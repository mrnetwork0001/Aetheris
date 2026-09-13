import { Contract, JsonRpcProvider, Network } from "ethers";
import { NextResponse } from "next/server";

import { DEMO_HCS_MESSAGES, DEMO_HCS_TOPIC, type HcsMessage } from "@/components/aetheris-data";
import { optionalEnv } from "@/lib/env";
import { HEDERA_TESTNET_CHAIN_ID, HEDERA_TESTNET_RPC } from "@/lib/hedera";
import {
  apiError,
  badRequest,
  describeError,
  isAddress,
  isNonEmptyString,
  isTopicId,
  notConfigured,
  readJsonObject,
  upstreamFailure,
} from "../_lib/http";

/**
 * /api/hcs - the Hedera Consensus Service audit log.
 *
 *   GET  ?topicId=0.0.x&limit=n   mirror of the topic (degrades to demo frames)
 *   POST { message }              anchors a new immutable audit entry
 *
 * `submitHcsMessage` is server-only (it holds the operator key), so the browser
 * only ever talks to this route. Because every POST is signed with the operator
 * key, spends its HBAR and lands permanently in the audit stream the dashboard
 * and anchor verification rely on, the write path is deliberately narrow:
 *
 *   • it writes ONLY to the configured `HEDERA_HCS_TOPIC_ID` (a `topicId` in the
 *     body is accepted solely when it equals the configured one);
 *   • it accepts ONLY frames matching a fixed schema (`ProfitClaimed`), and the
 *     server re-composes the frame itself - client-supplied extra fields are
 *     dropped, so arbitrary text can never reach the topic;
 *   • the `operator` named in the frame must be a World ID-verified operator in
 *     AetherisAgency (`isVerifiedOperator`), and the frame's nullifier is taken
 *     from the contract (`operatorNullifier`), not from the request;
 *   • it is rate-limited per IP like /api/operator/verify.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HcsReadResponse {
  topicId: string;
  source: "live" | "demo";
  notice?: string;
  messages: HcsMessage[];
}

export interface HcsWriteResponse {
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
  /** The exact frame that was anchored (server-composed). */
  frame: string;
}

/* ── Config ───────────────────────────────────────────────────────────────── */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_FRAME_BYTES = 1024;
/** Audit events the relay is willing to anchor on behalf of the browser. */
const ALLOWED_EVENTS = ["ProfitClaimed"] as const;
type AllowedEvent = (typeof ALLOWED_EVENTS)[number];
const FRAME_FIELDS = ["evt", "operator", "amount", "nullifier"] as const;

const AGENCY_ABI = [
  "function isVerifiedOperator(address) view returns (bool)",
  "function operatorNullifier(address) view returns (uint256)",
] as const;

function defaultTopicId(): string {
  const configured =
    process.env.HEDERA_HCS_TOPIC_ID ?? process.env.NEXT_PUBLIC_HEDERA_HCS_TOPIC_ID ?? "";
  return isTopicId(configured) ? configured : "";
}

/* ── Naive in-memory rate limiter (per IP, survives HMR via globalThis) ───── */

type Buckets = Map<string, number[]>;
const bucketStore = globalThis as typeof globalThis & { __aetherisHcsWriteBuckets?: Buckets };
const buckets: Buckets = (bucketStore.__aetherisHcsWriteBuckets ??= new Map());

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function rateLimited(ip: string): { limited: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (buckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    const oldest = recent[0] ?? now;
    return { limited: true, retryAfterSec: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000) };
  }
  recent.push(now);
  buckets.set(ip, recent);
  if (buckets.size > 5000) {
    for (const [key, stamps] of buckets) {
      if (stamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) buckets.delete(key);
    }
  }
  return { limited: false, retryAfterSec: 0 };
}

/* ── Frame schema ─────────────────────────────────────────────────────────── */

interface ClaimFrameInput {
  evt: AllowedEvent;
  operator: string;
  amount: string;
  /** Client-asserted nullifier (0x-hex or decimal uint256); verified against chain. */
  nullifier: bigint | null;
}

/** Accepts a 0x-hex or decimal uint256; returns null for anything else or zero. */
function parseUint256(raw: string): bigint | null {
  if (!/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    if (value === 0n || value >= 1n << 256n) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Parses the browser's `message` into the fixed ProfitClaimed schema.
 * Returns a string describing the first violation, or the parsed frame.
 */
function parseClaimFrame(message: string): ClaimFrameInput | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return "`message` must be a JSON object - free-form text is not anchored.";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "`message` must be a JSON object.";
  }
  const record = parsed as Record<string, unknown>;

  const unexpected = Object.keys(record).filter((k) => !(FRAME_FIELDS as readonly string[]).includes(k));
  if (unexpected.length > 0) {
    return `Unexpected frame field(s): ${unexpected.join(", ")}. Frame must be {${FRAME_FIELDS.join(", ")}}.`;
  }

  const evt = record.evt;
  if (typeof evt !== "string" || !(ALLOWED_EVENTS as readonly string[]).includes(evt)) {
    return `\`evt\` must be one of: ${ALLOWED_EVENTS.join(", ")}.`;
  }

  const operator = record.operator;
  if (!isAddress(operator)) {
    return "`operator` must be a 0x-prefixed 20-byte EVM address.";
  }

  const amount = record.amount;
  // `formatUsd` output: optional sign, currency symbol, grouped integer, optional cents.
  if (typeof amount !== "string" || amount.length > 32 || !/^-?\$?[0-9][0-9,]{0,24}(\.[0-9]{1,8})?$/.test(amount)) {
    return "`amount` must be a formatted USD figure such as `$1,234.56`.";
  }

  let nullifier: bigint | null = null;
  if (record.nullifier !== undefined && record.nullifier !== null) {
    if (typeof record.nullifier !== "string") return "`nullifier` must be a uint256 string or null.";
    nullifier = parseUint256(record.nullifier.trim());
    if (nullifier === null) return "`nullifier` must be a non-zero uint256 (0x-hex or decimal) or null.";
  }

  return { evt: evt as AllowedEvent, operator: operator.toLowerCase(), amount, nullifier };
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

function demoPayload(topicId: string, limit: number, notice: string): NextResponse<HcsReadResponse> {
  return NextResponse.json<HcsReadResponse>({
    topicId: topicId === "" ? DEMO_HCS_TOPIC : topicId,
    source: "demo",
    notice,
    messages: DEMO_HCS_MESSAGES.slice(0, limit),
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const requested = url.searchParams.get("topicId");
  const rawLimit = url.searchParams.get("limit");

  if (requested !== null && !isTopicId(requested)) {
    return badRequest("`topicId` must be a Hedera entity id such as `0.0.4915302`.");
  }

  let limit = 12;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
      return badRequest("`limit` must be an integer between 1 and 50.");
    }
    limit = parsed;
  }

  const topicId = requested ?? defaultTopicId();
  if (topicId === "") {
    return demoPayload("", limit, "HEDERA_HCS_TOPIC_ID is not set - showing demo audit frames.");
  }

  try {
    const { readHcsMessages } = await import("@/lib/hedera");
    const messages = await readHcsMessages(topicId, limit);
    if (messages.length === 0) {
      return demoPayload(topicId, limit, "Topic has no messages yet - showing demo audit frames.");
    }
    return NextResponse.json<HcsReadResponse>({ topicId, source: "live", messages });
  } catch (error) {
    // A read failure must never blank the dashboard; degrade, but say so.
    return demoPayload(topicId, limit, `Mirror node unavailable: ${describeError(error)}`);
  }
}

/* ── Write ────────────────────────────────────────────────────────────────── */

export async function POST(request: Request): Promise<NextResponse> {
  /* (1) Rate limit first - even malformed requests count, like /api/operator/verify. */
  const ip = clientIp(request);
  const limit = rateLimited(ip);
  if (limit.limited) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `At most ${RATE_LIMIT_MAX} HCS audit writes per minute per IP (each one spends the operator's HBAR).`,
          details: `Retry after ${limit.retryAfterSec}s.`,
        },
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  /* (2) Only the configured audit topic is writable through this relay. */
  const topicId = defaultTopicId();
  if (topicId === "") {
    return notConfigured(
      "No HCS topic configured.",
      "Set HEDERA_HCS_TOPIC_ID on the server; this relay never writes to a caller-chosen topic.",
    );
  }
  const requested = body.value.topicId;
  if (requested !== undefined && requested !== topicId) {
    return badRequest(
      "This relay only anchors to the configured audit topic.",
      `Requested ${typeof requested === "string" ? requested : typeof requested}; configured ${topicId}. Omit \`topicId\`.`,
    );
  }

  const unexpected = Object.keys(body.value).filter((k) => !["topicId", "message"].includes(k));
  if (unexpected.length > 0) {
    return badRequest(`Unexpected field(s): ${unexpected.join(", ")}.`, "Body must be {message, topicId?}.");
  }

  /* (3) Fixed frame schema - the server composes what actually gets anchored. */
  const message = body.value.message;
  if (!isNonEmptyString(message, MAX_FRAME_BYTES)) {
    return badRequest(`\`message\` must be a non-empty string of at most ${MAX_FRAME_BYTES} characters.`);
  }
  const frame = parseClaimFrame(message);
  if (typeof frame === "string") {
    return badRequest("Rejected audit frame.", frame);
  }

  /* (4) Authorisation: the named operator must be World ID-verified on-chain.
         hashio rejects batched eth_* calls → batchMaxCount: 1. Fail closed. */
  const agencyAddress = optionalEnv("NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS");
  if (!isAddress(agencyAddress)) {
    return apiError(
      503,
      "NOT_CONFIGURED",
      "AetherisAgency address is not configured, so operator verification cannot be checked; nothing was anchored.",
      "Set NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS.",
    );
  }
  const provider = new JsonRpcProvider(
    optionalEnv("HEDERA_TESTNET_RPC", HEDERA_TESTNET_RPC),
    new Network("hedera-testnet", HEDERA_TESTNET_CHAIN_ID),
    { staticNetwork: true, batchMaxCount: 1 },
  );
  const agency = new Contract(agencyAddress, AGENCY_ABI, provider);

  let onChainNullifier: bigint;
  try {
    const verified = (await agency.isVerifiedOperator(frame.operator)) as boolean;
    if (!verified) {
      return apiError(
        403,
        "OPERATOR_NOT_VERIFIED",
        "Only World ID-verified operators can anchor audit frames; nothing was anchored.",
        `${frame.operator} is not a verified operator in AetherisAgency ${agencyAddress}.`,
      );
    }
    onChainNullifier = BigInt(await agency.operatorNullifier(frame.operator));
  } catch (error) {
    return upstreamFailure(
      "Could not read operator verification from Hedera JSON-RPC; nothing was anchored.",
      describeError(error),
    );
  }
  if (frame.nullifier !== null && frame.nullifier !== onChainNullifier) {
    return apiError(
      403,
      "NULLIFIER_MISMATCH",
      "The supplied World ID nullifier does not match the one bound to this operator on-chain; nothing was anchored.",
      `on-chain operatorNullifier(${frame.operator}) differs from the request.`,
    );
  }

  /* (5) Compose the canonical frame server-side and anchor it. */
  const canonical = JSON.stringify({
    evt: frame.evt,
    operator: frame.operator,
    amount: frame.amount,
    nullifier: onChainNullifier.toString(),
    agency: agencyAddress.toLowerCase(),
    ts: new Date().toISOString(),
    src: "aetheris/api/hcs",
  });
  if (Buffer.byteLength(canonical, "utf8") > MAX_FRAME_BYTES) {
    return badRequest(`Composed frame exceeds ${MAX_FRAME_BYTES} bytes.`);
  }

  let submit: typeof import("@/lib/hedera").submitHcsMessage;
  try {
    ({ submitHcsMessage: submit } = await import("@/lib/hedera"));
  } catch (error) {
    return notConfigured("Hedera client is not available.", describeError(error));
  }

  try {
    const receipt = await submit(topicId, canonical);
    return NextResponse.json<HcsWriteResponse>({ ...receipt, frame: canonical }, { status: 201 });
  } catch (error) {
    return upstreamFailure("Failed to submit the HCS message.", describeError(error));
  }
}
