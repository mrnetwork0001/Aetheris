/**
 * ENS identity resolution for Aetheris agencies and sub-agents.
 *
 * NOTE ON CHAINS: ENS records live on **Ethereum mainnet**, even though Aetheris
 * settles jobs and micro-payments on **Hedera** (chain 296). We therefore keep a
 * dedicated mainnet public client pointed at `NEXT_PUBLIC_ENS_RPC_URL` purely for
 * name/avatar/text lookups; it is never used to send transactions. An agency named
 * `acme.eth` is resolved here and then displayed alongside its Hedera treasury address.
 *
 * Every function is browser-safe and returns `null` instead of throwing, so an
 * unregistered name, a flaky RPC, or a malformed input can never break a render.
 */

import { createPublicClient, fallback, http, isAddress, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';
import { publicEnv } from './env';

/**
 * Public mainnet RPCs used as backups. Free endpoints go down (llamarpc was
 * returning HTTP 525 during development), and a dead RPC would silently erase
 * every ENS name from the UI — so `NEXT_PUBLIC_ENS_RPC_URL` is tried first and
 * viem's `fallback` transport rotates to these if it errors.
 */
const ENS_RPC_FALLBACKS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://rpc.ankr.com/eth',
  'https://cloudflare-eth.com',
] as const;

let cachedClient: PublicClient | null = null;

/**
 * Lazily build (and memoize) the mainnet client used for ENS lookups.
 * Built on first use — never at import time — so `next build` never needs an RPC URL.
 *
 * @returns A viem public client bound to Ethereum mainnet, with RPC failover.
 */
export function getEnsClient(): PublicClient {
  if (cachedClient) return cachedClient;
  const configured = publicEnv.ensRpcUrl.trim();
  const urls = [configured, ...ENS_RPC_FALLBACKS].filter(
    (url, index, all): url is string => url.length > 0 && all.indexOf(url) === index,
  );
  cachedClient = createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((url) => http(url, { batch: true, retryCount: 1, timeout: 8_000 })),
      { rank: false },
    ),
  }) as PublicClient;
  return cachedClient;
}

/**
 * Normalize a name per ENSIP-15, returning `null` for anything unnormalizable.
 *
 * @param name - Raw user-supplied ENS name.
 * @returns The normalized name, or `null`.
 */
function safeNormalize(name: string): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || !trimmed.includes('.')) return null;
  try {
    return normalize(trimmed);
  } catch {
    // ENSIP-15 rejected the label (disallowed codepoint, empty label, …).
    return null;
  }
}

/**
 * Resolve an ENS name to its Ethereum address (forward resolution).
 *
 * @param name - ENS name such as `aetheris.eth`.
 * @returns The checksummed address, or `null` if unregistered / unresolvable.
 */
export async function resolveEnsName(name: string): Promise<string | null> {
  const normalized = safeNormalize(name);
  if (!normalized) return null;
  try {
    const address = await getEnsClient().getEnsAddress({ name: normalized });
    return address ?? null;
  } catch (error) {
    logEnsFailure('resolveEnsName', normalized, error);
    return null;
  }
}

/**
 * Reverse-resolve an address to its primary ENS name.
 *
 * @param address - 0x-prefixed EVM address.
 * @returns The primary ENS name, or `null` when none is set / lookup fails.
 */
export async function lookupEnsAddress(address: string): Promise<string | null> {
  if (typeof address !== 'string' || !isAddress(address.trim())) return null;
  try {
    const name = await getEnsClient().getEnsName({ address: address.trim() as `0x${string}` });
    return name ?? null;
  } catch (error) {
    logEnsFailure('lookupEnsAddress', address, error);
    return null;
  }
}

/**
 * Fetch the avatar URI recorded for an ENS name.
 *
 * @param name - ENS name.
 * @returns A resolved avatar URL, or `null` when unset / unresolvable.
 */
export async function getEnsAvatar(name: string): Promise<string | null> {
  const normalized = safeNormalize(name);
  if (!normalized) return null;
  try {
    const avatar = await getEnsClient().getEnsAvatar({ name: normalized });
    return avatar ?? null;
  } catch (error) {
    logEnsFailure('getEnsAvatar', normalized, error);
    return null;
  }
}

/**
 * Read an arbitrary ENS text record (e.g. `com.twitter`, `url`, `description`).
 * Aetheris uses these to attach public metadata to agency identities.
 *
 * @param name - ENS name.
 * @param key - Text record key.
 * @returns The record value, or `null` when unset / unresolvable.
 */
export async function getEnsTextRecord(name: string, key: string): Promise<string | null> {
  const normalized = safeNormalize(name);
  if (!normalized || typeof key !== 'string' || key.trim().length === 0) return null;
  try {
    const value = await getEnsClient().getEnsText({ name: normalized, key: key.trim() });
    return value ?? null;
  } catch (error) {
    logEnsFailure('getEnsTextRecord', `${normalized}#${key}`, error);
    return null;
  }
}

/**
 * Best-effort display identity for an address: primary ENS name if one exists,
 * otherwise the raw address.
 *
 * @param address - EVM address.
 * @returns `{ name, address }` where `name` may be `null`.
 */
export async function getEnsIdentity(
  address: string,
): Promise<{ name: string | null; address: string }> {
  const name = await lookupEnsAddress(address);
  return { name, address };
}

/**
 * Log an ENS failure without ever escalating it — resolution is decorative,
 * so a broken RPC must degrade to "no ENS name" rather than an error boundary.
 */
function logEnsFailure(fn: string, subject: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[aetheris:ens] ${fn}("${subject}") failed: ${message}`);
}
