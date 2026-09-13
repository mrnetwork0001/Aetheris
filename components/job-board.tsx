"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Briefcase, ChevronDown, ExternalLink } from "lucide-react";

import { cn, shortAddress } from "@/lib/utils";
import type { DataSource, Job, JobStatus } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDate, formatDuration, formatToken, relativeTime } from "./format";
import { AgentAvatar } from "./identity";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Pill, statusTone } from "./ui/pill";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import { useNow } from "./use-now";

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
  // Panels toggled by the user after mount animate in; the default-open panel is
  // server-rendered fully visible (initial={false}) so it never sits at opacity:0.
  const userToggled = React.useRef(false);
  const reducedMotion = useReducedMotion();
  const now = useNow();

  const toggle = React.useCallback((jobId: string, open: boolean) => {
    userToggled.current = true;
    setExpanded(open ? null : jobId);
  }, []);

  const visible = React.useMemo(() => {
    if (filter === "active") return jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
    if (filter === "settled") return jobs.filter((j) => j.status === "Settled");
    return jobs;
  }, [jobs, filter]);

  return (
    <Card flush>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-fl-border px-4 py-2.5">
        <div role="tablist" aria-label="Filter jobs" className="flex gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-[8px] px-3 py-1.5 text-xs font-medium transition-colors",
                filter === item.id ? "bg-fl-raised text-white" : "fg-2 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="ml-auto data-mono fg-3">
          {visible.length} of {jobs.length}
        </span>
        <DataSourceBadge source={source} reason={reason} />
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title={jobs.length === 0 ? "No jobs yet" : "No jobs match this filter"}
          body={
            jobs.length === 0
              ? "Fund a job on the agency contract and it appears here the moment the subgraph indexes it."
              : "Switch the filter to see the rest of the pipeline."
          }
          link={{ href: "/dashboard#agents", label: "See the sub-agent roster" }}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH mono>#</TH>
              <TH>Spec</TH>
              <TH>Client</TH>
              <TH align="right">Deposit</TH>
              <TH align="right">Tasks</TH>
              <TH>Status</TH>
              <TH align="right">
                <span className="sr-only">Expand</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {visible.map((job) => {
              const open = expanded === job.jobId;
              const ratio = paidRatio(job);
              const paid = job.tasks.filter((t) => t.status === "Paid").length;
              const panelId = `job-panel-${job.jobId}`;
              return (
                <React.Fragment key={job.jobId}>
                  <TR
                    interactive
                    onClick={() => toggle(job.jobId, open)}
                    className={cn(open && "bg-[color:var(--c-row-hover)]")}
                  >
                    <TD mono className="fg-3">
                      #{job.jobId}
                    </TD>
                    <TD>
                      <span className="block max-w-[26rem] truncate font-medium fg">{job.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] fg-3">
                        {now === null ? formatDate(job.createdAt) : relativeTime(job.createdAt, now)}
                        {job.specURI ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono" title={job.specURI}>
                              {job.specURI}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-2">
                        <AgentAvatar seed={job.client} label={job.clientName} size="sm" />
                        <span className="whitespace-nowrap text-[13px] fg-2">
                          {job.clientName ?? shortAddress(job.client)}
                        </span>
                      </span>
                    </TD>
                    <TD mono align="right" className="whitespace-nowrap fg">
                      {formatToken(job.depositRaw, job.tokenDecimals, job.tokenSymbol)}
                    </TD>
                    <TD align="right">
                      <span className="inline-flex flex-col items-end gap-1.5">
                        <span className="font-mono text-[0.8rem] tabular-nums fg-2">
                          {paid}/{job.tasks.length}
                        </span>
                        {job.tasks.length > 0 ? (
                          <span
                            aria-hidden="true"
                            className="block h-1 w-16 overflow-hidden rounded-full bg-fl-raised"
                          >
                            <span
                              className="block h-full rounded-full bg-fl-accent transition-[width] duration-700"
                              style={{ width: `${Math.max(ratio * 100, 4)}%` }}
                            />
                          </span>
                        ) : null}
                      </span>
                    </TD>
                    <TD>
                      <Pill tone={statusTone(job.status)}>{job.status}</Pill>
                    </TD>
                    <TD align="right">
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        aria-label={`${open ? "Collapse" : "Expand"} job ${job.jobId}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(job.jobId, open);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] fg-3 transition-colors hover:bg-fl-raised hover:text-white"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")}
                        />
                      </button>
                    </TD>
                  </TR>

                  {open ? (
                    <tr id={panelId}>
                      <td colSpan={7} className="!p-0">
                        <motion.div
                          initial={
                            userToggled.current && !reducedMotion ? { opacity: 0, y: -4 } : false
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
                          className="bg-fl-bg/60 px-5 py-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="mono-label">Sub-agent assignments</p>
                            {job.specURI ? (
                              <span className="data-mono truncate fg-3" title={job.specURI}>
                                {job.specURI}
                              </span>
                            ) : null}
                          </div>

                          {job.tasks.length === 0 ? (
                            <p className="mt-3 text-xs fg-2">
                              Deposit escrowed - awaiting dispatch to the sub-agent pool.
                            </p>
                          ) : (
                            <ul className="mt-3 divide-y divide-[color:var(--c-border)] overflow-hidden rounded-[10px] border border-fl-border">
                              {job.tasks.map((task) => (
                                <li
                                  key={`${job.jobId}-${task.taskId}`}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 bg-fl-card px-3 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto_auto]"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-[13px] font-medium fg">
                                      {task.role}
                                    </span>
                                    <span className="block text-[11px] fg-3">task #{task.taskId}</span>
                                  </span>
                                  <span className="order-last col-span-2 inline-flex min-w-0 items-center gap-2 sm:order-none sm:col-span-1">
                                    <AgentAvatar seed={task.subAgent} label={task.subAgentName} size="sm" />
                                    <span className="min-w-0">
                                      <span className="block truncate text-[13px] fg-2">
                                        {task.subAgentName}
                                      </span>
                                      {task.settlementMs ? (
                                        <span
                                          className="block text-[11px] fg-3"
                                          title="Assignment to on-chain settlement"
                                        >
                                          settled in {formatDuration(task.settlementMs)}
                                        </span>
                                      ) : null}
                                    </span>
                                  </span>
                                  <span className="data-mono whitespace-nowrap fg">
                                    {formatToken(task.feeRaw, job.tokenDecimals, job.tokenSymbol)}
                                  </span>
                                  <span
                                    className="data-mono hidden whitespace-nowrap text-fl-accent sm:inline"
                                    title="Hedera Consensus Service sequence number"
                                  >
                                    {task.hcsSequenceNumber ? `HCS #${task.hcsSequenceNumber}` : "-"}
                                  </span>
                                  <Pill tone={statusTone(task.status)} className="justify-self-end">
                                    {task.status}
                                  </Pill>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            {job.netMarginRaw ? (
                              <p className="text-xs fg-2">
                                Net margin retained{" "}
                                <span className="font-mono font-semibold text-fl-accent">
                                  {formatToken(job.netMarginRaw, job.tokenDecimals, job.tokenSymbol)}
                                </span>
                              </p>
                            ) : (
                              <span />
                            )}
                            <Link
                              href={`/agency/${job.client}`}
                              className="inline-flex items-center gap-1.5 rounded-[6px] text-xs font-medium text-fl-accent transition-colors hover:text-white"
                            >
                              View client agency
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </Link>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
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
