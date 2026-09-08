import { NextResponse } from "next/server";

import { resolveEnsProfile } from "@/components/aetheris-server";
import { badRequest } from "../_lib/http";

/**
 * GET /api/ens?address=0x… | ?name=vitalik.eth
 *
 * Keeps the ENS RPC client on the server. Resolution failures answer 200 with
 * null fields so the UI simply falls back to the raw address.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface EnsResponse {
  address: string | null;
  name: string | null;
  avatar: string | null;
  source: "live" | "unconfigured";
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  const name = url.searchParams.get("name");

  if (address === null && name === null) {
    return badRequest("Provide either an `address` or a `name` query parameter.");
  }
  if (address !== null && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return badRequest("`address` must be a 0x-prefixed 20-byte address.");
  }
  if (name !== null && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(name)) {
    return badRequest("`name` must be a dot-separated ENS name, e.g. `aetheris.eth`.");
  }

  const profile = await resolveEnsProfile(address ?? name ?? "");
  const resolved = profile.name !== null || profile.avatar !== null || profile.address !== null;

  return NextResponse.json<EnsResponse>(
    { ...profile, source: resolved ? "live" : "unconfigured" },
    { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=1800" } },
  );
}
