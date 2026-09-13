import * as React from "react";

import { cn } from "@/lib/utils";

export interface StatTileProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Render the value in the accent colour — exactly one tile per row should. */
  accent?: boolean;
}

/** Mono stat tile: 10px uppercase label · 2rem JetBrains Mono value · 12px note. */
export function StatTile({ label, value, note, accent = false, className, ...props }: StatTileProps) {
  return (
    <div className={cn("fl-card flex flex-col gap-3 !p-6", className)} {...props}>
      <div className="mono-label">{label}</div>
      <div
        className={cn(
          "font-mono text-[2rem] font-semibold leading-none tracking-tight tabular-nums",
          accent ? "text-fl-accent" : "fg",
        )}
      >
        {value}
      </div>
      {note !== undefined && note !== null ? (
        <div className="text-xs leading-snug fg-2">{note}</div>
      ) : null}
    </div>
  );
}
