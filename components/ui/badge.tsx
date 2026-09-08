import * as React from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "cyan"
  | "glow"
  | "gold"
  | "success"
  | "warn"
  | "danger"
  | "demo";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-white/12 bg-white/[0.05] text-slate-300",
  cyan: "border-aether-cyan/30 bg-aether-cyan/10 text-aether-cyan",
  glow: "border-aether-glow/40 bg-aether-glow/15 text-[#b9c0ff]",
  gold: "border-aether-gold/30 bg-aether-gold/10 text-aether-gold",
  success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  danger: "border-rose-400/30 bg-rose-400/10 text-rose-300",
  demo: "border-dashed border-amber-400/50 bg-amber-400/[0.08] text-amber-200",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[0.68rem] font-medium uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Small pulsing dot used to signal a live data source. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse-ring",
        className,
      )}
    />
  );
}
