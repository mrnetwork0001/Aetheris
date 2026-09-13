"use client";

import * as React from "react";
import { Trophy, Users } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import type { DataSource, SubAgentRow } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDuration, formatPercent, formatUsd, toNumber } from "./format";
import { AgentAvatar } from "./identity";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Pill } from "./ui/pill";
import { Table, TBody, TD, TH, THead } from "./ui/table";

type SortKey = "earnings" | "tasks" | "speed";

const SORTS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: "earnings", label: "Earnings" },
  { id: "tasks", label: "Volume" },
  { id: "speed", label: "Latency" },
];

const RANK_ACCENT = [
  "border-[#079ab740] bg-fl-accentSoft text-fl-accent",
  "border-fl-borderHi bg-fl-raised text-white",
  "border-[#f59e0b40] bg-fl-warnSoft text-fl-warn",
] as const;

export interface AgentLeaderboardProps {
  agents: SubAgentRow[];
  source: DataSource;
  reason?: string;
}

export function AgentLeaderboard({ agents, source, reason }: AgentLeaderboardProps) {
  const [sort, setSort] = React.useState<SortKey>("earnings");

  const rows = React.useMemo(() => {
    const copy = [...agents];
    copy.sort((a, b) => {
      if (sort === "tasks") return b.tasksCompleted - a.tasksCompleted;
      if (sort === "speed") return a.avgSettlementMs - b.avgSettlementMs;
      return toNumber(b.totalEarnedRaw) - toNumber(a.totalEarnedRaw);
    });
    return copy;
  }, [agents, sort]);

  const maxEarned = Math.max(...rows.map((r) => toNumber(r.totalEarnedRaw)), 1);

  return (
    <Card flush>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-fl-border px-4 py-2.5">
        <span className="mono-label mr-1">Rank by</span>
        {SORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={sort === item.id}
            onClick={() => setSort(item.id)}
            className={cn(
              "rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors",
              sort === item.id ? "bg-fl-raised text-white" : "fg-2 hover:text-white",
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto">
          <DataSourceBadge source={source} reason={reason} />
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title="No sub-agents yet"
          body="Sub-agents appear here once the agency dispatches a task and The Graph indexes the first MicroSettlement."
          link={{ href: "/dashboard#jobs", label: "Back to the job pipeline" }}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH mono align="center">
                Rank
              </TH>
              <TH>Sub-agent</TH>
              <TH>Role</TH>
              <TH align="right">Tasks</TH>
              <TH align="right">Earned</TH>
              <TH align="right">Completion</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((agent, index) => {
              const earned = toNumber(agent.totalEarnedRaw);
              const share = earned / maxEarned;
              return (
                <tr key={agent.address}>
                  <TD align="center">
                    <span
                      className={cn(
                        "inline-flex h-6 w-6 items-center justify-center rounded-[6px] border font-mono text-[0.68rem] font-semibold tabular-nums",
                        index < 3 ? RANK_ACCENT[index] : "border-fl-border bg-fl-card fg-3",
                      )}
                      aria-label={`Rank ${index + 1}`}
                    >
                      {index === 0 ? <Trophy className="h-3 w-3" aria-hidden="true" /> : index + 1}
                    </span>
                  </TD>
                  <TD>
                    <span className="inline-flex min-w-0 items-center gap-2.5">
                      <AgentAvatar seed={agent.address} label={agent.ensName} size="md" />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="inline-flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-medium fg">
                            {agent.ensName ?? shortAddress(agent.address)}
                          </span>
                          {agent.ensName ? (
                            <Pill tone="on" className="!px-1.5 !py-0">
                              ens
                            </Pill>
                          ) : null}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums fg-3" title={agent.address}>
                          {shortAddress(agent.address)}
                        </span>
                      </span>
                    </span>
                  </TD>
                  <TD>
                    <span className="block max-w-[14rem] truncate text-[13px] fg-2">{agent.role}</span>
                    <span
                      className="block text-[11px] fg-3"
                      title="Average assignment-to-settlement latency"
                    >
                      {formatDuration(agent.avgSettlementMs)} avg settle
                    </span>
                  </TD>
                  <TD mono align="right" className="fg-2">
                    {agent.tasksCompleted}
                  </TD>
                  <TD align="right">
                    <span className="inline-flex flex-col items-end gap-1.5">
                      <span className="font-mono text-[0.8rem] font-semibold tabular-nums fg">
                        {formatUsd(earned, 0)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="block h-1 w-16 overflow-hidden rounded-full bg-fl-raised"
                      >
                        <span
                          className="block h-full rounded-full bg-fl-accent"
                          style={{ width: `${Math.max(share * 100, 3)}%` }}
                        />
                      </span>
                    </span>
                  </TD>
                  <TD align="right">
                    <Pill
                      tone={agent.successRate >= 0.97 ? "emerald" : "off"}
                      title="Share of assigned tasks that settled successfully"
                    >
                      {formatPercent(agent.successRate)}
                    </Pill>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}

      {source === "demo" ? (
        <div className="px-4 pb-4">
          <FallbackNote source={source} reason={reason} />
        </div>
      ) : null}
    </Card>
  );
}
