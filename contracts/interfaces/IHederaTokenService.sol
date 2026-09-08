// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IHederaTokenService
 * @author Aetheris (ETHOnline 2026)
 * @notice Minimal ABI for the Hedera Token Service (HTS) system contract that lives at
 *         the reserved EVM address `0x0000000000000000000000000000000000000167` on every
 *         Hedera network (mainnet, testnet, previewnet).
 *
 * @dev IMPORTANT — HTS system-contract semantics differ from ordinary Solidity contracts:
 *
 *      1. Every function returns an `int64` **Hedera response code**, never a `bool`.
 *         `22` is `SUCCESS`. Anything else is a failure and MUST be surfaced by the caller.
 *         A plain `require(success)` on the low-level call result is therefore NOT enough:
 *         the outer call can succeed while the response code reports e.g.
 *         `INSUFFICIENT_TOKEN_BALANCE (178)` or `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT (184)`.
 *
 *      2. The precompile is *not* a normal account: on non-Hedera EVMs (Hardhat, Anvil,
 *         Sepolia) address `0x167` has no bytecode, so a `call`/`staticcall` to it returns
 *         `success == true` with **empty** return data. Callers must therefore check the
 *         returndata length before decoding — see {HederaTokenServiceLib}.
 *
 *      3. `associateToken` must be executed by/for an account *before* that account can
 *         receive a given HTS token. This is why {AetherisTreasury} exposes an association
 *         helper: an unassociated treasury cannot be paid.
 *
 *      4. Amounts are `int64` (Hedera's native tinybar/tinytoken unit), not `uint256`.
 *         Callers must range-check before narrowing.
 *
 *      This interface is intentionally *not* implemented by any contract in this repo — it
 *      exists purely so `abi.encodeWithSelector` produces the exact selectors the Hedera
 *      services node dispatches on.
 */
interface IHederaTokenService {
    /**
     * @notice Moves `amount` of fungible `token` from `sender` to `receiver`.
     * @param token    EVM address of the HTS token (the 20-byte form of `0.0.x`).
     * @param sender   Account debited. Must have authorized the transfer (contract keys /
     *                 allowance / being the calling contract itself).
     * @param receiver Account credited. Must already be associated with `token`.
     * @param amount   Amount in the token's smallest unit, as a signed 64-bit integer.
     * @return responseCode `22` on success, otherwise a Hedera response code.
     */
    function transferToken(
        address token,
        address sender,
        address receiver,
        int64 amount
    ) external returns (int64 responseCode);

    /**
     * @notice Moves `amount` of `token` from `from` to `to` using an HTS allowance.
     * @dev Mirrors ERC-20 `transferFrom`; requires a prior `approve` on the token.
     * @return responseCode `22` on success.
     */
    function transferFrom(
        address token,
        address from,
        address to,
        uint256 amount
    ) external returns (int64 responseCode);

    /**
     * @notice Associates `account` with `token`, enabling it to hold a balance.
     * @dev Hedera requires explicit association before an account may receive a token.
     *      Re-associating an already-associated account returns
     *      `TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194)`, which callers should treat as benign.
     * @return responseCode `22` on success.
     */
    function associateToken(address account, address token) external returns (int64 responseCode);

    /**
     * @notice Removes the association between `account` and `token`.
     * @dev Fails if `account` still holds a non-zero balance of `token`.
     * @return responseCode `22` on success.
     */
    function dissociateToken(address account, address token) external returns (int64 responseCode);

    /**
     * @notice Batch form of {associateToken}.
     * @return responseCode `22` on success.
     */
    function associateTokens(address account, address[] memory tokens)
        external
        returns (int64 responseCode);

    /**
     * @notice Reports whether `token` is a live HTS token entity.
     * @dev Used by {HederaTokenServiceLib.isHtsToken} to pick the HTS path over the
     *      plain ERC-20 fallback. Declared non-view to match the canonical Hedera ABI, but
     *      it is side-effect free and is invoked via `staticcall` in this repo.
     * @return responseCode `22` when the query itself succeeded.
     * @return isToken      true when `token` is an HTS token.
     */
    function isToken(address token) external returns (int64 responseCode, bool isToken);

    /**
     * @notice Returns the fungible-token balance HTS holds for `account`.
     * @dev Not part of the canonical HTS ABI in every release; kept out of the library's
     *      hot path and used only for diagnostics.
     */
    function getTokenType(address token) external returns (int64 responseCode, int32 tokenType);
}
