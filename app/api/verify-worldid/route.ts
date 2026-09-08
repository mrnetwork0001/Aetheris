import { NextResponse } from "next/server";

import type { WorldIdProof } from "@/lib/worldid";
import {
  badRequest,
  describeError,
  isNonEmptyString,
  notConfigured,
  readJsonObject,
  upstreamFailure,
} from "../_lib/http";

/**
 * POST /api/verify-worldid
 *
 * The single place a World ID zero-knowledge proof is verified. `lib/worldid`
 * is server-only, so the IDKit widget in the browser posts its proof here and
 * never touches the verification endpoint directly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifySuccess {
  success: true;
  nullifierHash: string;
  verificationLevel: string;
}

const PROOF_FIELDS = ["merkle_root", "nullifier_hash", "proof", "verification_level"] as const;

function parseProof(value: unknown): WorldIdProof | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const field of PROOF_FIELDS) {
    if (!isNonEmptyString(record[field], 8192)) return null;
  }
  return {
    merkle_root: String(record.merkle_root),
    nullifier_hash: String(record.nullifier_hash),
    proof: String(record.proof),
    verification_level: String(record.verification_level),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  const proof = parseProof(body.value.proof);
  if (proof === null) {
    return badRequest(
      "Missing or malformed World ID proof.",
      `\`proof\` must contain: ${PROOF_FIELDS.join(", ")}.`,
    );
  }

  const signal = body.value.signal;
  if (!isNonEmptyString(signal, 512)) {
    return badRequest("`signal` must be a non-empty string (the action signal you committed to).");
  }

  let verify: typeof import("@/lib/worldid").verifyWorldIdProof;
  try {
    ({ verifyWorldIdProof: verify } = await import("@/lib/worldid"));
  } catch (error) {
    return notConfigured(
      "World ID verification is not available in this environment.",
      describeError(error),
    );
  }

  try {
    const result = await verify(proof, signal);
    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: "PROOF_REJECTED",
            message: "World ID rejected this proof.",
            details: result.detail ?? "No detail returned by the verifier.",
          },
        },
        { status: 401 },
      );
    }
    return NextResponse.json<VerifySuccess>({
      success: true,
      nullifierHash: proof.nullifier_hash,
      verificationLevel: proof.verification_level,
    });
  } catch (error) {
    return upstreamFailure("World ID verifier is unreachable.", describeError(error));
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST to verify a World ID proof." } },
    { status: 405, headers: { allow: "POST" } },
  );
}
