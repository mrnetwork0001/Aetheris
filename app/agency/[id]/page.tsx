import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowUpRight, Coins, Gauge, Vault } from "lucide-react";

import { AgentLeaderboard } from "@/components/agent-leaderboard";
import {
  hcsTopicId,
  loadAgencyStats,
  loadJobs,
  loadLeaderboard,
  loadSettlements,
  loadTreasury,
  resolveEnsProfile,
} from "@/components/aetheris-server";
import { DataSourceBadge } from "@/components/data-source-badge";
import { toNumber } from "@/components/format";
import { AgentAvatar } from "@/components/identity";
import { JobBoard } from "@/components/job-board";
import { SettlementHistory } from "@/components/settlement-history";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { shortAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const ENS_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function isValidId(id: string): boolean {
  return ADDRESS.test(id) || ENS_NAME.test(id);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const id = decodeURIComponent(params.id);
  if (!isValidId(id)) return { title: "Unknown agency" };
  return {
    title: ADDRESS.test(id) ? shortAddress(id) : id,
    description: `Job pipeline, settlement history and treasury for the Aetheris agency ${id}.`,
  };
}

export default async function AgencyPage({ params }: PageProps) {
  const id = decodeURIComponent(params.id);
  if (!isValidId(id)) notFound();

  const [ens, stats, jobs, agents, settlements, treasury] = await Promise.all([
    resolveEnsProfile(id),
    loadAgencyStats(id),
    loadJobs(8),
    loadLeaderboard(6),
    loadSettlements(),
    loadTreasury(),
  ]);

  const address = ens.address ?? (ADDRESS.test(id) ? id : stats.data.agency);
  const displayName = ens.name ?? stats.data.ensName ?? shortAddress(address);
  const aum = treasury.data.reduce((sum, holding) => sum + holding.usdValue, 0);
  const topicId = hcsTopicId();

  return (
    <div className="aether-container py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/dashboard" className="transition-colors hover:text-slate-300">
              Mission Control
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="truncate text-slate-400">{displayName}</li>
        </ol>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <AgentAvatar
            seed={address}
            label={ens.name ?? stats.data.ensName}
            avatarUrl={ens.avatar}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {displayName}
            </h1>
            <p className="mt-1 truncate data-mono text-slate-500">{address}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ens.name ? (
            <Badge tone="cyan">ENS resolved</Badge>
          ) : stats.data.ensName ? (
            <Badge tone="demo">Demo identity</Badge>
          ) : (
            <Badge tone="neutral">No ENS record</Badge>
          )}
          <Badge tone="glow">Hedera EVM</Badge>
          <DataSourceBadge source={stats.source} reason={stats.error} />
        </div>
      </header>

      <section aria-label="Agency metrics" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Treasury AUM"
          value={aum}
          format="usd"
          tone="gold"
          icon={<Vault className="h-4 w-4" />}
          hint="Across all chains"
          source={treasury.source}
          sourceReason={treasury.error}
        />
        <StatCard
          label="Jobs in flight"
          value={stats.data.activeJobs}
          tone="cyan"
          icon={<Activity className="h-4 w-4" />}
          hint={`${stats.data.totalJobs} lifetime`}
          source={stats.source}
          sourceReason={stats.error}
          index={1}
        />
        <StatCard
          label="Lifetime margin"
          value={toNumber(stats.data.lifetimeMarginRaw)}
          format="usd"
          tone="success"
          icon={<Coins className="h-4 w-4" />}
          hint={`${stats.data.settledJobs} jobs settled`}
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
          hint={`${stats.data.hcsMessageCount.toLocaleString("en-US")} messages anchored`}
          source={stats.source}
          sourceReason={stats.error}
          index={3}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <JobBoard jobs={jobs.data} source={jobs.source} reason={jobs.error} />
          <SettlementHistory
            settlements={settlements.data}
            source={settlements.source}
            reason={settlements.error}
          />
        </div>

        <div className="space-y-6">
          <Card className="edge-lit">
            <CardHeader>
              <CardTitle as="h2">Identity &amp; anchors</CardTitle>
            </CardHeader>
            <dl className="divide-y divide-white/[0.05]">
              <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                <dt className="text-xs text-slate-500">ENS name</dt>
                <dd className="min-w-0 truncate text-xs text-slate-200">
                  {ens.name ?? "unresolved"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                <dt className="text-xs text-slate-500">Treasury</dt>
                <dd className="min-w-0 truncate data-mono text-slate-300">
                  {shortAddress(address)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                <dt className="text-xs text-slate-500">Operator</dt>
                <dd className="min-w-0 truncate data-mono text-slate-300">
                  {shortAddress(stats.data.operator)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                <dt className="text-xs text-slate-500">HCS topic</dt>
                <dd className="min-w-0 truncate data-mono text-slate-300">
                  {topicId === "" ? "not configured" : topicId}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-5 py-3">
                <dt className="text-xs text-slate-500">Sub-agents</dt>
                <dd className="text-xs tabular-nums text-slate-200">{stats.data.subAgentCount}</dd>
              </div>
            </dl>
            <div className="border-t border-white/[0.06] px-5 py-3">
              <a
                href={
                  topicId === ""
                    ? "https://hashscan.io/testnet"
                    : `https://hashscan.io/testnet/topic/${topicId}`
                }
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs text-aether-cyan transition-colors hover:text-white"
              >
                Open on HashScan
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </Card>

          <AgentLeaderboard agents={agents.data} source={agents.source} reason={agents.error} />
        </div>
      </div>
    </div>
  );
}
