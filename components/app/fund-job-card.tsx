"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatUnits, parseUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { BRIEF_MAX_CHARS, BRIEF_MIN_CHARS, BRIEF_ROLES, ROLE_SLUG_RE, TITLE_MAX_CHARS, specLink } from "@/lib/briefs";
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
type SpecMode = "brief" | "existing";

/** What /api/briefs returns once the frame has reached consensus. */
interface AnchoredBrief {
  specURI: string;
  topicId: string;
  sequenceNumber: string;
  keccak256: string;
  mirrorUrl: string;
  hashscanUrl: string;
}

const ROLE_LABELS: Record<(typeof BRIEF_ROLES)[number], string> = {
  "market-research": "Market research",
  "security-audit": "Security audit",
  "technical-writing": "Technical writing",
  "code-generation": "Code generation",
  "data-labelling": "Data labelling",
};

const FIELD = "rounded-[10px] border border-fl-border bg-fl-bg px-3 text-[13px] text-white";
const SPEC_SCHEME_RE = /^(ipfs|hcs):\/\/\S+$/i;

/**
 * The client write path: describe the job, anchor the brief on the HCS audit
 * topic, then approve the agency and createJob - signed by the connected wallet
 * on Hedera testnet. Every precondition that is not met is shown as the reason
 * the button is disabled; nothing is simulated.
 */
export function FundJobCard({ agency, tokens, className }: FundJobCardProps) {
  const router = useRouter();
  const { wallet, walletReady, privyEnabled, login, getProvider } = useRole();

  const [token, setToken] = React.useState<TokenOption | null>(tokens[0] ?? null);
  const [amount, setAmount] = React.useState("1.00");
  const [balance, setBalance] = React.useState<{ raw: bigint; decimals: number; symbol: string } | null>(null);
  const [hbar, setHbar] = React.useState<bigint | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [steps, setSteps] = React.useState<StepEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<React.ReactNode>(null);

  // Job brief - anchored on HCS before funding so the spec URI is verifiable.
  const [specMode, setSpecMode] = React.useState<SpecMode>("brief");
  const [title, setTitle] = React.useState("");
  const [role, setRole] = React.useState<string>(BRIEF_ROLES[0]);
  const [customRole, setCustomRole] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [existingSpec, setExistingSpec] = React.useState("");
  const [anchored, setAnchored] = React.useState<AnchoredBrief | null>(null);
  const [anchoring, setAnchoring] = React.useState(false);
  const [anchorError, setAnchorError] = React.useState<string | null>(null);

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

  /* ── Brief validation ─────────────────────────────────────────────────── */

  const effectiveRole = role === "other" ? customRole.trim().toLowerCase() : role;
  const trimmedTitle = title.trim();
  const trimmedBrief = brief.trim();

  let briefReason: string | null = null;
  if (trimmedTitle.length < 3) briefReason = "Give the job a title (3 to 80 characters).";
  else if (trimmedTitle.length > TITLE_MAX_CHARS) briefReason = `Title is over ${TITLE_MAX_CHARS} characters.`;
  else if (!ROLE_SLUG_RE.test(effectiveRole)) briefReason = "Role must be a slug such as market-research.";
  else if (trimmedBrief.length < BRIEF_MIN_CHARS) briefReason = `Brief needs at least ${BRIEF_MIN_CHARS} characters (${trimmedBrief.length} so far).`;
  else if (trimmedBrief.length > BRIEF_MAX_CHARS) briefReason = `Brief is over ${BRIEF_MAX_CHARS} characters.`;
  else if (anchoring) briefReason = "Waiting for Hedera consensus…";

  const effectiveSpec = specMode === "brief" ? anchored?.specURI ?? "" : existingSpec.trim();

  /* ── Funding preconditions ────────────────────────────────────────────── */

  let disabledReason: string | null = null;
  if (!privyEnabled) disabledReason = "NEXT_PUBLIC_PRIVY_APP_ID is not set - no wallet can sign.";
  else if (!walletReady) disabledReason = "Wallet initialising…";
  else if (!wallet) disabledReason = "Sign in to fund a job.";
  else if (!token) disabledReason = "No settlement token is known yet.";
  else if (hbar !== null && hbar === 0n) disabledReason = "No HBAR for gas - use the testnet faucet.";
  else if (balance && balance.raw === 0n) disabledReason = `No ${balance.symbol} to deposit - use the testnet faucet.`;

  let amountRaw: bigint | null = null;
  try {
    amountRaw = token ? parseUnits(amount, token.decimals) : null;
    if (amountRaw !== null && amountRaw <= 0n) amountRaw = null;
  } catch {
    amountRaw = null;
  }
  if (!disabledReason && amountRaw === null) disabledReason = "Enter a positive amount.";
  if (!disabledReason && balance && amountRaw !== null && amountRaw > balance.raw) disabledReason = "Amount exceeds your balance.";
  if (!disabledReason && specMode === "brief" && !anchored) disabledReason = "Anchor the brief on HCS first - the job's spec URI points at that frame.";
  if (!disabledReason && specMode === "existing" && effectiveSpec === "") disabledReason = "Enter an ipfs:// or hcs:// spec URI.";
  if (!disabledReason && specMode === "existing" && !SPEC_SCHEME_RE.test(effectiveSpec)) disabledReason = "Spec URI must start with ipfs:// or hcs:// and contain no spaces.";

  /** Editing any brief field after anchoring invalidates the anchored frame. */
  function editBrief(update: () => void) {
    update();
    if (anchored) setAnchored(null);
    if (anchorError) setAnchorError(null);
  }

  async function anchorBrief() {
    if (briefReason) return;
    setAnchoring(true);
    setAnchorError(null);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, role: effectiveRole, brief: trimmedBrief, client: wallet ?? null }),
      });
      const data = (await res.json()) as Partial<AnchoredBrief> & { ok?: boolean; error?: { message: string; details?: string } };
      if (!res.ok || !data.ok || !data.specURI) {
        const detail = data.error?.details ? ` ${data.error.details}` : "";
        throw new Error(`${data.error?.message ?? `Anchoring failed (${res.status})`}${detail}`);
      }
      setAnchored({
        specURI: data.specURI,
        topicId: data.topicId ?? "",
        sequenceNumber: data.sequenceNumber ?? "",
        keccak256: data.keccak256 ?? "",
        mirrorUrl: data.mirrorUrl ?? specLink(data.specURI).href ?? "",
        hashscanUrl: data.hashscanUrl ?? "",
      });
    } catch (cause) {
      setAnchorError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setAnchoring(false);
    }
  }

  async function faucet() {
    if (!wallet) return;
    setPhase("faucet");
    setError(null);
    try {
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: wallet }) });
      type Drip = { symbol: string; address: string; amount?: string; hashscan?: string; error?: string };
      const data = (await res.json()) as { ok?: boolean; error?: { message: string }; token?: Drip; tokens?: Drip[]; hbar?: { hashscan?: string; skipped?: string } };
      if (!res.ok || !data.ok) throw new Error(data.error?.message ?? `Faucet failed (${res.status})`);
      const drips = (data.tokens ?? (data.token ? [data.token] : [])).filter((t) => t.amount);
      const failed = (data.tokens ?? []).filter((t) => t.error);
      setNotice(
        <>
          Received{" "}
          {drips.map((t, i) => (
            <React.Fragment key={t.address}>
              {i > 0 ? " and " : ""}
              {t.amount} {t.symbol} (
              <a href={t.hashscan} target="_blank" rel="noreferrer" className="underline decoration-dotted">tx</a>)
            </React.Fragment>
          ))}
          {data.hbar?.hashscan ? " and 1 HBAR" : ""}
          {failed.length > 0 ? ` - ${failed.map((t) => `${t.symbol} drip failed: ${t.error}`).join("; ")}` : "."}
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
    if (disabledReason || !wallet || !token || amountRaw === null || effectiveSpec === "") return;
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
        specURI: effectiveSpec,
        onStep: (e) => setSteps((s) => [...s.filter((x) => x.step !== e.step), e]),
      });
      setNotice(
        <>
          Job funded - <a href={`${HASHSCAN_TX}${createHash}`} target="_blank" rel="noreferrer" className="underline decoration-dotted">createJob on HashScan</a>. The subgraph indexes it within ~10 s.
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

  const existingLink = specMode === "existing" && SPEC_SCHEME_RE.test(effectiveSpec) ? specLink(effectiveSpec) : null;

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
            className={cn("h-10", FIELD)}
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
            className={cn("h-10 font-mono", FIELD)}
          />
        </label>

        {/* ── Job brief ─────────────────────────────────────────────────── */}
        <div className="sm:col-span-2 rounded-[12px] border border-fl-border bg-fl-bg/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="mono-label">Job brief</span>
            <button
              type="button"
              onClick={() => setSpecMode((m) => (m === "brief" ? "existing" : "brief"))}
              className="text-[12px] text-fl-fg2 underline decoration-dotted underline-offset-2 hover:text-white"
            >
              {specMode === "brief" ? "Use an existing spec URI instead" : "Write a brief and anchor it on HCS instead"}
            </button>
          </div>

          {specMode === "brief" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]">
              <label className="grid gap-1">
                <span className="text-[12px] text-fl-fg2">Title <span className="font-mono text-fl-fg3">{trimmedTitle.length}/{TITLE_MAX_CHARS}</span></span>
                <input
                  value={title}
                  maxLength={TITLE_MAX_CHARS}
                  placeholder="Security review of the escrow settlement path"
                  onChange={(e) => editBrief(() => setTitle(e.target.value))}
                  className={cn("h-10", FIELD)}
                />
              </label>
              <div className="grid gap-1">
                <span className="text-[12px] text-fl-fg2">Role</span>
                <div className="grid gap-2 grid-cols-[1fr_auto] sm:grid-cols-1">
                  <select
                    value={role}
                    onChange={(e) => editBrief(() => setRole(e.target.value))}
                    className={cn("h-10", FIELD)}
                  >
                    {BRIEF_ROLES.map((slug) => (
                      <option key={slug} value={slug}>{ROLE_LABELS[slug]} · {slug}</option>
                    ))}
                    <option value="other">Other (type a slug)</option>
                  </select>
                  {role === "other" ? (
                    <input
                      value={customRole}
                      placeholder="e.g. legal-review"
                      maxLength={32}
                      onChange={(e) => editBrief(() => setCustomRole(e.target.value))}
                      className={cn("h-10 font-mono", FIELD)}
                      aria-label="Custom role slug"
                    />
                  ) : null}
                </div>
              </div>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-[12px] text-fl-fg2">
                  Brief{" "}
                  <span className={cn("font-mono", trimmedBrief.length > BRIEF_MAX_CHARS ? "text-rose-300" : "text-fl-fg3")}>
                    {trimmedBrief.length}/{BRIEF_MAX_CHARS}
                  </span>
                </span>
                <textarea
                  value={brief}
                  rows={5}
                  placeholder="What should the agency deliver, for whom, by what standard, and what does done look like?"
                  onChange={(e) => editBrief(() => setBrief(e.target.value))}
                  className={cn("min-h-[7rem] resize-y py-2 leading-relaxed", FIELD)}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" size="md" onClick={anchorBrief} disabled={briefReason !== null || anchored !== null}>
                  {anchoring ? "Anchoring…" : anchored ? "Brief anchored" : "Anchor brief on HCS"}
                </Button>
                {briefReason && !anchored ? <span className="text-[12px] text-fl-fg3">{briefReason}</span> : null}
              </div>

              {anchored ? (
                <p className="sm:col-span-2 text-[12.5px] text-emerald-300" role="status">
                  Spec URI{" "}
                  <a href={anchored.mirrorUrl} target="_blank" rel="noreferrer" className="font-mono underline decoration-dotted">{anchored.specURI}</a>
                  {" "}- frame #{anchored.sequenceNumber} on topic {anchored.topicId}
                  {anchored.hashscanUrl ? (
                    <>
                      {" "}(<a href={anchored.hashscanUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted">HashScan</a>)
                    </>
                  ) : null}
                  . keccak256 <span className="font-mono">{anchored.keccak256.slice(0, 10)}…</span>. Editing the brief clears this.
                </p>
              ) : null}
              {anchorError ? <p className="sm:col-span-2 text-[12.5px] text-rose-300" role="alert">{anchorError}</p> : null}
            </div>
          ) : (
            <label className="mt-3 grid gap-1">
              <span className="text-[12px] text-fl-fg2">Spec URI (ipfs:// or hcs://&lt;topic&gt;/&lt;seq&gt;)</span>
              <input
                value={existingSpec}
                placeholder="hcs://0.0.10518320/123"
                onChange={(e) => setExistingSpec(e.target.value)}
                className={cn("h-10 font-mono", FIELD)}
              />
              {existingLink?.href ? (
                <a href={existingLink.href} target="_blank" rel="noreferrer" className="text-[12px] text-fl-fg2 underline decoration-dotted underline-offset-2 hover:text-white">
                  Open {existingLink.label}
                </a>
              ) : null}
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" size="md" disabled={disabledReason !== null || phase === "submitting"}>
            {phase === "submitting" ? "Waiting for wallet…" : "Approve & fund job"}
          </Button>
          {wallet ? (
            <Button type="button" variant="secondary" size="md" onClick={faucet} disabled={phase !== "idle"}>
              {phase === "faucet" ? "Dripping…" : "Testnet faucet (HBAR + 10 aUSD + 10 aUSDC)"}
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
