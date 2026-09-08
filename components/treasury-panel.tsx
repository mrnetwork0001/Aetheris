"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  Repeat,
  Vault,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, TreasuryHolding } from "./aetheris-data";
import { readApiError, toBaseUnits } from "./api-client";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatCompactUsd, formatPercent, formatToken, formatUsd, toNumber } from "./format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { WorldIdGate, type VerificationResult } from "./worldid-gate";

/** Mirrors `POST /api/swap/quote`. */
interface QuoteResponse {
  chainId: number;
  quote: {
    srcToken: string;
    dstToken: string;
    srcAmount: string;
    dstAmount: string;
    estimatedGas: string;
    protocols: unknown;
  };
}

interface QuoteState {
  dstAmount: string;
  estimatedGas: string;
  simulated: boolean;
  note?: string;
}

interface HcsReceipt {
  topicId: string;
  sequenceNumber: string;
  transactionId: string;
}

function holdingKey(holding: TreasuryHolding): string {
  return `${holding.chainId}:${holding.address.toLowerCase()}`;
}

export interface TreasuryPanelProps {
  holdings: TreasuryHolding[];
  source: DataSource;
  reason?: string;
  /** `SUPPORTED_CHAINS` from `lib/oneinch`, threaded through a server component. */
  swapChains: ReadonlyArray<{ id: number; name: string }>;
  lifetimeMarginRaw: string;
  operator: string;
  worldIdAppId: string;
  worldIdAction: string;
}

export function TreasuryPanel({
  holdings,
  source,
  reason,
  swapChains,
  lifetimeMarginRaw,
  operator,
  worldIdAppId,
  worldIdAction,
}: TreasuryPanelProps) {
  const aum = holdings.reduce((sum, holding) => sum + holding.usdValue, 0);
  const swapChainIds = React.useMemo(
    () => new Set(swapChains.map((chain) => chain.id)),
    [swapChains],
  );

  /** Only same-chain pairs on a 1inch-supported chain can be routed. */
  const routable = React.useMemo(
    () => holdings.filter((holding) => swapChainIds.has(holding.chainId)),
    [holdings, swapChainIds],
  );

  const [srcKey, setSrcKey] = React.useState<string>(() => {
    const overweight = [...routable].sort(
      (a, b) => b.usdValue / (aum || 1) - b.targetWeight - (a.usdValue / (aum || 1) - a.targetWeight),
    )[0];
    return overweight ? holdingKey(overweight) : "";
  });

  const src = routable.find((h) => holdingKey(h) === srcKey) ?? routable[0] ?? null;
  const destinations = src
    ? routable.filter((h) => h.chainId === src.chainId && holdingKey(h) !== holdingKey(src))
    : [];

  const [dstKey, setDstKey] = React.useState<string>("");
  const dst =
    destinations.find((h) => holdingKey(h) === dstKey) ?? destinations[0] ?? null;

  const [amount, setAmount] = React.useState("2500");
  const [quote, setQuote] = React.useState<QuoteState | null>(null);
  const [verification, setVerification] = React.useState<VerificationResult | null>(null);

  const quoteMutation = useMutation<QuoteState, Error, void>({
    mutationFn: async () => {
      if (!src || !dst) throw new Error("Select a source and destination asset.");
      const baseUnits = toBaseUnits(amount, src.decimals);
      if (baseUnits === null || baseUnits === "0") {
        throw new Error("Enter an amount greater than zero.");
      }
      const response = await fetch("/api/swap/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: src.chainId,
          src: src.address,
          dst: dst.address,
          amount: baseUnits,
        }),
      });
      if (!response.ok) {
        // 1inch needs a server-side API key; without it we still show the shape
        // of the result so the flow is demonstrable — labelled as simulated.
        const detail = await readApiError(response);
        return simulateQuote(src, dst, amount, detail);
      }
      const payload = (await response.json()) as QuoteResponse;
      return {
        dstAmount: formatToken(payload.quote.dstAmount, dst.decimals, dst.symbol),
        estimatedGas: payload.quote.estimatedGas,
        simulated: false,
      };
    },
    onSuccess: (result) => setQuote(result),
  });

  const claimMutation = useMutation<HcsReceipt, Error, void>({
    mutationFn: async () => {
      const response = await fetch("/api/hcs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: JSON.stringify({
            evt: "ProfitClaimed",
            operator,
            amount: formatUsd(toNumber(lifetimeMarginRaw), 2),
            nullifier: verification?.nullifierHash ?? null,
          }),
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      return (await response.json()) as HcsReceipt;
    },
  });

  return (
    <Card className="edge-lit">
      <CardHeader>
        <div>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Vault className="h-4 w-4 text-aether-gold" aria-hidden="true" />
            Agency treasury
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Multi-chain AUM with 1inch v6.0 rebalancing and World ID-gated margin sweeps.
          </p>
        </div>
        <DataSourceBadge source={source} reason={reason} />
      </CardHeader>

      {/* ── AUM headline ─────────────────────────────────────────────────── */}
      <div className="grid gap-px border-b border-white/[0.06] bg-white/[0.04] sm:grid-cols-3">
        <div className="bg-aether-deep/40 px-5 py-4">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">Assets under management</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-white">{formatUsd(aum, 0)}</p>
        </div>
        <div className="bg-aether-deep/40 px-5 py-4">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">Lifetime margin</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-aether-gold">
            {formatUsd(toNumber(lifetimeMarginRaw), 0)}
          </p>
        </div>
        <div className="bg-aether-deep/40 px-5 py-4">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">Chains</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-white">
            {new Set(holdings.map((h) => h.chainId)).size}
          </p>
        </div>
      </div>

      {/* ── Allocation ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <p className="text-[0.7rem] uppercase tracking-wider text-slate-400">Allocation vs target</p>
        <ul className="mt-3 space-y-3">
          {holdings.map((holding) => {
            const weight = aum > 0 ? holding.usdValue / aum : 0;
            const drift = weight - holding.targetWeight;
            return (
              <li key={holdingKey(holding)}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{holding.symbol}</span>
                    <Badge tone="neutral" className="shrink-0 normal-case tracking-normal">
                      {holding.chainName}
                    </Badge>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="data-mono text-slate-400">
                      {formatToken(holding.amountRaw, holding.decimals)}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-slate-200">
                      {formatCompactUsd(holding.usdValue)}
                    </span>
                  </span>
                </div>
                <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-aether-glow to-aether-cyan"
                    style={{ width: `${Math.min(weight * 100, 100)}%` }}
                  />
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-aether-gold"
                    style={{ left: `${Math.min(holding.targetWeight * 100, 100)}%` }}
                    title={`Target ${formatPercent(holding.targetWeight, 0)}`}
                  />
                </div>
                <p className="mt-1 flex items-center gap-2 text-[0.68rem] text-slate-500">
                  <span className="tabular-nums">{formatPercent(weight)} held</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">target {formatPercent(holding.targetWeight, 0)}</span>
                  <span
                    className={cn(
                      "ml-auto tabular-nums",
                      Math.abs(drift) < 0.02
                        ? "text-slate-500"
                        : drift > 0
                          ? "text-amber-300"
                          : "text-aether-cyan",
                    )}
                  >
                    {drift > 0 ? "+" : ""}
                    {formatPercent(drift)} drift
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
        <FallbackNote source={source} reason={reason} />
      </div>

      {/* ── 1inch rebalance ──────────────────────────────────────────────── */}
      <div className="border-t border-white/[0.06] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[0.7rem] uppercase tracking-wider text-slate-400">
            <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
            Rebalance via 1inch v6.0
          </p>
          <Badge tone="glow">{swapChains.length} chains routable</Badge>
        </div>

        {src === null || dst === null ? (
          <p className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-xs leading-relaxed text-slate-400">
            No same-chain pair is available on a 1inch-supported network. Hedera balances settle
            through HTS; EVM legs route through 1inch once two assets share a supported chain.
          </p>
        ) : (
          <>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label
                  htmlFor="rebalance-src"
                  className="block text-[0.68rem] uppercase tracking-wider text-slate-400"
                >
                  From
                </label>
                <select
                  id="rebalance-src"
                  value={holdingKey(src)}
                  onChange={(event) => {
                    setSrcKey(event.target.value);
                    setDstKey("");
                    setQuote(null);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-aether-deep/80 px-3 text-sm text-white transition focus-visible:border-aether-cyan/60"
                >
                  {routable.map((holding) => (
                    <option key={holdingKey(holding)} value={holdingKey(holding)}>
                      {holding.symbol} · {holding.chainName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hidden items-end pb-3 sm:flex">
                <ArrowRight className="h-4 w-4 text-slate-600" aria-hidden="true" />
              </div>

              <div>
                <label
                  htmlFor="rebalance-dst"
                  className="block text-[0.68rem] uppercase tracking-wider text-slate-400"
                >
                  To
                </label>
                <select
                  id="rebalance-dst"
                  value={holdingKey(dst)}
                  onChange={(event) => {
                    setDstKey(event.target.value);
                    setQuote(null);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-aether-deep/80 px-3 text-sm text-white transition focus-visible:border-aether-cyan/60"
                >
                  {destinations.map((holding) => (
                    <option key={holdingKey(holding)} value={holdingKey(holding)}>
                      {holding.symbol} · {holding.chainName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[9rem] flex-1">
                <label
                  htmlFor="rebalance-amount"
                  className="block text-[0.68rem] uppercase tracking-wider text-slate-400"
                >
                  Amount ({src.symbol})
                </label>
                <input
                  id="rebalance-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setQuote(null);
                  }}
                  className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-aether-deep/80 px-3 mono text-sm tabular-nums text-white transition focus-visible:border-aether-cyan/60"
                />
              </div>
              <Button
                onClick={() => quoteMutation.mutate()}
                loading={quoteMutation.isPending}
                variant="secondary"
              >
                <Coins className="h-4 w-4" aria-hidden="true" />
                Get quote
              </Button>
            </div>

            <AnimatePresence mode="wait">
              {quoteMutation.isError ? (
                <motion.p
                  key="quote-error"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {quoteMutation.error.message}
                </motion.p>
              ) : null}

              {quote ? (
                <motion.div
                  key="quote-result"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.68rem] uppercase tracking-wider text-slate-400">
                      Expected output
                    </span>
                    {quote.simulated ? (
                      <Badge tone="demo">Simulated quote</Badge>
                    ) : (
                      <Badge tone="success">1inch v6.0</Badge>
                    )}
                  </div>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums text-aether-cyan">
                    {quote.dstAmount}
                  </p>
                  <p className="mt-1 data-mono text-slate-500">
                    est. gas {quote.estimatedGas}
                  </p>
                  {quote.note ? (
                    <p className="mt-2 text-[0.7rem] leading-relaxed text-amber-200/75">
                      {quote.note}
                    </p>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* ── World ID gated margin sweep ──────────────────────────────────── */}
      <div className="border-t border-white/[0.06] px-5 py-4">
        <WorldIdGate
          appId={worldIdAppId}
          action={worldIdAction}
          signal={operator}
          verification={verification}
          onVerified={setVerification}
          onReset={() => {
            setVerification(null);
            claimMutation.reset();
          }}
        />

        {verification ? (
          <div className="mt-3 space-y-3">
            <Button
              variant="gold"
              className="w-full"
              loading={claimMutation.isPending}
              onClick={() => claimMutation.mutate()}
            >
              Sweep {formatUsd(toNumber(lifetimeMarginRaw), 0)} margin to operator
            </Button>

            {claimMutation.isError ? (
              <p className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.07] px-3 py-2 text-xs leading-relaxed text-rose-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-medium">HCS anchor failed.</span>{" "}
                  {claimMutation.error.message}
                </span>
              </p>
            ) : null}

            {claimMutation.isSuccess ? (
              <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-3 py-2.5 text-xs text-emerald-200">
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Claim anchored to HCS
                </p>
                <p className="mt-1 data-mono break-all text-emerald-200/70">
                  seq #{claimMutation.data.sequenceNumber} · tx {claimMutation.data.transactionId}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** Local, clearly-labelled stand-in when the 1inch key is absent. */
function simulateQuote(
  src: TreasuryHolding,
  dst: TreasuryHolding,
  amount: string,
  detail: string,
): QuoteState {
  const parsed = Number(amount);
  const srcUnitUsd = src.usdValue / Math.max(toNumber(src.amountRaw, src.decimals), 1);
  const dstUnitUsd = dst.usdValue / Math.max(toNumber(dst.amountRaw, dst.decimals), 1);
  const outUnits = Number.isFinite(parsed)
    ? (parsed * srcUnitUsd * 0.9985) / Math.max(dstUnitUsd, 1e-9)
    : 0;
  return {
    dstAmount: `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(outUnits)} ${dst.symbol}`,
    estimatedGas: "182000",
    simulated: true,
    note: detail,
  };
}
