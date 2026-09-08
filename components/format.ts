/**
 * Presentation helpers. Pure, isomorphic — safe in both server and client
 * components. Built on top of the frozen `@/lib/utils` primitives.
 */

import { formatUnitsSafe } from "@/lib/utils";

/** Base-units string/bigint -> a JS number, guarded against NaN. */
export function toNumber(raw: bigint | string, decimals = 6): number {
  try {
    const parsed = Number(formatUnitsSafe(raw, decimals));
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function formatUsd(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits === 0 ? 0 : 2,
  }).format(value);
}

export function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Formats a base-units amount with its ticker, e.g. `2,400.00 USDC`. */
export function formatToken(raw: bigint | string, decimals: number, symbol?: string): string {
  const value = toNumber(raw, decimals);
  const digits = value >= 1000 ? 2 : value >= 1 ? 2 : 4;
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.min(2, digits),
  }).format(value);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** `1_940` -> `1.94s`; `640` -> `640ms`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const RELATIVE_STEPS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ["second", 60_000],
  ["minute", 3_600_000],
  ["hour", 86_400_000],
  ["day", 2_592_000_000],
  ["month", 31_536_000_000],
];

const DIVISORS: Record<string, number> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  month: 2_592_000_000,
  year: 31_536_000_000,
};

/** Stable relative time. Pass `now` explicitly to avoid hydration drift. */
export function relativeTime(timestampMs: number, now: number): string {
  const delta = timestampMs - now;
  const abs = Math.abs(delta);
  for (const [unit, limit] of RELATIVE_STEPS) {
    if (abs < limit) {
      return RELATIVE.format(Math.round(delta / DIVISORS[unit]), unit);
    }
  }
  return RELATIVE.format(Math.round(delta / DIVISORS.year), "year");
}

/** Hedera consensus timestamps look like `1757292144.882301455`. */
export function hcsTimestampToMs(consensusTimestamp: string): number {
  const seconds = Number.parseFloat(consensusTimestamp);
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(seconds * 1000);
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "--:--:--";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function formatDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export interface DecodedHcsMessage {
  event: string;
  fields: ReadonlyArray<readonly [string, string]>;
  raw: string;
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserialisable]";
  }
}

/**
 * HCS payloads are opaque strings. Aetheris writes compact JSON frames, so we
 * decode them when possible and degrade to the raw string when not.
 */
export function decodeHcsMessage(contents: string): DecodedHcsMessage {
  try {
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const eventKey = ["evt", "event", "type", "kind"].find(
        (key) => typeof record[key] === "string",
      );
      const event = eventKey ? String(record[eventKey]) : "Message";
      const fields = Object.entries(record)
        .filter(([key]) => key !== eventKey)
        .map(([key, value]) => [key, stringifyValue(value)] as const);
      return { event, fields, raw: contents };
    }
  } catch {
    /* not JSON — fall through to the raw rendering */
  }
  return { event: "Message", fields: [["payload", contents]], raw: contents };
}

/** Maps an Aetheris HCS event name to a semantic accent. */
export type EventTone = "cyan" | "glow" | "gold" | "success" | "neutral";

export function eventTone(event: string): EventTone {
  switch (event) {
    case "MicroSettlement":
    case "ProfitClaimed":
      return "gold";
    case "JobSettled":
    case "TaskCompleted":
      return "success";
    case "TreasuryRebalanced":
      return "glow";
    case "JobCreated":
    case "SubAgentAssigned":
      return "cyan";
    default:
      return "neutral";
  }
}
