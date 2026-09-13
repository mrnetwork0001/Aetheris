import * as React from "react";

import { cn } from "@/lib/utils";

export type PillTone = "on" | "warn" | "off" | "muted" | "emerald" | "rose" | "solid";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  /** Leading status dot in the pill's own colour. */
  dot?: boolean;
  /** Dashed hairline (used for DEMO DATA). */
  dashed?: boolean;
}

/**
 * `.fl-pill`: 10px JetBrains Mono, uppercase, .08em. Colours come from the
 * contextual `--c-*` tokens so the pill stays AA on light and dark bands.
 */
export function Pill({
  tone = "muted",
  dot = false,
  dashed = false,
  className,
  children,
  ...props
}: PillProps) {
  return (
    <span
      className={cn("fl-pill", `fl-pill--${tone}`, dashed && "fl-pill--dashed", className)}
      {...props}
    >
      {dot ? <span aria-hidden="true" className="fl-pill__dot" /> : null}
      {children}
    </span>
  );
}

/** Job / task status → pill tone (DESIGN.md §4). Unknown statuses fall back to `muted`. */
export function statusTone(status: string): PillTone {
  switch (status.trim().toLowerCase()) {
    case "funded":
    case "open":
    case "pending":
      return "off";
    case "dispatched":
    case "assigned":
    case "active":
    case "in_progress":
      return "on";
    case "completed":
    case "done":
      return "emerald";
    case "settled":
    case "paid":
      return "solid";
    case "refunded":
    case "cancelled":
    case "canceled":
    case "failed":
      return "rose";
    default:
      return "muted";
  }
}
