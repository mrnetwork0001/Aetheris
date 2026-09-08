// ═══════════════════════════════════════════════════════════════════════════
//  Aetheris — shared mapping helpers
//
//  AssemblyScript, not TypeScript. Rules obeyed throughout this file:
//    • no closures over mutable state, no union types, no optional chaining
//    • every `Entity.load()` result is explicitly null-checked before use
//    • integers are converted explicitly (`BigInt.fromI32`, `.toI32()`)
//    • entities are loaded ONCE per handler and passed by reference so that a
//      helper's mutations are never lost to a second in-memory copy
//    • aggregates are maintained incrementally — nothing is ever recomputed by
//      scanning child entities
// ═══════════════════════════════════════════════════════════════════════════

import {
  Address,
  BigDecimal,
  BigInt,
  Bytes,
  ethereum,
} from "@graphprotocol/graph-ts";

import {
  ActiveAgencyMarker,
  ActiveSubAgentMarker,
  Agency,
  AgencyDayData,
  AgentRoleStat,
  Job,
  Operator,
  Protocol,
  ProtocolDayData,
  SubAgent,
  Task,
  Token,
} from "../generated/schema";

// ── Constants ──────────────────────────────────────────────────────────────

export const PROTOCOL_ID = "aetheris";
export const SECONDS_PER_DAY = 86400;

export const ZERO_BI = BigInt.fromI32(0);
export const ONE_BI = BigInt.fromI32(1);
export const ZERO_BD = BigDecimal.fromString("0");

/** Hedera EVM Testnet. Used to flag `Rebalance.crossChain`. */
export const HEDERA_TESTNET_CHAIN_ID = BigInt.fromI32(296);

export const ADDRESS_ZERO = Address.fromString(
  "0x0000000000000000000000000000000000000000"
);

// GraphQL enum values are written as plain strings by the mappings. These
// constants mirror `IAetherisEvents.JobStatus` / `TaskStatus` member-for-member.
export const JOB_STATUS_NONE = "None";
export const JOB_STATUS_FUNDED = "Funded";
export const JOB_STATUS_DISPATCHED = "Dispatched";
export const JOB_STATUS_COMPLETED = "Completed";
export const JOB_STATUS_SETTLED = "Settled";
export const JOB_STATUS_REFUNDED = "Refunded";

export const TASK_STATUS_NONE = "None";
export const TASK_STATUS_ASSIGNED = "Assigned";
export const TASK_STATUS_COMPLETED = "Completed";
export const TASK_STATUS_PAID = "Paid";
export const TASK_STATUS_CANCELLED = "Cancelled";

export const RAIL_HTS = "HTS";
export const RAIL_ERC20 = "ERC20";

// ── Small numeric / id utilities ───────────────────────────────────────────

/** Division that yields 0 instead of trapping when the denominator is zero. */
export function safeDiv(numerator: BigDecimal, denominator: BigDecimal): BigDecimal {
  if (denominator == ZERO_BD) {
    return ZERO_BD;
  }
  return numerator.div(denominator);
}

/** `numerator / denominator` as a BigDecimal ratio, zero-safe. */
export function ratio(numerator: BigInt, denominator: BigInt): BigDecimal {
  if (denominator.isZero()) {
    return ZERO_BD;
  }
  return numerator.toBigDecimal().div(denominator.toBigDecimal());
}

/** Deterministic, collision-free id for a log: `txHash ++ logIndex`. */
export function eventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

/** Composite task id, exactly as specified: `{jobId}-{taskId}`. */
export function taskEntityId(jobId: BigInt, taskId: BigInt): string {
  return jobId.toString() + "-" + taskId.toString();
}

/** Days since the unix epoch. */
export function dayIdFrom(timestamp: BigInt): i32 {
  return timestamp.toI32() / SECONDS_PER_DAY;
}

/** True if `value` is already present in `values`. */
export function stringArrayContains(values: string[], value: string): boolean {
  for (let i = 0; i < values.length; i++) {
    if (values[i] == value) {
      return true;
    }
  }
  return false;
}

// ── Protocol singleton ─────────────────────────────────────────────────────

export function getOrCreateProtocol(event: ethereum.Event): Protocol {
  let protocol = Protocol.load(PROTOCOL_ID);
  if (protocol == null) {
    protocol = new Protocol(PROTOCOL_ID);
    protocol.agencyCount = ZERO_BI;
    protocol.operatorCount = ZERO_BI;
    protocol.verifiedOperatorCount = ZERO_BI;
    protocol.subAgentCount = ZERO_BI;
    protocol.tokenCount = ZERO_BI;
    protocol.jobCount = ZERO_BI;
    protocol.jobsSettled = ZERO_BI;
    protocol.taskCount = ZERO_BI;
    protocol.tasksCompleted = ZERO_BI;
    protocol.settlementCount = ZERO_BI;
    protocol.htsSettlementCount = ZERO_BI;
    protocol.rebalanceCount = ZERO_BI;
    protocol.hcsAnchorCount = ZERO_BI;
    protocol.grossRevenue = ZERO_BI;
    protocol.totalPaidToSubAgents = ZERO_BI;
    protocol.netMargin = ZERO_BI;
    protocol.totalProfitClaimed = ZERO_BI;
  }
  protocol.lastUpdatedAt = event.block.timestamp;
  return protocol as Protocol;
}

// ── Operator ───────────────────────────────────────────────────────────────

export function getOrCreateOperator(
  address: Address,
  event: ethereum.Event,
  protocol: Protocol
): Operator {
  let operator = Operator.load(address);
  if (operator == null) {
    operator = new Operator(address);
    operator.address = address;
    operator.ensName = null;
    operator.verified = false;
    operator.nullifierHash = null;
    operator.verifiedAt = null;
    operator.verifiedAtBlock = null;
    operator.agencyCount = ZERO_BI;
    operator.profitClaimed = ZERO_BI;
    operator.profitClaimCount = ZERO_BI;
    operator.firstSeenAt = event.block.timestamp;
    protocol.operatorCount = protocol.operatorCount.plus(ONE_BI);
  }
  operator.lastActiveAt = event.block.timestamp;
  return operator as Operator;
}

// ── Agency ─────────────────────────────────────────────────────────────────

/**
 * Agencies are keyed by the contract address that emitted the event, so job
 * flow stays attributable even when `AgencyDeployed` fell before `startBlock`.
 */
export function getOrCreateAgency(
  address: Address,
  event: ethereum.Event,
  protocol: Protocol
): Agency {
  let agency = Agency.load(address);
  if (agency == null) {
    agency = new Agency(address);
    agency.address = address;
    agency.operator = null;
    agency.ensName = null;
    agency.nullifierHash = null;
    agency.totalJobs = ZERO_BI;
    agency.jobsSettled = ZERO_BI;
    agency.totalTasks = ZERO_BI;
    agency.tasksCompleted = ZERO_BI;
    agency.grossRevenue = ZERO_BI;
    agency.totalPaidToSubAgents = ZERO_BI;
    agency.netMargin = ZERO_BI;
    agency.marginRate = ZERO_BD;
    agency.totalMicroSettled = ZERO_BI;
    agency.microSettlementCount = ZERO_BI;
    agency.htsSettlementCount = ZERO_BI;
    agency.erc20SettlementCount = ZERO_BI;
    agency.hcsAnchorCount = ZERO_BI;
    agency.uniqueSubAgentCount = ZERO_BI;
    agency.createdAt = event.block.timestamp;
    agency.createdAtBlock = event.block.number;
    agency.createdAtTx = event.transaction.hash;
    protocol.agencyCount = protocol.agencyCount.plus(ONE_BI);
  }
  agency.lastActiveAt = event.block.timestamp;
  return agency as Agency;
}

// ── SubAgent ───────────────────────────────────────────────────────────────

export function getOrCreateSubAgent(
  address: Address,
  event: ethereum.Event,
  protocol: Protocol
): SubAgent {
  let subAgent = SubAgent.load(address);
  if (subAgent == null) {
    subAgent = new SubAgent(address);
    subAgent.address = address;
    subAgent.ensName = null;
    subAgent.tasksAssigned = ZERO_BI;
    subAgent.tasksCompleted = ZERO_BI;
    subAgent.tasksPaid = ZERO_BI;
    subAgent.tasksCancelled = ZERO_BI;
    subAgent.totalEarned = ZERO_BI;
    subAgent.totalFeesAssigned = ZERO_BI;
    subAgent.completionRate = ZERO_BD;
    subAgent.averageFee = ZERO_BD;
    subAgent.roles = new Array<string>(0);
    subAgent.agencyCount = ZERO_BI;
    subAgent.firstSeenAt = event.block.timestamp;
    protocol.subAgentCount = protocol.subAgentCount.plus(ONE_BI);
  }
  subAgent.lastActiveAt = event.block.timestamp;
  return subAgent as SubAgent;
}

/** Re-derive the two BigDecimal performance ratios after a counter changed. */
export function refreshSubAgentRates(subAgent: SubAgent): void {
  subAgent.completionRate = ratio(subAgent.tasksCompleted, subAgent.tasksAssigned);
  subAgent.averageFee = ratio(subAgent.totalFeesAssigned, subAgent.tasksAssigned);
}

/** Append a role to the sub-agent's role list if it is not already there. */
export function addRoleToSubAgent(subAgent: SubAgent, role: string): void {
  let roles = subAgent.roles;
  if (!stringArrayContains(roles, role)) {
    roles.push(role);
    subAgent.roles = roles;
  }
}

export function getOrCreateAgentRoleStat(
  subAgent: SubAgent,
  role: string,
  event: ethereum.Event
): AgentRoleStat {
  let id = subAgent.id.toHexString() + "-" + role;
  let stat = AgentRoleStat.load(id);
  if (stat == null) {
    stat = new AgentRoleStat(id);
    stat.subAgent = subAgent.id;
    stat.role = role;
    stat.tasksAssigned = ZERO_BI;
    stat.tasksCompleted = ZERO_BI;
    stat.totalEarned = ZERO_BI;
  }
  stat.lastActiveAt = event.block.timestamp;
  return stat as AgentRoleStat;
}

// ── Token ──────────────────────────────────────────────────────────────────

export function getOrCreateToken(
  address: Address,
  event: ethereum.Event,
  protocol: Protocol
): Token {
  let token = Token.load(address);
  if (token == null) {
    token = new Token(address);
    token.address = address;
    token.seenViaHts = false;
    token.jobCount = ZERO_BI;
    token.totalDeposited = ZERO_BI;
    token.totalSettled = ZERO_BI;
    token.totalClaimed = ZERO_BI;
    token.settlementCount = ZERO_BI;
    token.firstSeenAt = event.block.timestamp;
    protocol.tokenCount = protocol.tokenCount.plus(ONE_BI);
  }
  return token as Token;
}

// ── Job ────────────────────────────────────────────────────────────────────

/**
 * Jobs are keyed by `jobId`. A stub (`status: None`) is created defensively if
 * a task / settlement / HCS anchor references a job whose `JobCreated` event
 * was never indexed, so no non-null relation is ever dangling.
 */
export function getOrCreateJob(
  jobId: BigInt,
  agency: Agency,
  defaultToken: Token,
  event: ethereum.Event,
  protocol: Protocol
): Job {
  let id = jobId.toString();
  let job = Job.load(id);
  if (job == null) {
    job = new Job(id);
    job.jobId = jobId;
    job.agency = agency.id;
    job.client = ADDRESS_ZERO;
    job.token = defaultToken.id;
    job.deposit = ZERO_BI;
    job.specURI = "";
    job.status = JOB_STATUS_NONE;
    job.taskCount = ZERO_BI;
    job.tasksCompleted = ZERO_BI;
    job.tasksPaid = ZERO_BI;
    job.totalTaskFees = ZERO_BI;
    job.totalSettled = ZERO_BI;
    job.settlement = null;
    job.hcsAnchorCount = ZERO_BI;
    job.createdAt = event.block.timestamp;
    job.createdAtBlock = event.block.number;
    job.createdAtTx = event.transaction.hash;
    job.dispatchedAt = null;
    job.completedAt = null;
    job.settledAt = null;

    agency.totalJobs = agency.totalJobs.plus(ONE_BI);
    protocol.jobCount = protocol.jobCount.plus(ONE_BI);
  }
  return job as Job;
}

// ── Time-series roll-ups ───────────────────────────────────────────────────

export function getOrCreateAgencyDayData(
  agency: Agency,
  event: ethereum.Event
): AgencyDayData {
  let dayId = dayIdFrom(event.block.timestamp);
  let id = agency.id.toHexString() + "-" + dayId.toString();

  let dayData = AgencyDayData.load(id);
  if (dayData == null) {
    dayData = new AgencyDayData(id);
    dayData.agency = agency.id;
    dayData.dayId = dayId;
    dayData.date = dayId * SECONDS_PER_DAY;
    dayData.jobsCreated = ZERO_BI;
    dayData.jobsSettled = ZERO_BI;
    dayData.tasksAssigned = ZERO_BI;
    dayData.tasksCompleted = ZERO_BI;
    dayData.microSettlements = ZERO_BI;
    dayData.htsMicroSettlements = ZERO_BI;
    dayData.erc20MicroSettlements = ZERO_BI;
    dayData.microSettledVolume = ZERO_BI;
    dayData.revenue = ZERO_BI;
    dayData.paidToSubAgents = ZERO_BI;
    dayData.netMargin = ZERO_BI;
    dayData.marginRate = ZERO_BD;
    dayData.uniqueSubAgents = 0;
    dayData.hcsAnchors = ZERO_BI;
    dayData.cumulativeGrossRevenue = ZERO_BI;
    dayData.cumulativeNetMargin = ZERO_BI;
  }
  dayData.lastUpdatedAt = event.block.timestamp;
  return dayData as AgencyDayData;
}

/** Snapshot the agency's running totals onto the open day bucket. */
export function syncAgencyDayCumulatives(
  dayData: AgencyDayData,
  agency: Agency
): void {
  dayData.cumulativeGrossRevenue = agency.grossRevenue;
  dayData.cumulativeNetMargin = agency.netMargin;
  dayData.marginRate = ratio(dayData.netMargin, dayData.revenue);
}

export function getOrCreateProtocolDayData(event: ethereum.Event): ProtocolDayData {
  let dayId = dayIdFrom(event.block.timestamp);
  let id = dayId.toString();

  let dayData = ProtocolDayData.load(id);
  if (dayData == null) {
    dayData = new ProtocolDayData(id);
    dayData.dayId = dayId;
    dayData.date = dayId * SECONDS_PER_DAY;
    dayData.jobsCreated = ZERO_BI;
    dayData.jobsSettled = ZERO_BI;
    dayData.tasksAssigned = ZERO_BI;
    dayData.tasksCompleted = ZERO_BI;
    dayData.microSettlements = ZERO_BI;
    dayData.htsMicroSettlements = ZERO_BI;
    dayData.microSettledVolume = ZERO_BI;
    dayData.revenue = ZERO_BI;
    dayData.netMargin = ZERO_BI;
    dayData.rebalances = ZERO_BI;
    dayData.rebalanceVolumeIn = ZERO_BI;
    dayData.profitClaimed = ZERO_BI;
    dayData.hcsAnchors = ZERO_BI;
    dayData.activeAgencies = 0;
  }
  dayData.lastUpdatedAt = event.block.timestamp;
  return dayData as ProtocolDayData;
}

// ── Incremental distinct-counting ──────────────────────────────────────────

/**
 * Records that `subAgent` was active for `agency` on this day, incrementing
 * `AgencyDayData.uniqueSubAgents` and `Agency.uniqueSubAgentCount` at most once
 * each. Marker entities make this O(1) instead of an array scan.
 *
 * Neither `agency` nor `dayData` is saved here — the caller owns persistence.
 */
export function markSubAgentActive(
  agency: Agency,
  subAgent: SubAgent,
  dayData: AgencyDayData
): void {
  let agencyHex = agency.id.toHexString();
  let subAgentHex = subAgent.id.toHexString();

  let lifetimeId = agencyHex + "-" + subAgentHex;
  if (ActiveSubAgentMarker.load(lifetimeId) == null) {
    let lifetimeMarker = new ActiveSubAgentMarker(lifetimeId);
    lifetimeMarker.save();
    agency.uniqueSubAgentCount = agency.uniqueSubAgentCount.plus(ONE_BI);
    subAgent.agencyCount = subAgent.agencyCount.plus(ONE_BI);
  }

  let dailyId = agencyHex + "-" + dayData.dayId.toString() + "-" + subAgentHex;
  if (ActiveSubAgentMarker.load(dailyId) == null) {
    let dailyMarker = new ActiveSubAgentMarker(dailyId);
    dailyMarker.save();
    dayData.uniqueSubAgents = dayData.uniqueSubAgents + 1;
  }
}

/** Records that `agency` was active on this protocol day, at most once. */
export function markAgencyActive(
  agency: Agency,
  protocolDayData: ProtocolDayData
): void {
  let id = protocolDayData.dayId.toString() + "-" + agency.id.toHexString();
  if (ActiveAgencyMarker.load(id) == null) {
    let marker = new ActiveAgencyMarker(id);
    marker.save();
    protocolDayData.activeAgencies = protocolDayData.activeAgencies + 1;
  }
}

// ── Task construction ──────────────────────────────────────────────────────

/**
 * Creates a `Task` and applies every "a new task exists" counter in one place:
 * job, agency, protocol and sub-agent. Callers decide newness with
 * `Task.load(id) == null` before calling, so nothing is ever double-counted.
 *
 * Nothing is saved here — the caller owns persistence for all five entities.
 */
export function createTask(
  id: string,
  taskId: BigInt,
  job: Job,
  agency: Agency,
  subAgent: SubAgent,
  token: Token,
  fee: BigInt,
  role: string,
  event: ethereum.Event,
  protocol: Protocol
): Task {
  let task = new Task(id);
  task.taskId = taskId;
  task.job = job.id;
  task.agency = agency.id;
  task.subAgent = subAgent.id;
  task.role = role;
  task.token = token.id;
  task.fee = fee;
  task.status = TASK_STATUS_ASSIGNED;
  task.resultHash = null;
  task.hcsTopicId = null;
  task.hcsSequenceNumber = null;
  task.settlement = null;
  task.assignedAt = event.block.timestamp;
  task.assignedAtBlock = event.block.number;
  task.assignedAtTx = event.transaction.hash;
  task.completedAt = null;
  task.paidAt = null;

  job.taskCount = job.taskCount.plus(ONE_BI);
  job.totalTaskFees = job.totalTaskFees.plus(fee);
  agency.totalTasks = agency.totalTasks.plus(ONE_BI);
  protocol.taskCount = protocol.taskCount.plus(ONE_BI);
  subAgent.tasksAssigned = subAgent.tasksAssigned.plus(ONE_BI);
  subAgent.totalFeesAssigned = subAgent.totalFeesAssigned.plus(fee);

  return task;
}

/**
 * Loads a job, or fabricates a `status: None` stub if the `JobCreated` event
 * was never indexed. Used by handlers that carry no token in their payload;
 * the stub's token is the zero address, which on Hedera EVM also denotes
 * native HBAR.
 */
export function loadOrStubJob(
  jobId: BigInt,
  agency: Agency,
  event: ethereum.Event,
  protocol: Protocol
): Job {
  let existing = Job.load(jobId.toString());
  if (existing != null) {
    return existing as Job;
  }
  let placeholderToken = getOrCreateToken(ADDRESS_ZERO, event, protocol);
  placeholderToken.save();
  return getOrCreateJob(jobId, agency, placeholderToken, event, protocol);
}
