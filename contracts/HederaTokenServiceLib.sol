// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IHederaTokenService} from "./interfaces/IHederaTokenService.sol";

/**
 * @title HederaTokenServiceLib
 * @author Aetheris (ETHOnline 2026)
 * @notice Safe, self-contained wrapper around the Hedera Token Service (HTS) system
 *         contract at `0x0000000000000000000000000000000000000167`.
 *
 * @dev This library is the heart of Aetheris' Hedera integration. It exists because the
 *      HTS precompile has three sharp edges that naive integrations get wrong:
 *
 *      ┌─ 1. Response codes, not booleans ────────────────────────────────────────────┐
 *      │ HTS returns a signed `int64` Hedera response code. `22` means SUCCESS.        │
 *      │ A low-level `call` that returns `success == true` says only that the EVM      │
 *      │ frame did not revert — the token operation may still have failed. Every       │
 *      │ helper here decodes the code and the `safe*` helpers revert with              │
 *      │ {HtsCallFailed}, which carries the raw code so it can be looked up against    │
 *      │ Hedera's `ResponseCodeEnum`.                                                  │
 *      └──────────────────────────────────────────────────────────────────────────────┘
 *      ┌─ 2. Empty returndata on non-Hedera chains ───────────────────────────────────┐
 *      │ On Hardhat / Anvil / any L1 that is not Hedera, `0x167` is an empty account.  │
 *      │ The EVM makes calls to empty accounts *succeed* with zero-length returndata.  │
 *      │ Decoding that blindly yields `0`, which is `OK (0)` in Hedera's enum — i.e. a │
 *      │ silent false positive. {_responseCode} therefore rejects short returndata and │
 *      │ reports {UNKNOWN}, which is what makes Aetheris' ERC-20 fallback path safe.   │
 *      └──────────────────────────────────────────────────────────────────────────────┘
 *      ┌─ 3. Association before receipt ──────────────────────────────────────────────┐
 *      │ A Hedera account cannot receive a token it is not associated with. Contracts  │
 *      │ that hold funds must associate themselves. {safeAssociateToken} treats        │
 *      │ `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194)` as success so association is      │
 *      │ idempotent.                                                                   │
 *      └──────────────────────────────────────────────────────────────────────────────┘
 *
 *      All functions are `internal`, so the library is inlined at compile time — there is
 *      no `delegatecall`, no deployment step, and no extra gas versus hand-rolled calls.
 */
library HederaTokenServiceLib {
    // ─────────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice Reserved EVM address of the HTS system contract on all Hedera networks.
    address internal constant HTS_PRECOMPILE = address(0x167);

    /// @notice Hedera `ResponseCodeEnum.SUCCESS`.
    int64 internal constant SUCCESS = 22;

    /// @notice Hedera `ResponseCodeEnum.UNKNOWN` — also used here for "no usable returndata".
    int64 internal constant UNKNOWN = 21;

    /// @notice Hedera `ResponseCodeEnum.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT` — benign on associate.
    int64 internal constant TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT = 194;

    /// @notice Largest amount HTS can move in a single transfer (`int64` is Hedera-native).
    uint256 internal constant MAX_HTS_AMOUNT = uint256(uint64(type(int64).max));

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice An HTS operation returned a non-`SUCCESS` response code.
    /// @param selector      Selector of the HTS function that was invoked.
    /// @param responseCode  Raw Hedera response code (see `ResponseCodeEnum`).
    error HtsCallFailed(bytes4 selector, int64 responseCode);

    /// @notice `amount` does not fit in the `int64` domain HTS uses for transfers.
    error HtsAmountOverflow(uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────────
    // Fungible transfers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Moves `amount` of HTS `token` from `sender` to `receiver`, returning the raw code.
     * @dev Non-reverting. Use this when a fallback path exists (see
     *      {AetherisTreasury.settleSubAgent}); use {safeTransferToken} when failure is fatal.
     * @param token    EVM address of the HTS token.
     * @param sender   Debited account — normally `address(this)`, which the contract can
     *                 authorize by virtue of being the message sender to the precompile.
     * @param receiver Credited account. Must already be associated with `token`.
     * @param amount   Amount in the token's smallest unit.
     * @return responseCode `22` on success, otherwise the Hedera failure code.
     */
    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) internal returns (int64 responseCode) {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSelector(
                IHederaTokenService.transferToken.selector,
                token,
                sender,
                receiver,
                amount
            )
        );
        return _responseCode(ok, data);
    }

    /**
     * @notice {transferToken} that reverts with {HtsCallFailed} on any non-`SUCCESS` code.
     * @param token    EVM address of the HTS token.
     * @param sender   Debited account.
     * @param receiver Credited account.
     * @param amount   Amount as `uint256`; narrowed to `int64` after a range check.
     */
    function safeTransferToken(
        address token,
        address sender,
        address receiver,
        uint256 amount
    ) internal {
        int64 responseCode = transferToken(token, sender, receiver, toInt64(amount));
        if (responseCode != SUCCESS) {
            revert HtsCallFailed(IHederaTokenService.transferToken.selector, responseCode);
        }
    }

    /**
     * @notice Best-effort HTS transfer that never reverts.
     * @dev The dual-path primitive behind Aetheris micro-settlement: when this returns
     *      false the caller falls back to a plain ERC-20 `transfer`.
     * @param token    EVM address of the candidate HTS token.
     * @param sender   Debited account.
     * @param receiver Credited account.
     * @param amount   Amount as `uint256`; amounts above `int64` max return false.
     * @return success true only when HTS returned `SUCCESS (22)`.
     * @return responseCode The raw code, for event/telemetry purposes.
     */
    function tryTransferToken(
        address token,
        address sender,
        address receiver,
        uint256 amount
    ) internal returns (bool success, int64 responseCode) {
        if (amount > MAX_HTS_AMOUNT) {
            return (false, UNKNOWN);
        }
        responseCode = transferToken(token, sender, receiver, int64(uint64(amount)));
        success = responseCode == SUCCESS;
    }

    /**
     * @notice Allowance-based HTS transfer (`transferFrom` semantics).
     * @param token EVM address of the HTS token.
     * @param from  Account debited; must have approved `address(this)`.
     * @param to    Account credited.
     * @param amount Amount in the token's smallest unit.
     * @return responseCode `22` on success.
     */
    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) internal returns (int64 responseCode) {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSelector(IHederaTokenService.transferFrom.selector, token, from, to, amount)
        );
        return _responseCode(ok, data);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Association
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Associates `account` with `token`, returning the raw response code.
     * @param account Account to associate — typically `address(this)`.
     * @param token   EVM address of the HTS token.
     * @return responseCode `22` on success, `194` when already associated.
     */
    function associateToken(address account, address token)
        internal
        returns (int64 responseCode)
    {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSelector(IHederaTokenService.associateToken.selector, account, token)
        );
        return _responseCode(ok, data);
    }

    /**
     * @notice Idempotent association that reverts on genuine failure.
     * @dev `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194)` is treated as success so callers can
     *      associate defensively without tracking state.
     * @param account Account to associate.
     * @param token   EVM address of the HTS token.
     * @return responseCode The raw code that was accepted.
     */
    function safeAssociateToken(address account, address token)
        internal
        returns (int64 responseCode)
    {
        responseCode = associateToken(account, token);
        if (responseCode != SUCCESS && responseCode != TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT) {
            revert HtsCallFailed(IHederaTokenService.associateToken.selector, responseCode);
        }
    }

    /**
     * @notice Removes the association between `account` and `token`.
     * @dev Reverts unless HTS returns `SUCCESS`. The account must hold a zero balance.
     * @param account Account to dissociate.
     * @param token   EVM address of the HTS token.
     * @return responseCode Always `22` when this call returns.
     */
    function dissociateToken(address account, address token)
        internal
        returns (int64 responseCode)
    {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.call(
            abi.encodeWithSelector(IHederaTokenService.dissociateToken.selector, account, token)
        );
        responseCode = _responseCode(ok, data);
        if (responseCode != SUCCESS) {
            revert HtsCallFailed(IHederaTokenService.dissociateToken.selector, responseCode);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Introspection
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns true when `token` is a live HTS token entity.
     * @dev Issued as a `staticcall` so it can be used from `view` contexts and can never
     *      mutate state. Returns false on every non-Hedera chain (empty returndata) and
     *      false whenever the query itself did not return `SUCCESS` — which is precisely
     *      the behaviour that makes the ERC-20 fallback safe on Hardhat.
     * @param token Candidate token address.
     * @return true when HTS positively identifies `token`.
     */
    function isHtsToken(address token) internal view returns (bool) {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.staticcall(
            abi.encodeWithSelector(IHederaTokenService.isToken.selector, token)
        );
        // Requires a full `(int64, bool)` tuple — 64 bytes. Anything shorter is not HTS.
        if (!ok || data.length < 64) {
            return false;
        }
        (int64 responseCode, bool tokenExists) = abi.decode(data, (int64, bool));
        return responseCode == SUCCESS && tokenExists;
    }

    /**
     * @notice Reports whether the HTS system contract is reachable from this chain.
     * @dev Cheap chain-capability probe used by {AetherisTreasury} to describe itself in
     *      deployment logs. Uses the zero address as a harmless query subject.
     * @return true when `0x167` answers with a well-formed HTS response.
     */
    function isHtsAvailable() internal view returns (bool) {
        (bool ok, bytes memory data) = HTS_PRECOMPILE.staticcall(
            abi.encodeWithSelector(IHederaTokenService.isToken.selector, address(0))
        );
        return ok && data.length >= 64;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Numeric helpers
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Narrows a `uint256` amount into the `int64` domain HTS transfers use.
     * @param amount Amount in the token's smallest unit.
     * @return The same amount as a positive `int64`.
     */
    function toInt64(uint256 amount) internal pure returns (int64) {
        if (amount > MAX_HTS_AMOUNT) {
            revert HtsAmountOverflow(amount);
        }
        return int64(uint64(amount));
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @dev Decodes an HTS response code without ever reverting on malformed returndata.
     *
     *      Hedera's own `HederaTokenService.sol` decodes as `int32` while its
     *      `IHederaTokenService` declares `int64`; both read the same 32-byte word, so this
     *      helper reads the word directly and range-checks it into `int64`. Returndata that
     *      is absent (empty account — i.e. not a Hedera chain) or malformed maps to
     *      {UNKNOWN} rather than the dangerously-successful-looking `0`.
     */
    function _responseCode(bool ok, bytes memory data) private pure returns (int64) {
        if (!ok || data.length < 32) {
            return UNKNOWN;
        }
        int256 raw;
        assembly {
            raw := mload(add(data, 32))
        }
        if (raw > type(int64).max || raw < type(int64).min) {
            return UNKNOWN;
        }
        return int64(raw);
    }
}
