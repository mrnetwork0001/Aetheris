// ═══════════════════════════════════════════════════════════════════════════
//  Aetheris — AetherisAgency data source handlers
//
//  The seven events AetherisAgency.sol emits from IAetherisEvents.sol:
//    AgencyDeployed · OperatorVerified · JobCreated · SubAgentAssigned
//    TaskCompleted  · JobSettled       · HcsLogAnchored
//
//  MicroSettlement lives in treasury.ts — AetherisTreasury.settleSubAgent()
//  emits it, not the agency.
//
//  Every handler loads each entity exactly once, mutates running aggregates
//  in place, and saves at the end — no total is ever recomputed by scanning.
// ═══════════════════════════════════════════════════════════════════════════

import { BigInt, log } from "@graphprotocol/graph-ts";

import {
  AgencyDeployed,
  HcsLogAnchored,
  JobCreated,
  JobSettled,
  OperatorVerified,
  SubAgentAssigned,
  TaskCompleted,
} from "../generated/AetherisAgency/AetherisAgency";

import {
  HcsAnchor,
  JobSettlement,
  SubAgent,
  Task,
} from "../generated/schema";

import {
  JOB_STATUS_COMPLETED,
  JOB_STATUS_DISPATCHED,
  JOB_STATUS_FUNDED,
  JOB_STATUS_NONE,
  JOB_STATUS_SETTLED,
  ONE_BI,
  TASK_STATUS_COMPLETED,
  TASK_STATUS_PAID,
  addRoleToSubAgent,
  createTask,
  eventId,
  getOrCreateAgency,
  getOrCreateAgencyDayData,
  getOrCreateAgentRoleStat,
  getOrCreateJob,
  getOrCreateOperator,
  getOrCreateProtocol,
  getOrCreateProtocolDayData,
  getOrCreateSubAgent,
  getOrCreateToken,
  loadOrStubJob,
  markAgencyActive,
  markSubAgentActive,
  ratio,
  refreshSubAgentRates,
  syncAgencyDayCumulatives,
  taskEntityId,
} from "./helpers";

// ── Identity & governance ──────────────────────────────────────────────────

/**
 * `AgencyDeployed(address indexed agency, address indexed operator, string ensName, uint256 nullifierHash)`
 *
 * Note the agency address comes from the *parameter*, not `event.address` —
 * this event may be emitted by a factory rather than by the agency itself.
 */
export function handleAgencyDeployed(event: AgencyDeployed): void {
  let protocol = getOrCreateProtocol(event);
  let operator = getOrCreateOperator(event.params.operator, event, protocol);
  let agency = getOrCreateAgency(event.params.agency, event, protocol);

  // NOTE: `x == null` on a nullable `Bytes` field routes through ByteArray's
  // non-nullable `==` overload and crashes the AssemblyScript compiler.
  // Truthiness on the reference is the safe null test.
  let existingOperator = agency.operator;
  let hadOperator = true;
  if (!existingOperator) {
    hadOperator = false;
  }

  agency.operator = operator.id;
  agency.nullifierHash = event.params.nullifierHash;
  if (event.params.ensName.length > 0) {
    agency.ensName = event.params.ensName;
    // The agency's ENS name is a reasonable default label for its operator
    // until a dedicated `OperatorVerified` name arrives.
    if (operator.ensName == null) {
      operator.ensName = event.params.ensName;
    }
  }
  agency.createdAt = event.block.timestamp;
  agency.createdAtBlock = event.block.number;
  agency.createdAtTx = event.transaction.hash;

  if (!hadOperator) {
    operator.agencyCount = operator.agencyCount.plus(ONE_BI);
  }

  operator.save();
  agency.save();
  protocol.save();
}

/**
 * `OperatorVerified(address indexed operator, uint256 nullifierHash, string ensName)`
 *
 * World ID proof-of-personhood cleared. `verifiedOperatorCount` only moves the
 * first time an operator flips to verified.
 */
export function handleOperatorVerified(event: OperatorVerified): void {
  let protocol = getOrCreateProtocol(event);
  let operator = getOrCreateOperator(event.params.operator, event, protocol);

  if (!operator.verified) {
    operator.verified = true;
    protocol.verifiedOperatorCount = protocol.verifiedOperatorCount.plus(ONE_BI);
  }

  operator.nullifierHash = event.params.nullifierHash;
  operator.verifiedAt = event.block.timestamp;
  operator.verifiedAtBlock = event.block.number;
  if (event.params.ensName.length > 0) {
    operator.ensName = event.params.ensName;
  }

  operator.save();
  protocol.save();
}

// ── Job lifecycle ──────────────────────────────────────────────────────────

/**
 * `JobCreated(uint256 indexed jobId, address indexed client, address indexed token, uint256 deposit, string specURI)`
 */
export function handleJobCreated(event: JobCreated): void {
  let protocol = getOrCreateProtocol(event);
  let agency = getOrCreateAgency(event.address, event, protocol);
  let token = getOrCreateToken(event.params.token, event, protocol);
  let job = getOrCreateJob(event.params.jobId, agency, token, event, protocol);

  job.client = event.params.client;
  job.token = token.id;
  job.deposit = event.params.deposit;
  job.specURI = event.params.specURI;
  job.status = JOB_STATUS_FUNDED;
  job.createdAt = event.block.timestamp;
  job.createdAtBlock = event.block.number;
  job.createdAtTx = event.transaction.hash;

  token.jobCount = token.jobCount.plus(ONE_BI);
  token.totalDeposited = token.totalDeposited.plus(event.params.deposit);

  let dayData = getOrCreateAgencyDayData(agency, event);
  dayData.jobsCreated = dayData.jobsCreated.plus(ONE_BI);
  syncAgencyDayCumulatives(dayData, agency);

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.jobsCreated = protocolDay.jobsCreated.plus(ONE_BI);
  markAgencyActive(agency, protocolDay);

  job.save();
  token.save();
  dayData.save();
  protocolDay.save();
  agency.save();
  protocol.save();
}

/**
 * `SubAgentAssigned(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent, address token, uint256 fee, string role)`
 */
export function handleSubAgentAssigned(event: SubAgentAssigned): void {
  let protocol = getOrCreateProtocol(event);
  let agency = getOrCreateAgency(event.address, event, protocol);
  let token = getOrCreateToken(event.params.token, event, protocol);
  let subAgent = getOrCreateSubAgent(event.params.subAgent, event, protocol);
  let job = getOrCreateJob(event.params.jobId, agency, token, event, protocol);

  let id = taskEntityId(event.params.jobId, event.params.taskId);
  let task = Task.load(id);

  let dayData = getOrCreateAgencyDayData(agency, event);
  let roleStat = getOrCreateAgentRoleStat(subAgent, event.params.role, event);

  if (task == null) {
    task = createTask(
      id,
      event.params.taskId,
      job,
      agency,
      subAgent,
      token,
      event.params.fee,
      event.params.role,
      event,
      protocol
    );

    roleStat.tasksAssigned = roleStat.tasksAssigned.plus(ONE_BI);
    dayData.tasksAssigned = dayData.tasksAssigned.plus(ONE_BI);

    let protocolDay = getOrCreateProtocolDayData(event);
    protocolDay.tasksAssigned = protocolDay.tasksAssigned.plus(ONE_BI);
    markAgencyActive(agency, protocolDay);
    protocolDay.save();
  } else {
    // Idempotent re-emission of an existing assignment: refresh the mutable
    // terms without touching any counter.
    task.role = event.params.role;
    task.token = token.id;
    job.totalTaskFees = job.totalTaskFees.plus(event.params.fee).minus(task.fee);
    subAgent.totalFeesAssigned = subAgent.totalFeesAssigned
      .plus(event.params.fee)
      .minus(task.fee);
    task.fee = event.params.fee;
  }

  addRoleToSubAgent(subAgent, event.params.role);
  refreshSubAgentRates(subAgent);
  markSubAgentActive(agency, subAgent, dayData);

  if (job.status == JOB_STATUS_NONE || job.status == JOB_STATUS_FUNDED) {
    job.status = JOB_STATUS_DISPATCHED;
    job.dispatchedAt = event.block.timestamp;
  }

  syncAgencyDayCumulatives(dayData, agency);

  task.save();
  roleStat.save();
  subAgent.save();
  job.save();
  token.save();
  dayData.save();
  agency.save();
  protocol.save();
}

/**
 * `TaskCompleted(uint256 indexed jobId, uint256 indexed taskId, bytes32 resultHash, string hcsTopicId, uint64 hcsSequenceNumber)`
 *
 * The HCS topic id + sequence number pin the deliverable to a
 * consensus-ordered message on the Hedera mirror node.
 */
export function handleTaskCompleted(event: TaskCompleted): void {
  let id = taskEntityId(event.params.jobId, event.params.taskId);
  let task = Task.load(id);
  if (task == null) {
    // No `SubAgentAssigned` was indexed for this task — nothing to attribute
    // the completion to. Recording a stub would invent a sub-agent, so bail.
    log.warning("TaskCompleted for unknown task {} (tx {})", [
      id,
      event.transaction.hash.toHexString(),
    ]);
    return;
  }

  let protocol = getOrCreateProtocol(event);
  let agency = getOrCreateAgency(event.address, event, protocol);
  let job = loadOrStubJob(event.params.jobId, agency, event, protocol);

  let alreadyDone =
    task.status == TASK_STATUS_COMPLETED || task.status == TASK_STATUS_PAID;

  task.resultHash = event.params.resultHash;
  task.hcsTopicId = event.params.hcsTopicId;
  task.hcsSequenceNumber = event.params.hcsSequenceNumber;
  task.completedAt = event.block.timestamp;
  if (task.status != TASK_STATUS_PAID) {
    task.status = TASK_STATUS_COMPLETED;
  }

  let dayData = getOrCreateAgencyDayData(agency, event);

  if (!alreadyDone) {
    job.tasksCompleted = job.tasksCompleted.plus(ONE_BI);
    agency.tasksCompleted = agency.tasksCompleted.plus(ONE_BI);
    protocol.tasksCompleted = protocol.tasksCompleted.plus(ONE_BI);
    dayData.tasksCompleted = dayData.tasksCompleted.plus(ONE_BI);

    let protocolDay = getOrCreateProtocolDayData(event);
    protocolDay.tasksCompleted = protocolDay.tasksCompleted.plus(ONE_BI);
    markAgencyActive(agency, protocolDay);
    protocolDay.save();

    let subAgent = SubAgent.load(task.subAgent);
    if (subAgent != null) {
      subAgent.tasksCompleted = subAgent.tasksCompleted.plus(ONE_BI);
      subAgent.lastActiveAt = event.block.timestamp;
      refreshSubAgentRates(subAgent);
      markSubAgentActive(agency, subAgent, dayData);
      subAgent.save();

      let roleStat = getOrCreateAgentRoleStat(subAgent, task.role, event);
      roleStat.tasksCompleted = roleStat.tasksCompleted.plus(ONE_BI);
      roleStat.save();
    }
  }

  // "All tasks reported complete" — mirrors `JobStatus.Completed`.
  if (
    job.taskCount.gt(BigInt.zero()) &&
    job.tasksCompleted.ge(job.taskCount) &&
    job.status != JOB_STATUS_SETTLED
  ) {
    job.status = JOB_STATUS_COMPLETED;
    job.completedAt = event.block.timestamp;
  }

  syncAgencyDayCumulatives(dayData, agency);

  task.save();
  job.save();
  dayData.save();
  agency.save();
  protocol.save();
}

/**
 * `JobSettled(uint256 indexed jobId, uint256 grossDeposit, uint256 paidToSubAgents, uint256 netMargin)`
 *
 * Close-out: the agency's realised margin lands here and rolls up into the
 * agency, protocol and daily revenue series.
 */
export function handleJobSettled(event: JobSettled): void {
  let protocol = getOrCreateProtocol(event);
  let agency = getOrCreateAgency(event.address, event, protocol);
  let job = loadOrStubJob(event.params.jobId, agency, event, protocol);

  if (job.status == JOB_STATUS_SETTLED) {
    // `JobSettlement` is immutable — never re-write it.
    log.warning("Duplicate JobSettled for job {} (tx {})", [
      job.id,
      event.transaction.hash.toHexString(),
    ]);
    job.save();
    agency.save();
    protocol.save();
    return;
  }

  let settlement = new JobSettlement(job.id);
  settlement.job = job.id;
  settlement.agency = agency.id;
  settlement.grossDeposit = event.params.grossDeposit;
  settlement.paidToSubAgents = event.params.paidToSubAgents;
  settlement.netMargin = event.params.netMargin;
  settlement.marginRate = ratio(
    event.params.netMargin,
    event.params.grossDeposit
  );
  settlement.timestamp = event.block.timestamp;
  settlement.blockNumber = event.block.number;
  settlement.transactionHash = event.transaction.hash;
  settlement.logIndex = event.logIndex;
  settlement.save();

  job.status = JOB_STATUS_SETTLED;
  job.settledAt = event.block.timestamp;
  job.settlement = settlement.id;

  agency.jobsSettled = agency.jobsSettled.plus(ONE_BI);
  agency.grossRevenue = agency.grossRevenue.plus(event.params.grossDeposit);
  agency.totalPaidToSubAgents = agency.totalPaidToSubAgents.plus(
    event.params.paidToSubAgents
  );
  agency.netMargin = agency.netMargin.plus(event.params.netMargin);
  agency.marginRate = ratio(agency.netMargin, agency.grossRevenue);

  protocol.jobsSettled = protocol.jobsSettled.plus(ONE_BI);
  protocol.grossRevenue = protocol.grossRevenue.plus(event.params.grossDeposit);
  protocol.totalPaidToSubAgents = protocol.totalPaidToSubAgents.plus(
    event.params.paidToSubAgents
  );
  protocol.netMargin = protocol.netMargin.plus(event.params.netMargin);

  let dayData = getOrCreateAgencyDayData(agency, event);
  dayData.jobsSettled = dayData.jobsSettled.plus(ONE_BI);
  dayData.revenue = dayData.revenue.plus(event.params.grossDeposit);
  dayData.paidToSubAgents = dayData.paidToSubAgents.plus(
    event.params.paidToSubAgents
  );
  dayData.netMargin = dayData.netMargin.plus(event.params.netMargin);
  syncAgencyDayCumulatives(dayData, agency);

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.jobsSettled = protocolDay.jobsSettled.plus(ONE_BI);
  protocolDay.revenue = protocolDay.revenue.plus(event.params.grossDeposit);
  protocolDay.netMargin = protocolDay.netMargin.plus(event.params.netMargin);
  markAgencyActive(agency, protocolDay);

  job.save();
  dayData.save();
  protocolDay.save();
  agency.save();
  protocol.save();
}

// ── Hedera Consensus Service audit trail ───────────────────────────────────

/**
 * `HcsLogAnchored(uint256 indexed jobId, bytes32 messageHash, string topicId, uint64 sequenceNumber)`
 *
 * Immutable by construction: one row per anchored consensus message.
 */
export function handleHcsLogAnchored(event: HcsLogAnchored): void {
  let protocol = getOrCreateProtocol(event);
  let agency = getOrCreateAgency(event.address, event, protocol);
  let job = loadOrStubJob(event.params.jobId, agency, event, protocol);

  let anchor = new HcsAnchor(eventId(event));
  anchor.job = job.id;
  anchor.agency = agency.id;
  anchor.jobId = event.params.jobId;
  anchor.messageHash = event.params.messageHash;
  anchor.topicId = event.params.topicId;
  anchor.sequenceNumber = event.params.sequenceNumber;
  anchor.timestamp = event.block.timestamp;
  anchor.blockNumber = event.block.number;
  anchor.transactionHash = event.transaction.hash;
  anchor.logIndex = event.logIndex;
  anchor.save();

  job.hcsAnchorCount = job.hcsAnchorCount.plus(ONE_BI);
  agency.hcsAnchorCount = agency.hcsAnchorCount.plus(ONE_BI);
  protocol.hcsAnchorCount = protocol.hcsAnchorCount.plus(ONE_BI);

  let dayData = getOrCreateAgencyDayData(agency, event);
  dayData.hcsAnchors = dayData.hcsAnchors.plus(ONE_BI);
  syncAgencyDayCumulatives(dayData, agency);

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.hcsAnchors = protocolDay.hcsAnchors.plus(ONE_BI);
  markAgencyActive(agency, protocolDay);

  job.save();
  dayData.save();
  protocolDay.save();
  agency.save();
  protocol.save();
}
