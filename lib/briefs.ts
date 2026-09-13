/**
 * Job briefs anchored on the Hedera Consensus Service audit topic.
 *
 * A job's `specURI` can point at a `JobBrief` frame on the audit topic using the
 * convention `hcs://<topicId>/<sequenceNumber>`. The frame is canonical JSON:
 *
 *   { evt: "JobBrief", title, role, client, chars, keccak256, text }
 *
 * where `keccak256` is the hash of the UTF-8 `text`, so anyone can verify that the
 * brief the dashboard shows is the one that was anchored. `ipfs://<cid>` specs are
 * still honoured (link to a public gateway); anything else renders as plain text.
 *
 * Pure helpers (`parseSpecURI`, `specLink`, `briefFrame`) are safe in the browser;
 * `loadBrief` reads the mirror node and is meant for Server Components / routes.
 */

import { cache } from 'react';
import { keccak256, toBytes } from 'viem';

import { HEDERA_MIRROR_NODE_BASE, readHcsMessage } from './hedera';

/** Shortest and longest brief the relay and the reader accept, in characters. */
export const BRIEF_MIN_CHARS = 40;
export const BRIEF_MAX_CHARS = 3000;
/** Longest title accepted. */
export const TITLE_MAX_CHARS = 80;
/** Role slugs look like `market-research`. */
export const ROLE_SLUG_RE = /^[a-z][a-z0-9-]{2,31}$/;

/** The roles offered in the funding form; `other` lets the client type a slug. */
export const BRIEF_ROLES = [
  'market-research',
  'security-audit',
  'technical-writing',
  'code-generation',
  'data-labelling',
] as const;

const HCS_SPEC_RE = /^hcs:\/\/(\d{1,10}\.\d{1,10}\.\d{1,19})\/(\d{1,19})$/i;
const IPFS_SPEC_RE = /^ipfs:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export type ParsedSpecURI =
  | { kind: 'hcs'; topicId: string; sequenceNumber: string }
  | { kind: 'ipfs'; cid: string }
  | { kind: 'other' };

/**
 * Classify a job's `specURI`.
 *
 * @returns `hcs` for `hcs://<topic>/<seq>`, `ipfs` only when the CID is well-formed
 * (CIDv0 `Qm…` or CIDv1 `bafy…`), otherwise `other`.
 */
export function parseSpecURI(spec: string | null | undefined): ParsedSpecURI {
  const value = (spec ?? '').trim();
  const hcs = HCS_SPEC_RE.exec(value);
  if (hcs) return { kind: 'hcs', topicId: hcs[1] as string, sequenceNumber: hcs[2] as string };
  const ipfs = IPFS_SPEC_RE.exec(value);
  if (ipfs) return { kind: 'ipfs', cid: ipfs[1] as string };
  return { kind: 'other' };
}

/** Mirror node REST URL for one topic message (the first chunk of a frame). */
export function mirrorMessageUrl(topicId: string, sequenceNumber: string | number): string {
  // Same override the server-side reader honours, plus the public form for client bundles.
  const base = (
    process.env.NEXT_PUBLIC_HEDERA_MIRROR_NODE_URL ??
    process.env.HEDERA_MIRROR_NODE_URL ??
    HEDERA_MIRROR_NODE_BASE
  ).replace(/\/+$/, '');
  return `${base}/api/v1/topics/${encodeURIComponent(topicId)}/messages/${encodeURIComponent(String(sequenceNumber))}`;
}

/**
 * How a spec should be presented: a link when the URI points somewhere public.
 *
 * @returns `href` (absent for `other`) and a short label.
 */
export function specLink(spec: string | null | undefined): { href?: string; label: string } {
  const parsed = parseSpecURI(spec);
  if (parsed.kind === 'hcs') {
    return {
      href: mirrorMessageUrl(parsed.topicId, parsed.sequenceNumber),
      label: `Brief · HCS #${parsed.sequenceNumber}`,
    };
  }
  if (parsed.kind === 'ipfs') {
    return { href: `https://ipfs.io/ipfs/${parsed.cid}`, label: 'IPFS' };
  }
  return { label: (spec ?? '').trim() };
}

/** Canonical on-topic shape of a brief. Field order is part of the convention. */
export interface JobBriefFrame {
  evt: 'JobBrief';
  title: string;
  role: string;
  client: string | null;
  chars: number;
  keccak256: `0x${string}`;
  text: string;
}

export interface JobBriefInput {
  title: string;
  role: string;
  /** Funding client's EVM address, when known at anchoring time. */
  client?: string | null;
  text: string;
}

/** keccak256 over the UTF-8 bytes of `text`, as the frame records it. */
export function briefHash(text: string): `0x${string}` {
  return keccak256(toBytes(text));
}

/**
 * Build the canonical `JobBrief` frame. `chars` and `keccak256` are always derived
 * from `text` here - callers cannot supply them - so a frame composed by the relay
 * is verifiable by `loadBrief` byte for byte.
 */
export function briefFrame(input: JobBriefInput): JobBriefFrame {
  const text = input.text.trim();
  const client = typeof input.client === 'string' && ADDRESS_RE.test(input.client) ? input.client.toLowerCase() : null;
  return {
    evt: 'JobBrief',
    title: input.title.trim(),
    role: input.role.trim(),
    client,
    chars: text.length,
    keccak256: briefHash(text),
    text,
  };
}

/** A brief as resolved from the audit topic and verified against its hash. */
export interface ResolvedBrief {
  title: string;
  role: string;
  client: string | null;
  text: string;
  keccak256: `0x${string}`;
  sequenceNumber: string;
  consensusTimestamp: string;
  topicId: string;
}

/**
 * Parse and verify a frame's contents as a `JobBrief`.
 *
 * @returns `null` when the JSON is not a brief, or when `keccak256` does not match `text`.
 */
export function parseBriefFrame(contents: string): Omit<ResolvedBrief, 'sequenceNumber' | 'consensusTimestamp' | 'topicId'> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  if (r.evt !== 'JobBrief') return null;
  if (typeof r.text !== 'string' || typeof r.title !== 'string' || typeof r.keccak256 !== 'string') return null;
  const text = r.text;
  if (text.length < BRIEF_MIN_CHARS || text.length > BRIEF_MAX_CHARS) return null;
  const expected = briefHash(text);
  if (expected.toLowerCase() !== r.keccak256.toLowerCase()) return null;
  const title = r.title.trim().slice(0, TITLE_MAX_CHARS);
  if (title.length === 0) return null;
  return {
    title,
    role: typeof r.role === 'string' && ROLE_SLUG_RE.test(r.role) ? r.role : 'other',
    client: typeof r.client === 'string' && ADDRESS_RE.test(r.client) ? r.client.toLowerCase() : null,
    text,
    keccak256: expected,
  };
}

/**
 * Resolve a `JobBrief` frame from the mirror node. Memoised per request with
 * React `cache()` so a page that lists the same job twice fetches once.
 *
 * @returns The verified brief, or `null` when the frame is absent, not a brief,
 * or fails hash verification. Network errors propagate as `HederaError`.
 */
/**
 * React's `cache` exists only under the `react-server` export condition. Route
 * handlers and scripts import plain `react`, where it is undefined, so fall back
 * to the unmemoised function there instead of crashing at module load.
 */
const memoise: <F extends (...args: never[]) => unknown>(fn: F) => F =
  typeof cache === 'function' ? cache : (fn) => fn;

export const loadBrief = memoise(async function loadBrief(
  topicId: string,
  sequenceNumber: string | number,
): Promise<ResolvedBrief | null> {
  const message = await readHcsMessage(topicId, sequenceNumber);
  if (!message) return null;
  const brief = parseBriefFrame(message.contents);
  if (!brief) return null;
  return {
    ...brief,
    sequenceNumber: message.sequenceNumber,
    consensusTimestamp: message.consensusTimestamp,
    topicId,
  };
});
