"use client";

import * as React from "react";
import { ArrowUpRight } from "lucide-react";

import { shortAddress } from "@/lib/utils";
import type { DataSource, SettlementRow } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDate, formatToken, relativeTime } from "./format";
import { Badge } from "./ui/badge";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { useNow } from "./use-now";

export interface SettlementHistoryProps {
  settlements: SettlementRow[];
  source: DataSource;
  reason?: string;
}

export function SettlementHistory({ settlements, source, reason }: SettlementHistoryProps) {
  const now = useNow();

  return (
    <Card className="edge-lit">
      <CardHeader>
        <div>
          <CardTitle as="h2">Settlement history</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            Programmatic sub-agent payouts, most recent first.
          </p>
        </div>
        <DataSourceBadge source={source} reason={reason} />
      </CardHeader>

      {settlements.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">
          No settlements recorded for this agency yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <caption className="sr-only">
              Micro-settlements paid to sub-agents, newest first
            </caption>
            <thead>
              <tr className="border-b border-white/[0.06] text-[0.66rem] uppercase tracking-wider text-slate-400">
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Job · task
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Sub-agent
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Rail
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Settled
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Transaction
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {settlements.map((row) => (
                <tr
                  key={`${row.jobId}-${row.taskId}-${row.txId}`}
                  className="transition-colors hover:bg-white/[0.02]"
                >
                  <td className="whitespace-nowrap px-5 py-3 data-mono text-slate-400">
                    #{row.jobId} · {row.taskId}
                  </td>
                  <td className="px-5 py-3">
                    <span className="block truncate text-xs font-medium text-slate-200">
                      {row.subAgentName || shortAddress(row.subAgent)}
                    </span>
                    <span className="block truncate data-mono text-slate-500">
                      {shortAddress(row.subAgent)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs font-semibold tabular-nums text-aether-gold">
                    {formatToken(row.amountRaw, row.decimals, row.tokenSymbol)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={row.viaHts ? "cyan" : "neutral"}>
                      {row.viaHts ? "HTS" : "ERC-20"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                    {now === null ? formatDate(row.timestamp) : relativeTime(row.timestamp, now)}
                  </td>
                  <td className="px-5 py-3">
                    {row.txId ? (
                      <a
                        href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(row.txId)}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex max-w-[13rem] items-center gap-1 data-mono text-aether-cyan/80 transition-colors hover:text-aether-cyan"
                      >
                        <span className="truncate">{row.txId}</span>
                        <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="data-mono text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 pb-4">
        <FallbackNote source={source} reason={reason} />
      </div>
    </Card>
  );
}
