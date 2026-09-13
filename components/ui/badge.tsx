import * as React from "react";

import { cn } from "@/lib/utils";

import { Pill, type PillTone } from "./pill";

/**
 * Legacy tone vocabulary, mapped onto the fl palette. New code should use
 * `Pill` directly; `Badge` stays exported because other modules import it.
 */
export type BadgeTone =
  | "cyan"
  | "glow"
  | "demo"
  | "neutral"
  | "live"
  | "warn"
  | "gold"
  | "success"
  | "danger";

const TONES: Record<BadgeTone, { tone: PillTone; dot?: boolean; dashed?: boolean }> = {
  cyan: { tone: "on" },
  glow: { tone: "solid" },
  demo: { tone: "warn", dashed: true },
  neutral: { tone: "off" },
  live: { tone: "on", dot: true },
  warn: { tone: "warn" },
  gold: { tone: "warn" },
  success: { tone: "emerald" },
  danger: { tone: "rose" },
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  const mapped = TONES[tone];
  return (
    <Pill
      tone={mapped.tone}
      dot={mapped.dot}
      dashed={mapped.dashed}
      className={className}
      {...props}
    />
  );
}

/** Small pulsing accent dot used to signal a live data source. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("fl-dot", className)} />;
}
