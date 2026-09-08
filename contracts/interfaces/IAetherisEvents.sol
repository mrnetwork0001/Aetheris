// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title IAetherisEvents
 * @notice FROZEN INTERFACE — the single source of truth for every event Aetheris
 *         emits on Hedera EVM. `contracts/` implements these signatures verbatim
 *         and `subgraph/` indexes them verbatim. Neither side may alter a
 *         signature (name, arity, types, or indexed-ness) without updating this
 *         file first and regenerating the subgraph ABI.
 *
 * @dev Solidity permits at most 3 indexed parameters per non-anonymous event.
 *      Every event below respects that limit.
 */
interface IAetherisEvents {
    /// @notice Lifecycle state of a client job held by the agency.
    enum JobStatus {
        None,       // 0 — never created
        Funded,     // 1 — client deposit escrowed
        Dispatched, // 2 — at least one sub-agent assigned
        Completed,  // 3 — all tasks reported complete
        Settled,    // 4 — sub-agents paid, margin swept to treasury
        Refunded    // 5 — deposit returned to client
    }

    /// @notice Lifecycle state of a single sub-agent task within a job.
    enum TaskStatus {
        None,      // 0
        Assigned,  // 1
        Completed, // 2
        Paid,      // 3
        Cancelled  // 4
    }

    // ── Identity & governance ────────────────────────────────────────────────

    /// @notice A new agency treasury was deployed by a verified human operator.
    event AgencyDeployed(
        address indexed agency,
        address indexed operator,
        string ensName,
        uint256 nullifierHash
    );

    /// @notice An operator cleared World ID proof-of-personhood.
    event OperatorVerified(
        address indexed operator,
        uint256 nullifierHash,
        string ensName
    );

    // ── Job lifecycle ────────────────────────────────────────────────────────

    /// @notice A client funded a new job in `token` (HTS or ERC-20).
    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed token,
        uint256 deposit,
        string specURI
    );

    /// @notice The agency assigned a sub-task to a specialized sub-agent.
    event SubAgentAssigned(
        uint256 indexed jobId,
        uint256 indexed taskId,
        address indexed subAgent,
        address token,
        uint256 fee,
        string role
    );

    /// @notice A sub-agent reported completion, anchored by an HCS message.
    event TaskCompleted(
        uint256 indexed jobId,
        uint256 indexed taskId,
        bytes32 resultHash,
        string hcsTopicId,
        uint64 hcsSequenceNumber
    );

    /// @notice Programmatic micro-payout to a sub-agent.
    /// @param viaHts true when routed through the HTS precompile, false for plain ERC-20.
    event MicroSettlement(
        uint256 indexed jobId,
        uint256 indexed taskId,
        address indexed subAgent,
        address token,
        uint256 amount,
        bool viaHts
    );

    /// @notice Job closed out; margin retained by the agency treasury.
    event JobSettled(
        uint256 indexed jobId,
        uint256 grossDeposit,
        uint256 paidToSubAgents,
        uint256 netMargin
    );

    // ── Treasury operations ──────────────────────────────────────────────────

    /// @notice Treasury rebalanced via the 1inch Swap API v6.0.
    event TreasuryRebalanced(
        address indexed fromToken,
        address indexed toToken,
        uint256 amountIn,
        uint256 amountOut,
        uint256 dstChainId,
        bytes32 oneInchTxHash
    );

    /// @notice Operator withdrew accrued margin (gated on World ID).
    event ProfitClaimed(
        address indexed operator,
        address indexed token,
        uint256 amount,
        uint256 nullifierHash
    );

    /// @notice An immutable HCS audit message was anchored on-chain.
    event HcsLogAnchored(
        uint256 indexed jobId,
        bytes32 messageHash,
        string topicId,
        uint64 sequenceNumber
    );
}
