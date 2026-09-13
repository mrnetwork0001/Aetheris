"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Band } from "@/components/ui/section-band";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";

import { DARK_PB_SCOOP } from "./manifesto";
import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

type Status = "integrated" | "needs-key";

interface Sponsor {
  name: string;
  /** Partner mark under /public/partners, rendered as a rounded tile. */
  logo: string;
  role: string;
  glyph: string;
  tone: string;
  body: string;
  status: Status;
  needs?: string;
}

/** Real integration status from README.md § Integration status. */
const SPONSORS: readonly Sponsor[] = [
  {
    name: "Hedera",
    logo: "/partners/hedera.png",
    role: "EVM · HTS · HCS",
    glyph: "ℏ",
    tone: "text-fl-fg",
    body: "Contracts live on Hedera EVM. Sub-agents are paid through the HTS system contract; completions anchor to a Consensus Service topic.",
    status: "integrated",
  },
  {
    name: "The Graph",
    logo: "/partners/thegraph.png",
    role: "Self-hosted subgraph",
    glyph: "◍",
    tone: "text-[#a78bfa]",
    body: "graph-node against the Hedera JSON-RPC relay. 17 entities, 10 handlers; Settlement.viaHts makes HTS vs ERC-20 routing queryable.",
    status: "integrated",
  },
  {
    name: "World ID",
    logo: "/partners/worldid.png",
    role: "Proof of personhood",
    glyph: "◎",
    tone: "text-fl-fg",
    body: "Proofs are verified by World ID 4.0 and the nullifier is burned on-chain by the relay. No router exists on Hedera, so the contract announces bypass mode instead of hiding it.",
    status: "needs-key",
    needs: "NEXT_PUBLIC_WORLD_ID_APP_ID",
  },
  {
    name: "1inch",
    logo: "/partners/oneinch.png",
    role: "Swap API v6.0",
    glyph: "⟁",
    tone: "text-[#f87171]",
    body: "Live swap quotes and transaction builds on EVM chains through a server-side proxy. Hedera settles through HTS, so routing serves the operator's EVM wallet.",
    status: "needs-key",
    needs: "ONEINCH_API_KEY",
  },
  {
    name: "Privy",
    logo: "/partners/privy.png",
    role: "Embedded passkey wallets",
    glyph: "◈",
    tone: "text-[#c4b5fd]",
    body: "Operators and clients sign in with a passkey and get an embedded wallet on Hedera testnet; clients fund jobs from it in the browser.",
    status: "needs-key",
    needs: "NEXT_PUBLIC_PRIVY_APP_ID",
  },
  {
    name: "ENS",
    logo: "/partners/ens.png",
    role: "Agent identity",
    glyph: "⬡",
    tone: "text-[#7dd3fc]",
    body: "Agency and sub-agent addresses resolve against Ethereum mainnet with public RPC fallbacks. aetheris.eth is the demo identity.",
    status: "integrated",
  },
];

function StatusPill({ status }: { status: Status }) {
  return status === "integrated" ? (
    <Pill tone="on">✓ Integrated</Pill>
  ) : (
    <Pill tone="warn">◌ Needs key</Pill>
  );
}

/** One card. `decorative` marks the marquee clone (§9.4): hidden from AT, never focusable. */
function SponsorCard({ sponsor, decorative = false }: { sponsor: Sponsor; decorative?: boolean }) {
  return (
    <li
      aria-hidden={decorative || undefined}
      className="w-[280px] shrink-0 md:w-[320px]"
    >
      <Card eco className="flex h-full flex-col p-6">
        <span className="card-logo grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-fl-raised ring-1 ring-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sponsor.logo} alt="" width={44} height={44} className="h-11 w-11 object-cover" loading="lazy" decoding="async" />
              </span>
        <h3 className="mt-5 font-display text-[1.1rem] font-bold text-fl-fg">{sponsor.name}</h3>
        <p className="mono-label mt-1">{sponsor.role}</p>
        <p className="mt-3 flex-1 text-[0.88rem] leading-[1.6] text-fl-fg2">{sponsor.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <StatusPill status={sponsor.status} />
          {sponsor.needs ? (
            <span className="data-mono text-[0.68rem] text-fl-dim">{sponsor.needs}</span>
          ) : null}
        </div>
      </Card>
    </li>
  );
}

/** Card width + the 20px track gap (§9.4). */
const MARQUEE_GAP = 20;

export interface LiveStatus {
  worldId: boolean;
  oneinch: boolean;
  privy: boolean;
}

export interface EcosystemRowProps {
  /** Real configuration, read on the server: which keyed integrations are live right now. */
  live: LiveStatus;
}

const LIVE_BY_ENV: Record<string, keyof LiveStatus> = {
  NEXT_PUBLIC_WORLD_ID_APP_ID: "worldId",
  ONEINCH_API_KEY: "oneinch",
  NEXT_PUBLIC_PRIVY_APP_ID: "privy",
};

export function EcosystemRow({ live }: EcosystemRowProps) {
  const sponsors = SPONSORS.map((sponsor) => {
    const key = sponsor.needs ? LIVE_BY_ENV[sponsor.needs] : undefined;
    const status: Status = key && live[key] ? "integrated" : sponsor.status;
    return { ...sponsor, status };
  });
  const liveCount = sponsors.filter((s) => s.status === "integrated").length;
  const pending = sponsors.length - liveCount;
  const summary =
    pending === 0
      ? `all ${sponsors.length} run live today.`
      : `${liveCount} run live today, ${pending} ${pending === 1 ? "is" : "are"} wired and ${pending === 1 ? "waits" : "wait"} on a key.`;
  // The overflow container, not the animated track: chevrons nudge its `scrollLeft`.
  const rowRef = React.useRef<HTMLDivElement>(null);
  // Once a chevron is used the marquee yields to manual scrolling.
  const [paused, setPaused] = React.useState(false);

  function scrollBy(direction: -1 | 1) {
    const row = rowRef.current;
    if (!row) return;
    setPaused(true);
    const card = row.querySelector<HTMLElement>("li");
    const step = card ? card.offsetWidth + MARQUEE_GAP : 320;
    row.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  return (
    <Band tone="dark" tuck id="ecosystem" className={`scroll-mt-16 ${DARK_PB_SCOOP}`}>
      <Reveal>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[640px]">
            <WipeText
              as="h2"
              tone="dark"
              lines={["Built on Hedera"]}
              className="display-2 text-fl-fg"
            />
            <p className="mt-4 text-[1.05rem] leading-[1.65] text-fl-fg2">
              Every integration owns a specific job in the settlement loop. The pill on each card
              is the real status: {summary}
            </p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              aria-label="Scroll integrations left"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-fl-borderHi bg-fl-card text-fl-fg transition-colors hover:bg-fl-raised"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              aria-label="Scroll integrations right"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-fl-borderHi bg-fl-card text-fl-fg transition-colors hover:bg-fl-raised"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Reveal>

      {/* §9.4 marquee: `.ecosystem-row` is the scroll container (chevrons, swipe, reduced-motion
          snap list); `.ecosystem-track` is the animated strip holding the six cards plus one
          aria-hidden clone so the −50% loop is seamless. Hover / focus-within pauses it. */}
      <div
        ref={rowRef}
        role="group"
        aria-label="Ecosystem integrations"
        tabIndex={0}
        data-paused={paused || undefined}
        className="ecosystem-row -mx-6 mt-10 px-6 pb-4 pt-2 md:mx-0 md:px-0"
      >
        <ul className="ecosystem-track">
          {sponsors.map((sponsor) => (
            <SponsorCard key={sponsor.name} sponsor={sponsor} />
          ))}
          {sponsors.map((sponsor) => (
            <SponsorCard key={`${sponsor.name}-clone`} sponsor={sponsor} decorative />
          ))}
        </ul>
      </div>
    </Band>
  );
}
