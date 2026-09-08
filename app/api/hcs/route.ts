import { NextResponse } from "next/server";

import { DEMO_HCS_MESSAGES, DEMO_HCS_TOPIC, type HcsMessage } from "@/components/aetheris-data";
import {
  badRequest,
  describeError,
  isNonEmptyString,
  isTopicId,
  notConfigured,
  readJsonObject,
  upstreamFailure,
} from "../_lib/http";

/**
 * /api/hcs — the Hedera Consensus Service audit log.
 *
 *   GET  ?topicId=0.0.x&limit=n   mirror of the topic (degrades to demo frames)
 *   POST { topicId?, message }    anchors a new immutable audit entry
 *
 * `submitHcsMessage` is server-only (it holds the operator key), so the browser
 * only ever talks to this route.
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
}

function defaultTopicId(): string {
  const configured =
    process.env.HEDERA_HCS_TOPIC_ID ?? process.env.NEXT_PUBLIC_HEDERA_HCS_TOPIC_ID ?? "";
  return isTopicId(configured) ? configured : "";
}

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
    return demoPayload("", limit, "HEDERA_HCS_TOPIC_ID is not set — showing demo audit frames.");
  }

  try {
    const { readHcsMessages } = await import("@/lib/hedera");
    const messages = await readHcsMessages(topicId, limit);
    if (messages.length === 0) {
      return demoPayload(topicId, limit, "Topic has no messages yet — showing demo audit frames.");
    }
    return NextResponse.json<HcsReadResponse>({ topicId, source: "live", messages });
  } catch (error) {
    // A read failure must never blank the dashboard; degrade, but say so.
    return demoPayload(topicId, limit, `Mirror node unavailable: ${describeError(error)}`);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const requested = body.value.topicId;
  if (requested !== undefined && !isTopicId(requested)) {
    return badRequest("`topicId` must be a Hedera entity id such as `0.0.4915302`.");
  }

  const message = body.value.message;
  if (!isNonEmptyString(message, 1024)) {
    return badRequest("`message` must be a non-empty string of at most 1024 characters.");
  }

  const topicId = typeof requested === "string" ? requested : defaultTopicId();
  if (topicId === "") {
    return notConfigured(
      "No HCS topic configured.",
      "Set HEDERA_HCS_TOPIC_ID or pass `topicId` in the request body.",
    );
  }

  let submit: typeof import("@/lib/hedera").submitHcsMessage;
  try {
    ({ submitHcsMessage: submit } = await import("@/lib/hedera"));
  } catch (error) {
    return notConfigured("Hedera client is not available.", describeError(error));
  }

  try {
    const receipt = await submit(topicId, message);
    return NextResponse.json<HcsWriteResponse>(receipt, { status: 201 });
  } catch (error) {
    return upstreamFailure("Failed to submit the HCS message.", describeError(error));
  }
}
