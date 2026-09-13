import * as React from "react";

import { cn } from "@/lib/utils";

import type { DataSource } from "./aetheris-data";
import { Pill } from "./ui/pill";

export interface DataSourceBadgeProps {
  source: DataSource;
  /** Why the live path was unavailable - surfaced as the tooltip. */
  reason?: string;
  className?: string;
}

const LIVE_TITLE = "Served from a live indexed source";
const DEMO_TITLE = "Rendered from local fixtures - not on-chain data.";

/**
 * Honest provenance marker. Anything rendered from fixtures is badged
 * DEMO DATA so a judge is never shown mock numbers dressed up as chain state.
 * Never hide this.
 */
export function DataSourceBadge({ source, reason, className }: DataSourceBadgeProps) {
  if (source === "live") {
    return (
      <Pill
        tone="on"
        dot
        className={cn("live-pill", className)}
        title={LIVE_TITLE}
        role="status"
      >
        Live
      </Pill>
    );
  }
  return (
    <Pill tone="warn" dashed className={className} title={reason ?? DEMO_TITLE} role="status">
      <span aria-hidden="true">◌</span>
      Demo data
    </Pill>
  );
}

/** Inline explanation shown under a panel that fell back to fixtures. */
export function FallbackNote({ source, reason }: { source: DataSource; reason?: string }) {
  if (source === "live" || !reason) return null;
  return (
    <p className="mt-3 rounded-[10px] border border-[#f59e0b40] bg-[#f59e0b1f] px-3 py-2 text-xs leading-relaxed text-[color:var(--c-warn-ink)]">
      <span className="font-semibold">Fallback active.</span> {reason}
    </p>
  );
}
