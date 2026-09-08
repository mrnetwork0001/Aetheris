"use client";

import * as React from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { DataSourceBadge } from "./data-source-badge";
import type { DataSource } from "./aetheris-data";
import { formatCompactUsd, formatDuration, formatPercent, formatUsd } from "./format";
import { Card } from "./ui/card";

const TONES = {
  cyan: { text: "text-aether-cyan", glow: "from-aether-cyan/25", stroke: "#38e8ff" },
  glow: { text: "text-[#a9b2ff]", glow: "from-aether-glow/30", stroke: "#6d7cff" },
  gold: { text: "text-aether-gold", glow: "from-aether-gold/25", stroke: "#ffc857" },
  success: { text: "text-emerald-300", glow: "from-emerald-400/25", stroke: "#34d399" },
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
  source?: DataSource;
  sourceReason?: string;
  /** Normalised 0–1 samples driving the sparkline. */
  series?: readonly number[];
  delta?: string;
  index?: number;
}

function Sparkline({ series, stroke }: { series: readonly number[]; stroke: string }) {
  const gradientId = React.useId();
  if (series.length < 2) return null;
  const width = 120;
  const height = 32;
  const step = width / (series.length - 1);
  const points = series.map((v, i) => `${(i * step).toFixed(1)},${(height - v * height).toFixed(1)}`);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill={`url(#${gradientId})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
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
  source,
  sourceReason,
  series,
  delta,
  index = 0,
}: StatCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = React.useState(0);
  const palette = TONES[tone];
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

  // Safety net. The count-up is an enhancement, but `display` starts at 0, so
  // anything that stops useInView from firing — no IntersectionObserver, a card
  // that never enters the viewport, headless/OG capture — would otherwise pin
  // the tile at a permanent "$0" and misreport the treasury. Never let a
  // decorative animation be the only path to the real number.
  React.useEffect(() => {
    if (inView || prefersReducedMotion) return;
    const timer = window.setTimeout(() => {
      setDisplay((current) => (current === 0 ? value : current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [inView, prefersReducedMotion, value]);

  return (
    <Card ref={ref} className="edge-lit group p-0">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-opacity duration-500 group-hover:opacity-100",
          palette.glow,
          "opacity-60",
        )}
      />
      <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <p className="truncate text-[0.7rem] font-medium uppercase tracking-[0.14em] text-slate-400">
            {label}
          </p>
          <p
            className={cn("mt-2 text-2xl font-semibold tabular-nums text-white sm:text-[1.65rem]")}
          >
            {render(display)}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]",
            palette.text,
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>

      {series && series.length > 1 ? (
        <div className="mt-3 px-1 pb-1">
          <Sparkline series={series} stroke={palette.stroke} />
        </div>
      ) : (
        <div className="h-4" />
      )}

      {(delta || source) && (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-2.5">
          <span className={cn("text-[0.7rem] font-medium", palette.text)}>{delta ?? ""}</span>
          {source ? <DataSourceBadge source={source} reason={sourceReason} /> : null}
        </div>
      )}
    </Card>
  );
}
