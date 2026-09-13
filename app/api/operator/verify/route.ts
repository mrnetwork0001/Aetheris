import { Contract, Interface, JsonRpcProvider, Network, Wallet, isHexString } from "ethers";
import { NextResponse } from "next/server";

import { optionalEnv } from "@/lib/env";
import { HEDERA_TESTNET_CHAIN_ID, HEDERA_TESTNET_RPC } from "@/lib/hedera";
import type { WorldIdProof } from "@/lib/worldid";
import {
  apiError,
  badRequest,
  describeError,
  isAddress,
  isNonEmptyString,
  readJsonObject,
  upstreamFailure,
} from "../../_lib/http";

/**
 * POST /api/operator/verify
 *
 * Makes the World ID human gate real end-to-end on Hedera testnet:
 *
 *   1. Verifies the IDKit proof against the World ID cloud verifier (server-only).
 *   2. Relays `AetherisAgency.verifyOperator(signal, 0, nullifierHash, [0×8], ensName)`
 *      with the deployer key. World ID's on-chain router is not deployed on Hedera,
 *      so the contract runs in *announced* bypass mode — the Groth16 proof is not
 *      re-checked on-chain — but the REAL nullifier hash is burned, so a second
 *      proof from the same human reverts with `NullifierAlreadyUsed` (→ 409).
 *
 * Without `NEXT_PUBLIC_WORLD_ID_APP_ID` the route answers 503 and never pretends
 * success. The relay spends the deployer's HBAR, so it is rate-limited per IP.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── Config ───────────────────────────────────────────────────────────────── */

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const PROOF_FIELDS = ["merkle_root", "nullifier_hash", "proof", "verification_level"] as const;
const ZERO_PROOF: readonly [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
const DEFAULT_ENS_NAME = "aetheris.eth";

const WORLD_ID_ENV_VARS = [
  "NEXT_PUBLIC_WORLD_ID_APP_ID  (app_… from developer.worldcoin.org → your app)",
  "NEXT_PUBLIC_WORLD_ID_ACTION  (action id under the app's Actions tab; default aetheris-operator)",
  "WORLD_ID_RP_ID               (relying-party id under the app's 'Relying party' settings)",
  "WORLD_ID_RP_SIGNING_KEY      (relying-party signing key, same settings page — server-only)",
] as const;

const AGENCY_ABI = [
  "function verifyOperator(address signal, uint256 root, uint256 nullifierHash, uint256[8] proof, string ensName)",
  "function nullifierHashUsed(uint256) view returns (bool)",
  "function isVerifiedOperator(address) view returns (bool)",
  "function worldIdVerificationBypassed() view returns (bool)",
  "error NullifierAlreadyUsed(uint256 nullifierHash)",
  "error InvalidNullifier()",
  "error ZeroAddress()",
] as const;

/* ── Response shapes ──────────────────────────────────────────────────────── */

export interface OperatorVerifySuccess {
  ok: true;
  txHash: string;
  nullifierHash: string;
  hashscan: string;
  signal: string;
  ensName: string;
  blockNumber: number | null;
  /** True when the contract ran without a World ID router (ZK check skipped on-chain). */
  worldIdBypassed: boolean;
  verificationLevel: string;
}

/* ── Naive in-memory rate limiter (per IP, survives HMR via globalThis) ───── */

type Buckets = Map<string, number[]>;
const bucketStore = globalThis as typeof globalThis & { __aetherisOperatorVerifyBuckets?: Buckets };
const buckets: Buckets = (bucketStore.__aetherisOperatorVerifyBuckets ??= new Map());

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

/* ── Validation ───────────────────────────────────────────────────────────── */

function parseProof(value: unknown): WorldIdProof | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const field of PROOF_FIELDS) {
    if (!isNonEmptyString(record[field], 8192)) return null;
  }
  return {
    merkle_root: String(record.merkle_root).trim(),
    nullifier_hash: String(record.nullifier_hash).trim(),
    proof: String(record.proof).trim(),
    verification_level: String(record.verification_level).trim(),
  };
}

/** Accepts a 0x-hex or decimal uint256; returns null for anything else or zero. */
function parseNullifier(raw: string): bigint | null {
  if (!/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    if (value === 0n || value >= 1n << 256n) return null;
    return value;
  } catch {
    return null;
  }
}

function parseEnsName(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > 255 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function normalizePrivateKey(raw: string): string | null {
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  return isHexString(key, 32) ? key : null;
}

/* ── Revert decoding ──────────────────────────────────────────────────────── */

const agencyInterface = new Interface(AGENCY_ABI);

function revertName(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const err = error as { revert?: { name?: string }; data?: unknown; info?: { error?: { data?: unknown } }; message?: string };
  if (err.revert?.name) return err.revert.name;
  const data = typeof err.data === "string" ? err.data : err.info?.error?.data;
  if (typeof data === "string" && data.startsWith("0x") && data.length >= 10) {
    try {
      return agencyInterface.parseError(data)?.name ?? null;
    } catch {
      /* not one of ours */
    }
  }
  if (typeof err.message === "string" && err.message.includes("NullifierAlreadyUsed")) {
    return "NullifierAlreadyUsed";
  }
  return null;
}

/* ── Handler ──────────────────────────────────────────────────────────────── */

export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIp(request);
  const limit = rateLimited(ip);
  if (limit.limited) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `At most ${RATE_LIMIT_MAX} operator verifications per minute per IP (this relay spends the deployer's HBAR).`,
          details: `Retry after ${limit.retryAfterSec}s.`,
        },
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } },
    );
  }

  const body = await readJsonObject(request);
  if (!body.ok) return body.response;

  // Two accepted shapes: {result: <IDKit 4.0 result>, signal, ensName?} (World ID 4.0,
  // rp-scoped) or the legacy {proof: {merkle_root,…}, signal, ensName?} (World ID 3.0).
  const { isIdKitResultV4, extractV4Nullifier } = await import("@/lib/worldid");
  const v4Result = isIdKitResultV4(body.value.result) ? body.value.result : null;
  const proof = v4Result ? null : parseProof(body.value.proof);
  if (v4Result === null && proof === null) {
    return badRequest(
      "Missing or malformed World ID proof.",
      `Send {result: <IDKit 4.0 result>, signal, ensName?} or a legacy \`proof\` with: ${PROOF_FIELDS.join(", ")}.`,
    );
  }

  const rawNullifier = v4Result ? extractV4Nullifier(v4Result) : proof!.nullifier_hash;
  const nullifier = rawNullifier === null ? null : parseNullifier(rawNullifier);
  if (nullifier === null) {
    return badRequest("The proof's nullifier must be a non-zero uint256 (0x-hex or decimal).");
  }

  const signal = body.value.signal;
  if (!isAddress(signal)) {
    return badRequest("`signal` must be the operator's 0x-prefixed 20-byte EVM address.");
  }

  const ensName = parseEnsName(body.value.ensName);
  if (ensName === null) {
    return badRequest("`ensName`, when provided, must be a valid ENS-style name (e.g. aetheris.eth).");
  }

  const unexpected = Object.keys(body.value).filter((k) => !["proof", "result", "signal", "ensName"].includes(k));
  if (unexpected.length > 0) {
    return badRequest(`Unexpected field(s): ${unexpected.join(", ")}.`, "Body must be {result, signal, ensName?} or {proof, signal, ensName?}.");
  }

  /* (a) World ID cloud verification — never pretend success. */
  const appId = optionalEnv("NEXT_PUBLIC_WORLD_ID_APP_ID");
  if (appId === "") {
    return apiError(
      503,
      "WORLD_ID_NOT_CONFIGURED",
      "World ID is not configured on this server, so the proof cannot be verified and the operator was NOT registered on-chain.",
      `Set these in .env (see .env.example): ${WORLD_ID_ENV_VARS.join(" | ")}`,
    );
  }

  const rawKey = optionalEnv("PRIVATE_KEY");
  const agencyAddress = optionalEnv("NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS");
  if (rawKey === "" || !isAddress(agencyAddress)) {
    return apiError(
      503,
      "RELAYER_NOT_CONFIGURED",
      "The on-chain relayer is not configured; the proof was not verified and nothing was sent on-chain.",
      "Set PRIVATE_KEY (deployer ECDSA key, funded on Hedera testnet) and NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS.",
    );
  }
  const privateKey = normalizePrivateKey(rawKey);
  if (privateKey === null) {
    return apiError(503, "RELAYER_NOT_CONFIGURED", "PRIVATE_KEY is not a 32-byte hex ECDSA key.");
  }

  let verifyWorldIdProof: typeof import("@/lib/worldid").verifyWorldIdProof;
  let verifyWorldIdV4: typeof import("@/lib/worldid").verifyWorldIdV4;
  try {
    ({ verifyWorldIdProof, verifyWorldIdV4 } = await import("@/lib/worldid"));
  } catch (error) {
    return apiError(503, "WORLD_ID_NOT_CONFIGURED", "World ID verifier module unavailable.", describeError(error));
  }

  try {
    const result = v4Result ? await verifyWorldIdV4(v4Result) : await verifyWorldIdProof(proof!, signal);
    if (!result.success) {
      return apiError(
        401,
        "PROOF_REJECTED",
        "World ID rejected this proof; nothing was sent on-chain.",
        result.detail ?? "No detail returned by the verifier.",
      );
    }
  } catch (error) {
    return upstreamFailure("World ID verifier is unreachable; nothing was sent on-chain.", describeError(error));
  }

  /* (b) Relay on-chain with the deployer key. hashio rejects batched eth_* calls → batchMaxCount: 1. */
  const rpcUrl = optionalEnv("HEDERA_TESTNET_RPC", HEDERA_TESTNET_RPC);
  const provider = new JsonRpcProvider(
    rpcUrl,
    new Network("hedera-testnet", HEDERA_TESTNET_CHAIN_ID),
    { staticNetwork: true, batchMaxCount: 1 },
  );
  const wallet = new Wallet(privateKey, provider);
  const agency = new Contract(agencyAddress, AGENCY_ABI, wallet);
  const nullifierHex = `0x${nullifier.toString(16).padStart(64, "0")}`;

  try {
    const alreadyUsed = (await agency.nullifierHashUsed(nullifier)) as boolean;
    if (alreadyUsed) {
      return apiError(
        409,
        "NULLIFIER_ALREADY_USED",
        "This World ID nullifier has already been burned on-chain; the same human cannot register twice for this action.",
        `nullifierHash ${nullifierHex} is consumed in AetherisAgency ${agencyAddress}. https://hashscan.io/testnet/contract/${agencyAddress}`,
      );
    }
  } catch (error) {
    return upstreamFailure("Could not read AetherisAgency state from Hedera JSON-RPC.", describeError(error));
  }

  let txHash: string;
  let blockNumber: number | null = null;
  try {
    const tx = await agency.verifyOperator(signal, 0n, nullifier, ZERO_PROOF, ensName ?? DEFAULT_ENS_NAME);
    txHash = tx.hash as string;
    const receipt = await tx.wait(1);
    blockNumber = receipt?.blockNumber ?? null;
    if (receipt && receipt.status !== 1) {
      return upstreamFailure("verifyOperator transaction reverted on-chain.", `tx ${txHash}`);
    }
  } catch (error) {
    const name = revertName(error);
    if (name === "NullifierAlreadyUsed") {
      return apiError(
        409,
        "NULLIFIER_ALREADY_USED",
        "AetherisAgency reverted with NullifierAlreadyUsed — this human's nullifier was already burned on-chain.",
        `nullifierHash ${nullifierHex}`,
      );
    }
    if (name === "InvalidNullifier" || name === "ZeroAddress") {
      return badRequest(`AetherisAgency rejected the input (${name}).`);
    }
    return upstreamFailure("Failed to relay verifyOperator to Hedera testnet.", describeError(error));
  }

  let worldIdBypassed = true;
  try {
    worldIdBypassed = (await agency.worldIdVerificationBypassed()) as boolean;
  } catch {
    /* informational only */
  }

  /* (c) */
  return NextResponse.json<OperatorVerifySuccess>({
    ok: true,
    txHash,
    nullifierHash: nullifierHex,
    hashscan: `https://hashscan.io/testnet/transaction/${txHash}`,
    signal,
    ensName: ensName ?? DEFAULT_ENS_NAME,
    blockNumber,
    worldIdBypassed,
    verificationLevel: v4Result ? "orb" : proof!.verification_level,
  });
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST {result, signal, ensName?} (World ID 4.0) or {proof, signal, ensName?} (legacy) to register a World ID-verified operator." } },
    { status: 405, headers: { allow: "POST" } },
  );
}
