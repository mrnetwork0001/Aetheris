"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Fingerprint,
  Globe,
  Repeat,
  ScanFace,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Card } from "./ui/card";

interface Integration {
  name: string;
  bounty: string;
  icon: LucideIcon;
  headline: string;
  body: string;
  proof: string;
  accent: string;
}

const INTEGRATIONS: readonly Integration[] = [
  {
    name: "Hedera",
    bounty: "EVM · HTS · HCS",
    icon: Zap,
    headline: "Sub-second settlement rail",
    body: "AetherisTreasury.sol escrows the client deposit on Hedera EVM, pays each sub-agent through the Hedera Token Service, and anchors every milestone to a Consensus Service topic.",
    proof: "MicroSettlement · HcsLogAnchored",
    accent: "text-aether-cyan",
  },
  {
    name: "The Graph",
    bounty: "Subgraph analytics",
    icon: BarChart3,
    headline: "Real-time agent economics",
    body: "Every contract event is indexed into a GraphQL API, so the dashboard can rank sub-agents by realised earnings, latency and success rate without polling a node.",
    proof: "JobSettled · SubAgentAssigned",
    accent: "text-[#a9b2ff]",
  },
  {
    name: "World ID",
    bounty: "Proof of personhood",
    icon: ScanFace,
    headline: "One human, one treasury",
    body: "Deploying an agency and sweeping its accrued margin both require a zero-knowledge proof of personhood, with the nullifier recorded on-chain so a claim cannot be replayed.",
    proof: "OperatorVerified · ProfitClaimed",
    accent: "text-emerald-300",
  },
  {
    name: "1inch",
    bounty: "Swap API v6.0",
    icon: Repeat,
    headline: "Agentic portfolio routing",
    body: "The treasury holds stablecoins and majors across five EVM chains. Drift past the target weights and the agency quotes and builds a swap through 1inch — server-side, key never exposed.",
    proof: "TreasuryRebalanced",
    accent: "text-aether-gold",
  },
  {
    name: "Privy",
    bounty: "Passkey wallets",
    icon: Fingerprint,
    headline: "Onboarding without seed phrases",
    body: "Operators sign in with a passkey or an email and receive an embedded wallet. No extension, no mnemonic, no chain switching before the first job is funded.",
    proof: "Embedded wallet · Hedera testnet",
    accent: "text-[#c4b5fd]",
  },
  {
    name: "ENS",
    bounty: "Agent identity",
    icon: Globe,
    headline: "Names, not hex strings",
    body: "Agencies and sub-agents resolve to .eth names with avatars, so the audit log reads sentinel.aetheris.eth rather than a 42-character address.",
    proof: "resolveEnsName · lookupEnsAddress",
    accent: "text-[#7dd3fc]",
  },
];

export function SponsorGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {INTEGRATIONS.map((integration, index) => {
        const Icon = integration.icon;
        return (
          <motion.li
            key={integration.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.3) }}
          >
            <Card className="edge-lit group h-full p-5 transition-colors duration-300 hover:border-white/[0.14]">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]",
                    integration.accent,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-white">{integration.name}</h3>
                  <p className="truncate text-[0.68rem] uppercase tracking-wider text-slate-400">
                    {integration.bounty}
                  </p>
                </div>
              </div>

              <p className={cn("mt-4 text-sm font-medium", integration.accent)}>
                {integration.headline}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{integration.body}</p>

              <p className="mt-4 border-t border-white/[0.06] pt-3 data-mono text-slate-500">
                {integration.proof}
              </p>
            </Card>
          </motion.li>
        );
      })}
    </ul>
  );
}
