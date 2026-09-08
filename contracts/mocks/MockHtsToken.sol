// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockHtsToken
 * @notice Simulates a Hedera Token Service fungible token, including the two behaviours that
 *         actually break naive integrations: mandatory association before receipt, and a
 *         privileged transfer entry point reachable only from the `0x167` system contract.
 * @dev TEST FIXTURE ONLY — paired with {MockHtsPrecompile}, which is installed at `0x167`
 *      via `hardhat_setCode` so the real {HederaTokenServiceLib} code path can be exercised
 *      on a local Hardhat network.
 */
contract MockHtsToken is ERC20 {
    /// @notice Reserved address of the HTS system contract.
    address public constant HTS_PRECOMPILE = address(0x167);

    /// @notice Marker read by {MockHtsPrecompile.isToken} to identify this as an HTS entity.
    bool public constant isHtsMock = true;

    /// @notice Accounts that have been associated with this token.
    mapping(address => bool) public isAssociated;

    /// @notice Emitted when an account is associated with the token.
    event Associated(address indexed account);

    /// @notice Caller is not the HTS system contract.
    error NotHtsPrecompile(address caller);
    /// @notice Hedera refuses transfers to accounts that have not associated the token.
    error NotAssociated(address account);

    uint8 private immutable _decimals;

    /**
     * @notice Deploys the mock HTS token.
     * @param name_     Token name.
     * @param symbol_   Token symbol.
     * @param decimals_ Decimal precision (HTS stablecoins typically use 6).
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Associates the caller with this token.
     * @dev Mirrors an account submitting a `TokenAssociate` transaction directly.
     */
    function associate() external {
        isAssociated[msg.sender] = true;
        emit Associated(msg.sender);
    }

    /**
     * @notice Associates `account`; callable only by the HTS system contract.
     * @param account Account to associate.
     */
    function htsAssociate(address account) external {
        if (msg.sender != HTS_PRECOMPILE) revert NotHtsPrecompile(msg.sender);
        isAssociated[account] = true;
        emit Associated(account);
    }

    /**
     * @notice Dissociates `account`; callable only by the HTS system contract.
     * @param account Account to dissociate.
     */
    function htsDissociate(address account) external {
        if (msg.sender != HTS_PRECOMPILE) revert NotHtsPrecompile(msg.sender);
        isAssociated[account] = false;
    }

    /**
     * @notice Privileged transfer used by the HTS system contract.
     * @param from   Debited account.
     * @param to     Credited account.
     * @param amount Amount to move.
     */
    function htsTransfer(address from, address to, uint256 amount) external {
        if (msg.sender != HTS_PRECOMPILE) revert NotHtsPrecompile(msg.sender);
        _transfer(from, to, amount);
    }

    /**
     * @notice Mints `amount` to `to`, auto-associating the recipient.
     * @param to     Recipient.
     * @param amount Amount to mint.
     */
    function mint(address to, uint256 amount) external {
        isAssociated[to] = true;
        _mint(to, amount);
    }

    /// @dev Enforces Hedera's association rule on every credit.
    function _update(address from, address to, uint256 value) internal override {
        if (to != address(0) && !isAssociated[to]) revert NotAssociated(to);
        super._update(from, to, value);
    }
}
