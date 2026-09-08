/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  SERVER-ONLY MODULE — World ID proof verification (Proof of Personhood).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `verifyWorldIdProof` talks to the World ID **cloud verify** endpoint. Although
 * that call uses no secret today, verification must be authoritative and
 * un-forgeable, so it MUST run on the server (Route Handler / Server Action) —
 * a client-side "verification" is trivially spoofed by the caller.
 *
 * We do not depend on the `server-only` npm package (not in this project's
 * dependency set); instead `assertServerOnly()` provides the same guarantee at
 * runtime, and this banner provides it for readers.
 *
 * `encodeProofForContract` is pure and browser-safe — it is used by the UI to
 * prepare calldata for `AetherisAgency.verifyProof(...)` on Hedera EVM.
 */

import { decodeAbiParameters, keccak256, toBytes, type Hex } from 'viem';
import { assertServerOnly, optionalEnv, publicEnv } from './env';

/** A World ID ZK proof exactly as produced by IDKit's `onSuccess` callback. */
export type WorldIdProof = {
  merkle_root: string;
  nullifier_hash: string;
  proof: string;
  verification_level: string;
};

/** World ID app id (`app_...`). Public — safe to ship to the browser. */
export const WORLD_ID_APP_ID: string = publicEnv.worldIdAppId;

/** Action identifier registered in the Worldcoin Developer Portal. */
export const WORLD_ID_ACTION: string = publicEnv.worldIdAction;

/** Default Developer Portal origin; override with `WORLD_ID_API_BASE`. */
const DEFAULT_WORLD_ID_API_BASE = 'https://developer.worldcoin.org';

/** Verification levels the Aetheris agency governance flow accepts. */
export const WORLD_ID_VERIFICATION_LEVELS = ['orb', 'device'] as const;

/** Error raised when the World ID cloud verifier rejects a proof or is unreachable. */
export class WorldIdVerificationError extends Error {
  readonly name = 'WorldIdVerificationError';
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Error body returned by `/api/v2/verify/{app_id}` on a 4xx. */
type WorldIdErrorBody = {
  code?: string;
  detail?: string;
  attribute?: string | null;
};

/** Success body returned by `/api/v2/verify/{app_id}`. */
type WorldIdSuccessBody = {
  success?: boolean;
  action?: string;
  nullifier_hash?: string;
  created_at?: string;
};

/**
 * World ID's `hashToField`: keccak256 over the packed signal bytes, right-shifted
 * by 8 bits so the digest fits inside the BN254 scalar field. This mirrors
 * `@worldcoin/idkit-core/hashing` without pulling the React bundle onto the server.
 *
 * @param signal - Arbitrary signal string; `0x`-prefixed values are treated as raw
 *                 bytes (matching `abi.encodePacked` semantics), others as UTF-8.
 * @returns The 0x-prefixed, 32-byte field-safe digest.
 */
export function hashSignalToField(signal: string): Hex {
  const bytes = toBytes(signal.startsWith('0x') ? (signal as Hex) : signal);
  const shifted = BigInt(keccak256(bytes)) >> 8n;
  return `0x${shifted.toString(16).padStart(64, '0')}` as Hex;
}

/**
 * Verify a World ID proof against the Worldcoin cloud verifier. **Server-only.**
 *
 * Aetheris gates agency deployment and treasury profit claims behind this call so
 * that one human operator maps to exactly one governance identity (Sybil resistance).
 *
 * @param proof - The proof object emitted by IDKit.
 * @param signal - The same signal that was passed to IDKit (typically the operator address).
 * @returns `{ success: true }` on a verified proof, or `{ success: false, detail }`
 *          carrying the Developer Portal's human-readable rejection reason.
 * @throws {ServerOnlyViolationError} If called from the browser.
 * @throws {WorldIdVerificationError} On network failure or an unexpected (5xx) response.
 */
export async function verifyWorldIdProof(
  proof: WorldIdProof,
  signal: string,
): Promise<{ success: boolean; detail?: string }> {
  assertServerOnly('lib/worldid.ts#verifyWorldIdProof');

  const appId = WORLD_ID_APP_ID || optionalEnv('NEXT_PUBLIC_WORLD_ID_APP_ID');
  if (!appId) {
    return {
      success: false,
      detail:
        'NEXT_PUBLIC_WORLD_ID_APP_ID is not configured; cannot verify World ID proofs.',
    };
  }

  const base = optionalEnv('WORLD_ID_API_BASE', DEFAULT_WORLD_ID_API_BASE).replace(/\/+$/, '');
  const url = `${base}/api/v2/verify/${encodeURIComponent(appId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nullifier_hash: proof.nullifier_hash,
        merkle_root: proof.merkle_root,
        proof: proof.proof,
        verification_level: proof.verification_level,
        action: WORLD_ID_ACTION,
        signal_hash: hashSignalToField(signal),
      }),
      cache: 'no-store',
    });
  } catch (cause) {
    throw new WorldIdVerificationError(
      `Could not reach the World ID verifier at ${url}: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      0,
    );
  }

  const rawBody = await response.text();
  let parsed: unknown = null;
  if (rawBody.length > 0) {
    try {
      parsed = JSON.parse(rawBody) as unknown;
    } catch {
      // Non-JSON body (e.g. an HTML gateway error page) — keep `rawBody` for the message.
      parsed = null;
    }
  }

  if (response.ok) {
    const body = (parsed ?? {}) as WorldIdSuccessBody;
    return { success: body.success !== false };
  }

  // 4xx means "this proof was rejected" — a normal, expected outcome we surface
  // to the caller as `success: false` rather than as a thrown exception.
  if (response.status >= 400 && response.status < 500) {
    const body = (parsed ?? {}) as WorldIdErrorBody;
    const detail =
      body.detail ?? body.code ?? (rawBody.length > 0 ? rawBody.slice(0, 300) : '');
    return {
      success: false,
      detail: detail.length > 0 ? detail : `World ID verifier returned HTTP ${response.status}.`,
    };
  }

  const body = (parsed ?? {}) as WorldIdErrorBody;
  throw new WorldIdVerificationError(
    `World ID verifier returned ${response.status}: ${body.detail ?? rawBody.slice(0, 300)}`,
    response.status,
    body.code,
  );
}

/**
 * Unpack an ABI-encoded World ID proof into the arguments the on-chain
 * `IWorldID.verifyProof(root, groupId, signalHash, nullifierHash, externalNullifier, proof)`
 * expects — specifically the `uint256[8]` Groth16 proof plus the two field elements.
 *
 * @param proof - The IDKit proof object; `proof.proof` is `abi.encode(uint256[8])`.
 * @returns `root`, `nullifierHash` and the 8-element `proof` tuple as bigints.
 * @throws {WorldIdVerificationError} If the proof payload is not decodable as `uint256[8]`.
 */
export function encodeProofForContract(proof: WorldIdProof): {
  root: bigint;
  nullifierHash: bigint;
  proof: readonly bigint[];
} {
  const packed = proof.proof?.trim() ?? '';
  if (!packed.startsWith('0x')) {
    throw new WorldIdVerificationError(
      'World ID proof payload must be a 0x-prefixed ABI-encoded uint256[8].',
      0,
      'invalid_proof_encoding',
    );
  }

  let unpacked: readonly bigint[];
  try {
    const [decoded] = decodeAbiParameters([{ type: 'uint256[8]' }] as const, packed as Hex);
    unpacked = decoded;
  } catch (cause) {
    throw new WorldIdVerificationError(
      `Failed to decode World ID proof as uint256[8]: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      0,
      'invalid_proof_encoding',
    );
  }

  try {
    return {
      root: BigInt(proof.merkle_root),
      nullifierHash: BigInt(proof.nullifier_hash),
      proof: unpacked,
    };
  } catch (cause) {
    throw new WorldIdVerificationError(
      `merkle_root / nullifier_hash are not valid uint256 values: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      0,
      'invalid_proof_fields',
    );
  }
}
