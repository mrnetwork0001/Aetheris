import { NextResponse } from "next/server";

/**
 * Shared request/response plumbing for Aetheris route handlers.
 *
 * `_lib` is a Next.js private folder, so nothing in here is routable.
 * Every handler answers with the same error envelope so the client can render
 * a useful message instead of a blank panel.
 */

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: string;
  };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: string,
): NextResponse<ApiError> {
  return NextResponse.json<ApiError>(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export const badRequest = (message: string, details?: string) =>
  apiError(400, "BAD_REQUEST", message, details);

export const notConfigured = (message: string, details?: string) =>
  apiError(503, "NOT_CONFIGURED", message, details);

export const upstreamFailure = (message: string, details?: string) =>
  apiError(502, "UPSTREAM_ERROR", message, details);

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}

export type BodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse<ApiError> };

/** Parses a JSON object body, rejecting arrays, primitives and malformed JSON. */
export async function readJsonObject(request: Request): Promise<BodyResult> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, response: badRequest("Request body must be valid JSON.") };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, response: badRequest("Request body must be a JSON object.") };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/* ── Field validators ──────────────────────────────────────────────────────── */

export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

/** 1inch expects amounts as decimal strings in the token's base units. */
export function isBaseUnitAmount(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{1,78}$/.test(value) && value !== "0";
}

export function isChainId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value < 1e9;
}

/** Hedera entity ids: `shard.realm.num`. */
export function isTopicId(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,10}\.\d{1,10}\.\d{1,19}$/.test(value);
}

export function isNonEmptyString(value: unknown, max = 4096): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
