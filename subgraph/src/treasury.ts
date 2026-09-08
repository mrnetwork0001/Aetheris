// ═══════════════════════════════════════════════════════════════════════════
//  Aetheris — AetherisTreasury data source handlers
//
//    MicroSettlement · TreasuryRebalanced · ProfitClaimed
//
//  MicroSettlement lives here, not in agency.ts, because
//  `AetherisTreasury.settleSubAgent()` is what emits it — the sub-second HTS
//  payout is a treasury operation. That means `event.address` is the TREASURY,
//  so the owning agency is resolved via the job (see `resolveAgency`).
//
//  The other two are the 1inch Swap API v6.0 rebalances and the World-ID-gated
//  margin withdrawals.
// ═══════════════════════════════════════════════════════════════════════════

import { BigInt, ethereum, log } from "@graphprotocol/graph-ts";

import {
  AetherisTreasury,
  MicroSettlement,
  ProfitClaimed,
  TreasuryRebalanced,
} from "../generated/AetherisTreasury/AetherisTreasury";

import {
  Agency,
  Job,
  ProfitClaim,
  Protocol,
  Rebalance,
  Settlement,
  Task,
} from "../generated/schema";

import {
  ADDRESS_ZERO,
  HEDERA_TESTNET_CHAIN_ID,
  ONE_BI,
  RAIL_ERC20,
  RAIL_HTS,
  TASK_STATUS_PAID,
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
  markAgencyActive,
  markSubAgentActive,
  ratio,
  refreshSubAgentRates,
  syncAgencyDayCumulatives,
  taskEntityId,
} from "./helpers";

/**
 * Resolves the agency that owns `jobId`.
 *
 * Treasury events carry the treasury address in `event.address`, so agency
 * aggregates would be attributed to the wrong entity if we used it directly.
 * The job — created by `AetherisAgency.createJob()` — already carries the
 * correct link, so that is the cheap path. Only when the job is unknown do we
 * pay for an `eth_call` to the treasury's `agency()` view.
 */
function resolveAgency(
  jobId: BigInt,
  event: ethereum.Event,
  protocol: Protocol
): Agency {
  let job = Job.load(jobId.toString());
  if (job != null) {
    let owner = Agency.load(job.agency);
    if (owner != null) {
      owner.lastActiveAt = event.block.timestamp;
      return owner as Agency;
    }
  }

  let treasury = AetherisTreasury.bind(event.address);
  let wired = treasury.try_agency();
  if (!wired.reverted && wired.value.notEqual(ADDRESS_ZERO)) {
    return getOrCreateAgency(wired.value, event, protocol);
  }

  // Last resort: attribute to the treasury itself rather than drop the event.
  log.warning("MicroSettlement: could not resolve agency for job {} (tx {})", [
    jobId.toString(),
    event.transaction.hash.toHexString(),
  ]);
  return getOrCreateAgency(event.address, event, protocol);
}

/**
 * `MicroSettlement(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent, address token, uint256 amount, bool viaHts)`
 *
 * Emitted by `AetherisTreasury.settleSubAgent()` — the sub-second Hedera
 * payout. `viaHts` is preserved verbatim and mirrored into `Settlement.rail`,
 * so HTS-vs-ERC-20 routing is directly queryable.
 */
export function handleMicroSettlement(event: MicroSettlement): void {
  let protocol = getOrCreateProtocol(event);
  let token = getOrCreateToken(event.params.token, event, protocol);
  let subAgent = getOrCreateSubAgent(event.params.subAgent, event, protocol);

  // `event.address` is the TREASURY here, not the agency — resolve the owning
  // agency before touching any agency-scoped aggregate.
  let agency = resolveAgency(event.params.jobId, event, protocol);
  let job = getOrCreateJob(event.params.jobId, agency, token, event, protocol);

  let taskKey = taskEntityId(event.params.jobId, event.params.taskId);
  let task = Task.load(taskKey);
  if (task == null) {
    // A payout with no indexed assignment: `Settlement.task` is non-null, so
    // materialise the task from what the payout itself tells us.
    task = createTask(
      taskKey,
      event.params.taskId,
      job,
      agency,
      subAgent,
      token,
      event.params.amount,
      "",
      event,
      protocol
    );
  }

  let settlement = new Settlement(eventId(event));
  settlement.job = job.id;
  settlement.task = task.id;
  settlement.agency = agency.id;
  settlement.subAgent = subAgent.id;
  settlement.token = token.id;
  settlement.amount = event.params.amount;
  settlement.viaHts = event.params.viaHts;
  settlement.rail = event.params.viaHts ? RAIL_HTS : RAIL_ERC20;
  settlement.timestamp = event.block.timestamp;
  settlement.blockNumber = event.block.number;
  settlement.transactionHash = event.transaction.hash;
  settlement.logIndex = event.logIndex;
  settlement.save();

  let alreadyPaid = task.status == TASK_STATUS_PAID;
  task.settlement = settlement.id;
  task.status = TASK_STATUS_PAID;
  task.paidAt = event.block.timestamp;

  if (!alreadyPaid) {
    job.tasksPaid = job.tasksPaid.plus(ONE_BI);
    subAgent.tasksPaid = subAgent.tasksPaid.plus(ONE_BI);
  }

  job.totalSettled = job.totalSettled.plus(event.params.amount);

  subAgent.totalEarned = subAgent.totalEarned.plus(event.params.amount);
  refreshSubAgentRates(subAgent);

  let roleStat = getOrCreateAgentRoleStat(subAgent, task.role, event);
  roleStat.totalEarned = roleStat.totalEarned.plus(event.params.amount);
  roleStat.save();

  agency.totalMicroSettled = agency.totalMicroSettled.plus(event.params.amount);
  agency.microSettlementCount = agency.microSettlementCount.plus(ONE_BI);

  token.totalSettled = token.totalSettled.plus(event.params.amount);
  token.settlementCount = token.settlementCount.plus(ONE_BI);

  protocol.settlementCount = protocol.settlementCount.plus(ONE_BI);

  let dayData = getOrCreateAgencyDayData(agency, event);
  dayData.microSettlements = dayData.microSettlements.plus(ONE_BI);
  dayData.microSettledVolume = dayData.microSettledVolume.plus(
    event.params.amount
  );

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.microSettlements = protocolDay.microSettlements.plus(ONE_BI);
  protocolDay.microSettledVolume = protocolDay.microSettledVolume.plus(
    event.params.amount
  );

  if (event.params.viaHts) {
    token.seenViaHts = true;
    agency.htsSettlementCount = agency.htsSettlementCount.plus(ONE_BI);
    protocol.htsSettlementCount = protocol.htsSettlementCount.plus(ONE_BI);
    dayData.htsMicroSettlements = dayData.htsMicroSettlements.plus(ONE_BI);
    protocolDay.htsMicroSettlements = protocolDay.htsMicroSettlements.plus(ONE_BI);
  } else {
    agency.erc20SettlementCount = agency.erc20SettlementCount.plus(ONE_BI);
    dayData.erc20MicroSettlements = dayData.erc20MicroSettlements.plus(ONE_BI);
  }

  markSubAgentActive(agency, subAgent, dayData);
  markAgencyActive(agency, protocolDay);
  syncAgencyDayCumulatives(dayData, agency);

  task.save();
  subAgent.save();
  job.save();
  token.save();
  dayData.save();
  protocolDay.save();
  agency.save();
  protocol.save();
}


/**
 * `TreasuryRebalanced(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut, uint256 dstChainId, bytes32 oneInchTxHash)`
 *
 * `crossChain` is derived by comparing `dstChainId` against Hedera testnet
 * (296), which makes Fusion+ cross-chain fills filterable in one predicate.
 */
export function handleTreasuryRebalanced(event: TreasuryRebalanced): void {
  let protocol = getOrCreateProtocol(event);
  let fromToken = getOrCreateToken(event.params.fromToken, event, protocol);
  let toToken = getOrCreateToken(event.params.toToken, event, protocol);

  let rebalance = new Rebalance(eventId(event));
  rebalance.treasury = event.address;
  rebalance.fromToken = fromToken.id;
  rebalance.toToken = toToken.id;
  rebalance.amountIn = event.params.amountIn;
  rebalance.amountOut = event.params.amountOut;
  rebalance.dstChainId = event.params.dstChainId;
  rebalance.crossChain = !event.params.dstChainId.equals(
    HEDERA_TESTNET_CHAIN_ID
  );
  rebalance.oneInchTxHash = event.params.oneInchTxHash;
  rebalance.executionRate = ratio(
    event.params.amountOut,
    event.params.amountIn
  );
  rebalance.timestamp = event.block.timestamp;
  rebalance.blockNumber = event.block.number;
  rebalance.transactionHash = event.transaction.hash;
  rebalance.logIndex = event.logIndex;
  rebalance.save();

  protocol.rebalanceCount = protocol.rebalanceCount.plus(ONE_BI);

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.rebalances = protocolDay.rebalances.plus(ONE_BI);
  protocolDay.rebalanceVolumeIn = protocolDay.rebalanceVolumeIn.plus(
    event.params.amountIn
  );

  fromToken.save();
  toToken.save();
  protocolDay.save();
  protocol.save();
}

/**
 * `ProfitClaimed(address indexed operator, address indexed token, uint256 amount, uint256 nullifierHash)`
 *
 * A withdrawal is only reachable behind World ID, so the nullifier hash is
 * carried onto both the claim and the operator for auditability.
 */
export function handleProfitClaimed(event: ProfitClaimed): void {
  let protocol = getOrCreateProtocol(event);
  let operator = getOrCreateOperator(event.params.operator, event, protocol);
  let token = getOrCreateToken(event.params.token, event, protocol);

  let claim = new ProfitClaim(eventId(event));
  claim.operator = operator.id;
  claim.treasury = event.address;
  claim.token = token.id;
  claim.amount = event.params.amount;
  claim.nullifierHash = event.params.nullifierHash;
  claim.timestamp = event.block.timestamp;
  claim.blockNumber = event.block.number;
  claim.transactionHash = event.transaction.hash;
  claim.logIndex = event.logIndex;
  claim.save();

  operator.profitClaimed = operator.profitClaimed.plus(event.params.amount);
  operator.profitClaimCount = operator.profitClaimCount.plus(ONE_BI);
  // Truthiness, not `== null`: BigInt's `==` overload is non-nullable and
  // comparing it against `null` crashes the AssemblyScript compiler.
  let knownNullifier = operator.nullifierHash;
  if (!knownNullifier) {
    operator.nullifierHash = event.params.nullifierHash;
  }

  token.totalClaimed = token.totalClaimed.plus(event.params.amount);
  protocol.totalProfitClaimed = protocol.totalProfitClaimed.plus(
    event.params.amount
  );

  let protocolDay = getOrCreateProtocolDayData(event);
  protocolDay.profitClaimed = protocolDay.profitClaimed.plus(
    event.params.amount
  );

  operator.save();
  token.save();
  protocolDay.save();
  protocol.save();
}
