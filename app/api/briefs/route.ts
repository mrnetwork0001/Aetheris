import { NextResponse } from "next/server";

import {
  BRIEF_MAX_CHARS,
  BRIEF_MIN_CHARS,
  ROLE_SLUG_RE,
  TITLE_MAX_CHARS,
  briefFrame,
  mirrorMessageUrl,
} from "@/lib/briefs";
import { apiError, badRequest, describeError, isAddress, isTopicId, notConfigured, readJsonObject, upstreamFailure } from "../_lib/http";

/**
 * /api/briefs - anchor a job brief on the Hedera Consensus Service audit topic.
 *
 *   POST { title, role, brief, client? }  ->  201 { specURI: "hcs://<topic>/<seq>", ... }
 *
 * The browser never holds the operator key, so it asks this relay to publish the
 * brief. The relay composes the canonical `JobBrief` frame itself (`evt`, `chars`
 * and `keccak256` are derived server-side, never taken from the request), writes
 * only to the configured `HEDERA_HCS_TOPIC_ID`, and is rate-limited per IP
 * because every write spends the operator's HBAR and lands permanently on the
 * topic. The resulting `hcs://` URI is what the client passes to `createJob`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** HCS consensus plus receipt can exceed the 10s default on serverless hosts. */
export const maxDuration = 60;

export interface BriefWriteResponse {
  ok: true;
  specURI: string;
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
  keccak256: string;
  chars: number;
  mirrorUrl: string;
  hashscanUrl: string;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
/** Hard cap on the serialised frame; HCS chunks at 1,024 bytes so this is four chunks. */
const MAX_FRAME_BYTES = 3_900;
const BODY_FIELDS = ["title", "role", "brief", "client"] as const;

function configuredTopicId(): string {
  const configured = process.env.HEDERA_HCS_TOPIC_ID ?? process.env.NEXT_PUBLIC_HEDERA_HCS_TOPIC_ID ?? "";
  return isTopicId(configured) ? configured : "";
}

/* ── Naive in-memory rate limiter (per IP, survives HMR via globalThis) ───── */

type Buckets = Map<string, number[]>;
const bucketStore = globalThis as typeof globalThis & { __aetherisBriefWriteBuckets?: Buckets };
const buckets: Buckets = (bucketStore.__aetherisBriefWriteBuckets ??= new Map());

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

/* ── Write ────────────────────────────────────────────────────────────────── */

export async function POST(request: Request): Promise<NextResponse> {
  /* (1) Rate limit first - malformed requests count too. */
  const ip = clientIp(request);
  const limit = rateLimited(ip);
  if (limit.limited) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `At most ${RATE_LIMIT_MAX} brief anchors per minute per IP (each one spends the operator's HBAR).`,
          details: `Retry after ${limit.retryAfterSec}s.`,
        },
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const unexpected = Object.keys(body.value).filter((k) => !(BODY_FIELDS as readonly string[]).includes(k));
  if (unexpected.length > 0) {
    return badRequest(`Unexpected field(s): ${unexpected.join(", ")}.`, "Body must be {title, role, brief, client?}.");
  }

  /* (2) Validate the three user-supplied fields. */
  const title = typeof body.value.title === "string" ? body.value.title.trim().replace(/\s+/g, " ") : "";
  if (title.length < 3 || title.length > TITLE_MAX_CHARS) {
    return badRequest(`\`title\` must be 3 to ${TITLE_MAX_CHARS} characters.`);
  }
  const role = typeof body.value.role === "string" ? body.value.role.trim().toLowerCase() : "";
  if (!ROLE_SLUG_RE.test(role)) {
    return badRequest("`role` must be a slug such as `market-research` (lowercase letters, digits and hyphens, 3 to 32 characters).");
  }
  const brief = typeof body.value.brief === "string" ? body.value.brief.trim() : "";
  if (brief.length < BRIEF_MIN_CHARS || brief.length > BRIEF_MAX_CHARS) {
    return badRequest(`\`brief\` must be ${BRIEF_MIN_CHARS} to ${BRIEF_MAX_CHARS} characters after trimming.`);
  }
  const client = body.value.client;
  if (client !== undefined && client !== null && !isAddress(client)) {
    return badRequest("`client`, when present, must be a 0x-prefixed 20-byte EVM address.");
  }

  /* (3) Only the configured audit topic is writable; the operator key must be present. */
  const topicId = configuredTopicId();
  if (topicId === "") {
    return notConfigured(
      "No HCS topic configured - the brief was not anchored.",
      "Set HEDERA_HCS_TOPIC_ID on the server; this relay never writes to a caller-chosen topic.",
    );
  }
  if (!(process.env.HEDERA_OPERATOR_ID ?? "").trim() || !(process.env.HEDERA_OPERATOR_KEY ?? "").trim()) {
    return notConfigured(
      "Hedera operator credentials are not configured - the brief was not anchored.",
      "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY on the server.",
    );
  }

  /* (4) Compose the canonical frame server-side. */
  const frame = briefFrame({ title, role, client: typeof client === "string" ? client : null, text: brief });
  const canonical = JSON.stringify(frame);
  const bytes = Buffer.byteLength(canonical, "utf8");
  if (bytes > MAX_FRAME_BYTES) {
    return apiError(
      413,
      "FRAME_TOO_LARGE",
      `The serialised brief is ${bytes} bytes; the limit is ${MAX_FRAME_BYTES}.`,
      "Shorten the brief (multibyte characters count more than once).",
    );
  }

  let hedera: typeof import("@/lib/hedera");
  try {
    hedera = await import("@/lib/hedera");
  } catch (error) {
    return notConfigured("Hedera client is not available.", describeError(error));
  }

  try {
    const receipt = await hedera.submitHcsMessage(topicId, canonical);
    return NextResponse.json<BriefWriteResponse>(
      {
        ok: true,
        specURI: `hcs://${receipt.topicId}/${receipt.sequenceNumber}`,
        topicId: receipt.topicId,
        sequenceNumber: receipt.sequenceNumber,
        transactionId: receipt.transactionId,
        keccak256: frame.keccak256,
        chars: frame.chars,
        mirrorUrl: mirrorMessageUrl(receipt.topicId, receipt.sequenceNumber),
        hashscanUrl: hedera.hashscanUrl("transaction", receipt.transactionId),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "MissingEnvError") {
      return notConfigured("Hedera operator credentials are not configured - the brief was not anchored.", error.message);
    }
    return upstreamFailure("Failed to anchor the brief on HCS.", describeError(error));
  }
}
