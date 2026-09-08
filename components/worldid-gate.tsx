"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BadgeCheck, ScanFace, ShieldCheck } from "lucide-react";

import type { WorldIdProof } from "@/lib/worldid";
import { cn } from "@/lib/utils";
import { readApiError } from "./api-client";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

/**
 * World ID proof-of-personhood gate.
 *
 * Coded against the *installed* IDKit (v4.2.3), whose API is `IDKitRequestWidget`
 * + presets + a server-signed `rp_context` — not the older `IDKitWidget`.
 * We request the `orbLegacy` preset with `allow_legacy_proofs`, because the
 * frozen `lib/worldid.verifyWorldIdProof` verifies the World ID 3.0 proof
 * envelope (`merkle_root` / `nullifier_hash` / `proof` / `verification_level`).
 *
 * The widget is loaded with `ssr: false` so its wasm bundle never runs during
 * server rendering, and the whole flow degrades to a labelled simulation when
 * the relying-party credentials are absent.
 */

type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

const IDKitRequestWidget = dynamic(
  () => import("@worldcoin/idkit").then((mod) => mod.IDKitRequestWidget),
  { ssr: false },
);

type ResponseV3 = {
  identifier: string;
  proof: string;
  merkle_root: string;
  nullifier: string;
};

type IDKitResultLike = {
  protocol_version: string;
  responses?: unknown;
};

/** Maps an IDKit v4 result carrying a legacy (v3) response onto `WorldIdProof`. */
function toWorldIdProof(result: unknown): WorldIdProof | null {
  if (typeof result !== "object" || result === null) return null;
  const outer = result as IDKitResultLike;
  if (outer.protocol_version !== "3.0" || !Array.isArray(outer.responses)) return null;
  const first: unknown = outer.responses[0];
  if (typeof first !== "object" || first === null) return null;
  const response = first as Partial<ResponseV3>;
  if (
    typeof response.proof !== "string" ||
    typeof response.merkle_root !== "string" ||
    typeof response.nullifier !== "string"
  ) {
    return null;
  }
  return {
    merkle_root: response.merkle_root,
    nullifier_hash: response.nullifier,
    proof: response.proof,
    verification_level: response.identifier === "proof_of_human" ? "orb" : "device",
  };
}

export interface VerificationResult {
  nullifierHash: string;
  verificationLevel: string;
  simulated: boolean;
}

export interface WorldIdGateProps {
  /** From `lib/worldid.WORLD_ID_APP_ID`, passed down by a server component. */
  appId: string;
  /** From `lib/worldid.WORLD_ID_ACTION`. */
  action: string;
  /** The value committed to inside the proof — typically the operator address. */
  signal: string;
  verification: VerificationResult | null;
  onVerified: (result: VerificationResult) => void;
  onReset?: () => void;
  className?: string;
}

type Phase = "idle" | "preparing" | "awaiting" | "verifying" | "error";

export function WorldIdGate({
  appId,
  action,
  signal,
  verification,
  onVerified,
  onReset,
  className,
}: WorldIdGateProps) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [rpContext, setRpContext] = React.useState<RpContext | null>(null);
  const [open, setOpen] = React.useState(false);

  const appIdValid = /^app_[a-zA-Z0-9_]+$/.test(appId);

  async function beginVerification() {
    setMessage(null);

    if (!appIdValid) {
      simulate("NEXT_PUBLIC_WORLD_ID_APP_ID is not set.");
      return;
    }

    setPhase("preparing");
    try {
      const response = await fetch("/api/worldid/rp-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const detail = await readApiError(response);
        simulate(detail);
        return;
      }
      const payload = (await response.json()) as { rp_context: RpContext };
      setRpContext(payload.rp_context);
      setPhase("awaiting");
      setOpen(true);
    } catch (error) {
      simulate(error instanceof Error ? error.message : "Could not reach the RP context route.");
    }
  }

  /** Clearly-labelled fallback so the demo still shows the gated flow end to end. */
  function simulate(reason: string) {
    setPhase("verifying");
    setMessage(reason);
    window.setTimeout(() => {
      setPhase("idle");
      onVerified({
        nullifierHash: `0x${"2b1d".repeat(8)}c904`,
        verificationLevel: "orb",
        simulated: true,
      });
    }, 900);
  }

  async function handleVerify(result: unknown): Promise<void> {
    setPhase("verifying");
    const proof = toWorldIdProof(result);
    if (proof === null) {
      throw new Error(
        "World App returned a World ID 4.0 proof. `lib/worldid.verifyWorldIdProof` expects the 3.0 envelope — request the orbLegacy preset.",
      );
    }
    const response = await fetch("/api/verify-worldid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proof, signal }),
    });
    if (!response.ok) {
      throw new Error(await readApiError(response));
    }
    const payload = (await response.json()) as {
      nullifierHash: string;
      verificationLevel: string;
    };
    onVerified({ ...payload, simulated: false });
    setPhase("idle");
  }

  if (verification) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
          verification.simulated
            ? "border-amber-400/30 bg-amber-400/[0.06]"
            : "border-emerald-400/30 bg-emerald-400/[0.06]",
          className,
        )}
      >
        <BadgeCheck
          className={cn(
            "h-5 w-5 shrink-0",
            verification.simulated ? "text-amber-300" : "text-emerald-300",
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">
            {verification.simulated ? "Simulated human check" : "Operator verified"}
          </p>
          <p className="data-mono truncate text-slate-400" title={verification.nullifierHash}>
            nullifier {verification.nullifierHash}
          </p>
        </div>
        <Badge tone={verification.simulated ? "demo" : "success"}>
          {verification.simulated ? "Simulated" : verification.verificationLevel}
        </Badge>
        {onReset ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset
          </Button>
        ) : null}
      </motion.div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 shrink-0 text-aether-cyan" aria-hidden="true" />
          <p className="text-sm font-medium text-white">Human operator required</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">
          Sweeping agency margin is gated on a World ID proof of personhood, committed to the
          operator address so a nullifier can only claim once.
        </p>
        <Button
          className="mt-3 w-full"
          onClick={() => void beginVerification()}
          loading={phase === "preparing" || phase === "verifying"}
          size="md"
        >
          <ScanFace className="h-4 w-4" aria-hidden="true" />
          Verify with World ID
        </Button>
      </div>

      <AnimatePresence>
        {message ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[0.72rem] leading-relaxed text-amber-200/85"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Falling back to a simulated check.</span> {message}
            </span>
          </motion.p>
        ) : null}
      </AnimatePresence>

      {rpContext && appIdValid ? (
        <IDKitRequestWidget
          app_id={appId as `app_${string}`}
          action={action}
          rp_context={rpContext}
          allow_legacy_proofs
          preset={{ type: "OrbLegacy", signal }}
          open={open}
          onOpenChange={setOpen}
          handleVerify={handleVerify}
          onSuccess={() => setOpen(false)}
          onError={(code) => {
            setPhase("error");
            setMessage(`World App returned: ${String(code)}`);
          }}
        />
      ) : null}
    </div>
  );
}
