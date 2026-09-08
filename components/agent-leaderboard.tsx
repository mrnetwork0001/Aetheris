"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import type { DataSource, SubAgentRow } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDuration, formatPercent, formatUsd, toNumber } from "./format";
import { AgentAvatar } from "./identity";
import { Badge } from "./ui/badge";
import { Card, CardHeader, CardTitle } from "./ui/card";

type SortKey = "earnings" | "tasks" | "speed";

const SORTS: ReadonlyArray<{ id: SortKey; label: string }> = [
  { id: "earnings", label: "Earnings" },
  { id: "tasks", label: "Volume" },
  { id: "speed", label: "Latency" },
];

const RANK_ACCENT = [
  "text-aether-gold border-aether-gold/40 bg-aether-gold/10",
  "text-slate-200 border-white/25 bg-white/[0.08]",
  "text-amber-600 border-amber-600/40 bg-amber-600/10",
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
    <Card className="edge-lit">
      <CardHeader>
        <div>
          <CardTitle as="h2">Sub-agent leaderboard</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Indexed from <span className="text-slate-400">MicroSettlement</span> events by The Graph.
          </p>
        </div>
        <DataSourceBadge source={source} reason={reason} />
      </CardHeader>

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-5 py-2.5">
        <span className="mr-1 text-[0.7rem] uppercase tracking-wider text-slate-400">Rank by</span>
        {SORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={sort === item.id}
            onClick={() => setSort(item.id)}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              sort === item.id
                ? "bg-white/[0.08] text-white"
                : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <ol className="divide-y divide-white/[0.05]">
        {rows.map((agent, index) => {
          const earned = toNumber(agent.totalEarnedRaw);
          const share = earned / maxEarned;
          return (
            <motion.li
              key={agent.address}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(index * 0.045, 0.3) }}
              className="relative px-5 py-3"
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-aether-glow/[0.10] to-transparent"
                style={{ width: `${Math.max(share * 100, 2)}%` }}
              />
              <div className="relative flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[0.68rem] font-semibold tabular-nums",
                    index < 3 ? RANK_ACCENT[index] : "border-white/10 bg-white/[0.03] text-slate-500",
                  )}
                  aria-hidden="true"
                >
                  {index === 0 ? <Trophy className="h-3 w-3" /> : index + 1}
                </span>

                <AgentAvatar seed={agent.address} label={agent.ensName} size="md" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {agent.ensName ?? shortAddress(agent.address)}
                    {agent.ensName ? (
                      <span className="ml-2 align-middle text-[0.62rem] uppercase tracking-wider text-aether-cyan/70">
                        ens
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-slate-500">
                    <span className="truncate">{agent.role}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{agent.tasksCompleted} tasks</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums" title="Average assignment-to-settlement latency">
                      {formatDuration(agent.avgSettlementMs)}
                    </span>
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-aether-gold">
                    {formatUsd(earned, 0)}
                  </p>
                  <Badge
                    tone={agent.successRate >= 0.97 ? "success" : "neutral"}
                    className="mt-1"
                    title="Share of assigned tasks that settled successfully"
                  >
                    {formatPercent(agent.successRate)}
                  </Badge>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>

      <div className="px-5 pb-4">
        <FallbackNote source={source} reason={reason} />
      </div>
    </Card>
  );
}
