// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IWorldID} from "../interfaces/IWorldID.sol";

/**
 * @title MockWorldID
 * @notice Stand-in for the Worldcoin `WorldIDRouter`, used to exercise the non-bypassed
 *         proof-of-personhood path locally.
 * @dev TEST FIXTURE ONLY. Like the real router, {verifyProof} returns nothing on success and
 *      reverts on an invalid proof — there is no boolean to inspect.
 */
contract MockWorldID is IWorldID {
    /// @notice When true, every proof is rejected.
    bool public shouldRevert;

    /// @notice Thrown in place of the router's Semaphore verifier failure.
    error InvalidProof();

    /**
     * @notice Toggles proof rejection.
     * @param value True to make every subsequent {verifyProof} revert.
     */
    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    /// @inheritdoc IWorldID
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view {
        root; groupId; signalHash; nullifierHash; externalNullifierHash; proof;
        if (shouldRevert) revert InvalidProof();
    }
}
