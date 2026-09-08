"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink, FileCode2 } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import type { DataSource, Job, JobStatus, SubTask } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDate, formatDuration, formatToken, relativeTime } from "./format";
import { AgentAvatar } from "./identity";
import { Badge, type BadgeTone } from "./ui/badge";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { useNow } from "./use-now";

const STATUS_TONE: Record<JobStatus, BadgeTone> = {
  Funded: "neutral",
  Dispatched: "glow",
  Completed: "cyan",
  Settled: "success",
  Refunded: "danger",
};

const TASK_TONE: Record<SubTask["status"], BadgeTone> = {
  Assigned: "neutral",
  Completed: "cyan",
  Paid: "gold",
  Cancelled: "danger",
};

type Filter = "all" | "active" | "settled";

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "In flight" },
  { id: "settled", label: "Settled" },
];

const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "Funded",
  "Dispatched",
  "Completed",
]);

function paidRatio(job: Job): number {
  if (job.tasks.length === 0) return 0;
  const paid = job.tasks.filter((t) => t.status === "Paid").length;
  return paid / job.tasks.length;
}

export interface JobBoardProps {
  jobs: Job[];
  source: DataSource;
  reason?: string;
}

export function JobBoard({ jobs, source, reason }: JobBoardProps) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [expanded, setExpanded] = React.useState<string | null>(jobs[0]?.jobId ?? null);
  const now = useNow();

  const visible = React.useMemo(() => {
    if (filter === "active") return jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
    if (filter === "settled") return jobs.filter((j) => j.status === "Settled");
    return jobs;
  }, [jobs, filter]);

  return (
    <Card className="edge-lit">
      <CardHeader>
        <div>
          <CardTitle as="h2">Job pipeline</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Client deposits escrowed on Hedera EVM, dispatched to specialised sub-agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={source} reason={reason} />
        </div>
      </CardHeader>

      <div className="flex items-center gap-1 border-b border-white/[0.06] px-5 py-2.5">
        <div role="tablist" aria-label="Filter jobs" className="flex gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filter === item.id
                  ? "bg-white/[0.08] text-white"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[0.7rem] tabular-nums text-slate-500">
          {visible.length} of {jobs.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No jobs match this filter.
        </p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {visible.map((job, index) => {
            const open = expanded === job.jobId;
            const ratio = paidRatio(job);
            return (
              <motion.li
                key={job.jobId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.24) }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : job.jobId)}
                  aria-expanded={open}
                  aria-controls={`job-panel-${job.jobId}`}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.025]"
                >
                  <span className="mt-0.5 hidden shrink-0 sm:block">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-aether-cyan">
                      <FileCode2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="data-mono text-slate-500">#{job.jobId}</span>
                      <span className="truncate text-sm font-medium text-white">{job.title}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-slate-500">
                      <span>
                        Client{" "}
                        <span className="text-slate-400">
                          {job.clientName ?? shortAddress(job.client)}
                        </span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {now === null
                          ? formatDate(job.createdAt)
                          : relativeTime(job.createdAt, now)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {job.tasks.length} sub-agent{job.tasks.length === 1 ? "" : "s"}
                      </span>
                    </span>

                    {job.tasks.length > 0 ? (
                      <span className="mt-2.5 block h-1 w-full max-w-xs overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-aether-glow to-aether-cyan transition-[width] duration-700"
                          style={{ width: `${Math.max(ratio * 100, 4)}%` }}
                        />
                      </span>
                    ) : null}
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatToken(job.depositRaw, job.tokenDecimals, job.tokenSymbol)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[job.status]}>{job.status}</Badge>
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 text-slate-500 transition-transform duration-300",
                          open && "rotate-180",
                        )}
                      />
                    </span>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      id={`job-panel-${job.jobId}`}
                      key="panel"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/[0.05] bg-black/20 px-5 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-[0.7rem] uppercase tracking-wider text-slate-400">
                            Sub-agent assignments
                          </p>
                          {job.specURI ? (
                            <span className="data-mono truncate text-slate-500" title={job.specURI}>
                              {job.specURI}
                            </span>
                          ) : null}
                        </div>

                        {job.tasks.length === 0 ? (
                          <p className="mt-3 text-xs text-slate-500">
                            Deposit escrowed — awaiting dispatch to the sub-agent pool.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-2">
                            {job.tasks.map((task) => (
                              <li
                                key={`${job.jobId}-${task.taskId}`}
                                className="flex flex-wrap items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                              >
                                <AgentAvatar
                                  seed={task.subAgent}
                                  label={task.subAgentName}
                                  size="sm"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium text-slate-200">
                                    {task.subAgentName}
                                  </span>
                                  <span className="block truncate text-[0.7rem] text-slate-500">
                                    {task.role}
                                  </span>
                                </span>
                                {task.settlementMs ? (
                                  <span
                                    className="data-mono hidden text-slate-500 sm:block"
                                    title="Assignment to on-chain settlement"
                                  >
                                    {formatDuration(task.settlementMs)}
                                  </span>
                                ) : null}
                                {task.hcsSequenceNumber ? (
                                  <span
                                    className="data-mono hidden text-aether-cyan/70 md:block"
                                    title="Hedera Consensus Service sequence number"
                                  >
                                    HCS #{task.hcsSequenceNumber}
                                  </span>
                                ) : null}
                                <span className="data-mono text-slate-300">
                                  {formatToken(task.feeRaw, job.tokenDecimals, job.tokenSymbol)}
                                </span>
                                <Badge tone={TASK_TONE[task.status]}>{task.status}</Badge>
                              </li>
                            ))}
                          </ul>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          {job.netMarginRaw ? (
                            <p className="text-[0.72rem] text-slate-400">
                              Net margin retained{" "}
                              <span className="font-semibold text-aether-gold">
                                {formatToken(job.netMarginRaw, job.tokenDecimals, job.tokenSymbol)}
                              </span>
                            </p>
                          ) : (
                            <span />
                          )}
                          <Link
                            href={`/agency/${job.client}`}
                            className="inline-flex items-center gap-1.5 rounded-lg text-[0.72rem] text-aether-cyan transition-colors hover:text-white"
                          >
                            View client agency
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="px-5 pb-4">
        <FallbackNote source={source} reason={reason} />
      </div>
    </Card>
  );
}
