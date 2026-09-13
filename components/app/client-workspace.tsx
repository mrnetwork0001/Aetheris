"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { DataSource, Job } from "@/components/aetheris-data";
import { formatToken } from "@/components/format";
import { JobBoard } from "@/components/job-board";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { HASHSCAN_TX, explainWriteError, refundJob } from "@/lib/write";
import { shortAddress } from "@/lib/utils";

import { FundJobCard, type TokenOption } from "./fund-job-card";
import { useRole } from "./role-context";
import { Section } from "./section";

export interface ClientWorkspaceProps {
  jobs: Job[];
  source: DataSource;
  reason?: string;
  agency: string;
  tokens: TokenOption[];
}

const REFUNDABLE = new Set(["Funded", "Dispatched"]);

/**
 * What "Client" means in real time: the jobs funded by the connected wallet,
 * what they deposited, which deposits are still refundable — and the form to
 * fund a new job. Without a wallet it shows the indexed clients so the view
 * is still real, just not personal.
 */
export function ClientWorkspace({ jobs, source, reason, agency, tokens }: ClientWorkspaceProps) {
  const router = useRouter();
  const { wallet, clients, isClient, getProvider } = useRole();
  const [picked, setPicked] = React.useState<string>(clients[0]?.address ?? "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<React.ReactNode>(null);

  const viewing = wallet ?? picked;
  const mine = viewing ? jobs.filter((j) => j.client.toLowerCase() === viewing) : [];
  const own = wallet !== null && isClient;

  const deposits = new Map<string, { raw: bigint; decimals: number; symbol: string }>();
  for (const j of mine) {
    const cur = deposits.get(j.tokenSymbol) ?? { raw: 0n, decimals: j.tokenDecimals, symbol: j.tokenSymbol };
    cur.raw += BigInt(j.depositRaw);
    deposits.set(j.tokenSymbol, cur);
  }
  const refundable = mine.filter((j) => REFUNDABLE.has(j.status));

  async function refund(job: Job) {
    if (!wallet) return;
    setBusy(job.jobId);
    setNote(null);
    try {
      const provider = await getProvider();
      if (!provider) throw new Error("No signing provider.");
      const hash = await refundJob({ provider, account: wallet, agency, jobId: job.jobId });
      setNote(
        <>
          Job #{job.jobId} refunded — <a href={`${HASHSCAN_TX}${hash}`} target="_blank" rel="noreferrer" className="underline decoration-dotted">HashScan</a>
        </>,
      );
      window.setTimeout(() => router.refresh(), 8000);
    } catch (cause) {
      setNote(<span className="text-rose-300">{explainWriteError(cause)}</span>);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Jobs funded"
          value={String(mine.length)}
          note={wallet ? (own ? "by your wallet" : "your wallet has none yet") : viewing ? `by ${shortAddress(viewing)}` : "no clients indexed"}
          accent
        />
        <StatTile
          label="Total deposited"
          value={deposits.size === 0 ? "—" : Array.from(deposits.values()).map((d) => formatToken(d.raw, d.decimals, d.symbol)).join(" + ")}
          note="escrowed on AetherisTreasury"
        />
        <StatTile label="Refundable" value={String(refundable.length)} note="Funded or Dispatched — client can reclaim" />
      </div>

      {!wallet && clients.length > 0 ? (
        <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-fl-fg2">
          <span className="mono-label">Viewing client</span>
          <select value={picked} onChange={(e) => setPicked(e.target.value)} className="h-9 rounded-[10px] border border-fl-border bg-fl-bg px-3 font-mono text-[12px] text-white">
            {clients.map((c) => (
              <option key={c.address} value={c.address}>{shortAddress(c.address)} · {c.jobs} job{c.jobs === 1 ? "" : "s"}</option>
            ))}
          </select>
          <span className="text-fl-fg3">— sign in to see and manage your own.</span>
        </label>
      ) : null}

      <Section id="jobs" title={own ? "Your jobs" : "Client jobs"} description={own ? "Jobs funded by the connected wallet." : "Jobs funded by the selected client, from the subgraph."}>
        {mine.length === 0 ? (
          <EmptyState title="No jobs for this client yet" body={wallet ? "Fund one below — the deposit is escrowed and refundable until settlement." : "Sign in as a client, or pick another address above."} />
        ) : (
          <JobBoard jobs={mine} source={source} reason={reason} />
        )}
      </Section>

      {own && refundable.length > 0 ? (
        <Section id="refunds" title="Refundable deposits" description="Calls AetherisAgency.refundJob — allowed for the client while a job is Funded or Dispatched.">
          <ul className="divide-y divide-fl-border rounded-[14px] border border-fl-border bg-fl-card">
            {refundable.map((j) => (
              <li key={j.jobId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                <span className="min-w-0">
                  <span className="font-mono text-fl-fg2">#{j.jobId}</span> <span className="text-white">{formatToken(BigInt(j.depositRaw), j.tokenDecimals, j.tokenSymbol)}</span>{" "}
                  <span className="text-fl-fg3">· {j.status}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => refund(j)} disabled={busy !== null}>
                  {busy === j.jobId ? "Refunding…" : "Refund"}
                </Button>
              </li>
            ))}
          </ul>
          {note ? <p className="mt-2 text-[12.5px] text-emerald-300" role="status">{note}</p> : null}
        </Section>
      ) : null}

      <Section id="fund" title="New job" description="Approve the agency, escrow a deposit, and watch it appear in the pipeline.">
        <FundJobCard agency={agency} tokens={tokens} />
      </Section>
    </div>
  );
}
