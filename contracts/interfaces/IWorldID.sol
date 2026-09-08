// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IWorldID
 * @author Aetheris (ETHOnline 2026)
 * @notice The canonical World ID router ABI used for on-chain proof-of-personhood.
 * @dev Deployed by Worldcoin as `WorldIDRouter` on supported chains. `verifyProof` reverts
 *      when the Semaphore proof is invalid and returns nothing when it is valid — there is
 *      no boolean to check, so callers must treat "did not revert" as success.
 */
interface IWorldID {
    /**
     * @notice Verifies a World ID zero-knowledge proof of personhood.
     * @param root                  Root of the Merkle tree the proof was generated against.
     * @param groupId               Credential group (`1` = Orb-verified humans).
     * @param signalHash            `hashToField` of the signal being bound to the proof.
     * @param nullifierHash         Per-(action, identity) nullifier; the replay guard.
     * @param externalNullifierHash `hashToField` of `abi.encodePacked(appId, action)`.
     * @param proof                 The eight-element Groth16 proof.
     */
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}
