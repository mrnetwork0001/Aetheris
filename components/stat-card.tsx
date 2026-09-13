"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { DataSourceBadge } from "./data-source-badge";
import type { DataSource } from "./aetheris-data";
import { formatCompactUsd, formatDuration, formatPercent, formatUsd } from "./format";
import { Card } from "./ui/card";

/** Tone now only colours the small icon; the value is white or accent (see `accent`). */
const TONES = {
  cyan: "text-fl-accent",
  glow: "fg-2",
  gold: "text-fl-warn",
  success: "text-fl-emerald",
} as const;

export type StatTone = keyof typeof TONES;

/**
 * Formatters are named rather than passed as functions: a Server Component
 * cannot hand a function across the RSC boundary.
 */
export type StatFormat = "int" | "usd" | "usdCompact" | "duration" | "percent";

export interface StatCardProps {
  label: string;
  value: number;
  format?: StatFormat;
  icon: React.ReactNode;
  hint?: string;
  tone?: StatTone;
  /** Render the value in the accent colour - exactly one tile per row should. */
  accent?: boolean;
  source?: DataSource;
  sourceReason?: string;
  /** Kept for API compatibility; the fl tile does not draw a sparkline. */
  series?: readonly number[];
  delta?: string;
  index?: number;
}

const FORMATTERS: Record<StatFormat, (value: number) => string> = {
  int: (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value),
  usd: (value) => formatUsd(value, 0),
  usdCompact: (value) => formatCompactUsd(value),
  duration: (value) => formatDuration(value),
  percent: (value) => formatPercent(value),
};

export function StatCard({
  label,
  value,
  format = "int",
  icon,
  hint,
  tone = "cyan",
  accent = false,
  source,
  sourceReason,
  delta,
  index = 0,
}: StatCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const prefersReducedMotion = useReducedMotion();
  // Server-render the real figure so the tile is correct without JS; the
  // count-up below is purely an enhancement layered on top after hydration.
  const [display, setDisplay] = React.useState(value);
  const render = FORMATTERS[format];

  React.useEffect(() => {
    // Honour prefers-reduced-motion: show the figure, skip the count-up.
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, {
      duration: 1.1,
      delay: index * 0.07,
      ease: "easeOut",
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [inView, value, index, prefersReducedMotion]);

  // Safety net. Anything that stops useInView from firing - no
  // IntersectionObserver, a card that never enters the viewport, headless/OG
  // capture - must never leave a stale figure on screen. Never let a
  // decorative animation be the only path to the real number.
  React.useEffect(() => {
    if (inView || prefersReducedMotion) return;
    const timer = window.setTimeout(() => {
      setDisplay((current) => (current === 0 ? value : current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [inView, prefersReducedMotion, value]);

  return (
    <Card ref={ref} className="flex flex-col gap-3 !p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="mono-label">{label}</span>
        <span
          aria-hidden="true"
          className={cn("shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5", TONES[tone])}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "font-mono text-[2rem] font-semibold leading-none tracking-tight tabular-nums",
          accent ? "text-fl-accent" : "fg",
        )}
      >
        {render(display)}
      </p>
      {hint ? <p className="text-xs leading-snug fg-2">{hint}</p> : null}
      {delta || source ? (
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-fl-border pt-3">
          <span className="text-[11px] fg-3">{delta ?? ""}</span>
          {source ? <DataSourceBadge source={source} reason={sourceReason} /> : null}
        </div>
      ) : null}
    </Card>
  );
}
