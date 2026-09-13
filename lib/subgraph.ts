/**
 * The Graph - Aetheris DeAI agency analytics subgraph client.
 *
 * Entities indexed by the Aetheris subgraph (plural collection names):
 *   agencies · jobs · tasks · subAgents · settlements · rebalances ·
 *   hcsAnchors · agencyDayDatas
 *
 * Resilience contract: if `NEXT_PUBLIC_SUBGRAPH_URL` is unset - or the endpoint is
 * still deploying - every helper degrades to an empty result so the dashboard renders
 * a clean "no data yet" state instead of crashing. Query field sets are also
 * fallback-guarded: if the subgraph schema does not yet expose a field we ask for,
 * we retry with an id-only projection rather than surfacing a GraphQL error.
 */

import { GraphQLClient } from 'graphql-request';
import { publicEnv } from './env';

/** Raised when the subgraph endpoint responds with an error we cannot recover from. */
export class SubgraphError extends Error {
  readonly name = 'SubgraphError';
  readonly query: string;

  constructor(message: string, query: string) {
    super(`Subgraph query failed: ${message}`);
    this.query = query;
  }
}

let cachedClient: GraphQLClient | null = null;
let cachedUrl = '';

/**
 * Resolve the configured subgraph endpoint.
 *
 * @returns The endpoint URL, or `''` when unconfigured.
 */
export function getSubgraphUrl(): string {
  return publicEnv.subgraphUrl.trim();
}

/**
 * Whether a subgraph endpoint is configured.
 *
 * @returns True when `NEXT_PUBLIC_SUBGRAPH_URL` is set.
 */
export function isSubgraphConfigured(): boolean {
  return getSubgraphUrl().length > 0;
}

/**
 * Lazily create (and memoize) the GraphQL client. Built on first query, never at
 * import time, so `next build` succeeds without the env var.
 *
 * @returns A client, or `null` when unconfigured.
 */
/** Upper bound for one indexer round-trip; the callers fall back to demo data on abort. */
const SUBGRAPH_TIMEOUT_MS = 8_000;

/**
 * `fetch` that opts out of the Next.js Data Cache so every query hits the indexer,
 * and aborts instead of hanging when the indexer is unreachable (a dropped packet
 * would otherwise hold a serverless function open until the platform kills it).
 */
const uncachedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(SUBGRAPH_TIMEOUT_MS) });

function getClient(): GraphQLClient | null {
  const url = getSubgraphUrl();
  if (url.length === 0) return null;
  if (!cachedClient || cachedUrl !== url) {
    cachedClient = new GraphQLClient(url, {
      headers: { 'Content-Type': 'application/json' },
      // Bypass the Next.js Data Cache: without `cache: 'no-store'` the patched global
      // fetch memoises every (url, body) pair for a year, so LIVE panels freeze at
      // whatever the subgraph answered first.
      fetch: uncachedFetch,
    });
    cachedUrl = url;
  }
  return cachedClient;
}

/**
 * Execute an arbitrary GraphQL query against the Aetheris subgraph.
 *
 * When the endpoint is unconfigured this resolves to an empty object rather than
 * throwing, so server components and `useQuery` callers never crash during the
 * hackathon window while the subgraph is still deploying.
 *
 * @param query - GraphQL document string.
 * @param variables - Optional variables map.
 * @returns The `data` payload typed as `T`.
 * @throws {SubgraphError} When a configured endpoint returns a transport/GraphQL error.
 */
export async function querySubgraph<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const client = getClient();
  if (!client) {
    console.warn(
      '[aetheris:subgraph] NEXT_PUBLIC_SUBGRAPH_URL is unset - returning an empty result.',
    );
    // Unavoidable cast: the frozen signature promises `T`, and the graceful-degradation
    // contract forbids throwing here. Collection helpers below normalize with `?? []`.
    return {} as T;
  }

  try {
    return await client.request<T>(query, variables ?? {});
  } catch (cause) {
    throw new SubgraphError(cause instanceof Error ? cause.message : String(cause), query);
  }
}

/**
 * Run a query, falling back to a leaner projection if the richer one is rejected
 * (e.g. the subgraph schema has not shipped a field yet), then to an empty result.
 *
 * @param primary - Preferred query document.
 * @param fallback - Minimal, id-only query document.
 * @param variables - Variables shared by both documents.
 * @returns The parsed payload, or `null` if both attempts fail.
 */
async function queryWithFallback<T>(
  primary: string,
  fallback: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  if (!isSubgraphConfigured()) return null;
  try {
    return await querySubgraph<T>(primary, variables);
  } catch (primaryError) {
    console.warn(
      `[aetheris:subgraph] primary query failed, retrying with minimal projection: ${
        primaryError instanceof Error ? primaryError.message : String(primaryError)
      }`,
    );
    try {
      return await querySubgraph<T>(fallback, variables);
    } catch (fallbackError) {
      console.warn(
        `[aetheris:subgraph] fallback query also failed: ${
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }`,
      );
      return null;
    }
  }
}

/* ────────────────────────────── Query documents ─────────────────────────────
 * Exported so they can be adjusted in lock-step with the subgraph schema without
 * touching call sites.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Rich `jobs` projection. */
export const JOBS_QUERY = /* GraphQL */ `
  query AetherisJobs($first: Int!) {
    jobs(first: $first, orderBy: jobId, orderDirection: desc) {
      id
      jobId
      client
      token { id }
      deposit
      specURI
      status
      taskCount
      tasksCompleted
      tasksPaid
      totalSettled
      createdAt
      settledAt
      tasks(orderBy: taskId) {
        id
        taskId
        role
        status
        fee
        assignedAt
        completedAt
        paidAt
        hcsTopicId
        hcsSequenceNumber
        subAgent { id address ensName }
      }
    }
  }
`;

/** Minimal `jobs` projection used when the schema rejects the rich one. */
export const JOBS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisJobsMinimal($first: Int!) {
    jobs(first: $first) {
      id
    }
  }
`;

/** Rich single-agency projection, including its day-data time series. */
export const AGENCY_STATS_QUERY = /* GraphQL */ `
  query AetherisAgencyStats($id: ID!, $first: Int!) {
    agency(id: $id) {
      id
      address
      operator { id address ensName verified nullifierHash }
      nullifierHash
      ensName
      totalJobs
      jobsSettled
      grossRevenue
      totalPaidToSubAgents
      netMargin
      marginRate
      htsSettlementCount
      erc20SettlementCount
      hcsAnchorCount
      uniqueSubAgentCount
    }
    agencyDayDatas(first: $first, where: { agency: $id }) {
      id
      date
      revenue
      netMargin
      jobsCreated
      jobsSettled
      microSettlements
      htsMicroSettlements
      erc20MicroSettlements
    }
    settlements(first: $first, where: { agency: $id }, orderBy: timestamp, orderDirection: desc) {
      id
      amount
      viaHts
      rail
      timestamp
    }
    hcsAnchors(first: $first, where: { agency: $id }, orderBy: sequenceNumber, orderDirection: desc) {
      id
      topicId
      sequenceNumber
      timestamp
    }
  }
`;

/** Minimal single-agency projection. */
export const AGENCY_STATS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisAgencyStatsMinimal($id: ID!) {
    agency(id: $id) {
      id
    }
  }
`;

/** Rich `subAgents` leaderboard projection. */
export const SUB_AGENT_LEADERBOARD_QUERY = /* GraphQL */ `
  query AetherisSubAgentLeaderboard($first: Int!) {
    subAgents(first: $first, orderBy: totalEarned, orderDirection: desc) {
      id
      address
      ensName
      totalEarned
      tasksAssigned
      tasksCompleted
      tasksPaid
      completionRate
      averageFee
      roles
    }
  }
`;

/** Minimal `subAgents` projection. */
export const SUB_AGENT_LEADERBOARD_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisSubAgentLeaderboardMinimal($first: Int!) {
    subAgents(first: $first) {
      id
    }
  }
`;

/** Rich `tasks` projection. */
export const TASKS_QUERY = /* GraphQL */ `
  query AetherisTasks($first: Int!) {
    tasks(first: $first, orderBy: assignedAt, orderDirection: desc) {
      id
      taskId
      role
      status
      fee
      subAgent { id ensName }
      hcsTopicId
      hcsSequenceNumber
      assignedAt
      completedAt
      paidAt
    }
  }
`;

/** Minimal `tasks` projection. */
export const TASKS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisTasksMinimal($first: Int!) {
    tasks(first: $first) {
      id
    }
  }
`;

/**
 * Rich `settlements` projection. `job`, `task`, `subAgent` and `token` are entity
 * references in the deployed schema, so each needs a sub-selection.
 */
export const SETTLEMENTS_QUERY = /* GraphQL */ `
  query AetherisSettlements($first: Int!) {
    settlements(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      job { jobId }
      task { taskId }
      subAgent { id ensName }
      token { id }
      amount
      viaHts
      rail
      timestamp
      transactionHash
    }
  }
`;

/** Minimal `settlements` projection. */
export const SETTLEMENTS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisSettlementsMinimal($first: Int!) {
    settlements(first: $first) {
      id
    }
  }
`;

/** Rich `rebalances` projection (1inch treasury swaps indexed on-chain). */
export const REBALANCES_QUERY = /* GraphQL */ `
  query AetherisRebalances($first: Int!) {
    rebalances(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      fromToken
      toToken
      amountIn
      amountOut
      dstChainId
      crossChain
      executionRate
      timestamp
    }
  }
`;

/** Minimal `rebalances` projection. */
export const REBALANCES_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisRebalancesMinimal($first: Int!) {
    rebalances(first: $first) {
      id
    }
  }
`;

/** Rich `hcsAnchors` projection (Hedera Consensus Service audit anchors). */
export const HCS_ANCHORS_QUERY = /* GraphQL */ `
  query AetherisHcsAnchors($first: Int!) {
    hcsAnchors(first: $first, orderBy: sequenceNumber, orderDirection: desc) {
      id
      jobId
      messageHash
      topicId
      sequenceNumber
      timestamp
    }
  }
`;

/** Minimal `hcsAnchors` projection. */
export const HCS_ANCHORS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisHcsAnchorsMinimal($first: Int!) {
    hcsAnchors(first: $first) {
      id
    }
  }
`;

/** Rich `agencies` projection. */
export const AGENCIES_QUERY = /* GraphQL */ `
  query AetherisAgencies($first: Int!) {
    agencies(first: $first, orderBy: grossRevenue, orderDirection: desc) {
      id
      address
      operator { id address ensName verified nullifierHash }
      nullifierHash
      ensName
      totalJobs
      jobsSettled
      grossRevenue
      totalPaidToSubAgents
      netMargin
      htsSettlementCount
      erc20SettlementCount
    }
  }
`;

/** Minimal `agencies` projection. */
export const AGENCIES_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisAgenciesMinimal($first: Int!) {
    agencies(first: $first) {
      id
    }
  }
`;

/** Clamp a caller-supplied page size into The Graph's 1–1000 window. */
function clampFirst(first: number | undefined, fallback = 25): number {
  if (first === undefined || !Number.isFinite(first)) return fallback;
  return Math.min(Math.max(Math.floor(first), 1), 1000);
}

/**
 * Fetch indexed agency jobs.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns Job entities, or `[]` when the subgraph is unavailable.
 */
export async function getJobs(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ jobs?: unknown[] }>(JOBS_QUERY, JOBS_QUERY_MINIMAL, {
    first: clampFirst(first),
  });
  return data?.jobs ?? [];
}

/**
 * Fetch aggregate statistics for one agency, plus its day-data, settlements and
 * HCS anchors.
 *
 * @param agency - Agency entity id (typically the lowercase treasury address).
 * @returns The stats payload, or `null` when unavailable.
 */
export async function getAgencyStats(agency: string): Promise<unknown> {
  const id = (agency ?? '').trim().toLowerCase();
  if (id.length === 0) return null;
  const data = await queryWithFallback<Record<string, unknown>>(
    AGENCY_STATS_QUERY,
    AGENCY_STATS_QUERY_MINIMAL,
    { id, first: 30 },
  );
  return data ?? null;
}

/**
 * Fetch the sub-agent performance leaderboard.
 *
 * @param first - Page size (1–1000, default 10).
 * @returns Sub-agent entities, or `[]` when the subgraph is unavailable.
 */
export async function getSubAgentLeaderboard(first = 10): Promise<unknown[]> {
  const data = await queryWithFallback<{ subAgents?: unknown[] }>(
    SUB_AGENT_LEADERBOARD_QUERY,
    SUB_AGENT_LEADERBOARD_QUERY_MINIMAL,
    { first: clampFirst(first, 10) },
  );
  return data?.subAgents ?? [];
}

/**
 * Fetch indexed agencies.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns Agency entities, or `[]` when unavailable.
 */
export async function getAgencies(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ agencies?: unknown[] }>(
    AGENCIES_QUERY,
    AGENCIES_QUERY_MINIMAL,
    { first: clampFirst(first) },
  );
  return data?.agencies ?? [];
}

/**
 * Fetch indexed sub-tasks.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns Task entities, or `[]` when unavailable.
 */
export async function getTasks(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ tasks?: unknown[] }>(TASKS_QUERY, TASKS_QUERY_MINIMAL, {
    first: clampFirst(first),
  });
  return data?.tasks ?? [];
}

/**
 * Fetch indexed micro-settlements, newest first.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns Settlement entities, or `[]` when unavailable.
 */
export async function getSettlements(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ settlements?: unknown[] }>(
    SETTLEMENTS_QUERY,
    SETTLEMENTS_QUERY_MINIMAL,
    { first: clampFirst(first) },
  );
  return data?.settlements ?? [];
}

/**
 * Fetch indexed 1inch treasury rebalances.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns Rebalance entities, or `[]` when unavailable.
 */
export async function getRebalances(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ rebalances?: unknown[] }>(
    REBALANCES_QUERY,
    REBALANCES_QUERY_MINIMAL,
    { first: clampFirst(first) },
  );
  return data?.rebalances ?? [];
}

/**
 * Fetch indexed Hedera Consensus Service anchors.
 *
 * @param first - Page size (1–1000, default 25).
 * @returns HCS anchor entities, or `[]` when unavailable.
 */
export async function getHcsAnchors(first = 25): Promise<unknown[]> {
  const data = await queryWithFallback<{ hcsAnchors?: unknown[] }>(
    HCS_ANCHORS_QUERY,
    HCS_ANCHORS_QUERY_MINIMAL,
    { first: clampFirst(first) },
  );
  return data?.hcsAnchors ?? [];
}

/* ────────────────────────────── Treasury helpers ────────────────────────────
 * Used by `lib/treasury.ts` to discover which ERC-20 / HTS tokens the treasury
 * has ever been funded in, and by `loadAgencyStats` to measure real finality.
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Every token a job has been funded in. `Job.token` is a `Token` entity in the
 * deployed schema, so we select its `id` (the lowercase EVM address).
 */
export const TREASURY_TOKENS_QUERY = /* GraphQL */ `
  query AetherisTreasuryTokens($first: Int!) {
    jobs(first: $first) {
      token { id }
    }
  }
`;

/** Fallback: the de-duplicated `tokens` collection the subgraph maintains itself. */
export const TREASURY_TOKENS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisTreasuryTokensMinimal($first: Int!) {
    tokens(first: $first) {
      id
    }
  }
`;

/** Assignment → payout timestamps for every task that has actually been paid. */
export const TASK_TIMINGS_QUERY = /* GraphQL */ `
  query AetherisTaskTimings($first: Int!) {
    tasks(first: $first, where: { status: Paid }) {
      assignedAt
      paidAt
    }
  }
`;

/** Minimal `tasks` projection (no timing fields → caller yields `[]`). */
export const TASK_TIMINGS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisTaskTimingsMinimal($first: Int!) {
    tasks(first: $first, where: { status: Paid }) {
      id
    }
  }
`;

/** Normalize an unknown to a lowercase 0x-prefixed 20-byte address, else `null`. */
function asEvmAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(v) ? v : null;
}

/**
 * Distinct token addresses jobs have been funded in (lowercase, de-duplicated,
 * insertion-ordered).
 *
 * @returns Token addresses, or `[]` when the subgraph is unset/unreachable.
 */
export async function getTreasuryTokens(): Promise<string[]> {
  const data = await queryWithFallback<{ jobs?: unknown[]; tokens?: unknown[] }>(
    TREASURY_TOKENS_QUERY,
    TREASURY_TOKENS_QUERY_MINIMAL,
    { first: 1000 },
  );
  if (!data) return [];
  const seen = new Set<string>();
  const rows: unknown[] = Array.isArray(data.jobs) ? data.jobs : [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const token = (row as { token?: unknown }).token;
    const addr =
      typeof token === 'object' && token !== null
        ? asEvmAddress((token as { id?: unknown }).id ?? (token as { address?: unknown }).address)
        : asEvmAddress(token);
    if (addr) seen.add(addr);
  }
  const tokens: unknown[] = Array.isArray(data.tokens) ? data.tokens : [];
  for (const row of tokens) {
    if (typeof row !== 'object' || row === null) continue;
    const addr = asEvmAddress((row as { id?: unknown }).id);
    if (addr) seen.add(addr);
  }
  return [...seen];
}

/**
 * `(assignedAt, paidAt)` pairs - unix seconds - for every task with status `Paid`.
 * Rows missing either timestamp are dropped so the caller can average honestly.
 *
 * @returns Timing pairs, or `[]` when the subgraph is unset/unreachable or no
 *   task has been paid yet.
 */
export async function getTaskTimings(): Promise<{ assignedAt: number; paidAt: number }[]> {
  const data = await queryWithFallback<{ tasks?: unknown[] }>(
    TASK_TIMINGS_QUERY,
    TASK_TIMINGS_QUERY_MINIMAL,
    { first: 1000 },
  );
  const rows: unknown[] = Array.isArray(data?.tasks) ? data.tasks : [];
  const out: { assignedAt: number; paidAt: number }[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { assignedAt?: unknown; paidAt?: unknown };
    const assignedAt = Number(r.assignedAt);
    const paidAt = Number(r.paidAt);
    if (!Number.isFinite(assignedAt) || !Number.isFinite(paidAt)) continue;
    if (assignedAt <= 0 || paidAt <= 0) continue;
    out.push({ assignedAt, paidAt });
  }
  return out;
}

/** Per-sub-agent assignment → payout timestamps for every task that has been paid. */
export const AGENT_TIMINGS_QUERY = /* GraphQL */ `
  query AetherisAgentTimings($first: Int!) {
    tasks(first: $first, where: { status: Paid }) {
      subAgent {
        id
      }
      assignedAt
      paidAt
    }
  }
`;

/** Minimal `tasks` projection (no sub-agent/timing fields → caller yields `[]`). */
export const AGENT_TIMINGS_QUERY_MINIMAL = /* GraphQL */ `
  query AetherisAgentTimingsMinimal($first: Int!) {
    tasks(first: $first, where: { status: Paid }) {
      id
    }
  }
`;

/** One paid task's settlement timing, keyed by the sub-agent that performed it. */
export interface AgentTiming {
  /** Lowercase 0x-prefixed sub-agent address. */
  subAgent: string;
  /** Unix seconds. */
  assignedAt: number;
  /** Unix seconds. */
  paidAt: number;
}

/**
 * `(subAgent, assignedAt, paidAt)` triples - unix seconds - for every task with
 * status `Paid`. Rows missing the sub-agent or either timestamp are dropped so
 * per-agent averages stay honest.
 *
 * @returns Timing rows, or `[]` when the subgraph is unset/unreachable or no
 *   task has been paid yet.
 */
export async function getAgentTimings(): Promise<AgentTiming[]> {
  const data = await queryWithFallback<{ tasks?: unknown[] }>(
    AGENT_TIMINGS_QUERY,
    AGENT_TIMINGS_QUERY_MINIMAL,
    { first: 1000 },
  );
  const rows: unknown[] = Array.isArray(data?.tasks) ? data.tasks : [];
  const out: AgentTiming[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as { subAgent?: unknown; assignedAt?: unknown; paidAt?: unknown };
    const agent = r.subAgent;
    const subAgent =
      typeof agent === 'object' && agent !== null
        ? asEvmAddress((agent as { id?: unknown }).id ?? (agent as { address?: unknown }).address)
        : asEvmAddress(agent);
    if (!subAgent) continue;
    const assignedAt = Number(r.assignedAt);
    const paidAt = Number(r.paidAt);
    if (!Number.isFinite(assignedAt) || !Number.isFinite(paidAt)) continue;
    if (assignedAt <= 0 || paidAt <= 0) continue;
    out.push({ subAgent, assignedAt, paidAt });
  }
  return out;
}
