"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Pause, Play, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataSource, HcsMessage } from "./aetheris-data";
import { DataSourceBadge } from "./data-source-badge";
import { decodeHcsMessage, eventTone, formatClock, hcsTimestampToMs } from "./format";
import { Badge, LiveDot } from "./ui/badge";
import { Card, CardHeader, CardTitle } from "./ui/card";
import { SkeletonRows } from "./ui/skeleton";

/** Mirrors the JSON contract of `GET /api/hcs`. */
interface HcsReadResponse {
  topicId: string;
  source: DataSource;
  notice?: string;
  messages: HcsMessage[];
}

const TONE_CLASS = {
  cyan: "text-aether-cyan",
  glow: "text-[#a9b2ff]",
  gold: "text-aether-gold",
  success: "text-emerald-300",
  neutral: "text-slate-400",
} as const;

const TONE_BADGE = {
  cyan: "cyan",
  glow: "glow",
  gold: "gold",
  success: "success",
  neutral: "neutral",
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
    <Card className="edge-lit flex flex-col">
      <CardHeader>
        <div>
          <CardTitle as="h2" className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-aether-cyan" aria-hidden="true" />
            HCS audit stream
          </CardTitle>
          <p className="mt-1 data-mono text-slate-500">
            topic {payload.topicId || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataSourceBadge source={source} reason={notice} />
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            aria-pressed={paused}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-[0.7rem] text-slate-300 transition hover:bg-white/[0.08]"
          >
            {paused ? (
              <Play className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Pause className="h-3 w-3" aria-hidden="true" />
            )}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </CardHeader>

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
          <div className="m-5 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/[0.07] px-3 py-2.5 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              Live mirror unavailable — showing the last frames received.{" "}
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

        <ul className="divide-y divide-white/[0.04]">
          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const decoded = decodeHcsMessage(message.contents);
              const tone = eventTone(decoded.event);
              return (
                <motion.li
                  key={`${payload.topicId}-${message.sequenceNumber}`}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="px-5 py-3 transition-colors hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2">
                    <span className="data-mono shrink-0 text-slate-500">
                      #{message.sequenceNumber}
                    </span>
                    <Badge tone={TONE_BADGE[tone]} className="normal-case tracking-normal">
                      {decoded.event}
                    </Badge>
                    <span className="data-mono ml-auto shrink-0 text-slate-500">
                      {formatClock(hcsTimestampToMs(message.consensusTimestamp))} UTC
                    </span>
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {decoded.fields.slice(0, 6).map(([key, value]) => (
                      <div key={key} className="flex min-w-0 items-baseline gap-1.5">
                        <dt className="text-[0.68rem] text-slate-500">{key}</dt>
                        <dd
                          className={cn("data-mono max-w-[16rem] truncate", TONE_CLASS[tone])}
                          title={value}
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        {messages.length === 0 && !query.isFetching ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No consensus messages on this topic yet.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-2.5 text-[0.7rem] text-slate-500">
        <span className="flex items-center gap-1.5">
          {paused ? (
            "Stream paused"
          ) : (
            <>
              <LiveDot className={source === "live" ? "" : "bg-amber-400"} />
              Polling every 12s
            </>
          )}
        </span>
        <span className="tabular-nums">{messages.length} frames</span>
      </div>
    </Card>
  );
}
