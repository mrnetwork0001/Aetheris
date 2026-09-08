// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IAetherisTreasury
 * @author Aetheris (ETHOnline 2026)
 * @notice The surface {AetherisAgency} uses to drive the treasury. Kept deliberately small
 *         so the agency can never touch retained margin directly.
 */
interface IAetherisTreasury {
    /**
     * @notice Records that `amount` of `token` has landed in the treasury for `jobId`.
     * @dev The agency transfers the client deposit into the treasury first, then calls this.
     *      The treasury re-derives its own balance to prove the transfer really happened.
     */
    function recordEscrow(uint256 jobId, address token, uint256 amount) external;

    /**
     * @notice Pays a sub-agent out of a job's escrow, HTS-first with an ERC-20 fallback.
     * @return viaHts true when the payout was routed through the HTS precompile.
     */
    function settleSubAgent(
        uint256 jobId,
        uint256 taskId,
        address subAgent,
        uint256 amount
    ) external returns (bool viaHts);

    /**
     * @notice Sweeps a job's unspent escrow into the agency's retained margin.
     * @return margin The amount moved into retained margin.
     */
    function closeEscrow(uint256 jobId) external returns (uint256 margin);

    /**
     * @notice Returns a job's remaining escrow to `client`.
     * @return refunded The amount returned.
     */
    function refundEscrow(uint256 jobId, address client) external returns (uint256 refunded);

    /// @notice Token an escrow is denominated in.
    function escrowToken(uint256 jobId) external view returns (address);

    /// @notice Remaining escrowed balance for `jobId`.
    function escrowBalance(uint256 jobId) external view returns (uint256);
}

/**
 * @title IAetherisOperatorRegistry
 * @notice The World ID verification surface {AetherisTreasury} reads before releasing profit.
 * @dev Implemented by {AetherisAgency}, which owns the nullifier set.
 */
interface IAetherisOperatorRegistry {
    /// @notice True once `operator` has cleared a World ID proof (or the explicit testnet bypass).
    function isVerifiedOperator(address operator) external view returns (bool);

    /// @notice The nullifier hash consumed by `operator`'s verification; `0` if unverified.
    function operatorNullifier(address operator) external view returns (uint256);
}
