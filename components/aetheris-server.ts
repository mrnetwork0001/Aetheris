/**
 * Server-side data loaders.
 *
 * IMPORTANT: this module is server-only. It is imported from React Server
 * Components and route handlers exclusively — never from a `"use client"` file.
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
   Narrowing helpers — the frozen subgraph API returns `unknown`, so every field
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
  const subAgent = asString(r.subAgent ?? r.agent, "0x0000000000000000000000000000000000000000");
  return {
    taskId: asString(r.taskId ?? r.id, String(index + 1)),
    subAgent,
    subAgentName: asString(r.subAgentName ?? r.ensName, subAgent),
    role: asString(r.role, "Unspecified task"),
    feeRaw: asString(r.fee ?? r.feeRaw, "0"),
    status: asTaskStatus(r.status),
    hcsSequenceNumber: r.hcsSequenceNumber === undefined
      ? undefined
      : asString(r.hcsSequenceNumber),
    settlementMs: r.settlementMs === undefined ? undefined : asNumber(r.settlementMs),
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
    token: asString(r.token, "0x0000000000000000000000000000000000000000"),
    tokenSymbol: asString(r.tokenSymbol, "USDC"),
    tokenDecimals: asNumber(r.tokenDecimals, 6),
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

function normalizeStats(value: unknown, fallback: AgencyStats): AgencyStats {
  if (!isRecord(value)) return fallback;
  // AGENCY_STATS_QUERY returns { agency, agencyDayDatas, settlements, hcsAnchors },
  // so the scalar stats sit under `agency`. Accept a flat object too, so a
  // hand-rolled caller passing the entity directly still works.
  const a = isRecord(value.agency) ? value.agency : value;

  const ensName = typeof a.ensName === "string" && a.ensName !== "" ? a.ensName : null;
  const totalJobs = asNumber(a.totalJobs, fallback.totalJobs);
  const settledJobs = asNumber(a.jobsSettled ?? a.settledJobs, fallback.settledJobs);

  return {
    agency: asString(a.address ?? a.id, fallback.agency),
    ensName,
    operator: asString(a.operator, fallback.operator),
    totalJobs,
    // Not indexed directly — everything not yet settled is still in flight.
    activeJobs: Math.max(totalJobs - settledJobs, 0),
    settledJobs,
    // Retained margin is precisely what the treasury still holds.
    treasuryRaw: asString(a.netMargin ?? a.treasuryBalance ?? a.treasuryRaw, fallback.treasuryRaw),
    lifetimeMarginRaw: asString(
      a.netMargin ?? a.lifetimeMargin ?? a.lifetimeMarginRaw,
      fallback.lifetimeMarginRaw,
    ),
    subAgentCount: asNumber(a.uniqueSubAgentCount ?? a.subAgentCount, fallback.subAgentCount),
    hcsMessageCount: asNumber(a.hcsAnchorCount ?? a.hcsMessageCount, fallback.hcsMessageCount),
    avgFinalityMs: asNumber(a.avgFinalityMs, fallback.avgFinalityMs),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Loaders
   ──────────────────────────────────────────────────────────────────────────── */

export function isSubgraphConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  return typeof url === "string" && url.trim().length > 0;
}

const NO_SUBGRAPH = "NEXT_PUBLIC_SUBGRAPH_URL is not set — subgraph is not deployed yet.";

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
    return { data: jobs, source: "live" };
  } catch (error) {
    return { data: DEMO_JOBS, source: "demo", error: describeError(error) };
  }
}

export async function loadLeaderboard(first = 8): Promise<DataEnvelope<SubAgentRow[]>> {
  if (!isSubgraphConfigured()) {
    return { data: DEMO_SUB_AGENTS, source: "demo", error: NO_SUBGRAPH };
  }
  try {
    const { getSubAgentLeaderboard } = await import("@/lib/subgraph");
    const rows = await getSubAgentLeaderboard(first);
    const agents = asArray(rows).map(normalizeSubAgent);
    if (agents.length === 0) {
      return { data: DEMO_SUB_AGENTS, source: "demo", error: "Subgraph returned no sub-agents." };
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
    return { data: normalizeStats(raw, fallback), source: "live" };
  } catch (error) {
    return { data: fallback, source: "demo", error: describeError(error) };
  }
}

/**
 * Treasury holdings are not indexed by the subgraph yet — they will come from
 * on-chain balance reads once `AetherisTreasury.sol` is deployed. Until then
 * this is explicitly demo data and the panel badges it as such.
 */
export async function loadTreasury(): Promise<DataEnvelope<TreasuryHolding[]>> {
  return {
    data: DEMO_TREASURY,
    source: "demo",
    // The treasury IS deployed, but per-token balances are not indexed by
    // the subgraph, so this panel has no live source yet.
    error: "Treasury balances are not indexed by the subgraph yet.",
  };
}

export async function loadSettlements(): Promise<DataEnvelope<SettlementRow[]>> {
  if (!isSubgraphConfigured()) {
    return { data: DEMO_SETTLEMENTS, source: "demo", error: NO_SUBGRAPH };
  }
  try {
    const { querySubgraph } = await import("@/lib/subgraph");
    const result = await querySubgraph<{ microSettlements?: unknown[] }>(
      `query Settlements($first: Int!) {
        microSettlements(first: $first, orderBy: blockTimestamp, orderDirection: desc) {
          id
          jobId
          taskId
          subAgent
          token
          amount
          viaHts
          blockTimestamp
          transactionHash
        }
      }`,
      { first: 12 },
    );
    const rows = asArray(result?.microSettlements).map((value, index): SettlementRow => {
      const r = isRecord(value) ? value : {};
      const subAgent = asString(r.subAgent, "0x0000000000000000000000000000000000000000");
      return {
        jobId: asString(r.jobId, "0"),
        taskId: asString(r.taskId, String(index)),
        subAgent,
        subAgentName: asString(r.subAgentName, subAgent),
        amountRaw: asString(r.amount, "0"),
        tokenSymbol: asString(r.tokenSymbol, "USDC"),
        decimals: asNumber(r.tokenDecimals, 6),
        viaHts: r.viaHts === true || r.viaHts === "true",
        timestamp: asTimestampMs(r.blockTimestamp, Date.now()),
        txId: asString(r.transactionHash ?? r.id, ""),
      };
    });
    if (rows.length === 0) {
      return { data: DEMO_SETTLEMENTS, source: "demo", error: "No settlements indexed yet." };
    }
    return { data: rows, source: "live" };
  } catch (error) {
    return { data: DEMO_SETTLEMENTS, source: "demo", error: describeError(error) };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   Config bridges — read server-only constants and hand them to client
   components as plain props, so no server module is ever bundled for the browser.
   ──────────────────────────────────────────────────────────────────────────── */

export interface WorldIdConfig {
  appId: string;
  action: string;
  configured: boolean;
}

export async function loadWorldIdConfig(): Promise<WorldIdConfig> {
  try {
    const mod = await import("@/lib/worldid");
    const appId = asString(mod.WORLD_ID_APP_ID);
    const action = asString(mod.WORLD_ID_ACTION);
    return { appId, action, configured: appId.startsWith("app_") && action.length > 0 };
  } catch {
    return { appId: "", action: "", configured: false };
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
      error: "HEDERA_HCS_TOPIC_ID is not set — no live topic to mirror.",
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
