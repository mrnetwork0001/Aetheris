// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAetherisEvents} from "./interfaces/IAetherisEvents.sol";
import {IAetherisTreasury, IAetherisOperatorRegistry} from "./interfaces/IAetherisTreasury.sol";
import {HederaTokenServiceLib} from "./HederaTokenServiceLib.sol";

/**
 * @title AetherisTreasury
 * @author Aetheris (ETHOnline 2026)
 * @notice The autonomous micro-treasury of an Aetheris DeAI agency. It escrows client
 *         deposits per job, streams programmatic micro-payments to sub-agents over the
 *         Hedera Token Service, retains the agency's margin, and releases that margin only
 *         to a World-ID-verified human operator.
 *
 * @dev Design notes that matter for review:
 *
 *      • **Dual settlement path.** {settleSubAgent} attempts the HTS system contract first
 *        and falls back to a plain ERC-20 `transfer` when the token is not an HTS entity
 *        (or when HTS declines the transfer). The `viaHts` flag on the emitted
 *        {IAetherisEvents.MicroSettlement} always reports what actually happened, and a
 *        failed HTS attempt additionally emits {HtsPayoutFallback} with the raw Hedera
 *        response code — the fallback is never silent.
 *
 *      • **Association.** Hedera refuses token transfers to an unassociated account, so a
 *        freshly deployed treasury must call {associateToken} once per HTS token before it
 *        can be funded. See {associateToken}.
 *
 *      • **Solvency invariant.** For every token, the contract's balance must cover
 *        `totalObligations` = (sum of live job escrows) + (retained margin). {recordEscrow}
 *        re-derives the real balance rather than trusting the agency's arithmetic, which
 *        also rejects fee-on-transfer tokens instead of silently under-funding a job.
 *
 *      • **Separation of powers.** The agency contract may move escrow but can never touch
 *        retained margin; the owner may claim margin but can never touch escrow. Neither
 *        can bypass {ReentrancyGuard} on the fund-moving paths.
 */
contract AetherisTreasury is IAetherisEvents, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using HederaTokenServiceLib for address;

    // ─────────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Per-job escrow record.
    struct Escrow {
        address token;   // Token the deposit is denominated in (HTS or ERC-20).
        uint256 balance; // Unspent deposit still held for this job.
        bool opened;     // True once a deposit has been recorded for this job id.
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice The {AetherisAgency} authorised to move escrow and to answer World ID queries.
    address public agency;

    /// @notice Master switch for the HTS path. Owner may disable it to force ERC-20 payouts.
    bool public htsEnabled = true;

    /// @dev jobId => escrow record.
    mapping(uint256 => Escrow) private _escrows;

    /// @notice Accrued agency profit per token, claimable by a verified operator.
    mapping(address => uint256) public retainedMargin;

    /// @notice Live escrow + retained margin per token; the solvency floor for that token.
    mapping(address => uint256) public totalObligations;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events (contract-local diagnostics; the indexed protocol events live in IAetherisEvents)
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice The treasury associated itself with an HTS token so it can hold a balance.
    event TokenAssociated(address indexed token, int64 responseCode);

    /// @notice The treasury dissociated itself from an HTS token.
    event TokenDissociated(address indexed token, int64 responseCode);

    /// @notice An HTS payout attempt failed and the ERC-20 fallback was used instead.
    /// @param responseCode The raw Hedera response code that triggered the fallback.
    event HtsPayoutFallback(address indexed token, address indexed to, uint256 amount, int64 responseCode);

    /// @notice The agency contract allowed to drive escrow was (re)wired.
    event AgencyUpdated(address indexed previousAgency, address indexed newAgency);

    /// @notice The HTS master switch was flipped.
    event HtsEnabledUpdated(bool enabled);

    /// @notice A client deposit was escrowed against a job.
    event EscrowRecorded(uint256 indexed jobId, address indexed token, uint256 amount);

    /// @notice A job's escrow was returned to its client.
    event EscrowRefunded(uint256 indexed jobId, address indexed client, address indexed token, uint256 amount);

    /// @notice Surplus tokens above the solvency floor were rescued by the owner.
    event SurplusSwept(address indexed token, address indexed to, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Caller is not the wired agency contract.
    error NotAgency(address caller);
    /// @notice A zero address was supplied where a real address is required.
    error ZeroAddress();
    /// @notice A zero amount was supplied where a positive amount is required.
    error ZeroAmount();
    /// @notice The agency contract has not been wired yet.
    error AgencyNotSet();
    /// @notice `jobId` already holds an escrow record.
    error EscrowAlreadyOpen(uint256 jobId);
    /// @notice `jobId` has no escrow record.
    error EscrowNotOpen(uint256 jobId);
    /// @notice Escrow for `jobId` cannot cover `requested`.
    error InsufficientEscrow(uint256 jobId, uint256 requested, uint256 available);
    /// @notice Retained margin for `token` cannot cover `requested`.
    error InsufficientMargin(address token, uint256 requested, uint256 available);
    /// @notice The token balance actually held does not cover the recorded obligations.
    error SolvencyCheckFailed(address token, uint256 held, uint256 required);
    /// @notice The caller has not cleared World ID proof-of-personhood on the agency.
    error OperatorNotVerified(address operator);
    /// @notice The requested token mismatched the job's escrow denomination.
    error TokenMismatch(address expected, address actual);

    // ─────────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────────

    /// @dev Restricts a call to the wired {AetherisAgency}.
    modifier onlyAgency() {
        if (msg.sender != agency) revert NotAgency(msg.sender);
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the treasury.
     * @param initialOwner The human operator who will own the retained margin.
     */
    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Administration
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Wires the {AetherisAgency} permitted to open, spend and close escrows.
     * @dev Also the registry the treasury consults for World ID status in {claimProfit}.
     * @param newAgency Address of the agency contract.
     */
    function setAgency(address newAgency) external onlyOwner {
        if (newAgency == address(0)) revert ZeroAddress();
        emit AgencyUpdated(agency, newAgency);
        agency = newAgency;
    }

    /**
     * @notice Enables or disables the Hedera Token Service settlement path.
     * @dev When disabled, {settleSubAgent} goes straight to ERC-20 `transfer`. Useful on
     *      non-Hedera forks and as a circuit breaker.
     * @param enabled New value for {htsEnabled}.
     */
    function setHtsEnabled(bool enabled) external onlyOwner {
        htsEnabled = enabled;
        emit HtsEnabledUpdated(enabled);
    }

    /**
     * @notice Associates this treasury with an HTS token so it is allowed to hold a balance.
     * @dev Hedera rejects transfers to unassociated accounts, so this MUST be called once
     *      per HTS token before the treasury is funded. Idempotent: HTS response code
     *      `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194)` is accepted as success. On a chain
     *      without the HTS system contract this reverts with `HtsCallFailed`, which is the
     *      correct signal that association is not applicable there.
     * @param token EVM address of the HTS token.
     * @return responseCode The accepted Hedera response code (`22` or `194`).
     */
    function associateToken(address token) external onlyOwner returns (int64 responseCode) {
        if (token == address(0)) revert ZeroAddress();
        responseCode = HederaTokenServiceLib.safeAssociateToken(address(this), token);
        emit TokenAssociated(token, responseCode);
    }

    /**
     * @notice Dissociates this treasury from an HTS token it no longer holds.
     * @param token EVM address of the HTS token.
     * @return responseCode The Hedera response code (`22`).
     */
    function dissociateToken(address token) external onlyOwner returns (int64 responseCode) {
        if (token == address(0)) revert ZeroAddress();
        responseCode = HederaTokenServiceLib.dissociateToken(address(this), token);
        emit TokenDissociated(token, responseCode);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Escrow lifecycle (agency-driven)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Records a client deposit that the agency has already transferred in.
     * @dev The agency moves the tokens first and calls this second; the treasury then
     *      verifies its own balance covers every obligation it has taken on. That check is
     *      what makes the accounting trustworthy without the treasury needing an allowance.
     * @param jobId  Identifier minted by the agency.
     * @param token  Token the deposit is denominated in.
     * @param amount Deposit size in the token's smallest unit.
     */
    function recordEscrow(uint256 jobId, address token, uint256 amount) external onlyAgency {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Escrow storage escrow = _escrows[jobId];
        if (escrow.opened) revert EscrowAlreadyOpen(jobId);

        escrow.token = token;
        escrow.balance = amount;
        escrow.opened = true;

        uint256 obligations = totalObligations[token] + amount;
        totalObligations[token] = obligations;

        uint256 held = IERC20(token).balanceOf(address(this));
        if (held < obligations) revert SolvencyCheckFailed(token, held, obligations);

        emit EscrowRecorded(jobId, token, amount);
    }

    /**
     * @notice Pays a sub-agent out of a job's escrow — HTS first, ERC-20 fallback.
     * @dev Emits {IAetherisEvents.MicroSettlement} with `viaHts` reflecting the route that
     *      actually moved the funds. Guarded against reentrancy because an exotic token
     *      could hand control to the recipient mid-transfer.
     * @param jobId    Job whose escrow is debited.
     * @param taskId   Task being paid (for event correlation only).
     * @param subAgent Recipient of the micro-payment.
     * @param amount   Payout size in the token's smallest unit.
     * @return viaHts  true when the Hedera Token Service moved the funds.
     */
    function settleSubAgent(
        uint256 jobId,
        uint256 taskId,
        address subAgent,
        uint256 amount
    ) external onlyAgency nonReentrant returns (bool viaHts) {
        if (subAgent == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Escrow storage escrow = _escrows[jobId];
        if (!escrow.opened) revert EscrowNotOpen(jobId);
        if (escrow.balance < amount) {
            revert InsufficientEscrow(jobId, amount, escrow.balance);
        }

        address token = escrow.token;

        // Effects before interactions.
        escrow.balance -= amount;
        totalObligations[token] -= amount;

        viaHts = _payout(token, subAgent, amount);

        emit MicroSettlement(jobId, taskId, subAgent, token, amount, viaHts);
    }

    /**
     * @notice Closes a job's escrow, moving whatever is left into the agency's margin.
     * @param jobId Job to close.
     * @return margin The amount promoted from escrow to retained margin.
     */
    function closeEscrow(uint256 jobId) external onlyAgency returns (uint256 margin) {
        Escrow storage escrow = _escrows[jobId];
        if (!escrow.opened) revert EscrowNotOpen(jobId);

        margin = escrow.balance;
        address token = escrow.token;

        escrow.balance = 0;
        escrow.opened = false;

        // Obligation total is unchanged: the funds simply move from escrow to margin.
        if (margin > 0) {
            retainedMargin[token] += margin;
        }
    }

    /**
     * @notice Returns a job's remaining escrow to the client.
     * @param jobId  Job to refund.
     * @param client Recipient of the refund.
     * @return refunded The amount returned.
     */
    function refundEscrow(uint256 jobId, address client)
        external
        onlyAgency
        nonReentrant
        returns (uint256 refunded)
    {
        if (client == address(0)) revert ZeroAddress();

        Escrow storage escrow = _escrows[jobId];
        if (!escrow.opened) revert EscrowNotOpen(jobId);

        refunded = escrow.balance;
        address token = escrow.token;

        escrow.balance = 0;
        escrow.opened = false;
        totalObligations[token] -= refunded;

        if (refunded > 0) {
            _payout(token, client, refunded);
        }

        emit EscrowRefunded(jobId, client, token, refunded);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Operator treasury operations
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Withdraws accrued agency margin to the operator.
     * @dev Gated on World ID: the caller must be the owner *and* must appear as a verified
     *      operator in the wired agency's registry. The nullifier hash that cleared the
     *      operator is echoed into {IAetherisEvents.ProfitClaimed} so the subgraph can link
     *      the payout back to the proof-of-personhood that authorised it.
     * @param token  Token to withdraw.
     * @param amount Amount to withdraw from {retainedMargin}.
     * @param to     Recipient of the withdrawal.
     */
    function claimProfit(address token, uint256 amount, address to)
        external
        onlyOwner
        nonReentrant
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (agency == address(0)) revert AgencyNotSet();

        IAetherisOperatorRegistry registry = IAetherisOperatorRegistry(agency);
        if (!registry.isVerifiedOperator(msg.sender)) {
            revert OperatorNotVerified(msg.sender);
        }

        uint256 available = retainedMargin[token];
        if (available < amount) revert InsufficientMargin(token, amount, available);

        // Effects before interactions.
        retainedMargin[token] = available - amount;
        totalObligations[token] -= amount;

        _payout(token, to, amount);

        emit ProfitClaimed(msg.sender, token, amount, registry.operatorNullifier(msg.sender));
    }

    /**
     * @notice Records the settled result of an off-chain 1inch Swap API v6.0 rebalance.
     * @dev The swap itself is executed off-chain by the agency operator against the 1inch
     *      aggregation API; this function is the on-chain audit trail *and* the accounting
     *      adjustment, moving `amountIn` of margin out of `fromToken` and `amountOut` into
     *      `toToken`. Because both legs are reflected in {retainedMargin} and
     *      {totalObligations}, the treasury's solvency invariant continues to hold for
     *      same-chain swaps. For a cross-chain rebalance pass the destination chain in
     *      `dstChainId`; the outbound leg is still debited here.
     * @param fromToken     Token sold.
     * @param toToken       Token bought.
     * @param amountIn      Amount of `fromToken` sold.
     * @param amountOut     Amount of `toToken` received.
     * @param dstChainId    Chain the proceeds landed on (`block.chainid` for same-chain).
     * @param oneInchTxHash Transaction hash reported by the 1inch API, for reconciliation.
     */
    function rebalance(
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 dstChainId,
        bytes32 oneInchTxHash
    ) external onlyOwner nonReentrant {
        if (fromToken == address(0) || toToken == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();

        uint256 available = retainedMargin[fromToken];
        if (available < amountIn) revert InsufficientMargin(fromToken, amountIn, available);

        retainedMargin[fromToken] = available - amountIn;
        totalObligations[fromToken] -= amountIn;

        if (amountOut > 0 && dstChainId == block.chainid) {
            retainedMargin[toToken] += amountOut;
            totalObligations[toToken] += amountOut;
        }

        emit TreasuryRebalanced(fromToken, toToken, amountIn, amountOut, dstChainId, oneInchTxHash);
    }

    /**
     * @notice Rescues tokens held in excess of the solvency floor.
     * @dev Covers airdrops and accidental direct transfers. It can never touch escrow or
     *      retained margin because it only ever moves `balance - totalObligations`.
     * @param token Token to sweep.
     * @param to    Recipient of the surplus.
     * @return surplus The amount swept.
     */
    function sweepSurplus(address token, address to)
        external
        onlyOwner
        nonReentrant
        returns (uint256 surplus)
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();

        uint256 held = IERC20(token).balanceOf(address(this));
        uint256 required = totalObligations[token];
        if (held <= required) return 0;

        surplus = held - required;
        _payout(token, to, surplus);

        emit SurplusSwept(token, to, surplus);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Token a job's escrow is denominated in.
     * @param jobId Job to inspect.
     * @return The escrow token, or the zero address when no escrow was ever opened.
     */
    function escrowToken(uint256 jobId) external view returns (address) {
        return _escrows[jobId].token;
    }

    /**
     * @notice Unspent escrow still held for a job.
     * @param jobId Job to inspect.
     * @return The remaining escrow balance.
     */
    function escrowBalance(uint256 jobId) external view returns (uint256) {
        return _escrows[jobId].balance;
    }

    /**
     * @notice Whether a job's escrow is currently open.
     * @param jobId Job to inspect.
     * @return True between {recordEscrow} and {closeEscrow}/{refundEscrow}.
     */
    function isEscrowOpen(uint256 jobId) external view returns (bool) {
        return _escrows[jobId].opened;
    }

    /**
     * @notice Reports whether the Hedera Token Service system contract answers on this chain.
     * @dev False on Hardhat, Anvil and every non-Hedera network; true on Hedera
     *      testnet/mainnet. Deploy scripts print this so it is obvious which settlement
     *      route a demo will take.
     * @return True when `0x167` responds with well-formed HTS data.
     */
    function htsAvailable() external view returns (bool) {
        return HederaTokenServiceLib.isHtsAvailable();
    }

    /**
     * @notice Reports whether `token` is a Hedera Token Service token.
     * @param token Candidate token address.
     * @return True when HTS positively identifies `token`.
     */
    function isHtsToken(address token) external view returns (bool) {
        return HederaTokenServiceLib.isHtsToken(token);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @dev The dual settlement path. Tries the HTS system contract when it is enabled and
     *      the token is a genuine HTS entity; drops to `SafeERC20.safeTransfer` otherwise.
     *      A failed HTS attempt emits {HtsPayoutFallback} carrying the Hedera response code
     *      so the downgrade is always visible on-chain.
     * @return viaHts true when HTS moved the funds.
     */
    function _payout(address token, address to, uint256 amount) private returns (bool viaHts) {
        if (htsEnabled && HederaTokenServiceLib.isHtsToken(token)) {
            (bool ok, int64 responseCode) =
                HederaTokenServiceLib.tryTransferToken(token, address(this), to, amount);
            if (ok) {
                return true;
            }
            emit HtsPayoutFallback(token, to, amount, responseCode);
        }

        IERC20(token).safeTransfer(to, amount);
        return false;
    }
}
