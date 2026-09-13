import * as React from "react";
import { BadgeCheck, ShieldOff, ShieldQuestion } from "lucide-react";

import type { AgencyStats } from "./aetheris-data";
import { cn } from "@/lib/utils";
import { Badge, type BadgeTone } from "./ui/badge";

export interface OperatorVerificationBadgeProps {
  stats: AgencyStats;
  className?: string;
}

type Presentation = {
  tone: BadgeTone;
  label: string;
  icon: React.ReactNode;
};

/**
 * Decide what may honestly be claimed about the operator's World ID status. Labels
 * stay short; the full reasoning lives in `stats.operatorVerificationNote`.
 *
 *  - verified + router present                  -> "World ID verified" (success)
 *  - verified, no router, proof relayed by us   -> "World ID verified" (success): the
 *    World ID verifier checked the ZK proof and an OperatorVerified HCS frame binds
 *    it to the on-chain nullifier.
 *  - verified, no router, nothing relayed       -> "Operator registered" (neutral): the
 *    nullifier on-chain is a seed value, not a proof of personhood.
 *  - not verified                               -> "Operator unverified"
 *  - unknown                                    -> "World ID unknown"
 */
export function presentOperatorVerification(stats: AgencyStats): Presentation {
  const verified = stats.operatorVerified;
  const bypassed = stats.worldIdBypassed;
  const relayed = stats.worldIdProofRelayed;
  const icon = (Icon: typeof BadgeCheck) => <Icon className="h-3 w-3" aria-hidden="true" />;

  if (verified === null || verified === undefined) {
    return { tone: "neutral", label: "World ID unknown", icon: icon(ShieldQuestion) };
  }
  if (!verified) {
    return { tone: "neutral", label: "Operator unverified", icon: icon(ShieldOff) };
  }
  if (bypassed === false || relayed === true) {
    return { tone: "success", label: "World ID verified", icon: icon(BadgeCheck) };
  }
  return { tone: "neutral", label: "Operator registered", icon: icon(ShieldOff) };
}

/**
 * World ID provenance marker for the agency operator. The reason lives in
 * `stats.operatorVerificationNote` (tooltip + `<OperatorVerificationNote />`).
 */
export function OperatorVerificationBadge({ stats, className }: OperatorVerificationBadgeProps) {
  const view = presentOperatorVerification(stats);
  return (
    <Badge tone={view.tone} className={className} title={stats.operatorVerificationNote ?? undefined}>
      {view.icon}
      {view.label}
    </Badge>
  );
}

/** Inline explanation under the header - the full provenance sentence, never only a tooltip. */
export function OperatorVerificationNote({ stats, className }: OperatorVerificationBadgeProps) {
  const note = stats.operatorVerificationNote;
  if (!note) return null;
  const view = presentOperatorVerification(stats);
  const nullifier = stats.operatorNullifierHash;
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-[0.7rem] leading-relaxed",
        view.tone === "success"
          ? "border-emerald-400/20 bg-emerald-400/[0.05] text-emerald-200/85"
          : "border-white/[0.08] bg-white/[0.02] text-slate-400",
        className,
      )}
    >
      <span className="font-medium">World ID operator status.</span> {note}
      {nullifier ? (
        <>
          {" "}
          <span className="data-mono break-all text-slate-500" title={nullifier}>
            nullifier {nullifier.slice(0, 12)}…{nullifier.slice(-8)}
          </span>
        </>
      ) : null}
    </p>
  );
}
