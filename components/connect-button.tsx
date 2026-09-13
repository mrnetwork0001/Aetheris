"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Check, Copy, Fingerprint, LogOut, Wallet } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import { DEMO_OPERATOR_ADDRESS } from "./aetheris-data";
import { AgentAvatar } from "./identity";
import { PRIVY_ENABLED } from "./providers";
import { Button } from "./ui/button";
import { Pill } from "./ui/pill";
import { useEnsProfile } from "./use-ens";

/* ────────────────────────────────────────────────────────────────────────────
   Shared presentation
   ──────────────────────────────────────────────────────────────────────────── */

interface WalletMenuProps {
  address: string;
  onDisconnect: () => void;
  demo?: boolean;
  /** Full-width white sidebar variant; the menu opens upward. */
  block?: boolean;
}

function WalletMenu({ address, onDisconnect, demo = false, block = false }: WalletMenuProps) {
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
    <div ref={containerRef} className={cn("relative", block && "w-full")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-[10px] border text-sm font-medium transition-colors",
          block
            ? "w-full justify-start border-white bg-white pl-1.5 pr-3 text-black hover:bg-[#e6e6e6]"
            : "border-fl-borderHi bg-fl-raised pl-1.5 pr-3 text-white hover:bg-fl-border",
        )}
      >
        <AgentAvatar seed={address} label={ensName} avatarUrl={ens.data?.avatar} size="sm" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {demo ? (
          <span
            className={cn(
              "font-mono text-[0.6rem] uppercase tracking-[0.08em]",
              block ? "text-[#92400e]" : "text-fl-warn",
            )}
          >
            demo
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Wallet"
          className={cn(
            "absolute z-50 overflow-hidden rounded-xl border border-fl-borderHi bg-fl-raised p-1.5 shadow-2xl",
            block ? "bottom-full left-0 mb-2 w-full min-w-[16rem]" : "right-0 mt-2 w-72",
          )}
        >
          <div className="rounded-[10px] bg-fl-card px-3 py-3">
            <p className="mono-label">{demo ? "Demo session" : "Privy embedded wallet"}</p>
            <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed fg-2">{address}</p>
            {ens.isLoading ? <p className="mt-2 text-[11px] fg-3">Resolving ENS…</p> : null}
            {ensName ? (
              <p className="mt-2 text-[11px] text-fl-accent">Resolved via ENS: {ensName}</p>
            ) : null}
            {!ens.isLoading && !ensName ? (
              <p className="mt-2 text-[11px] fg-3">No reverse ENS record</p>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={copyAddress}
            className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm fg-2 transition-colors hover:bg-fl-border hover:text-white"
          >
            {copied ? (
              <Check className="h-4 w-4 text-fl-emerald" aria-hidden="true" />
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
            className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm fg-2 transition-colors hover:bg-[#ef44441f] hover:text-fl-rose"
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

function PrivyConnectButton({ block = false }: { block?: boolean }) {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <div
        className={cn("fl-skeleton h-10 rounded-[10px]", block ? "w-full" : "w-36")}
        role="status"
        aria-label="Loading wallet"
      />
    );
  }

  const address = user?.wallet?.address ?? null;

  if (!authenticated || !address) {
    return (
      <Button onClick={() => login()} size="md" variant="primary" className={cn(block && "w-full")}>
        <Fingerprint className="h-4 w-4" aria-hidden="true" />
        Sign in with passkey
      </Button>
    );
  }

  return <WalletMenu address={address} onDisconnect={() => void logout()} block={block} />;
}

/* ────────────────────────────────────────────────────────────────────────────
   Fallback used when NEXT_PUBLIC_PRIVY_APP_ID is absent
   ──────────────────────────────────────────────────────────────────────────── */

function DemoConnectButton({ block = false }: { block?: boolean }) {
  const [address, setAddress] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (address) {
    return (
      <WalletMenu address={address} onDisconnect={() => setAddress(null)} demo block={block} />
    );
  }

  return (
    <div className={cn("flex gap-2", block ? "flex-col" : "items-center")}>
      <Pill
        tone="warn"
        dashed
        className={cn(!block && "hidden lg:inline-flex", block && "self-start")}
        title="NEXT_PUBLIC_PRIVY_APP_ID is unset"
      >
        Privy not configured
      </Pill>
      <Button
        variant={block ? "primary" : "secondary"}
        loading={pending}
        className={cn(block && "w-full")}
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

export interface ConnectButtonProps {
  /** Full-width white button for the sidebar card. */
  block?: boolean;
}

/**
 * Hooks cannot be called conditionally, so the two modes are separate
 * components and the branch happens on a build-time constant.
 */
export function ConnectButton({ block = false }: ConnectButtonProps = {}) {
  return PRIVY_ENABLED ? <PrivyConnectButton block={block} /> : <DemoConnectButton block={block} />;
}
