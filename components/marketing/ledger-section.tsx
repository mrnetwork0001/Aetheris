import { Anchor, Scale, ShieldCheck, type LucideIcon } from "lucide-react";

import { Band } from "@/components/ui/section-band";
import { Card } from "@/components/ui/card";

import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

interface Guarantee {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
}

const GUARANTEES: readonly Guarantee[] = [
  {
    icon: Anchor,
    title: "HCS anchoring",
    body: (
      <>
        <code className="mono text-[0.85em]">completeTask</code> requires a Hedera topic id and
        sequence number, then emits <code className="mono text-[0.85em]">HcsLogAnchored</code> so
        the subgraph can join the task to the mirror-node stream.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Nullifier replay protection",
    body: (
      <>
        <code className="mono text-[0.85em]">verifyOperator</code> burns the World ID nullifier
        before any external call. A reused nullifier reverts with{" "}
        <code className="mono text-[0.85em]">NullifierAlreadyUsed</code> - in bypass mode too.
      </>
    ),
  },
  {
    icon: Scale,
    title: "Solvency floor",
    body: (
      <>
        <code className="mono text-[0.85em]">recordEscrow</code> re-reads the treasury&apos;s real
        balance and reverts with <code className="mono text-[0.85em]">SolvencyCheckFailed</code>{" "}
        unless it covers live escrow plus retained margin.
      </>
    ),
  },
];

/** Composed mark: an isometric cube in the accent, standing in for a product image. */
function LedgerCube() {
  return (
    <svg
      viewBox="0 0 200 200"
      className="h-[58%] w-[58%]"
      role="img"
      aria-label="Aetheris ledger mark"
    >
      <g transform="translate(100 104)">
        <polygon points="0,-72 62,-36 0,0 -62,-36" fill="#079ab7" />
        <polygon points="-62,-36 0,0 0,72 -62,36" fill="#047a91" />
        <polygon points="62,-36 0,0 0,72 62,36" fill="#111111" />
        <polygon points="0,-72 62,-36 0,0 -62,-36" fill="none" stroke="#ffffff" strokeOpacity="0.5" />
        <line x1="0" y1="0" x2="0" y2="72" stroke="#ffffff" strokeOpacity="0.35" />
        <circle cx="0" cy="-36" r="6" fill="#ffffff" />
        <circle cx="0" cy="36" r="4" fill="#079ab7" />
      </g>
    </svg>
  );
}

export function LedgerSection() {
  return (
    <Band tone="light" scoop="bl" id="ledger" className="scroll-mt-16 pt-0">
      <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <Reveal className="flex justify-center lg:justify-start">
          {/* §9.6: perspective stage → soft ground shadow → mark spinning in the Z-plane. */}
          <div className="cube-stage on-light relative flex aspect-square w-full max-w-[300px] items-center justify-center overflow-hidden rounded-[24px] border border-light-border bg-white shadow-[0_40px_80px_-36px_rgb(0_0_0/0.35)]">
            <span aria-hidden="true" className="cube-shadow" />
            <div className="cube-spin flex h-full w-full items-center justify-center">
              <LedgerCube />
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <WipeText
            as="h2"
            tone="light"
            lines={["Aetheris Ledger"]}
            className="display-2 text-light-heading"
          />
          <p className="mt-5 max-w-[560px] text-[1.05rem] leading-[1.65] text-light-body">
            Every settlement leaves two records: the contract event, and the Hedera Consensus
            Service anchor it references. The Graph indexes both, so the pipeline in Mission
            Control is reconciled from indexed events - not from a database the operator
            controls.
          </p>
        </Reveal>
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {GUARANTEES.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal key={item.title} delay={index * 0.06}>
              <Card className="h-full p-6 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.25)]">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-light-border bg-light-pill text-light-heading"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 font-display text-[1.05rem] font-bold text-light-heading">
                  {item.title}
                </h3>
                <p className="mt-2 text-[0.9rem] leading-[1.6] text-light-body">{item.body}</p>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </Band>
  );
}
