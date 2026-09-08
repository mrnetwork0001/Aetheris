// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAetherisEvents} from "./interfaces/IAetherisEvents.sol";
import {IAetherisTreasury, IAetherisOperatorRegistry} from "./interfaces/IAetherisTreasury.sol";
import {IWorldID} from "./interfaces/IWorldID.sol";

/**
 * @title AetherisAgency
 * @author Aetheris (ETHOnline 2026)
 * @notice Job and sub-agent orchestration for an Autonomous DeAI Agency. Clients fund jobs,
 *         the human operator dispatches specialised sub-agents, sub-agents anchor their
 *         results to a Hedera Consensus Service topic, and settlement streams micro-payments
 *         out of {AetherisTreasury} while the agency keeps its margin.
 *
 * @dev The agency is the *only* contract permitted to move job escrow, and it is also the
 *      World ID registry the treasury consults before releasing profit — see
 *      {IAetherisOperatorRegistry}.
 *
 *      **World ID.** {verifyOperator} takes the canonical Semaphore proof shape and burns the
 *      nullifier hash so a given human can clear a given action exactly once. When the
 *      router address is the zero address the ZK check — and only the ZK check — is skipped
 *      so the project can be demoed on networks with no World ID deployment. That state is
 *      never silent: {worldIdVerificationBypassed} reports it, {WorldIdBypassActive} is
 *      emitted at construction, and every bypassed verification additionally emits
 *      {OperatorVerifiedWithoutProof} alongside the normal {IAetherisEvents.OperatorVerified}.
 *      Replay protection stays fully active in both modes.
 *
 *      **Margin math.** `netMargin = grossDeposit - paidToSubAgents`. Fees for tasks that
 *      were assigned but never completed are simply never paid, so they fall through into
 *      margin — the treasury derives margin from the escrow remainder rather than trusting
 *      arithmetic done here.
 */
contract AetherisAgency is IAetherisEvents, IAetherisOperatorRegistry, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice A client-funded engagement held by the agency.
    struct Job {
        address client;        // Who funded the job.
        address token;         // Deposit denomination (HTS or ERC-20).
        uint256 deposit;       // Gross client deposit.
        uint256 committedFees; // Sum of fees across assigned tasks.
        uint256 paidOut;       // Sum actually paid to sub-agents at settlement.
        uint256 netMargin;     // Deposit retained by the agency at settlement.
        uint32 taskCount;      // Number of tasks assigned.
        uint32 completedCount; // Number of tasks reported complete.
        JobStatus status;      // Lifecycle state (see IAetherisEvents.JobStatus).
        string specURI;        // Off-chain job specification (IPFS/HTTPS).
    }

    /// @notice A single unit of work delegated to a specialised sub-agent.
    struct Task {
        address subAgent;   // Payee.
        uint256 fee;        // Agreed micro-payment.
        bytes32 resultHash; // Hash of the delivered artefact.
        TaskStatus status;  // Lifecycle state (see IAetherisEvents.TaskStatus).
        string role;        // Human-readable specialisation, e.g. "security-audit".
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Immutables & configuration
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice The micro-treasury this agency drives.
    IAetherisTreasury public immutable treasury;

    /// @notice `hashToField(abi.encodePacked(hashToField(appId), action))` for World ID.
    uint256 public immutable externalNullifierHash;

    /// @notice The World ID router. The zero address puts the contract in explicit bypass mode.
    IWorldID public worldId;

    /// @notice World ID credential group; `1` is the Orb-verified group.
    uint256 public worldIdGroupId;

    // ─────────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice True once an address has cleared World ID (or the explicit testnet bypass).
    mapping(address => bool) public isVerifiedOperator;

    /// @notice Nullifier hash that verified an operator; `0` when unverified.
    mapping(address => uint256) public operatorNullifier;

    /// @notice ENS name recorded alongside an operator's verification.
    mapping(address => string) public operatorEnsName;

    /// @notice Nullifier hashes already consumed. The World ID replay guard.
    mapping(uint256 => bool) public nullifierHashUsed;

    /// @dev jobId => job record.
    mapping(uint256 => Job) private _jobs;

    /// @dev jobId => ordered task list; the array index is the taskId.
    mapping(uint256 => Task[]) private _tasks;

    /// @notice Number of jobs created; also the id of the most recent job.
    uint256 public jobCount;

    // ─────────────────────────────────────────────────────────────────────────────
    // Events (contract-local; protocol events live in IAetherisEvents)
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice EMITTED AT DEPLOY WHEN NO WORLD ID ROUTER IS CONFIGURED — proofs are not checked.
    /// @dev Loud on purpose. A production deployment must supply a real router address.
    event WorldIdBypassActive(address indexed agency, string reason);

    /// @notice An operator was registered WITHOUT a zero-knowledge proof because of the bypass.
    /// @dev Always accompanies {IAetherisEvents.OperatorVerified} in bypass mode; its absence
    ///      is the proof that a real World ID verification took place.
    event OperatorVerifiedWithoutProof(address indexed operator, uint256 nullifierHash);

    /// @notice The World ID router / group configuration changed.
    event WorldIdRouterUpdated(address indexed router, uint256 groupId);

    /// @notice A job was cancelled and its escrow returned to the client.
    event JobRefunded(uint256 indexed jobId, address indexed client, address indexed token, uint256 amount);

    /// @notice A task was cancelled before completion; its fee falls through into margin.
    event TaskCancelled(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent);

    // ─────────────────────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────────────────────

    /// @notice A zero address was supplied where a real address is required.
    error ZeroAddress();
    /// @notice A zero amount was supplied where a positive amount is required.
    error ZeroAmount();
    /// @notice `jobId` does not exist.
    error UnknownJob(uint256 jobId);
    /// @notice `taskId` does not exist on `jobId`.
    error UnknownTask(uint256 jobId, uint256 taskId);
    /// @notice The job is not in a state that permits this action.
    error InvalidJobStatus(uint256 jobId, JobStatus actual);
    /// @notice The task is not in a state that permits this action.
    error InvalidTaskStatus(uint256 jobId, uint256 taskId, TaskStatus actual);
    /// @notice Assigning this fee would commit more than the client deposited.
    error FeeExceedsDeposit(uint256 jobId, uint256 committed, uint256 deposit);
    /// @notice Caller may not report completion for this task.
    error NotTaskOwner(uint256 jobId, uint256 taskId, address caller);
    /// @notice Caller is neither the operator nor the job's client.
    error NotClientOrOperator(uint256 jobId, address caller);
    /// @notice This World ID nullifier hash has already been consumed.
    error NullifierAlreadyUsed(uint256 nullifierHash);
    /// @notice A nullifier hash of zero is not accepted.
    error InvalidNullifier();
    /// @notice The HCS topic id anchoring this task was empty.
    error EmptyHcsTopic();

    // ─────────────────────────────────────────────────────────────────────────────
    // Construction
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Deploys the agency and binds it to a treasury.
     * @dev Emits {IAetherisEvents.AgencyDeployed} so the subgraph can create the agency
     *      entity from the deployment transaction itself. The nullifier hash is `0` here
     *      because proof-of-personhood is established afterwards via {verifyOperator}.
     * @param initialOwner   The human operator who runs the agency.
     * @param treasury_      Address of the deployed {AetherisTreasury}.
     * @param worldIdRouter  World ID router; pass `address(0)` for explicit bypass mode.
     * @param worldIdGroupId_ Credential group id (`1` = Orb).
     * @param worldIdAppId   World ID app identifier, e.g. `app_staging_...`.
     * @param worldIdAction  World ID action identifier, e.g. `aetheris-operator`.
     * @param ensName        ENS name the agency publishes as its identity.
     */
    constructor(
        address initialOwner,
        address treasury_,
        address worldIdRouter,
        uint256 worldIdGroupId_,
        string memory worldIdAppId,
        string memory worldIdAction,
        string memory ensName
    ) Ownable(initialOwner) {
        if (initialOwner == address(0) || treasury_ == address(0)) revert ZeroAddress();

        treasury = IAetherisTreasury(treasury_);
        worldId = IWorldID(worldIdRouter);
        worldIdGroupId = worldIdGroupId_;
        externalNullifierHash = _hashToField(
            abi.encodePacked(_hashToField(abi.encodePacked(worldIdAppId)), worldIdAction)
        );

        emit AgencyDeployed(address(this), initialOwner, ensName, 0);

        if (worldIdRouter == address(0)) {
            emit WorldIdBypassActive(
                address(this),
                "WORLD_ID_ROUTER_UNSET: zero-knowledge proofs are NOT verified on this deployment"
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // World ID proof of personhood
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Registers `signal` as a World-ID-verified human operator.
     * @dev The nullifier hash is burned before any external call, so a proof can never be
     *      replayed — this holds in bypass mode too, which is what makes the demo path an
     *      honest simulation of the production path rather than a no-op.
     * @param signal        The address being bound to the proof (normally the operator).
     * @param root          Merkle root the proof was generated against.
     * @param nullifierHash Per-(action, identity) nullifier; consumed here.
     * @param proof         The eight-element Groth16 proof from IDKit.
     * @param ensName       ENS name to publish alongside the verification (may be empty).
     */
    function verifyOperator(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof,
        string calldata ensName
    ) external {
        if (signal == address(0)) revert ZeroAddress();
        if (nullifierHash == 0) revert InvalidNullifier();
        if (nullifierHashUsed[nullifierHash]) revert NullifierAlreadyUsed(nullifierHash);

        // Effects first: burn the nullifier before touching the router.
        nullifierHashUsed[nullifierHash] = true;

        IWorldID router = worldId;
        if (address(router) != address(0)) {
            router.verifyProof(
                root,
                worldIdGroupId,
                _hashToField(abi.encodePacked(signal)),
                nullifierHash,
                externalNullifierHash,
                proof
            );
        } else {
            emit OperatorVerifiedWithoutProof(signal, nullifierHash);
        }

        isVerifiedOperator[signal] = true;
        operatorNullifier[signal] = nullifierHash;
        operatorEnsName[signal] = ensName;

        emit OperatorVerified(signal, nullifierHash, ensName);
    }

    /**
     * @notice Reports whether zero-knowledge proof checking is currently disabled.
     * @dev MUST be false on any deployment that handles real value.
     * @return True when no World ID router is configured.
     */
    function worldIdVerificationBypassed() public view returns (bool) {
        return address(worldId) == address(0);
    }

    /**
     * @notice Points the agency at a World ID router (or clears it, re-enabling bypass).
     * @param router  The World ID router address, or `address(0)` for bypass mode.
     * @param groupId Credential group id (`1` = Orb).
     */
    function setWorldId(address router, uint256 groupId) external onlyOwner {
        worldId = IWorldID(router);
        worldIdGroupId = groupId;
        emit WorldIdRouterUpdated(router, groupId);
        if (router == address(0)) {
            emit WorldIdBypassActive(
                address(this),
                "WORLD_ID_ROUTER_CLEARED: zero-knowledge proofs are NOT verified on this deployment"
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Job lifecycle
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Funds a new job. The caller is the client and must have approved this contract
     *         for `deposit` of `token`.
     * @dev The deposit is transferred straight into the treasury, which then re-derives its
     *      own balance in {AetherisTreasury.recordEscrow} to confirm the funds landed.
     * @param token   Deposit denomination — an HTS token on Hedera, any ERC-20 elsewhere.
     * @param deposit Gross deposit in the token's smallest unit.
     * @param specURI Off-chain specification of the work (IPFS CID or HTTPS URL).
     * @return jobId  The identifier assigned to this job.
     */
    function createJob(address token, uint256 deposit, string calldata specURI)
        external
        nonReentrant
        returns (uint256 jobId)
    {
        if (token == address(0)) revert ZeroAddress();
        if (deposit == 0) revert ZeroAmount();

        jobId = ++jobCount;

        Job storage job = _jobs[jobId];
        job.client = msg.sender;
        job.token = token;
        job.deposit = deposit;
        job.status = JobStatus.Funded;
        job.specURI = specURI;

        IERC20(token).safeTransferFrom(msg.sender, address(treasury), deposit);
        treasury.recordEscrow(jobId, token, deposit);

        emit JobCreated(jobId, msg.sender, token, deposit, specURI);
    }

    /**
     * @notice Delegates a sub-task of `jobId` to a specialised sub-agent.
     * @dev Committed fees can never exceed the client deposit, so a job is always solvent
     *      before any work begins.
     * @param jobId    Job to extend.
     * @param subAgent Address that will be paid on completion.
     * @param fee      Micro-payment reserved for this task.
     * @param role     Human-readable specialisation, e.g. `"security-audit"`.
     * @return taskId  Index of the new task within the job.
     */
    function assignSubAgent(uint256 jobId, address subAgent, uint256 fee, string calldata role)
        external
        onlyOwner
        returns (uint256 taskId)
    {
        Job storage job = _requireJob(jobId);
        if (subAgent == address(0)) revert ZeroAddress();
        if (fee == 0) revert ZeroAmount();
        if (job.status != JobStatus.Funded && job.status != JobStatus.Dispatched) {
            revert InvalidJobStatus(jobId, job.status);
        }

        uint256 committed = job.committedFees + fee;
        if (committed > job.deposit) revert FeeExceedsDeposit(jobId, committed, job.deposit);

        job.committedFees = committed;
        job.taskCount += 1;
        job.status = JobStatus.Dispatched;

        taskId = _tasks[jobId].length;
        _tasks[jobId].push(
            Task({subAgent: subAgent, fee: fee, resultHash: bytes32(0), status: TaskStatus.Assigned, role: role})
        );

        emit SubAgentAssigned(jobId, taskId, subAgent, job.token, fee, role);
    }

    /**
     * @notice Reports a sub-task complete and anchors the Hedera Consensus Service receipt.
     * @dev Callable by the assigned sub-agent or by the operator on its behalf. Emits both
     *      {IAetherisEvents.TaskCompleted} and {IAetherisEvents.HcsLogAnchored}: the first
     *      advances task state, the second is the immutable audit anchor the subgraph joins
     *      against the HCS mirror-node stream.
     * @param jobId             Job the task belongs to.
     * @param taskId            Index of the task within the job.
     * @param resultHash        Hash of the delivered artefact.
     * @param hcsTopicId        Hedera topic id the execution log was submitted to (`0.0.x`).
     * @param hcsSequenceNumber Sequence number of the HCS message within that topic.
     */
    function completeTask(
        uint256 jobId,
        uint256 taskId,
        bytes32 resultHash,
        string calldata hcsTopicId,
        uint64 hcsSequenceNumber
    ) external {
        Job storage job = _requireJob(jobId);
        Task storage task = _requireTask(jobId, taskId);

        if (msg.sender != task.subAgent && msg.sender != owner()) {
            revert NotTaskOwner(jobId, taskId, msg.sender);
        }
        if (task.status != TaskStatus.Assigned) {
            revert InvalidTaskStatus(jobId, taskId, task.status);
        }
        if (bytes(hcsTopicId).length == 0) revert EmptyHcsTopic();

        task.status = TaskStatus.Completed;
        task.resultHash = resultHash;
        job.completedCount += 1;

        if (job.completedCount == job.taskCount) {
            job.status = JobStatus.Completed;
        }

        emit TaskCompleted(jobId, taskId, resultHash, hcsTopicId, hcsSequenceNumber);
        emit HcsLogAnchored(jobId, resultHash, hcsTopicId, hcsSequenceNumber);
    }

    /**
     * @notice Cancels an assigned task before completion; its reserved fee returns to margin.
     * @param jobId  Job the task belongs to.
     * @param taskId Index of the task within the job.
     */
    function cancelTask(uint256 jobId, uint256 taskId) external onlyOwner {
        Job storage job = _requireJob(jobId);
        Task storage task = _requireTask(jobId, taskId);

        if (task.status != TaskStatus.Assigned) {
            revert InvalidTaskStatus(jobId, taskId, task.status);
        }

        task.status = TaskStatus.Cancelled;
        job.committedFees -= task.fee;
        job.taskCount -= 1;

        if (job.taskCount > 0 && job.completedCount == job.taskCount) {
            job.status = JobStatus.Completed;
        }

        emit TaskCancelled(jobId, taskId, task.subAgent);
    }

    /**
     * @notice Settles a job: pays every completed task and sweeps the margin to the treasury.
     * @dev Each payout runs through {AetherisTreasury.settleSubAgent}, which chooses the HTS
     *      or ERC-20 route per token and emits {IAetherisEvents.MicroSettlement}. Margin is
     *      whatever escrow remains afterwards, so unfinished work is never paid for.
     *      Reentrancy-guarded: the payout loop hands control to token contracts.
     * @param jobId Job to settle.
     * @return paidToSubAgents Total streamed to sub-agents.
     * @return netMargin       Amount retained by the agency.
     */
    function settleJob(uint256 jobId)
        external
        onlyOwner
        nonReentrant
        returns (uint256 paidToSubAgents, uint256 netMargin)
    {
        Job storage job = _requireJob(jobId);
        if (job.status != JobStatus.Dispatched && job.status != JobStatus.Completed) {
            revert InvalidJobStatus(jobId, job.status);
        }

        // Mark settled up front so a malicious token cannot re-enter through another path.
        job.status = JobStatus.Settled;

        Task[] storage tasks = _tasks[jobId];
        uint256 length = tasks.length;

        for (uint256 i = 0; i < length; ++i) {
            Task storage task = tasks[i];
            if (task.status != TaskStatus.Completed) continue;

            task.status = TaskStatus.Paid;
            paidToSubAgents += task.fee;
            treasury.settleSubAgent(jobId, i, task.subAgent, task.fee);
        }

        netMargin = treasury.closeEscrow(jobId);

        job.paidOut = paidToSubAgents;
        job.netMargin = netMargin;

        emit JobSettled(jobId, job.deposit, paidToSubAgents, netMargin);
    }

    /**
     * @notice Cancels an unsettled job and returns the escrow to its client.
     * @dev Callable by the operator or the client. Any still-assigned tasks are cancelled.
     * @param jobId Job to refund.
     * @return refunded The amount returned to the client.
     */
    function refundJob(uint256 jobId) external nonReentrant returns (uint256 refunded) {
        Job storage job = _requireJob(jobId);
        if (msg.sender != owner() && msg.sender != job.client) {
            revert NotClientOrOperator(jobId, msg.sender);
        }
        if (job.status != JobStatus.Funded && job.status != JobStatus.Dispatched) {
            revert InvalidJobStatus(jobId, job.status);
        }

        job.status = JobStatus.Refunded;

        Task[] storage tasks = _tasks[jobId];
        uint256 length = tasks.length;
        for (uint256 i = 0; i < length; ++i) {
            if (tasks[i].status == TaskStatus.Assigned || tasks[i].status == TaskStatus.Completed) {
                tasks[i].status = TaskStatus.Cancelled;
                emit TaskCancelled(jobId, i, tasks[i].subAgent);
            }
        }

        refunded = treasury.refundEscrow(jobId, job.client);

        emit JobRefunded(jobId, job.client, job.token, refunded);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the full record for a job.
     * @param jobId Job to inspect.
     * @return The stored {Job} struct.
     */
    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /**
     * @notice Returns a single task of a job.
     * @param jobId  Job the task belongs to.
     * @param taskId Index of the task within the job.
     * @return The stored {Task} struct.
     */
    function getTask(uint256 jobId, uint256 taskId) external view returns (Task memory) {
        if (taskId >= _tasks[jobId].length) revert UnknownTask(jobId, taskId);
        return _tasks[jobId][taskId];
    }

    /**
     * @notice Returns every task assigned to a job, in taskId order.
     * @param jobId Job to inspect.
     * @return The job's task list.
     */
    function getTasks(uint256 jobId) external view returns (Task[] memory) {
        return _tasks[jobId];
    }

    /**
     * @notice Number of tasks ever pushed to a job, including cancelled ones.
     * @param jobId Job to inspect.
     * @return The length of the job's task array.
     */
    function taskLength(uint256 jobId) external view returns (uint256) {
        return _tasks[jobId].length;
    }

    /**
     * @notice Current lifecycle state of a job.
     * @param jobId Job to inspect.
     * @return The job's {IAetherisEvents.JobStatus}.
     */
    function jobStatus(uint256 jobId) external view returns (JobStatus) {
        return _jobs[jobId].status;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────────────────────

    /// @dev Loads a job, reverting when it was never created.
    function _requireJob(uint256 jobId) private view returns (Job storage job) {
        job = _jobs[jobId];
        if (job.status == JobStatus.None) revert UnknownJob(jobId);
    }

    /// @dev Loads a task, reverting when the index is out of range.
    function _requireTask(uint256 jobId, uint256 taskId) private view returns (Task storage) {
        if (taskId >= _tasks[jobId].length) revert UnknownTask(jobId, taskId);
        return _tasks[jobId][taskId];
    }

    /**
     * @dev World ID's `ByteHasher`: keccak256 of the payload, right-shifted 8 bits so the
     *      result fits the BN254 scalar field the Semaphore circuit operates over.
     */
    function _hashToField(bytes memory value) private pure returns (uint256) {
        return uint256(keccak256(value)) >> 8;
    }
}
