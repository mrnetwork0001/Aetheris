import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatUnits, isAddress } from 'viem';

/**
 * Merge Tailwind class names, resolving conflicting utilities (last one wins).
 *
 * @param inputs - Any clsx-compatible values (strings, arrays, conditional maps).
 * @returns A single, de-conflicted class string.
 */
export function cn(...inputs: unknown[]): string {
  // The frozen public API types this as `unknown[]`; clsx's own `ClassValue`
  // is structurally the same permissive union, so this cast is safe and is the
  // only way to satisfy both signatures without changing the frozen shape.
  return twMerge(clsx(inputs as ClassValue[]));
}

/**
 * Abbreviate an EVM address (or any long identifier) for display.
 *
 * @param a - Address or identifier. Non-string / short values are returned as-is.
 * @returns e.g. `0x1234…cdef`, or the original string when it is too short to shorten.
 */
export function shortAddress(a: string): string {
  if (typeof a !== 'string') return '';
  const value = a.trim();
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/**
 * Format a token amount without ever throwing on malformed input.
 *
 * @param v - Raw base-unit amount as a bigint or decimal/hex string.
 * @param decimals - Token decimals (default 18).
 * @returns The human-readable amount, or `'0'` when the input cannot be parsed.
 */
export function formatUnitsSafe(v: bigint | string, decimals = 18): string {
  try {
    const raw = typeof v === 'bigint' ? v : BigInt(String(v).trim() === '' ? '0' : String(v).trim());
    const safeDecimals = Number.isFinite(decimals) && decimals >= 0 ? Math.floor(decimals) : 18;
    return formatUnits(raw, safeDecimals);
  } catch {
    // Malformed amounts (empty strings, floats, `undefined` coerced to string)
    // must degrade to a renderable value rather than crash a React tree.
    return '0';
  }
}

/**
 * Truncate a formatted decimal string to a fixed number of fraction digits
 * without floating-point rounding surprises.
 *
 * @param value - Decimal string such as the output of {@link formatUnitsSafe}.
 * @param maxFractionDigits - Maximum digits to keep after the decimal point.
 * @returns The truncated decimal string.
 */
export function truncateDecimals(value: string, maxFractionDigits = 4): string {
  const [whole, fraction] = value.split('.');
  if (!fraction || maxFractionDigits <= 0) return whole ?? '0';
  const kept = fraction.slice(0, maxFractionDigits).replace(/0+$/, '');
  return kept.length > 0 ? `${whole}.${kept}` : (whole ?? '0');
}

/**
 * Type guard for a checksum-agnostic EVM address.
 *
 * @param value - Candidate value.
 * @returns True when `value` is a syntactically valid 0x-prefixed address.
 */
export function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && isAddress(value);
}

/**
 * Format a Unix timestamp (seconds or milliseconds) as a locale date-time string.
 *
 * @param ts - Timestamp in seconds or milliseconds, as number or numeric string.
 * @returns Localized string, or `'—'` when the timestamp is unusable.
 */
export function formatTimestamp(ts: number | string): string {
  const n = typeof ts === 'number' ? ts : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
