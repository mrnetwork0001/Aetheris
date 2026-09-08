"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Check, Copy, Fingerprint, LogOut, Wallet } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import { DEMO_OPERATOR_ADDRESS } from "./aetheris-data";
import { AgentAvatar } from "./identity";
import { PRIVY_ENABLED } from "./providers";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useEnsProfile } from "./use-ens";

/* ────────────────────────────────────────────────────────────────────────────
   Shared presentation
   ──────────────────────────────────────────────────────────────────────────── */

interface WalletMenuProps {
  address: string;
  onDisconnect: () => void;
  demo?: boolean;
}

function WalletMenu({ address, onDisconnect, demo = false }: WalletMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const ens = useEnsProfile(address);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const ensName = ens.data?.name ?? null;
  const label = ensName ?? shortAddress(address);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "group inline-flex h-10 items-center gap-2 rounded-xl border border-white/10",
          "bg-white/[0.05] pl-1.5 pr-3 text-sm text-white transition hover:bg-white/[0.09]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aether-cyan",
        )}
      >
        <AgentAvatar seed={address} label={ensName} avatarUrl={ens.data?.avatar} size="sm" />
        <span className="max-w-[9rem] truncate font-medium">{label}</span>
        {demo ? (
          <span className="hidden text-[0.6rem] uppercase tracking-wider text-amber-300 sm:inline">
            demo
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Wallet"
          className={cn(
            "absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10",
            "bg-aether-deep/95 p-1.5 shadow-2xl backdrop-blur-xl",
          )}
        >
          <div className="rounded-lg bg-white/[0.03] px-3 py-3">
            <p className="text-[0.65rem] uppercase tracking-wider text-slate-400">
              {demo ? "Demo session" : "Privy embedded wallet"}
            </p>
            <p className="mt-1 break-all mono text-xs text-slate-300">{address}</p>
            {ens.isLoading ? (
              <p className="mt-2 text-[0.7rem] text-slate-500">Resolving ENS…</p>
            ) : null}
            {ensName ? (
              <p className="mt-2 text-[0.7rem] text-aether-cyan">Resolved via ENS: {ensName}</p>
            ) : null}
            {!ens.isLoading && !ensName ? (
              <p className="mt-2 text-[0.7rem] text-slate-500">No reverse ENS record</p>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={copyAddress}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? "Address copied" : "Copy address"}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-rose-500/15 hover:text-rose-200"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Privy-backed variant
   ──────────────────────────────────────────────────────────────────────────── */

function PrivyConnectButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <div
        className="h-10 w-36 animate-pulse rounded-xl border border-white/10 bg-white/[0.04]"
        role="status"
        aria-label="Loading wallet"
      />
    );
  }

  const address = user?.wallet?.address ?? null;

  if (!authenticated || !address) {
    return (
      <Button onClick={() => login()} size="md">
        <Fingerprint className="h-4 w-4" aria-hidden="true" />
        Sign in with passkey
      </Button>
    );
  }

  return <WalletMenu address={address} onDisconnect={() => void logout()} />;
}

/* ────────────────────────────────────────────────────────────────────────────
   Fallback used when NEXT_PUBLIC_PRIVY_APP_ID is absent
   ──────────────────────────────────────────────────────────────────────────── */

function DemoConnectButton() {
  const [address, setAddress] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (address) {
    return <WalletMenu address={address} onDisconnect={() => setAddress(null)} demo />;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge tone="demo" className="hidden lg:inline-flex" title="NEXT_PUBLIC_PRIVY_APP_ID is unset">
        Privy not configured
      </Badge>
      <Button
        variant="secondary"
        loading={pending}
        onClick={() => {
          setPending(true);
          window.setTimeout(() => {
            setAddress(DEMO_OPERATOR_ADDRESS);
            setPending(false);
          }, 550);
        }}
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        Demo session
      </Button>
    </div>
  );
}

/**
 * Hooks cannot be called conditionally, so the two modes are separate
 * components and the branch happens on a build-time constant.
 */
export function ConnectButton() {
  return PRIVY_ENABLED ? <PrivyConnectButton /> : <DemoConnectButton />;
}
