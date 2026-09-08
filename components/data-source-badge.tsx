import * as React from "react";
import { FlaskConical } from "lucide-react";

import type { DataSource } from "./aetheris-data";
import { Badge, LiveDot } from "./ui/badge";

export interface DataSourceBadgeProps {
  source: DataSource;
  /** Why the live path was unavailable — surfaced as a tooltip. */
  reason?: string;
  className?: string;
}

/**
 * Honest provenance marker. Anything rendered from fixtures is badged
 * "demo data" so a judge is never shown mock numbers dressed up as chain state.
 */
export function DataSourceBadge({ source, reason, className }: DataSourceBadgeProps) {
  if (source === "live") {
    return (
      <Badge tone="success" className={className} title="Served from a live indexed source">
        <LiveDot />
        Live
      </Badge>
    );
  }
  return (
    <Badge
      tone="demo"
      className={className}
      title={reason ?? "Rendered from local fixtures — not on-chain data."}
    >
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Demo data
    </Badge>
  );
}

/** Inline explanation shown under a panel that fell back to fixtures. */
export function FallbackNote({ source, reason }: { source: DataSource; reason?: string }) {
  if (source === "live" || !reason) return null;
  return (
    <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[0.7rem] leading-relaxed text-amber-200/80">
      <span className="font-medium">Fallback active.</span> {reason}
    </p>
  );
}
