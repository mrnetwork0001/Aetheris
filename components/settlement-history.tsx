"use client";

import * as React from "react";
import { ArrowUpRight, Receipt } from "lucide-react";

import type { DataSource, SettlementRow } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { formatDate, formatToken, formatUsd, relativeTime, toNumber } from "./format";
import { Identity } from "./identity";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { Pill } from "./ui/pill";
import { Table, TBody, TD, TH, THead, TR } from "./ui/table";
import { useNow } from "./use-now";

export interface SettlementHistoryProps {
  settlements: SettlementRow[];
  source: DataSource;
  reason?: string;
}

/**
 * Micro-settlement ledger: one row per paid sub-task, newest first. Amounts are
 * JetBrains Mono; the settlement rail is an accent `HTS` pill when the payout
 * went through the Hedera Token Service and a muted `ERC-20` pill otherwise.
 */
export function SettlementHistory({ settlements, source, reason }: SettlementHistoryProps) {
  const now = useNow();

  return (
    <Card flush>
      <CardHeader>
        <div>
          <CardTitle as="h2">Settlement history</CardTitle>
          <CardDescription>Programmatic sub-agent payouts, most recent first.</CardDescription>
        </div>
        <DataSourceBadge source={source} reason={reason} />
      </CardHeader>

      {settlements.length === 0 ? (
        <EmptyState
          icon={<Receipt />}
          title="No settlements yet"
          body="Every micro-settlement the agency pays a sub-agent lands here with its rail, amount and transaction."
          link={{ href: "/dashboard#jobs", label: "Watch the job pipeline" }}
        />
      ) : (
        <Table className="min-w-[48rem]">
          <caption className="sr-only">Micro-settlements paid to sub-agents, newest first</caption>
          <THead>
            <tr>
              <TH>Job · task</TH>
              <TH>Sub-agent</TH>
              <TH align="right">Amount</TH>
              <TH>Rail</TH>
              <TH>Settled</TH>
              <TH>Transaction</TH>
            </tr>
          </THead>
          <TBody>
            {settlements.map((row) => (
              <TR key={`${row.jobId}-${row.taskId}-${row.txId}`}>
                <TD mono className="whitespace-nowrap fg-2">
                  #{row.jobId} · {row.taskId}
                </TD>
                <TD className="min-w-[12rem]">
                  <Identity seed={row.subAgent} name={row.subAgentName || null} size="sm" />
                </TD>
                <TD align="right" className="whitespace-nowrap">
                  <span className="block font-mono text-[0.85rem] font-semibold tabular-nums fg">
                    {formatToken(row.amountRaw, row.decimals, row.tokenSymbol)}
                  </span>
                  <span className="block font-mono text-[11px] tabular-nums fg-3">
                    {formatUsd(toNumber(row.amountRaw, row.decimals))}
                  </span>
                </TD>
                <TD>
                  {row.viaHts ? (
                    <Pill tone="on" title="Settled through the Hedera Token Service">
                      HTS
                    </Pill>
                  ) : (
                    <Pill tone="muted" title="Settled through the ERC-20 fallback">
                      ERC-20
                    </Pill>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-[12px] fg-2">
                  <time dateTime={new Date(row.timestamp).toISOString()} title={formatDate(row.timestamp)}>
                    {now === null ? formatDate(row.timestamp) : relativeTime(row.timestamp, now)}
                  </time>
                </TD>
                <TD>
                  {row.txId ? (
                    <a
                      href={`https://hashscan.io/testnet/transaction/${encodeURIComponent(row.txId)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex max-w-[13rem] items-center gap-1 font-mono text-[0.78rem] tabular-nums accent-ink transition-colors hover:underline"
                    >
                      <span className="truncate">{row.txId}</span>
                      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="sr-only">(opens HashScan)</span>
                    </a>
                  ) : (
                    <span className="font-mono text-[0.78rem] fg-3">—</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {source === "demo" ? (
        <CardFooter className="block [&>p]:mt-0">
          <FallbackNote source={source} reason={reason} />
        </CardFooter>
      ) : null}
    </Card>
  );
}
