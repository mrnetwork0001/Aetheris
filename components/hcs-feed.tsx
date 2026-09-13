"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Pause, Play, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, HcsMessage } from "./aetheris-data";
import { DataSourceBadge, FallbackNote } from "./data-source-badge";
import { decodeHcsMessage, eventTone, formatClock, hcsTimestampToMs } from "./format";
import { LiveDot } from "./ui/badge";
import { Card } from "./ui/card";
import { EmptyState } from "./ui/empty-state";
import { SkeletonRows } from "./ui/skeleton";

/** Mirrors the JSON contract of `GET /api/hcs`. */
interface HcsReadResponse {
  topicId: string;
  source: DataSource;
  notice?: string;
  messages: HcsMessage[];
}

const TONE_CLASS = {
  cyan: "text-fl-accent",
  glow: "fg",
  gold: "text-fl-warn",
  success: "text-fl-emerald",
  neutral: "fg-2",
} as const;

async function fetchFeed(topicId: string, limit: number): Promise<HcsReadResponse> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (topicId !== "") params.set("topicId", topicId);
  const response = await fetch(`/api/hcs?${params.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HCS mirror returned ${response.status}`);
  return (await response.json()) as HcsReadResponse;
}

export interface HcsFeedProps {
  topicId: string;
  initialMessages: HcsMessage[];
  initialSource: DataSource;
  initialReason?: string;
  limit?: number;
}

export function HcsFeed({
  topicId,
  initialMessages,
  initialSource,
  initialReason,
  limit = 10,
}: HcsFeedProps) {
  const [paused, setPaused] = React.useState(false);

  const query = useQuery({
    queryKey: ["hcs-feed", topicId, limit],
    queryFn: () => fetchFeed(topicId, limit),
    initialData: {
      topicId,
      source: initialSource,
      notice: initialReason,
      messages: initialMessages,
    } satisfies HcsReadResponse,
    initialDataUpdatedAt: 0,
    refetchInterval: paused ? false : 12_000,
    staleTime: 0,
    retry: 0,
  });

  const payload = query.data;
  const messages = payload.messages.slice(0, limit);
  const source = payload.source;
  const notice = payload.notice;

  return (
    <Card flush className="flex flex-col">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-fl-border px-4 py-2.5">
        <span className="inline-flex items-center gap-2 data-mono fg-3">
          <Radio className="h-3.5 w-3.5 text-fl-accent" aria-hidden="true" />
          topic {payload.topicId || "-"}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <DataSourceBadge source={source} reason={notice} />
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            className="btn btn-secondary btn-sm !font-sans !font-medium"
          >
            {paused ? (
              <Play className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Pause className="h-3 w-3" aria-hidden="true" />
            )}
            {paused ? "Resume" : "Pause"}
          </button>
        </span>
      </div>

      {/* ── Log ──────────────────────────────────────────────────────────── */}
      <div
        className="relative max-h-[30rem] flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="Hedera Consensus Service audit log"
      >
        {query.isFetching && messages.length === 0 ? (
          <div className="px-5 py-5">
            <SkeletonRows count={4} />
          </div>
        ) : null}

        {query.isError ? (
          <div className="m-4 flex items-start gap-2 rounded-[10px] border border-[#ef444440] bg-[#ef44441f] px-3 py-2.5 text-xs leading-relaxed text-[color:var(--c-rose-ink)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Live mirror unavailable - showing the last frames received.{" "}
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="underline underline-offset-2 hover:text-white"
              >
                Retry
              </button>
            </span>
          </div>
        ) : null}

        <ol className="font-mono text-[12px] leading-relaxed">
          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const decoded = decodeHcsMessage(message.contents);
              const tone = eventTone(decoded.event);
              return (
                <motion.li
                  key={`${payload.topicId}-${message.sequenceNumber}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-fl-border px-4 py-2 transition-colors last:border-b-0 hover:bg-[color:var(--c-row-hover)]"
                >
                  <span className="w-14 shrink-0 tabular-nums fg-3">#{message.sequenceNumber}</span>
                  <span className="shrink-0 tabular-nums fg-3">
                    {formatClock(hcsTimestampToMs(message.consensusTimestamp))}Z
                  </span>
                  <span className={cn("shrink-0 font-semibold", TONE_CLASS[tone])}>
                    {decoded.event}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5">
                    {decoded.fields.slice(0, 6).map(([key, value]) => (
                      <span key={key} className="inline-flex min-w-0 max-w-full items-baseline">
                        <span className="fg-3">{key}=</span>
                        <span className="max-w-[16rem] truncate fg-2" title={value}>
                          {value}
                        </span>
                      </span>
                    ))}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>

        {messages.length === 0 && !query.isFetching ? (
          <EmptyState
            icon={<Radio />}
            title="No consensus messages yet"
            body="Every job milestone the agency anchors to its HCS topic will stream here with its sequence number and consensus timestamp."
            link={
              payload.topicId
                ? { href: `https://hashscan.io/testnet/topic/${payload.topicId}`, label: "View topic on HashScan" }
                : undefined
            }
          />
        ) : null}
      </div>

      {source === "demo" ? (
        <div className="px-4 pt-3">
          <FallbackNote source={source} reason={notice} />
        </div>
      ) : null}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-t border-fl-border px-4 py-2.5 text-[11px] fg-3">
        <span className="flex items-center gap-1.5">
          {paused ? (
            "Stream paused"
          ) : (
            <>
              <LiveDot className={cn(source === "live" ? "" : "text-fl-warn")} />
              Polling every 12s
            </>
          )}
        </span>
        <span className="font-mono tabular-nums">{messages.length} frames</span>
      </div>
    </Card>
  );
}
