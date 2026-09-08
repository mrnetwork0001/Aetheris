// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {MockHtsToken} from "./MockHtsToken.sol";

/**
 * @title MockHtsPrecompile
 * @notice A deliberately **stateless** stand-in for the Hedera Token Service system contract.
 * @dev TEST FIXTURE ONLY. Tests deploy this contract, copy its runtime bytecode to
 *      `0x0000000000000000000000000000000000000167` with `hardhat_setCode`, and then run the
 *      *real* {HederaTokenServiceLib} against it. Statelessness is essential: `hardhat_setCode`
 *      installs code but no storage, so this contract must derive everything from its
 *      arguments and from calls back into the token.
 *
 *      It reproduces the three HTS behaviours the library depends on:
 *        • every function answers with an `int64` Hedera response code (`22` = SUCCESS);
 *        • `isToken` returns the `(int64, bool)` tuple the library length-checks;
 *        • association is required before an account can receive a token.
 */
contract MockHtsPrecompile {
    /// @notice `ResponseCodeEnum.SUCCESS`.
    int64 public constant SUCCESS = 22;
    /// @notice `ResponseCodeEnum.INVALID_TOKEN_ID`.
    int64 public constant INVALID_TOKEN_ID = 167;
    /// @notice `ResponseCodeEnum.INSUFFICIENT_TOKEN_BALANCE`.
    int64 public constant INSUFFICIENT_TOKEN_BALANCE = 178;
    /// @notice `ResponseCodeEnum.TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT`.
    int64 public constant TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT = 194;

    /**
     * @notice Reports whether `token` is an HTS entity.
     * @dev Answers by probing for the {MockHtsToken.isHtsMock} marker. Declared `view` so the
     *      library's `staticcall` succeeds.
     * @param token Candidate token address.
     * @return responseCode Always `22` — the query itself always succeeds.
     * @return tokenExists  True when `token` carries the HTS marker.
     */
    function isToken(address token) external view returns (int64 responseCode, bool tokenExists) {
        (bool ok, bytes memory data) =
            token.staticcall(abi.encodeWithSignature("isHtsMock()"));
        tokenExists = ok && data.length >= 32 && abi.decode(data, (bool));
        responseCode = SUCCESS;
    }

    /**
     * @notice Moves `amount` of `token` from `sender` to `receiver`.
     * @param token    HTS token address.
     * @param sender   Debited account.
     * @param receiver Credited account.
     * @param amount   Amount as a signed 64-bit integer.
     * @return responseCode `22` on success, `178` when the token rejected the movement.
     */
    function transferToken(address token, address sender, address receiver, int64 amount)
        external
        returns (int64 responseCode)
    {
        if (amount < 0) return INSUFFICIENT_TOKEN_BALANCE;
        try MockHtsToken(token).htsTransfer(sender, receiver, uint256(uint64(amount))) {
            return SUCCESS;
        } catch {
            return INSUFFICIENT_TOKEN_BALANCE;
        }
    }

    /**
     * @notice Associates `account` with `token`.
     * @param account Account to associate.
     * @param token   HTS token address.
     * @return responseCode `22` on success, `194` when already associated, `167` when the
     *         token is not an HTS entity.
     */
    function associateToken(address account, address token) external returns (int64 responseCode) {
        try MockHtsToken(token).isAssociated(account) returns (bool alreadyAssociated) {
            if (alreadyAssociated) return TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT;
        } catch {
            return INVALID_TOKEN_ID;
        }
        try MockHtsToken(token).htsAssociate(account) {
            return SUCCESS;
        } catch {
            return INVALID_TOKEN_ID;
        }
    }

    /**
     * @notice Removes the association between `account` and `token`.
     * @param account Account to dissociate.
     * @param token   HTS token address.
     * @return responseCode `22` on success.
     */
    function dissociateToken(address account, address token) external returns (int64 responseCode) {
        try MockHtsToken(token).htsDissociate(account) {
            return SUCCESS;
        } catch {
            return INVALID_TOKEN_ID;
        }
    }
}
