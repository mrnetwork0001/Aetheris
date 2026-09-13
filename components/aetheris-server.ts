/**
 * Server-side data loaders.
 *
 * IMPORTANT: this module is server-only. It is imported from React Server
 * Components and route handlers exclusively - never from a `"use client"` file.
 *
 * Every `@/lib/*` integration is pulled in with a dynamic `await import()`
 * wrapped in try/catch. That keeps a missing env var (or a module that throws
 * while initialising an SDK client) from taking down `next build`'s page-data
 * collection, and lets each loader fall back to clearly-labelled demo data.
 */

import {
  DEMO_HCS_MESSAGES,
  DEMO_JOBS,
  DEMO_SETTLEMENTS,
  DEMO_STATS,
  DEMO_SUB_AGENTS,
  DEMO_TREASURY,
  demoStatsFor,
  type AgencyStats,
  type DataEnvelope,
  type HcsMessage,
  type Job,
  type JobStatus,
  type SettlementRow,
  type SubAgentRow,
  type SubTask,
  type TaskStatus,
  type TreasuryHolding,
} from "./aetheris-data";

/* ────────────────────────────────────────────────────────────────────────────
   Narrowing helpers - the frozen subgraph API returns `unknown`, so every field
   is validated before it reaches a component. No `any`, anywhere.
   ──────────────────────────────────────────────────────────────────────────── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const JOB_STATUSES: readonly JobStatus[] = [
  "Funded",
  "Dispatched",
  "Completed",
  "Settled",
  "Refunded",
];

const TASK_STATUSES: readonly TaskStatus[] = ["Assigned", "Completed", "Paid", "Cancelled"];

function asJobStatus(value: unknown): JobStatus {
  if (typeof value === "string") {
    const match = JOB_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase());
    if (match) return match;
  }
  // Solidity enum ordinals: 0 = None, 1 = Funded … 5 = Refunded.
  const ordinal = asNumber(value, -1);
  return JOB_STATUSES[ordinal - 1] ?? "Funded";
}

function asTaskStatus(value: unknown): TaskStatus {
  if (typeof value === "string") {
    const match = TASK_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase());
    if (match) return match;
  }
  const ordinal = asNumber(value, -1);
  return TASK_STATUSES[ordinal - 1] ?? "Assigned";
}

/** Subgraph timestamps are seconds-since-epoch strings; the UI wants millis. */
function asTimestampMs(value: unknown, fallback: number): number {
  const raw = asNumber(value, 0);
  if (raw <= 0) return fallback;
  return raw < 1e12 ? raw * 1000 : raw;
}

function normalizeTask(value: unknown, index: number): SubTask {
  const r = isRecord(value) ? value : {};
  // On the live path `subAgent` is a SubAgent entity (`{ id, address, ensName }`);
  // demo fixtures carry a bare address. Unwrap either, exactly as loadSettlements does.
  const subAgentRef = r.subAgent ?? r.agent;
  const subAgent = entityAddress(subAgentRef) || "0x0000000000000000000000000000000000000000";
  const ensName =
    isRecord(subAgentRef) && typeof subAgentRef.ensName === "string" && subAgentRef.ensName !== ""
      ? subAgentRef.ensName
      : null;
  const explicitName = asString(r.subAgentName ?? r.ensName, "");
  // Settlement latency is paidAt − assignedAt (subgraph seconds → ms). It is
  // only real when both stamps exist; an unpaid task has no latency to report.
  const assignedAt = asNumber(r.assignedAt, 0);
  const paidAt = asNumber(r.paidAt, 0);
  const settlementMs =
    r.settlementMs !== undefined
      ? asNumber(r.settlementMs)
      : assignedAt > 0 && paidAt >= assignedAt
        ? (paidAt - assignedAt) * 1000
        : undefined;
  return {
    taskId: asString(r.taskId ?? r.id, String(index + 1)),
    subAgent,
    subAgentName: ensName ?? (explicitName !== "" ? explicitName : subAgent),
    role: asString(r.role, "Unspecified task"),
    feeRaw: asString(r.fee ?? r.feeRaw, "0"),
    status: asTaskStatus(r.status),
    hcsSequenceNumber:
      r.hcsSequenceNumber === undefined || r.hcsSequenceNumber === null
        ? undefined
        : asString(r.hcsSequenceNumber),
    hcsTopicId:
      typeof r.hcsTopicId === "string" && r.hcsTopicId !== "" ? r.hcsTopicId : undefined,
    settlementMs,
  };
}

function normalizeJob(value: unknown, index: number): Job {
  const r = isRecord(value) ? value : {};
  const jobId = asString(r.jobId ?? r.id, String(index));
  return {
    jobId,
    title: asString(r.title ?? r.specURI, `Job #${jobId}`),
    client: asString(r.client, "0x0000000000000000000000000000000000000000"),
    clientName: typeof r.clientName === "string" ? r.clientName : null,
    // `Job.token` is a Token entity ({ id }) in the deployed schema; a bare address
    // string is still accepted. Symbol/decimals are NOT indexed - loadJobs reads
    // them from the token contract; until then "" / 0 (never a fixture label).
    token: entityAddress(r.token).toLowerCase() || ZERO_ADDRESS,
    tokenSymbol: asString(r.tokenSymbol, ""),
    tokenDecimals: asNumber(r.tokenDecimals, 0),
    depositRaw: asString(r.deposit ?? r.depositRaw, "0"),
    netMarginRaw:
      r.netMargin === undefined && r.netMarginRaw === undefined
        ? undefined
        : asString(r.netMargin ?? r.netMarginRaw, "0"),
    specURI: asString(r.specURI, ""),
    status: asJobStatus(r.status),
    createdAt: asTimestampMs(r.createdAt ?? r.blockTimestamp, Date.now()),
    tasks: asArray(r.tasks).map(normalizeTask),
  };
}

function normalizeSubAgent(value: unknown, index: number): SubAgentRow {
  const r = isRecord(value) ? value : {};
  const address = asString(r.address ?? r.id, `0x${index.toString(16).padStart(40, "0")}`);
  const ensName = typeof r.ensName === "string" && r.ensName !== "" ? r.ensName : null;
  const rate = asNumber(r.completionRate ?? r.successRate, 1);
  return {
    address,
    ensName,
    role: asString(r.role ?? asArray(r.roles)[0], "Sub-agent"),
    tasksCompleted: asNumber(r.tasksCompleted ?? r.completedTasks, 0),
    totalEarnedRaw: asString(r.totalEarned ?? r.totalEarnedRaw, "0"),
    // Accept either a 0–1 fraction or a 0–100 percentage.
    successRate: rate > 1 ? Math.min(rate / 100, 1) : Math.max(0, Math.min(rate, 1)),
    avgSettlementMs: asNumber(r.avgSettlementMs, 0),
    // `averageFee` is indexed but not part of SubAgentRow; ignored here.
  };
}

/**
 * Shape a live subgraph payload into `AgencyStats`.
 *
 * Returns `null` when the payload carries no usable agency entity - `agency: null`
 * (the id is not an agency), or the id-only MINIMAL projection - so the caller can
 * fall back to demo data *badged as demo*. On the live path no field ever takes a
 * fixture value: anything the subgraph did not return is 0 / "" / "0" and the gap
 * is appended to `caveats`.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/** `NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS` when it is a well-formed EVM address, else "". */
function configuredOperatorAddress(): string {
  const configured = (process.env.NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS ?? "").trim();
  return ADDRESS_RE.test(configured) ? configured : "";
}

interface OperatorResolution {
  address: string;
  verified: boolean | null;
  nullifierHash: string | null;
  verifiedAt: number | null;
  caveat?: string;
}

/**
 * Resolve the agency's operator on the LIVE path. Order of truth:
 *   1. the `Operator` entity the subgraph indexed from `AgencyDeployed` /
 *      `OperatorVerified` (nested object, or a bare id string for older schemas);
 *   2. `NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS`, caveated: World ID status unknown;
 *   3. the zero address, caveated: not yet World ID-verified on-chain.
 * The demo operator fixture is never used once the subgraph has answered.
 */
function resolveOperator(a: Record<string, unknown>): OperatorResolution {
  const raw = a.operator;
  const indexed = isRecord(raw) ? asString(raw.address ?? raw.id, "") : asString(raw, "");

  if (ADDRESS_RE.test(indexed)) {
    const verified = isRecord(raw) && typeof raw.verified === "boolean" ? raw.verified : null;
    const nullifierRaw = isRecord(raw) ? asString(raw.nullifierHash, "") : asString(a.nullifierHash, "");
    const verifiedAt = isRecord(raw) ? asNumber(raw.verifiedAt, 0) : 0;
    return {
      address: indexed,
      verified,
      nullifierHash: nullifierRaw !== "" && nullifierRaw !== "0" ? nullifierRaw : null,
      verifiedAt: verifiedAt > 0 ? verifiedAt : null,
      caveat:
        verified === false
          ? "Operator is not yet World ID-verified on-chain (no OperatorVerified event indexed)."
          : undefined,
    };
  }

  const configured = configuredOperatorAddress();
  if (configured !== "") {
    return {
      address: configured,
      verified: null,
      nullifierHash: null,
      verifiedAt: null,
      caveat:
        "Operator not indexed by the subgraph - showing NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS; World ID verification status unknown.",
    };
  }
  return {
    address: ZERO_ADDRESS,
    verified: null,
    nullifierHash: null,
    verifiedAt: null,
    caveat:
      "Operator not indexed by the subgraph and NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS is not set - operator unknown, not yet World ID-verified on-chain.",
  };
}

function normalizeStats(value: unknown, requestedId: string, caveats: string[]): AgencyStats | null {
  if (!isRecord(value)) return null;
  // AGENCY_STATS_QUERY returns { agency, agencyDayDatas, settlements, hcsAnchors },
  // so the scalar stats sit under `agency`. Accept a flat entity too, so a
  // hand-rolled caller passing the entity directly still works.
  const a = "agency" in value ? value.agency : value;
  if (!isRecord(a)) return null;
  // The MINIMAL projection only yields `id` - that is not stats.
  if (a.totalJobs === undefined && a.jobsSettled === undefined && a.netMargin === undefined) {
    return null;
  }

  const ensName = typeof a.ensName === "string" && a.ensName !== "" ? a.ensName : null;
  const totalJobs = asNumber(a.totalJobs, 0);
  const settledJobs = asNumber(a.jobsSettled ?? a.settledJobs, 0);

  // `Agency.operator` is an Operator entity → { id, address, ensName }; a plain
  // string is still accepted for older schemas. Never the demo operator.
  const operator = resolveOperator(a);
  if (operator.caveat) caveats.push(operator.caveat);

  const netMargin = asString(a.netMargin ?? a.lifetimeMargin ?? a.lifetimeMarginRaw, "0");

  return {
    agency: asString(a.address ?? a.id, requestedId),
    ensName,
    operator: operator.address,
    operatorVerified: operator.verified,
    operatorNullifierHash: operator.nullifierHash,
    operatorVerifiedAt: operator.verifiedAt,
    totalJobs,
    // Not indexed directly - everything not yet settled is still in flight.
    activeJobs: Math.max(totalJobs - settledJobs, 0),
    settledJobs,
    // Retained margin until loadAgencyStats overwrites it with on-chain holdings.
    treasuryRaw: asString(a.treasuryBalance ?? a.treasuryRaw, netMargin),
    lifetimeMarginRaw: netMargin,
    subAgentCount: asNumber(a.uniqueSubAgentCount ?? a.subAgentCount, 0),
    // Raw indexer count; loadAgencyStats re-counts against the configured HCS
    // topic so anchors on topics the mirror node does not know are excluded.
    hcsMessageCount: asNumber(a.hcsAnchorCount ?? a.hcsMessageCount, 0),
    // Not indexed - loadAgencyStats derives it from paid-task timings. Never the
    // demo fixture on a live read: an unknown value is reported as 0.
    avgFinalityMs: asNumber(a.avgFinalityMs, 0),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Loaders
   ──────────────────────────────────────────────────────────────────────────── */

export function isSubgraphConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  return typeof url === "string" && url.trim().length > 0;
}

const NO_SUBGRAPH = "NEXT_PUBLIC_SUBGRAPH_URL is not set - subgraph is not deployed yet.";

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

export async function loadJobs(first = 12): Promise<DataEnvelope<Job[]>> {
  if (!isSubgraphConfigured()) return { data: DEMO_JOBS, source: "demo", error: NO_SUBGRAPH };
  try {
    const { getJobs } = await import("@/lib/subgraph");
    const rows = await getJobs(first);
    const jobs = asArray(rows).map(normalizeJob);
    if (jobs.length === 0) {
      return { data: DEMO_JOBS, source: "demo", error: "Subgraph returned no jobs." };
    }
    // Label each job's funding token from the contract itself (symbol()/decimals(),
    // memoised in lib/treasury). A failed read leaves symbol "" / decimals 0 and is
    // reported in the envelope error - never a literal fixture symbol.
    const caveats = await labelJobTokens(jobs);
    // Best effort: stamp each anchored task with whether its (topic, sequence)
    // actually exists on the Hedera mirror node. Failure leaves the field
    // undefined ("unverified") and never demotes the envelope to demo.
    await verifyHcsAnchors(jobs.flatMap((job) => job.tasks));
    // Jobs whose spec is `hcs://<topic>/<seq>` carry their brief on the audit topic;
    // resolve those in parallel (bounded) and promote the brief title. Anything that
    // fails leaves the job as-is and adds one summary caveat.
    caveats.push(...(await resolveJobBriefs(jobs)));
    return caveats.length > 0
      ? { data: jobs, source: "live", error: caveats.join(" ") }
      : { data: jobs, source: "live" };
  } catch (error) {
    return { data: DEMO_JOBS, source: "demo", error: describeError(error) };
  }
}

/** Overall cap on resolving briefs for one page load; non-hcs specs cost nothing. */
const BRIEFS_TIMEOUT_MS = 5_000;

/**
 * Resolve `JobBrief` frames for every job whose `specURI` is an `hcs://` pointer.
 * Sets `job.brief` and `job.title` on success; a miss (no frame, not a brief, hash
 * mismatch, mirror node error or timeout) leaves the job untouched.
 *
 * @returns At most one caveat line summarising the misses.
 */
async function resolveJobBriefs(jobs: Job[]): Promise<string[]> {
  let briefs: typeof import("@/lib/briefs");
  try {
    briefs = await import("@/lib/briefs");
  } catch (error) {
    return [`Job briefs unavailable: ${describeError(error)}`];
  }
  const targets = jobs
    .map((job) => ({ job, spec: briefs.parseSpecURI(job.specURI) }))
    .filter((t): t is { job: Job; spec: { kind: "hcs"; topicId: string; sequenceNumber: string } } => t.spec.kind === "hcs");
  if (targets.length === 0) return [];

  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), BRIEFS_TIMEOUT_MS));
  const settled = await Promise.race([
    Promise.allSettled(targets.map(({ spec }) => briefs.loadBrief(spec.topicId, spec.sequenceNumber))),
    timeout,
  ]);
  if (settled === "timeout") {
    return [`${targets.length} HCS job brief(s) could not be resolved within ${BRIEFS_TIMEOUT_MS / 1000}s.`];
  }

  const missed: string[] = [];
  settled.forEach((result, i) => {
    const target = targets[i];
    if (!target) return;
    if (result.status === "fulfilled" && result.value) {
      const brief = result.value;
      target.job.brief = {
        title: brief.title,
        role: brief.role,
        sequenceNumber: brief.sequenceNumber,
        topicId: brief.topicId,
      };
      target.job.title = brief.title;
    } else {
      missed.push(target.job.jobId);
    }
  });
  return missed.length > 0
    ? [`${missed.length} HCS job brief(s) did not resolve from the mirror node (job ${missed.join(", ")}).`]
    : [];
}

/**
 * Fill `tokenSymbol` / `tokenDecimals` on live jobs from on-chain metadata.
 * Returns caveats for every token (or the metadata module) that could not be read;
 * those jobs keep symbol "" and decimals 0 so amounts render in base units.
 */
async function labelJobTokens(jobs: Job[]): Promise<string[]> {
  const caveats: string[] = [];
  const addresses = new Set<string>();
  for (const job of jobs) {
    if (ADDRESS_RE.test(job.token) && job.token !== ZERO_ADDRESS) addresses.add(job.token);
    else caveats.push(`Job ${job.jobId}: funding token not indexed by the subgraph (deposit shown in base units).`);
  }
  if (addresses.size === 0) return caveats;
  const meta = new Map<string, { symbol: string; decimals: number }>();
  try {
    const { readTokenMetadata } = await import("@/lib/treasury");
    await Promise.all(
      [...addresses].map(async (addr) => {
        try {
          const m = await readTokenMetadata(addr);
          meta.set(addr, { symbol: m.symbol, decimals: m.decimals });
        } catch (error) {
          caveats.push(`Token ${addr} metadata read failed (deposits in base units): ${describeError(error)}`);
        }
      }),
    );
  } catch (error) {
    caveats.push(`Token metadata unavailable (deposits in base units): ${describeError(error)}`);
  }
  for (const job of jobs) {
    const m = meta.get(job.token);
    if (m) {
      job.tokenSymbol = m.symbol;
      job.tokenDecimals = m.decimals;
    }
  }
  return caveats;
}

/** Mean assignment→payout latency (ms) per lowercase sub-agent address. */
function averageSettlementMsByAgent(
  timings: ReadonlyArray<{ subAgent: string; assignedAt: number; paidAt: number }>,
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const t of timings) {
    const delta = t.paidAt - t.assignedAt;
    if (!Number.isFinite(delta) || delta < 0) continue;
    const key = t.subAgent.toLowerCase();
    const acc = sums.get(key) ?? { total: 0, count: 0 };
    acc.total += delta;
    acc.count += 1;
    sums.set(key, acc);
  }
  const out = new Map<string, number>();
  for (const [key, { total, count }] of sums) {
    if (count > 0) out.set(key, (total / count) * 1000);
  }
  return out;
}

export async function loadLeaderboard(first = 8): Promise<DataEnvelope<SubAgentRow[]>> {
  if (!isSubgraphConfigured()) {
    return { data: DEMO_SUB_AGENTS, source: "demo", error: NO_SUBGRAPH };
  }
  try {
    const { getSubAgentLeaderboard, getAgentTimings } = await import("@/lib/subgraph");
    const [rows, timings] = await Promise.all([
      getSubAgentLeaderboard(first),
      getAgentTimings().catch(() => []),
    ]);
    const agents = asArray(rows).map(normalizeSubAgent);
    if (agents.length === 0) {
      return { data: DEMO_SUB_AGENTS, source: "demo", error: "Subgraph returned no sub-agents." };
    }
    // The SubAgent entity carries no latency field; derive it from paid tasks:
    // mean(paidAt - assignedAt) in seconds → ms. Agents with no paid task stay 0,
    // which the UI renders as "-".
    const latency = averageSettlementMsByAgent(timings);
    for (const agent of agents) {
      agent.avgSettlementMs = latency.get(agent.address.toLowerCase()) ?? 0;
    }
    return { data: agents, source: "live" };
  } catch (error) {
    return { data: DEMO_SUB_AGENTS, source: "demo", error: describeError(error) };
  }
}

export async function loadAgencyStats(agency?: string): Promise<DataEnvelope<AgencyStats>> {
  const fallback = agency ? demoStatsFor(agency) : DEMO_STATS;
  if (!isSubgraphConfigured()) return { data: fallback, source: "demo", error: NO_SUBGRAPH };
  try {
    const { getAgencyStats } = await import("@/lib/subgraph");
    const target = agency ?? process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS ?? fallback.agency;
    const raw = await getAgencyStats(target);
    if (!isRecord(raw)) {
      return { data: fallback, source: "demo", error: "Subgraph returned no agency entity." };
    }
    const caveats: string[] = [];
    const stats = normalizeStats(raw, target, caveats);
    if (stats === null) {
      return {
        data: fallback,
        source: "demo",
        error: `Subgraph has no agency entity for ${target} - showing demo fixtures.`,
      };
    }

    // HCS anchors: count only those on the configured topic. Anchors on any
    // other topic (legacy seed jobs pointing at a topic the mirror node does
    // not know) are reported in the caveat instead of the headline number.
    const anchorCount = countHcsAnchors(raw.hcsAnchors);
    const configuredTopic = hcsTopicId();
    if (anchorCount === null) {
      caveats.push(
        `HCS anchors not returned by the subgraph - showing raw hcsAnchorCount (${stats.hcsMessageCount}), which may include anchors on unverifiable topics.`,
      );
    } else if (configuredTopic === "") {
      stats.hcsMessageCount = anchorCount.total;
      caveats.push("HEDERA_HCS_TOPIC_ID is not set - HCS anchor count is not filtered by topic.");
    } else {
      stats.hcsMessageCount = anchorCount.byTopic.get(configuredTopic) ?? 0;
      stats.hcsTopicId = configuredTopic;
      const foreign = [...anchorCount.byTopic.entries()].filter(([topic]) => topic !== configuredTopic);
      if (foreign.length > 0) {
        const excluded = foreign.map(([topic, n]) => `${n} on ${topic}`).join(", ");
        caveats.push(
          `HCS anchors counted on topic ${configuredTopic} only; excluded ${excluded} (legacy seed topic, not found on the mirror node).`,
        );
      }
    }

    // Finality = assignment → settled payout, averaged over every Paid task.
    // 0 when nothing has been paid yet; never the demo fixture on the live path.
    try {
      const { getTaskTimings } = await import("@/lib/subgraph");
      const timings = await getTaskTimings();
      stats.avgFinalityMs = meanFinalityMs(timings);
      if (timings.length === 0) caveats.push("No paid tasks yet - finality reads 0.");
    } catch (error) {
      stats.avgFinalityMs = 0;
      caveats.push(`Finality unavailable: ${describeError(error)}`);
    }

    // Treasury AUM = real on-chain holdings in micro-dollars; netMargin otherwise.
    const treasury = treasuryAddress();
    if (treasury === "") {
      caveats.push("NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS is not set - treasury shows retained margin.");
    } else {
      try {
        const { readTreasury } = await import("@/lib/treasury");
        const result = await readTreasury(treasury);
        stats.treasuryRaw = Math.round(result.totalUsd * 1_000_000).toString();
        caveats.push(...result.warnings);
      } catch (error) {
        caveats.push(`Treasury balance read failed (showing retained margin): ${describeError(error)}`);
      }
    }

    // World ID: the contract is authoritative for `operatorVerified`; the note says
    // honestly whether a real proof stands behind it (today: bypass mode, seed nullifier).
    await annotateOperatorVerification(stats, caveats);

    return caveats.length > 0
      ? { data: stats, source: "live", error: caveats.join(" ") }
      : { data: stats, source: "live" };
  } catch (error) {
    return { data: fallback, source: "demo", error: describeError(error) };
  }
}

/**
 * Whether this server could ever have relayed a real World ID proof. Uses the cached
 * verifier probe (app id known to the portal, action registered, RP credentials set);
 * falls back to env presence when the probe itself is unavailable.
 */
async function worldIdRelayability(): Promise<{ configured: boolean; relayable: boolean; detail: string }> {
  const configured = /^app_[a-zA-Z0-9_]+$/.test((process.env.NEXT_PUBLIC_WORLD_ID_APP_ID ?? "").trim());
  try {
    const { probeWorldIdReadiness } = await import("@/lib/worldid-status");
    const ready = await probeWorldIdReadiness();
    return { configured, relayable: ready.relayable, detail: ready.detail };
  } catch (error) {
    return {
      configured,
      relayable: false,
      detail: `World ID readiness could not be probed: ${describeError(error)}`,
    };
  }
}

/**
 * Plain-language provenance for `operatorVerified`. Never claims a World ID proof
 * unless the contract actually checked one (router present → `bypassed === false`).
 */
function describeOperatorVerification(input: {
  verified: boolean | null | undefined;
  bypassed: boolean | null | undefined;
  configured: boolean;
  relayable: boolean;
  relayDetail: string;
  relayed?: boolean | null;
  relayedAt?: number | null;
}): string {
  const { verified, bypassed, configured, relayable, relayDetail, relayed, relayedAt } = input;
  if (verified === null || verified === undefined) {
    return "World ID status unknown - the operator is not indexed and the contract could not be read.";
  }
  if (!verified) {
    return "Operator is NOT World ID-verified on-chain: no verifyOperator call has been recorded for this address.";
  }
  if (bypassed === false) {
    return "World ID proof verified on-chain: AetherisAgency checked the Groth16 proof through the World ID router and burned the nullifier.";
  }
  if (relayed === true) {
    const when = relayedAt ? ` on ${formatRelayDate(relayedAt)}` : "";
    return `The ZK proof behind this nullifier was verified by the World ID verifier and relayed by this server${when} (OperatorVerified frame on the HCS audit topic). The contract burned the nullifier without an on-chain router because none exists on Hedera.`;
  }
  const routerClause =
    bypassed === true
      ? "The contract has no World ID router on Hedera, so verifyOperator burned the nullifier without an on-chain ZK check."
      : "Whether the contract checked a ZK proof on-chain is unknown (worldIdVerificationBypassed() could not be read).";
  let sourceClause: string;
  if (relayed === null) {
    sourceClause = "The HCS audit topic could not be read, so whether a World ID proof was relayed for this nullifier is unknown.";
  } else if (relayable) {
    sourceClause = "No OperatorVerified frame on the audit topic matches this nullifier, so it is treated as the scripts/seed.js registration until a proof is relayed through /api/operator/verify.";
  } else if (configured) {
    sourceClause = `No World ID proof has been relayed (${relayDetail || "relay readiness unknown"}); this nullifier is the random one scripts/seed.js burned, not a proof of personhood.`;
  } else {
    sourceClause = "World ID is not configured on this server (NEXT_PUBLIC_WORLD_ID_APP_ID is empty); this nullifier is the random one scripts/seed.js burned, not a proof of personhood.";
  }
  return `${routerClause} ${sourceClause}`;
}

function formatRelayDate(unixSeconds: number): string {
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
  }
}

/**
 * Look for an `OperatorVerified` frame on the HCS audit topic whose nullifier equals
 * the on-chain one. Returns `{ relayed: false }` when none matches, `{ relayed: null }`
 * when the topic could not be read (no topic configured, mirror node down).
 */
async function findRelayedProofFrame(
  nullifierHash: string | null | undefined,
): Promise<{ relayed: boolean | null; at: number | null }> {
  const topic = hcsTopicId();
  if (topic === "" || !nullifierHash) return { relayed: null, at: null };
  let target: bigint;
  try {
    target = BigInt(nullifierHash);
  } catch {
    return { relayed: null, at: null };
  }
  try {
    const { readHcsMessages } = await import("@/lib/hedera");
    const rows = await readHcsMessages(topic, 100);
    for (const row of rows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.contents);
      } catch {
        continue;
      }
      if (!isRecord(parsed) || parsed.evt !== "OperatorVerified") continue;
      const raw = parsed.nullifier;
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      let candidate: bigint;
      try {
        candidate = BigInt(raw);
      } catch {
        continue;
      }
      if (candidate !== target) continue;
      const seconds = Math.floor(Number(String(row.consensusTimestamp).split(".")[0]));
      return { relayed: true, at: Number.isFinite(seconds) && seconds > 0 ? seconds : null };
    }
    return { relayed: false, at: null };
  } catch {
    return { relayed: null, at: null };
  }
}

/**
 * Cross-check the subgraph's `Operator.verified` against the contract and attach
 * `worldIdBypassed` / `operatorVerificationNote`. Failures leave the subgraph value
 * in place and are reported in `caveats` - nothing is invented.
 */
async function annotateOperatorVerification(stats: AgencyStats, caveats: string[]): Promise<void> {
  const { configured, relayable, detail: relayDetail } = await worldIdRelayability();
  stats.worldIdConfigured = configured;
  if (!configured) {
    caveats.push(
      "World ID is not configured (NEXT_PUBLIC_WORLD_ID_APP_ID empty) - the human gate runs as a labelled simulation and the on-chain operator registration is a seed nullifier, not a World ID proof.",
    );
  } else if (!relayable) {
    caveats.push(`World ID cannot relay a real proof yet: ${relayDetail}`);
  }

  if (!ADDRESS_RE.test(stats.operator) || stats.operator === ZERO_ADDRESS || !ADDRESS_RE.test(stats.agency)) {
    stats.worldIdBypassed = null;
    stats.operatorVerificationNote = describeOperatorVerification({
      verified: stats.operatorVerified,
      bypassed: null,
      configured,
      relayable,
      relayDetail,
    });
    return;
  }

  try {
    const { readOperatorRegistry } = await import("@/lib/operator-registry");
    const chain = await readOperatorRegistry(stats.agency, stats.operator);
    stats.worldIdBypassed = chain.worldIdBypassed;

    if (stats.operatorVerified !== null && stats.operatorVerified !== undefined && stats.operatorVerified !== chain.isVerified) {
      caveats.push(
        `Subgraph says operator verified=${String(stats.operatorVerified)} but AetherisAgency.isVerifiedOperator returns ${String(chain.isVerified)} - showing the contract value.`,
      );
    }
    stats.operatorVerified = chain.isVerified;

    if (chain.nullifierHash !== null && stats.operatorNullifierHash !== null && stats.operatorNullifierHash !== undefined && stats.operatorNullifierHash !== chain.nullifierHash) {
      caveats.push("Subgraph nullifier differs from AetherisAgency.operatorNullifier - showing the contract value.");
    }
    stats.operatorNullifierHash = chain.nullifierHash ?? stats.operatorNullifierHash ?? null;
  } catch (error) {
    stats.worldIdBypassed = null;
    caveats.push(`On-chain World ID registry read failed (showing subgraph value): ${describeError(error)}`);
  }

  // Provenance: an OperatorVerified frame on the audit topic with the same nullifier
  // means this server verified a real proof and relayed it (the contract cannot tell).
  if (stats.operatorVerified && stats.worldIdBypassed !== false) {
    const frame = await findRelayedProofFrame(stats.operatorNullifierHash);
    stats.worldIdProofRelayed = frame.relayed;
    stats.worldIdProofRelayedAt = frame.at;
    if (frame.relayed === null) {
      caveats.push("HCS audit topic could not be scanned for an OperatorVerified frame - World ID relay provenance is unknown.");
    }
  } else {
    stats.worldIdProofRelayed = null;
    stats.worldIdProofRelayedAt = null;
  }

  stats.operatorVerificationNote = describeOperatorVerification({
    verified: stats.operatorVerified,
    bypassed: stats.worldIdBypassed,
    configured,
    relayable,
    relayDetail,
    relayed: stats.worldIdProofRelayed,
    relayedAt: stats.worldIdProofRelayedAt,
  });
}

/**
 * Tally the `hcsAnchors` rows returned alongside the agency entity by topic.
 * Returns `null` when the subgraph did not return the anchor list at all (the
 * minimal fallback query), so the caller can fall back to `hcsAnchorCount`.
 */
function countHcsAnchors(value: unknown): { total: number; byTopic: Map<string, number> } | null {
  if (!Array.isArray(value)) return null;
  const byTopic = new Map<string, number>();
  let total = 0;
  for (const row of value) {
    if (!isRecord(row)) continue;
    const topic = asString(row.topicId, "unknown");
    byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
    total += 1;
  }
  return { total, byTopic };
}

/* ────────────────────────────────────────────────────────────────────────────
   HCS anchor verification against the Hedera mirror node
   ──────────────────────────────────────────────────────────────────────────── */

const DEFAULT_MIRROR_NODE = "https://testnet.mirrornode.hedera.com";
const NOT_FOUND_TTL_MS = 5 * 60_000;
const MIRROR_TIMEOUT_MS = 4_000;
const TOPIC_ID = /^\d+\.\d+\.\d+$/;

/** (topic, sequence) → exists on the mirror node. Found anchors are immutable, so they cache forever. */
const ANCHOR_CACHE = new Map<string, { exists: boolean; expiresAt: number }>();

function mirrorNodeBase(): string {
  const configured = (process.env.HEDERA_MIRROR_NODE_URL ?? "").trim();
  return (configured !== "" ? configured : DEFAULT_MIRROR_NODE).replace(/\/+$/, "");
}

/**
 * Does `GET /api/v1/topics/{topic}/messages/{seq}` resolve on the mirror node?
 * `true`/`false` are definitive (200 / 404); `undefined` means the check could
 * not be completed (network error, timeout, 5xx) and the anchor stays unverified.
 */
async function mirrorHasMessage(topicId: string, sequenceNumber: string): Promise<boolean | undefined> {
  const key = `${topicId}#${sequenceNumber}`;
  const cached = ANCHOR_CACHE.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.exists;

  const url =
    `${mirrorNodeBase()}/api/v1/topics/${encodeURIComponent(topicId)}` +
    `/messages/${encodeURIComponent(sequenceNumber)}`;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(MIRROR_TIMEOUT_MS),
    });
    if (response.ok) {
      ANCHOR_CACHE.set(key, { exists: true, expiresAt: Number.POSITIVE_INFINITY });
      return true;
    }
    if (response.status === 404) {
      ANCHOR_CACHE.set(key, { exists: false, expiresAt: Date.now() + NOT_FOUND_TTL_MS });
      return false;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Stamps `hcsAnchorVerified` on every task that carries an HCS anchor. Never throws. */
async function verifyHcsAnchors(tasks: SubTask[]): Promise<void> {
  const configured = hcsTopicId();
  const anchored = tasks.filter((t) => typeof t.hcsSequenceNumber === "string" && t.hcsSequenceNumber !== "");
  await Promise.all(
    anchored.map(async (task) => {
      // Subgraph rows always carry the topic; if one is missing, assume the
      // configured topic and surface that assumption via `hcsTopicId`.
      const topic = task.hcsTopicId ?? configured;
      const sequence = task.hcsSequenceNumber ?? "";
      if (!TOPIC_ID.test(topic) || sequence === "") return;
      task.hcsTopicId = topic;
      task.hcsAnchorVerified = await mirrorHasMessage(topic, sequence);
    }),
  );
}

/** Mean of (paidAt − assignedAt) in milliseconds; 0 when there is nothing to average. */
function meanFinalityMs(timings: readonly { assignedAt: number; paidAt: number }[]): number {
  const deltas = timings
    .map((t) => t.paidAt - t.assignedAt)
    .filter((d) => Number.isFinite(d) && d >= 0);
  if (deltas.length === 0) return 0;
  const meanSeconds = deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
  return Math.round(meanSeconds * 1000);
}

function treasuryAddress(): string {
  const configured = process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(configured.trim()) ? configured.trim() : "";
}

/**
 * Live treasury holdings: every token the subgraph has seen a job funded in is
 * read straight from `AetherisTreasury` over the Hedera JSON-RPC relay, plus the
 * native HBAR balance. Falls back to the demo fixture (badged) only when the
 * chain read itself fails.
 */
export async function loadTreasury(): Promise<DataEnvelope<TreasuryHolding[]>> {
  const treasury = treasuryAddress();
  if (treasury === "") {
    return {
      data: DEMO_TREASURY,
      source: "demo",
      error: "NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS is not set - no treasury to read.",
    };
  }
  try {
    const { readTreasury } = await import("@/lib/treasury");
    const result = await readTreasury(treasury);
    if (result.holdings.length === 0) {
      return { data: DEMO_TREASURY, source: "demo", error: "Treasury read returned no holdings." };
    }
    return result.warnings.length > 0
      ? { data: result.holdings, source: "live", error: result.warnings.join(" ") }
      : { data: result.holdings, source: "live" };
  } catch (error) {
    return { data: DEMO_TREASURY, source: "demo", error: describeError(error) };
  }
}

export async function loadSettlements(): Promise<DataEnvelope<SettlementRow[]>> {
  if (!isSubgraphConfigured()) {
    return { data: DEMO_SETTLEMENTS, source: "demo", error: NO_SUBGRAPH };
  }
  try {
    const { getSettlements } = await import("@/lib/subgraph");
    const raw = asArray(await getSettlements(12)).filter(isRecord);
    if (raw.length === 0) {
      return { data: DEMO_SETTLEMENTS, source: "demo", error: "No settlements indexed yet." };
    }
    // The MINIMAL projection yields only `id` - that is not a settlement history.
    if (raw.every((r) => r.amount === undefined)) {
      return {
        data: DEMO_SETTLEMENTS,
        source: "demo",
        error: "Subgraph rejected the settlements projection - showing demo fixtures.",
      };
    }

    // `Settlement.token` is a Token entity carrying only an address; label it from
    // the contract itself (symbol()/decimals(), memoised). A failed read is
    // reported honestly: symbol = address, decimals = 0 (base units shown).
    const caveats: string[] = [];
    const tokenAddresses = new Set<string>();
    for (const r of raw) {
      const addr = entityAddress(r.token);
      if (addr !== "") tokenAddresses.add(addr.toLowerCase());
    }
    const tokenMeta = new Map<string, { symbol: string; decimals: number }>();
    if (tokenAddresses.size > 0) {
      try {
        const { readTokenMetadata } = await import("@/lib/treasury");
        await Promise.all(
          [...tokenAddresses].map(async (addr) => {
            try {
              const meta = await readTokenMetadata(addr);
              tokenMeta.set(addr, { symbol: meta.symbol, decimals: meta.decimals });
            } catch (error) {
              caveats.push(`Token ${addr} metadata read failed (amounts in base units): ${describeError(error)}`);
            }
          }),
        );
      } catch (error) {
        caveats.push(`Token metadata unavailable (amounts in base units): ${describeError(error)}`);
      }
    }

    const rows = raw.map((r, index): SettlementRow => {
      const subAgent = entityAddress(r.subAgent) || "0x0000000000000000000000000000000000000000";
      const ensName = isRecord(r.subAgent) && typeof r.subAgent.ensName === "string" && r.subAgent.ensName !== ""
        ? r.subAgent.ensName
        : null;
      const token = entityAddress(r.token).toLowerCase();
      const meta = tokenMeta.get(token);
      return {
        jobId: isRecord(r.job) ? asString(r.job.jobId ?? r.job.id, "0") : asString(r.jobId, "0"),
        taskId: isRecord(r.task) ? asString(r.task.taskId ?? r.task.id, String(index)) : asString(r.taskId, String(index)),
        subAgent,
        subAgentName: ensName ?? subAgent,
        amountRaw: asString(r.amount, "0"),
        tokenSymbol: meta?.symbol ?? (token !== "" ? token : ""),
        decimals: meta?.decimals ?? 0,
        viaHts: r.viaHts === true || r.viaHts === "true" || r.rail === "HTS",
        timestamp: asTimestampMs(r.timestamp ?? r.blockTimestamp, Date.now()),
        txId: asString(r.transactionHash ?? r.id, ""),
      };
    });
    return caveats.length > 0
      ? { data: rows, source: "live", error: caveats.join(" ") }
      : { data: rows, source: "live" };
  } catch (error) {
    return { data: DEMO_SETTLEMENTS, source: "demo", error: describeError(error) };
  }
}

/** Address of an entity reference (`{ id, address }`) or a bare address string; "" if neither. */
function entityAddress(value: unknown): string {
  if (isRecord(value)) return asString(value.address ?? value.id, "");
  return asString(value, "");
}

/* ────────────────────────────────────────────────────────────────────────────
   Config bridges - read server-only constants and hand them to client
   components as plain props, so no server module is ever bundled for the browser.
   ──────────────────────────────────────────────────────────────────────────── */

export interface WorldIdConfig {
  appId: string;
  action: string;
  /** App id + action are set (env presence only - see `relayable` for evidence). */
  configured: boolean;
  /** WORLD_ID_RP_ID + WORLD_ID_RP_SIGNING_KEY present, so IDKit v4 can open. */
  rpConfigured?: boolean;
  /** What the World ID verifier said about app/action when probed (cached 60 s). */
  actionStatus?: "ok" | "action-missing" | "app-not-found" | "unknown" | "unconfigured";
  /** True only when a real proof could be verified AND relayed from this server. */
  relayable?: boolean;
  /** The blocking gap, in plain language; empty when `relayable`. */
  detail?: string;
}

export async function loadWorldIdConfig(): Promise<WorldIdConfig> {
  let appId = "";
  let action = "";
  try {
    const mod = await import("@/lib/worldid");
    appId = asString(mod.WORLD_ID_APP_ID);
    action = asString(mod.WORLD_ID_ACTION);
  } catch {
    return { appId: "", action: "", configured: false, relayable: false, actionStatus: "unknown" };
  }
  const configured = appId.startsWith("app_") && action.length > 0;
  try {
    const { probeWorldIdReadiness } = await import("@/lib/worldid-status");
    const ready = await probeWorldIdReadiness();
    return {
      appId,
      action,
      configured,
      rpConfigured: ready.rpConfigured,
      actionStatus: ready.actionStatus,
      relayable: ready.relayable,
      detail: ready.detail,
    };
  } catch (error) {
    return {
      appId,
      action,
      configured,
      relayable: false,
      actionStatus: "unknown",
      detail: `World ID readiness probe failed: ${describeError(error)}`,
    };
  }
}

export interface ChainOption {
  id: number;
  name: string;
}

const FALLBACK_CHAINS: ChainOption[] = [
  { id: 1, name: "Ethereum" },
  { id: 137, name: "Polygon" },
  { id: 42161, name: "Arbitrum One" },
  { id: 8453, name: "Base" },
  { id: 10, name: "Optimism" },
];

export async function loadSupportedChains(): Promise<ChainOption[]> {
  try {
    const { SUPPORTED_CHAINS } = await import("@/lib/oneinch");
    const chains = SUPPORTED_CHAINS.map((chain) => ({ id: chain.id, name: chain.name }));
    return chains.length > 0 ? chains : FALLBACK_CHAINS;
  } catch {
    return FALLBACK_CHAINS;
  }
}

export async function loadHederaChainId(): Promise<number> {
  try {
    const { HEDERA_TESTNET_CHAIN_ID } = await import("@/lib/hedera");
    return HEDERA_TESTNET_CHAIN_ID;
  } catch {
    return 296;
  }
}

export function hcsTopicId(): string {
  const configured =
    process.env.HEDERA_HCS_TOPIC_ID ?? process.env.NEXT_PUBLIC_HEDERA_HCS_TOPIC_ID ?? "";
  return /^\d+\.\d+\.\d+$/.test(configured) ? configured : "";
}

export async function loadHcsMessages(limit = 12): Promise<DataEnvelope<HcsMessage[]>> {
  const topicId = hcsTopicId();
  if (topicId === "") {
    return {
      data: DEMO_HCS_MESSAGES.slice(0, limit),
      source: "demo",
      error: "HEDERA_HCS_TOPIC_ID is not set - no live topic to mirror.",
    };
  }
  try {
    const { readHcsMessages } = await import("@/lib/hedera");
    const messages = await readHcsMessages(topicId, limit);
    if (messages.length === 0) {
      return {
        data: DEMO_HCS_MESSAGES.slice(0, limit),
        source: "demo",
        error: "HCS topic has no messages yet.",
      };
    }
    return { data: messages, source: "live" };
  } catch (error) {
    return {
      data: DEMO_HCS_MESSAGES.slice(0, limit),
      source: "demo",
      error: describeError(error),
    };
  }
}

export interface EnsProfile {
  address: string | null;
  name: string | null;
  avatar: string | null;
}

/** Resolves in whichever direction the input implies. Never throws. */
export async function resolveEnsProfile(input: string): Promise<EnsProfile> {
  const trimmed = input.trim();
  if (trimmed === "") return { address: null, name: null, avatar: null };
  try {
    const ens = await import("@/lib/ens");
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      const name = await ens.lookupEnsAddress(trimmed);
      const avatar = name ? await ens.getEnsAvatar(name) : null;
      return { address: trimmed, name, avatar };
    }
    const address = await ens.resolveEnsName(trimmed);
    const avatar = await ens.getEnsAvatar(trimmed);
    return { address, name: trimmed, avatar };
  } catch {
    return {
      address: /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : null,
      name: /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? null : trimmed,
      avatar: null,
    };
  }
}
