import { NextResponse } from "next/server";

import { badRequest, describeError, notConfigured, readJsonObject } from "../../_lib/http";

/**
 * POST /api/worldid/rp-context
 *
 * IDKit v4 requires every proof request to carry an `rp_context` — a nonce
 * signed by the relying party's key. That key must never reach the browser, so
 * the widget asks this route to mint one immediately before opening.
 *
 * Requires WORLD_ID_RP_ID and WORLD_ID_RP_SIGNING_KEY. Without them the route
 * answers 503 and the UI falls back to a clearly-labelled simulated check.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RpContextResponse {
  rp_context: {
    rp_id: string;
    nonce: string;
    created_at: number;
    expires_at: number;
    signature: string;
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const action = body.value.action;
  if (typeof action !== "string" || action.trim() === "" || action.length > 256) {
    return badRequest("`action` must be a non-empty string of at most 256 characters.");
  }

  const rpId = process.env.WORLD_ID_RP_ID ?? "";
  const signingKeyHex = process.env.WORLD_ID_RP_SIGNING_KEY ?? "";

  if (rpId === "" || signingKeyHex === "") {
    return notConfigured(
      "World ID relying-party credentials are not configured.",
      "Set WORLD_ID_RP_ID and WORLD_ID_RP_SIGNING_KEY to enable live proof requests.",
    );
  }

  try {
    const { signRequest } = await import("@worldcoin/idkit-core");
    const signature = signRequest({ signingKeyHex, action, ttl: 300 });
    return NextResponse.json<RpContextResponse>({
      rp_context: {
        rp_id: rpId,
        nonce: signature.nonce,
        created_at: signature.createdAt,
        expires_at: signature.expiresAt,
        signature: signature.sig,
      },
    });
  } catch (error) {
    return notConfigured("Failed to sign the World ID request context.", describeError(error));
  }
}
