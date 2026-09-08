import type { Metadata } from "next";
import { Activity, Coins, Gauge, Vault } from "lucide-react";

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
import { DataSourceBadge } from "@/components/data-source-badge";
import { toNumber } from "@/components/format";
import { HcsFeed } from "@/components/hcs-feed";
import { AgentAvatar } from "@/components/identity";
import { JobBoard } from "@/components/job-board";
import { StatCard } from "@/components/stat-card";
import { TreasuryPanel } from "@/components/treasury-panel";
import { Badge } from "@/components/ui/badge";
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

const AUM_SERIES = [0.42, 0.48, 0.44, 0.56, 0.61, 0.58, 0.7, 0.76, 0.72, 0.88, 0.94, 1];
const JOB_SERIES = [0.5, 0.62, 0.45, 0.7, 0.55, 0.8, 0.66, 0.9, 0.74, 0.85, 0.92, 0.88];
const MARGIN_SERIES = [0.3, 0.36, 0.41, 0.39, 0.5, 0.58, 0.55, 0.67, 0.74, 0.8, 0.86, 0.95];
const FINALITY_SERIES = [0.9, 0.82, 0.86, 0.74, 0.78, 0.7, 0.72, 0.64, 0.68, 0.6, 0.63, 0.58];

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

  const aum = treasury.data.reduce((sum, holding) => sum + holding.usdValue, 0);
  const identity = stats.data.ensName ?? shortAddress(stats.data.agency);

  return (
    <div className="aether-container py-8 sm:py-12">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <AgentAvatar seed={stats.data.agency} label={stats.data.ensName} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {identity}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 data-mono text-slate-500">
              <span className="truncate">{stats.data.agency}</span>
              <span aria-hidden="true">·</span>
              <span>operator {shortAddress(stats.data.operator)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="cyan">Hedera testnet · 296</Badge>
          <DataSourceBadge source={stats.source} reason={stats.error} />
        </div>
      </header>

      {/* ── Headline metrics ──────────────────────────────────────────────── */}
      <section aria-label="Agency metrics" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Treasury AUM"
          value={aum}
          format="usd"
          tone="gold"
          icon={<Vault className="h-4 w-4" />}
          hint={`${new Set(treasury.data.map((h) => h.chainId)).size} chains`}
          series={AUM_SERIES}
          delta="Rebalanced via 1inch v6.0"
          source={treasury.source}
          sourceReason={treasury.error}
        />
        <StatCard
          label="Jobs in flight"
          value={stats.data.activeJobs}
          tone="cyan"
          icon={<Activity className="h-4 w-4" />}
          hint={`${stats.data.totalJobs} lifetime · ${stats.data.settledJobs} settled`}
          series={JOB_SERIES}
          delta={`${stats.data.subAgentCount} sub-agents on roster`}
          source={jobs.source}
          sourceReason={jobs.error}
          index={1}
        />
        <StatCard
          label="Lifetime margin"
          value={toNumber(stats.data.lifetimeMarginRaw)}
          format="usd"
          tone="success"
          icon={<Coins className="h-4 w-4" />}
          hint="Retained after sub-agent payouts"
          series={MARGIN_SERIES}
          delta={`${stats.data.hcsMessageCount.toLocaleString("en-US")} HCS messages anchored`}
          source={stats.source}
          sourceReason={stats.error}
          index={2}
        />
        <StatCard
          label="Avg consensus finality"
          value={stats.data.avgFinalityMs}
          format="duration"
          tone="glow"
          icon={<Gauge className="h-4 w-4" />}
          hint="Assignment to settled payout"
          series={FINALITY_SERIES}
          delta="Hedera Token Service"
          source={hcs.source}
          sourceReason={hcs.error}
          index={3}
        />
      </section>

      {/* ── Operational panels ────────────────────────────────────────────── */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <JobBoard jobs={jobs.data} source={jobs.source} reason={jobs.error} />
          <AgentLeaderboard agents={agents.data} source={agents.source} reason={agents.error} />
        </div>

        <div className="space-y-6">
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
          <HcsFeed
            topicId={hcsTopicId()}
            initialMessages={hcs.data}
            initialSource={hcs.source}
            initialReason={hcs.error}
          />
        </div>
      </div>
    </div>
  );
}
