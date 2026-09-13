import type { Metadata } from "next";

import { AgentLeaderboard } from "@/components/agent-leaderboard";
import {
  hcsTopicId,
  loadAgencyStats,
  loadHcsMessages,
  loadJobs,
  loadLeaderboard,
  loadSupportedChains,
  loadTreasury,
  loadWorldIdConfig,
} from "@/components/aetheris-server";
import { ClientWorkspace } from "@/components/app/client-workspace";
import type { TokenOption } from "@/components/app/fund-job-card";
import { RoleSwitch } from "@/components/app/role-switch";
import { Section } from "@/components/app/section";
import { StatRow } from "@/components/app/stat-row";
import { DataSourceBadge } from "@/components/data-source-badge";
import { OperatorVerificationBadge } from "@/components/operator-verification-badge";
import { HcsFeed } from "@/components/hcs-feed";
import { AgentAvatar } from "@/components/identity";
import { JobBoard } from "@/components/job-board";
import { TreasuryPanel } from "@/components/treasury-panel";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { shortAddress } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Mission Control",
  description:
    "Live agency stats, the active job pipeline, the sub-agent leaderboard, the Hedera Consensus Service audit stream and the multi-chain treasury.",
};

/**
 * Rendered per request. Every loader reads its integration through a guarded
 * dynamic import, so a missing env var degrades one panel instead of the page.
 */
export const dynamic = "force-dynamic";

const HASHSCAN = "https://hashscan.io/testnet";

export default async function DashboardPage() {
  const [stats, jobs, agents, treasury, hcs, worldId, swapChains] = await Promise.all([
    loadAgencyStats(),
    loadJobs(12),
    loadLeaderboard(8),
    loadTreasury(),
    loadHcsMessages(10),
    loadWorldIdConfig(),
    loadSupportedChains(),
  ]);

  const identity = stats.data.ensName ?? shortAddress(stats.data.agency);
  const agencyHref = `/agency/${stats.data.agency}`;
  const topicId = hcsTopicId();
  const tokenMap = new Map<string, TokenOption>();
  for (const job of jobs.data) {
    if (!tokenMap.has(job.token.toLowerCase())) {
      tokenMap.set(job.token.toLowerCase(), { address: job.token, symbol: job.tokenSymbol, decimals: job.tokenDecimals });
    }
  }
  const tokens = Array.from(tokenMap.values());

  return (
    <div className="space-y-10">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <AgentAvatar seed={stats.data.agency} label={stats.data.ensName} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[2rem] font-extrabold leading-none tracking-[-0.03em] fg">
              Mission Control
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm fg-2">
              <span className="truncate font-medium fg">{identity}</span>
              <span aria-hidden="true" className="fg-3">
                ·
              </span>
              <span className="data-mono" title={stats.data.agency}>
                {shortAddress(stats.data.agency)}
              </span>
              <span aria-hidden="true" className="fg-3">
                ·
              </span>
              <span className="data-mono" title={stats.data.operator}>
                operator {shortAddress(stats.data.operator)}
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="off">Hedera testnet · 296</Pill>
          <DataSourceBadge source={stats.source} reason={stats.error} />
          {stats.source === "live" ? <OperatorVerificationBadge stats={stats.data} /> : null}
        </div>
      </header>

      <RoleSwitch
        operator={
          <>
      {/* ── Stat row ──────────────────────────────────────────────────────── */}
      <StatRow stats={stats} jobs={jobs} agents={agents} hcs={hcs} />

      {/* ── Sections ──────────────────────────────────────────────────────── */}
      <Section
        id="jobs"
        title="Job pipeline"
        description="Client deposits escrowed on Hedera EVM, dispatched to specialised sub-agents."
        action={
          <Button
            href={`${HASHSCAN}/contract/${stats.data.agency}`}
            variant="secondary"
            size="sm"
            target="_blank"
            rel="noreferrer"
          >
            Agency on HashScan
          </Button>
        }
      >
        <JobBoard jobs={jobs.data} source={jobs.source} reason={jobs.error} />
      </Section>

      <Section
        id="agents"
        title="Sub-agent leaderboard"
        description="Indexed from MicroSettlement events by The Graph."
        action={
          <Button href={agencyHref} variant="primary" size="sm">
            Agency profile <span aria-hidden="true">→</span>
          </Button>
        }
      >
        <AgentLeaderboard agents={agents.data} source={agents.source} reason={agents.error} />
      </Section>

      {/* TreasuryPanel owns the World ID verification state that unlocks the
          margin sweep, so it renders both the "Treasury" (#treasury, #swap)
          and "Human operator required" (#operator) sections itself. */}
      <TreasuryPanel
        holdings={treasury.data}
        source={treasury.source}
        reason={treasury.error}
        swapChains={swapChains}
        lifetimeMarginRaw={stats.data.lifetimeMarginRaw}
        operator={stats.data.operator}
        worldIdAppId={worldId.appId}
        worldIdAction={worldId.action}
      />

          </>
        }
        client={
          <>
      <ClientWorkspace jobs={jobs.data} source={jobs.source} reason={jobs.error} agency={stats.data.agency} tokens={tokens} />
          </>
        }
      />

      <Section
        id="audit"
        title="HCS audit stream"
        description="Every milestone is anchored to a Hedera Consensus Service topic and mirrored here."
        action={
          topicId !== "" ? (
            <Button
              href={`${HASHSCAN}/topic/${topicId}`}
              variant="secondary"
              size="sm"
              target="_blank"
              rel="noreferrer"
            >
              Topic on HashScan
            </Button>
          ) : undefined
        }
      >
        <HcsFeed
          topicId={topicId}
          initialMessages={hcs.data}
          initialSource={hcs.source}
          initialReason={hcs.error}
        />
      </Section>
    </div>
  );
}
