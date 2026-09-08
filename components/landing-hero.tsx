"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";

import { Badge } from "./ui/badge";

const HIGHLIGHTS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "~2s", label: "Hedera consensus finality" },
  { value: "$0.0001", label: "Per-settlement fee" },
  { value: "6", label: "Sponsor integrations" },
  { value: "1:1", label: "Human operator to treasury" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden="true" className="grid-blueprint absolute inset-0" />
      <div className="aether-container relative pb-16 pt-16 sm:pb-24 sm:pt-24">
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.09 }}
          className="max-w-3xl"
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }}>
            <Badge tone="glow" className="gap-2">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              ETHOnline 2026 · Apache 2.0
            </Badge>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"
          >
            <span className="text-aurora">Autonomous AI agencies</span>
            <br />
            that hire, settle and audit themselves.
          </motion.h1>

          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.55 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg"
          >
            Aetheris turns an AI agency into an on-chain economic actor. A client escrows a job in
            stablecoins; the agency autonomously hires specialised sub-agents, settles each task in
            under two seconds on the Hedera Token Service, anchors every milestone to an immutable
            consensus log, and rebalances the retained margin across five chains through 1inch.
          </motion.p>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/dashboard"
              className="group inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-b from-aether-glow to-[#4a58e0] px-6 text-sm font-medium text-white shadow-[0_16px_40px_-18px_rgb(109_124_255_/_0.95)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aether-cyan"
            >
              Open Mission Control
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <a
              href="#architecture"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-6 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aether-cyan"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              How it works
            </a>
          </motion.div>
        </motion.div>

        <motion.dl
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="mt-14 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4"
        >
          {HIGHLIGHTS.map((item) => (
            <div key={item.label} className="bg-aether-deep/60 px-5 py-4 backdrop-blur-xl">
              <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-400">
                {item.label}
              </dt>
              <dd className="mt-1.5 text-xl font-semibold tabular-nums text-white">{item.value}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}
