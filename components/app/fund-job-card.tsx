"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import {
  HASHSCAN_TX,
  approveAndCreateJob,
  explainWriteError,
  readHbarBalance,
  readTokenBalance,
  type StepEvent,
} from "@/lib/write";
import { cn, shortAddress } from "@/lib/utils";

import { useRole } from "./role-context";

export interface TokenOption {
  address: string;
  symbol: string;
  decimals: number;
}

export interface FundJobCardProps {
  agency: string;
  tokens: TokenOption[];
  className?: string;
}

type Phase = "idle" | "faucet" | "submitting" | "done";

/**
 * The client write path: approve the agency, then createJob — signed by the
 * connected wallet on Hedera testnet. Every precondition that is not met is
 * shown as the reason the button is disabled; nothing is simulated.
 */
export function FundJobCard({ agency, tokens, className }: FundJobCardProps) {
  const router = useRouter();
  const { wallet, walletReady, privyEnabled, login, getProvider } = useRole();

  const [token, setToken] = React.useState<TokenOption | null>(tokens[0] ?? null);
  const [amount, setAmount] = React.useState("1.00");
  const [specURI, setSpecURI] = React.useState("ipfs://bafybeiaetherisclientjobspec");
  const [balance, setBalance] = React.useState<{ raw: bigint; decimals: number; symbol: string } | null>(null);
  const [hbar, setHbar] = React.useState<bigint | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [steps, setSteps] = React.useState<StepEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<React.ReactNode>(null);

  const refreshBalances = React.useCallback(async () => {
    if (!wallet || !token) return;
    try {
      const [b, h] = await Promise.all([readTokenBalance(token.address, wallet), readHbarBalance(wallet)]);
      setBalance(b);
      setHbar(h);
    } catch (cause) {
      setError(explainWriteError(cause));
    }
  }, [wallet, token]);

  React.useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  let disabledReason: string | null = null;
  if (!privyEnabled) disabledReason = "NEXT_PUBLIC_PRIVY_APP_ID is not set — no wallet can sign.";
  else if (!walletReady) disabledReason = "Wallet initialising…";
  else if (!wallet) disabledReason = "Sign in to fund a job.";
  else if (!token) disabledReason = "No settlement token is known yet.";
  else if (hbar !== null && hbar === 0n) disabledReason = "No HBAR for gas — use the testnet faucet.";
  else if (balance && balance.raw === 0n) disabledReason = `No ${balance.symbol} to deposit — use the testnet faucet.`;

  let amountRaw: bigint | null = null;
  try {
    amountRaw = token ? parseUnits(amount, token.decimals) : null;
    if (amountRaw !== null && amountRaw <= 0n) amountRaw = null;
  } catch {
    amountRaw = null;
  }
  if (!disabledReason && amountRaw === null) disabledReason = "Enter a positive amount.";
  if (!disabledReason && balance && amountRaw !== null && amountRaw > balance.raw) disabledReason = "Amount exceeds your balance.";

  async function faucet() {
    if (!wallet) return;
    setPhase("faucet");
    setError(null);
    try {
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: wallet }) });
      const data = (await res.json()) as { ok?: boolean; error?: { message: string }; token?: { hashscan: string; amount: string; symbol: string }; hbar?: { hashscan?: string } };
      if (!res.ok || !data.ok) throw new Error(data.error?.message ?? `Faucet failed (${res.status})`);
      setNotice(
        <>
          Received {data.token?.amount} {data.token?.symbol}
          {data.hbar?.hashscan ? " and 1 HBAR" : ""} —{" "}
          <a href={data.token?.hashscan} target="_blank" rel="noreferrer" className="underline decoration-dotted">mint tx</a>
        </>,
      );
      await refreshBalances();
    } catch (cause) {
      setError(explainWriteError(cause));
    } finally {
      setPhase("idle");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabledReason || !wallet || !token || amountRaw === null) return;
    setPhase("submitting");
    setError(null);
    setSteps([]);
    setNotice(null);
    try {
      const provider = await getProvider();
      if (!provider) throw new Error("The connected wallet exposes no signing provider.");
      const { createHash } = await approveAndCreateJob({
        provider,
        account: wallet,
        agency,
        token: token.address,
        amountRaw,
        specURI,
        onStep: (e) => setSteps((s) => [...s.filter((x) => x.step !== e.step), e]),
      });
      setNotice(
        <>
          Job funded — <a href={`${HASHSCAN_TX}${createHash}`} target="_blank" rel="noreferrer" className="underline decoration-dotted">createJob on HashScan</a>. The subgraph indexes it within ~10 s.
        </>,
      );
      setPhase("done");
      window.setTimeout(() => router.refresh(), 8000);
      await refreshBalances();
    } catch (cause) {
      setError(explainWriteError(cause));
      setPhase("idle");
    }
  }

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-white">Fund a job</h3>
          <p className="mt-1 text-[12.5px] text-fl-fg2">
            One escrowed deposit. The agency can only commit fees up to this amount; unspent deposit is refundable until settlement.
          </p>
        </div>
        {wallet ? <Pill tone="on" dot>{shortAddress(wallet)}</Pill> : privyEnabled ? <Button size="sm" variant="primary" onClick={login}>Sign in</Button> : <Pill tone="warn">Privy not configured</Pill>}
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr]">
        <label className="grid gap-1">
          <span className="mono-label">Token</span>
          <select
            value={token?.address ?? ""}
            onChange={(e) => setToken(tokens.find((t) => t.address === e.target.value) ?? null)}
            className="h-10 rounded-[10px] border border-fl-border bg-fl-bg px-3 text-[13px] text-white"
          >
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>{t.symbol} · {shortAddress(t.address)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="mono-label">Deposit{balance ? ` · balance ${formatUnits(balance.raw, balance.decimals)} ${balance.symbol}` : ""}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 rounded-[10px] border border-fl-border bg-fl-bg px-3 font-mono text-[13px] text-white"
          />
        </label>
        <label className="grid gap-1 sm:col-span-2">
          <span className="mono-label">Spec URI</span>
          <input
            value={specURI}
            onChange={(e) => setSpecURI(e.target.value)}
            className="h-10 rounded-[10px] border border-fl-border bg-fl-bg px-3 font-mono text-[13px] text-white"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" disabled={disabledReason !== null || phase === "submitting"}>
            {phase === "submitting" ? "Waiting for wallet…" : "Approve & fund job"}
          </Button>
          {wallet ? (
            <Button type="button" variant="secondary" size="md" onClick={faucet} disabled={phase !== "idle"}>
              {phase === "faucet" ? "Dripping…" : "Testnet faucet (1 HBAR + 10 aUSDC)"}
            </Button>
          ) : null}
          {disabledReason ? <span className="text-[12px] text-fl-fg3">{disabledReason}</span> : null}
        </div>
      </form>

      {steps.length > 0 ? (
        <ol className="mt-3 space-y-1 font-mono text-[11.5px] text-fl-fg2" aria-live="polite">
          {steps.map((s) => (
            <li key={s.step}>
              <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", s.status === "mined" ? "bg-emerald-400" : "bg-fl-accent animate-pulse")} />
              {s.step} · {s.status}
              {s.hash ? <> · <a href={`${HASHSCAN_TX}${s.hash}`} target="_blank" rel="noreferrer" className="underline decoration-dotted">{s.hash.slice(0, 12)}…</a></> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {notice ? <p className="mt-3 text-[12.5px] text-emerald-300" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 text-[12.5px] text-rose-300" role="alert">{error}</p> : null}
    </Card>
  );
}
