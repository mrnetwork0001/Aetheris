import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Radio } from "lucide-react";

import { AgentLeaderboard } from "@/components/agent-leaderboard";
import type { HcsMessage } from "@/components/aetheris-data";
import {
  hcsTopicId,
  loadAgencyStats,
  loadHcsMessages,
  loadJobs,
  loadLeaderboard,
  loadSettlements,
  loadTreasury,
  resolveEnsProfile,
} from "@/components/aetheris-server";
import { DataSourceBadge, FallbackNote } from "@/components/data-source-badge";
import {
  decodeHcsMessage,
  eventTone,
  formatClock,
  formatDate,
  formatDuration,
  formatUsd,
  hcsTimestampToMs,
  toNumber,
  type EventTone,
} from "@/components/format";
import { AgentAvatar } from "@/components/identity";
import { JobBoard } from "@/components/job-board";
import { SettlementHistory } from "@/components/settlement-history";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { shortAddress } from "@/lib/utils";

export const dynamic = "force-dynamic";
/** Hedera transactions and indexer reads can exceed the 10s default on serverless hosts. */
export const maxDuration = 60;

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

const EVENT_PILL: Record<EventTone, PillTone> = {
  cyan: "on",
  glow: "solid",
  gold: "warn",
  success: "emerald",
  neutral: "muted",
};

function hashscanTopicUrl(topicId: string): string {
  return topicId === ""
    ? "https://hashscan.io/testnet"
    : `https://hashscan.io/testnet/topic/${topicId}`;
}

/** Section header row: 1.05rem/600 title + optional right-aligned controls (DESIGN.md §4). */
function SectionHeader({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="font-sans text-[1.05rem] font-semibold tracking-tight fg">
        {title}
      </h2>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

function HcsAnchorRow({ message }: { message: HcsMessage }) {
  const decoded = decodeHcsMessage(message.contents);
  const ms = hcsTimestampToMs(message.consensusTimestamp);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-b border-[color:var(--c-border)] px-5 py-3 last:border-b-0 hover:bg-[color:var(--c-row-hover)] sm:items-center">
      <span className="font-mono text-[0.78rem] tabular-nums fg-3">#{message.sequenceNumber}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Pill tone={EVENT_PILL[eventTone(decoded.event)]}>{decoded.event}</Pill>
        <span className="min-w-0 truncate font-mono text-[0.78rem] fg-2" title={decoded.raw}>
          {decoded.fields.length === 0
            ? decoded.raw
            : decoded.fields.map(([key, value]) => `${key}=${value}`).join("  ")}
        </span>
      </div>
      <time
        dateTime={ms > 0 ? new Date(ms).toISOString() : undefined}
        title={ms > 0 ? `${formatDate(ms)} ${formatClock(ms)} UTC` : message.consensusTimestamp}
        className="whitespace-nowrap font-mono text-[11px] tabular-nums fg-3"
      >
        {formatClock(ms)}
      </time>
    </li>
  );
}

export default async function AgencyPage({ params }: PageProps) {
  const id = decodeURIComponent(params.id);
  if (!isValidId(id)) notFound();

  const [ens, stats, jobs, agents, settlements, treasury, hcs] = await Promise.all([
    resolveEnsProfile(id),
    loadAgencyStats(id),
    loadJobs(8),
    loadLeaderboard(6),
    loadSettlements(),
    loadTreasury(),
    loadHcsMessages(8),
  ]);

  const address = ens.address ?? (ADDRESS.test(id) ? id : stats.data.agency);
  const displayName = ens.name ?? stats.data.ensName ?? shortAddress(address);
  const aum = treasury.data.reduce((sum, holding) => sum + holding.usdValue, 0);
  const topicId = hcsTopicId();
  const anchors = stats.data.hcsMessageCount.toLocaleString("en-US");

  return (
    <div className="flex flex-col gap-10">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5">
        <nav aria-label="Breadcrumb" className="text-xs fg-3">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/dashboard" className="transition-colors hover:text-[color:var(--c-fg)]">
                Mission Control
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="truncate fg-2">{displayName}</li>
          </ol>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <AgentAvatar
              seed={address}
              label={ens.name ?? stats.data.ensName}
              avatarUrl={ens.avatar}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="truncate font-display text-[2rem] font-extrabold leading-tight tracking-[-0.03em] fg">
                {displayName}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] fg-2">
                <span className="font-mono text-[0.78rem] tabular-nums" title={address}>
                  {address}
                </span>
                <span aria-hidden="true" className="fg-3">
                  ·
                </span>
                <span>
                  Operator{" "}
                  <span className="font-mono text-[0.78rem] tabular-nums fg" title={stats.data.operator}>
                    {shortAddress(stats.data.operator)}
                  </span>
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ens.name ? (
              <Pill tone="on" title="Name resolved from the ENS registry">
                ENS resolved
              </Pill>
            ) : stats.data.ensName ? (
              <Pill tone="warn" dashed title="Name comes from local fixtures, not the ENS registry">
                Demo identity
              </Pill>
            ) : (
              <Pill tone="off">No ENS record</Pill>
            )}
            <Pill tone="solid">Hedera EVM</Pill>
            <Pill tone="muted" title="Chain id 296">
              Hedera testnet
            </Pill>
            <DataSourceBadge source={stats.source} reason={stats.error} />
          </div>
        </div>
      </header>

      {/* ── Stat row ────────────────────────────────────────────────────── */}
      <section aria-labelledby="agency-metrics">
        <h2 id="agency-metrics" className="sr-only">
          Agency metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Treasury AUM"
            value={formatUsd(aum, 0)}
            note={
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  {treasury.data.length} holding{treasury.data.length === 1 ? "" : "s"} across chains
                </span>
                <DataSourceBadge source={treasury.source} reason={treasury.error} />
              </span>
            }
          />
          <StatTile
            label="Jobs in flight"
            value={stats.data.activeJobs}
            note={`${stats.data.totalJobs} lifetime · ${stats.data.settledJobs} settled`}
          />
          <StatTile
            label="Lifetime margin"
            value={formatUsd(toNumber(stats.data.lifetimeMarginRaw), 0)}
            note={`Swept by the operator · ${stats.data.subAgentCount} sub-agents hired`}
            accent
          />
          <StatTile
            label="Consensus finality"
            value={formatDuration(stats.data.avgFinalityMs)}
            note={`Average per anchor · ${anchors} HCS messages`}
          />
        </div>
        <FallbackNote source={stats.source} reason={stats.error} />
      </section>

      {/* ── Jobs ────────────────────────────────────────────────────────── */}
      <section aria-labelledby="agency-jobs">
        <SectionHeader id="agency-jobs" title="Jobs">
          <Link href="/dashboard#jobs" className="text-[13px] font-medium accent-ink hover:underline">
            Full pipeline <span aria-hidden="true">→</span>
          </Link>
        </SectionHeader>
        <JobBoard jobs={jobs.data} source={jobs.source} reason={jobs.error} />
      </section>

      {/* ── Settlement history ──────────────────────────────────────────── */}
      <section aria-labelledby="agency-settlements">
        <SectionHeader id="agency-settlements" title="Settlement history" />
        <SettlementHistory
          settlements={settlements.data}
          source={settlements.source}
          reason={settlements.error}
        />
      </section>

      {/* ── Sub-agents + identity ───────────────────────────────────────── */}
      <section aria-labelledby="agency-subagents">
        <SectionHeader id="agency-subagents" title="Sub-agents" />
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <AgentLeaderboard agents={agents.data} source={agents.source} reason={agents.error} />

          <Card flush className="self-start">
            <CardHeader>
              <div>
                <CardTitle as="h3">Identity &amp; anchors</CardTitle>
                <CardDescription>What the contract and the registry say about this agency.</CardDescription>
              </div>
            </CardHeader>
            <dl>
              {(
                [
                  ["ENS name", ens.name ?? "unresolved", ens.name === null],
                  ["Treasury", shortAddress(address), true],
                  ["Operator", shortAddress(stats.data.operator), true],
                  ["HCS topic", topicId === "" ? "not configured" : topicId, true],
                  ["Sub-agents", String(stats.data.subAgentCount), true],
                  ["HCS anchors", anchors, true],
                ] as ReadonlyArray<readonly [string, string, boolean]>
              ).map(([term, value, mono]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-3 border-b border-[color:var(--c-border)] px-5 py-3 last:border-b-0"
                >
                  <dt className="mono-label">{term}</dt>
                  <dd
                    className={
                      mono
                        ? "min-w-0 truncate font-mono text-[0.8rem] tabular-nums fg"
                        : "min-w-0 truncate text-[13px] fg"
                    }
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <CardFooter>
              <a
                href={hashscanTopicUrl(topicId)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium accent-ink hover:underline"
              >
                Open on HashScan
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </CardFooter>
          </Card>
        </div>
      </section>

      {/* ── HCS anchors ─────────────────────────────────────────────────── */}
      <section aria-labelledby="agency-hcs">
        <SectionHeader id="agency-hcs" title="HCS anchors">
          <DataSourceBadge source={hcs.source} reason={hcs.error} />
        </SectionHeader>
        <Card flush>
          <CardHeader>
            <div>
              <CardTitle as="h3">Consensus log</CardTitle>
              <CardDescription>
                {topicId === "" ? (
                  "Every milestone is anchored to a Hedera Consensus Service topic; newest first."
                ) : (
                  <>
                    Topic <span className="font-mono tabular-nums fg">{topicId}</span> · newest
                    first.
                  </>
                )}
              </CardDescription>
            </div>
            <a
              href={hashscanTopicUrl(topicId)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium accent-ink hover:underline"
            >
              HashScan
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </CardHeader>
          {hcs.data.length === 0 ? (
            <EmptyState
              icon={<Radio />}
              title="No anchors on this topic yet"
              body="The first job completion writes a JSON frame to the topic and it shows up here within a few seconds."
              link={{ href: "/dashboard#audit", label: "Open the audit stream" }}
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {hcs.data.map((message) => (
                <HcsAnchorRow key={message.sequenceNumber} message={message} />
              ))}
            </ul>
          )}
          {hcs.source === "demo" ? (
            <CardFooter className="block [&>p]:mt-0">
              <FallbackNote source={hcs.source} reason={hcs.error} />
            </CardFooter>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
