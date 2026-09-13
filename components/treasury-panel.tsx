"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CheckCircle2, Coins, Repeat, Vault } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, TreasuryHolding } from "./aetheris-data";
import { readApiError, toBaseUnits } from "./api-client";
import { Section } from "./app/section";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatCompactUsd, formatPercent, formatToken, formatUsd, toNumber } from "./format";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Pill } from "./ui/pill";
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

const FIELD =
  "mt-1.5 h-10 w-full rounded-[10px] border border-fl-borderHi bg-fl-raised px-3 text-sm fg transition-colors focus-visible:border-fl-accent";

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

/**
 * Renders two dashboard sections - `#treasury` (allocation + the `#swap`
 * 1inch quote form) and `#operator` (World ID gate + margin sweep) - because
 * the verification result that unlocks the sweep is state owned here.
 */
const REFERENCE_ASSETS: TreasuryHolding[] = [
  { symbol: "WETH", name: "Wrapped Ether", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", chainId: 42161, chainName: "Arbitrum", decimals: 18, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "USDC", name: "USD Coin", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", chainId: 42161, chainName: "Arbitrum", decimals: 6, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "USDT", name: "Tether USD", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", chainId: 42161, chainName: "Arbitrum", decimals: 6, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0x4200000000000000000000000000000000000006", chainId: 8453, chainName: "Base", decimals: 18, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "USDC", name: "USD Coin", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", chainId: 8453, chainName: "Base", decimals: 6, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "WETH", name: "Wrapped Ether", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", chainId: 1, chainName: "Ethereum", decimals: 18, amountRaw: "0", usdValue: 0, targetWeight: 0 },
  { symbol: "USDC", name: "USD Coin", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: 1, chainName: "Ethereum", decimals: 6, amountRaw: "0", usdValue: 0, targetWeight: 0 },
];

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
  const routableHoldings = React.useMemo(
    () => holdings.filter((holding) => swapChainIds.has(holding.chainId)),
    [holdings, swapChainIds],
  );
  // The treasury settles on Hedera, which 1inch does not serve. So a live quote is
  // always reachable, fall back to reference assets on supported chains: the
  // operator's own EVM wallet is what would sign such a swap.
  const usingReference = routableHoldings.length === 0;
  const routable = React.useMemo(
    () => (usingReference ? REFERENCE_ASSETS.filter((a) => swapChainIds.has(a.chainId)) : routableHoldings),
    [usingReference, routableHoldings, swapChainIds],
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
        // of the result so the flow is demonstrable - labelled as simulated.
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
    <>
      <Section
        id="treasury"
        title="Treasury"
        description="Multi-chain AUM with 1inch v6.0 rebalancing and World ID-gated margin sweeps."
      >
        <Card flush>
          {/* ── Headline trio ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-fl-border px-5 py-4">
            <div>
              <p className="mono-label">Assets under management</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums fg">
                {formatUsd(aum, 0)}
              </p>
            </div>
            <div>
              <p className="mono-label">Lifetime margin</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-fl-accent">
                {formatUsd(toNumber(lifetimeMarginRaw), 0)}
              </p>
            </div>
            <div>
              <p className="mono-label">Chains</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums fg">
                {new Set(holdings.map((h) => h.chainId)).size}
              </p>
            </div>
            <span className="ml-auto">
              <DataSourceBadge source={source} reason={reason} />
            </span>
          </div>

          {/* ── Allocation ─────────────────────────────────────────────── */}
          <div className="px-5 py-4">
            <p className="mono-label">Allocation vs target</p>
            {holdings.length === 0 ? (
              <EmptyState
                icon={<Vault />}
                title="No treasury holdings"
                body="Balances appear here once AetherisTreasury holds a token on any supported chain."
                link={{ href: "/dashboard#jobs", label: "Back to the job pipeline" }}
              />
            ) : (
              <ul className="mt-3 space-y-3.5">
                {holdings.map((holding) => {
                  const weight = aum > 0 ? holding.usdValue / aum : 0;
                  const drift = weight - holding.targetWeight;
                  return (
                    <li key={holdingKey(holding)}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium fg">{holding.symbol}</span>
                          <Pill tone="off" className="shrink-0 normal-case tracking-normal">
                            {holding.chainName}
                          </Pill>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="data-mono fg-3">
                            {formatToken(holding.amountRaw, holding.decimals)}
                          </span>
                          <span className="font-mono text-xs font-medium tabular-nums fg">
                            {formatCompactUsd(holding.usdValue)}
                          </span>
                        </span>
                      </div>
                      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-fl-raised">
                        <div
                          className="h-full rounded-full bg-fl-accent"
                          style={{ width: `${Math.min(weight * 100, 100)}%` }}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-fl-warn"
                          style={{ left: `${Math.min(holding.targetWeight * 100, 100)}%` }}
                          title={`Target ${formatPercent(holding.targetWeight, 0)}`}
                        />
                      </div>
                      <p className="mt-1 flex items-center gap-2 text-[11px] fg-3">
                        <span className="tabular-nums">{formatPercent(weight)} held</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          target {formatPercent(holding.targetWeight, 0)}
                        </span>
                        <span
                          className={cn(
                            "ml-auto font-mono tabular-nums",
                            Math.abs(drift) < 0.02
                              ? "fg-3"
                              : drift > 0
                                ? "text-fl-warn"
                                : "text-fl-accent",
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
            )}
            <FallbackNote source={source} reason={reason} />
          </div>

          {/* ── 1inch rebalance (#swap) ────────────────────────────────── */}
          <div id="swap" className="scroll-mt-6 border-t border-fl-border px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="mono-label inline-flex items-center gap-2">
                <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                Rebalance via 1inch v6.0
              </p>
              <Pill tone="off">{swapChains.length} chains routable</Pill>
            </div>

            {usingReference ? (
              <p className="mt-3 rounded-[10px] border border-fl-border bg-fl-raised px-3 py-2.5 text-xs leading-relaxed fg-2">
                Treasury holdings settle on Hedera, which 1inch does not serve. Quotes below route
                reference assets on supported EVM chains - what the operator's own wallet would sign.
              </p>
            ) : null}
            {src === null || dst === null ? (
              <p className="mt-3 rounded-[10px] border border-fl-border bg-fl-raised px-3 py-2.5 text-xs leading-relaxed fg-2">
                No same-chain pair is available on a 1inch-supported network. Hedera balances
                settle through HTS; EVM legs route through 1inch once two assets share a
                supported chain.
              </p>
            ) : (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
                  <div>
                    <label htmlFor="rebalance-src" className="mono-label block">
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
                      className={FIELD}
                    >
                      {routable.map((holding) => (
                        <option key={holdingKey(holding)} value={holdingKey(holding)}>
                          {holding.symbol} · {holding.chainName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="hidden items-end pb-3 sm:flex">
                    <ArrowRight className="h-4 w-4 fg-3" aria-hidden="true" />
                  </div>

                  <div>
                    <label htmlFor="rebalance-dst" className="mono-label block">
                      To
                    </label>
                    <select
                      id="rebalance-dst"
                      value={holdingKey(dst)}
                      onChange={(event) => {
                        setDstKey(event.target.value);
                        setQuote(null);
                      }}
                      className={FIELD}
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
                    <label htmlFor="rebalance-amount" className="mono-label block">
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
                      className={cn(FIELD, "font-mono tabular-nums")}
                    />
                  </div>
                  <Button
                    onClick={() => quoteMutation.mutate()}
                    loading={quoteMutation.isPending}
                    variant="primary"
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
                      className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#ef444440] bg-[#ef44441f] px-3 py-2 text-xs leading-relaxed text-[color:var(--c-rose-ink)]"
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
                      className="mt-3 rounded-[10px] border border-fl-border bg-fl-raised px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="mono-label">Expected output</span>
                        {quote.simulated ? (
                          <Pill tone="warn" dashed>
                            Simulated quote
                          </Pill>
                        ) : (
                          <Pill tone="emerald">1inch v6.0</Pill>
                        )}
                      </div>
                      <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-fl-accent">
                        {quote.dstAmount}
                      </p>
                      <p className="mt-1 data-mono fg-3">est. gas {quote.estimatedGas}</p>
                      {quote.note ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--c-warn-ink)]">
                          {quote.note}
                        </p>
                      ) : null}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </>
            )}
          </div>
        </Card>
      </Section>

      {/* ── World ID gated margin sweep (#operator) ─────────────────────── */}
      <Section
        id="operator"
        title="Human operator required"
        description="Margin only leaves the treasury when a World-ID-verified human sweeps it - the nullifier is burned once."
      >
        <Card>
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
            <div className="mt-4 space-y-3">
              <Button
                variant="primary"
                className="w-full"
                loading={claimMutation.isPending}
                onClick={() => claimMutation.mutate()}
              >
                Sweep {formatUsd(toNumber(lifetimeMarginRaw), 0)} margin to operator
              </Button>

              {claimMutation.isError ? (
                <p className="flex items-start gap-2 rounded-[10px] border border-[#ef444440] bg-[#ef44441f] px-3 py-2 text-xs leading-relaxed text-[color:var(--c-rose-ink)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <span className="font-semibold">HCS anchor failed.</span>{" "}
                    {claimMutation.error.message}
                  </span>
                </p>
              ) : null}

              {claimMutation.isSuccess ? (
                <div className="rounded-[10px] border border-[#10b98140] bg-[#10b9811f] px-3 py-2.5 text-xs text-[color:var(--c-emerald-ink)]">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Claim anchored to HCS
                  </p>
                  <p className="mt-1 data-mono break-all opacity-80">
                    seq #{claimMutation.data.sequenceNumber} · tx {claimMutation.data.transactionId}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </Section>
    </>
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
