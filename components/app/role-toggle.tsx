"use client";

import * as React from "react";

import { cn, shortAddress } from "@/lib/utils";

import { type Role, useRole } from "./role-context";

const ROLES: ReadonlyArray<{ id: Role; label: string; short: string }> = [
  { id: "operator", label: "Operator", short: "O" },
  { id: "client", label: "Client", short: "C" },
];

export interface RoleToggleProps {
  /** Icon-rail mode: one letter per segment, no status line. */
  compact?: boolean;
  className?: string;
}

/**
 * Operator | Client segmented control bound to the workspace role. The status
 * line under it says, from the connected wallet, what the role means right
 * now: whether you *are* the operator, how many jobs you have funded as a
 * client, or that nothing is connected yet.
 */
export function RoleToggle({ compact = false, className }: RoleToggleProps) {
  const { role, setRole, wallet, walletReady, privyEnabled, isOperator, isClient, myJobs } = useRole();

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const index = ROLES.findIndex((r) => r.id === role);
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next = ROLES[(index + delta + ROLES.length) % ROLES.length];
    setRole(next.id);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-role="${next.id}"]`)?.focus();
  }

  // The status line only speaks for a connected wallet - the sidebar's wallet card
  // already owns sign-in, so a disconnected state shows nothing here.
  let status: React.ReactNode = null;
  let dot = "bg-fl-fg3";
  if (privyEnabled && walletReady && wallet) {
    if (isOperator) {
      dot = "bg-fl-accent";
      status = (
        <>
          <span className="text-white">You are the operator</span> · <span className="data-mono">{shortAddress(wallet)}</span>
        </>
      );
    } else if (isClient) {
      dot = "bg-emerald-400";
      status = (
        <>
          <span className="text-white">Client</span> · {myJobs} job{myJobs === 1 ? "" : "s"} funded by{" "}
          <span className="data-mono">{shortAddress(wallet)}</span>
        </>
      );
    } else {
      dot = "bg-amber-400";
      status = (
        <>
          <span className="data-mono">{shortAddress(wallet)}</span> has no jobs yet - switch to Client to fund one
        </>
      );
    }
  }

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="Workspace role"
        onKeyDown={onKeyDown}
        className={cn("grid gap-1 rounded-xl bg-fl-raised p-1", compact ? "grid-cols-1" : "grid-cols-2")}
      >
        {ROLES.map((item) => {
          const active = role === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-role={item.id}
              tabIndex={active ? 0 : -1}
              onClick={() => setRole(item.id)}
              title={compact ? item.label : undefined}
              className={cn(
                "rounded-[10px] py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fl-accent",
                active ? "bg-fl-border text-white" : "text-fl-fg3 hover:text-fl-fg2",
                compact ? "px-0 text-center" : "px-2",
              )}
            >
              {compact ? item.short : item.label}
            </button>
          );
        })}
      </div>
      {compact || status === null ? null : (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-fl-fg3" aria-live="polite">
          <span aria-hidden="true" className={cn("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
          <span className="min-w-0">{status}</span>
        </p>
      )}
    </div>
  );
}
