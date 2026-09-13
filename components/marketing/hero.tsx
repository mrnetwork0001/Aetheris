import Link from "next/link";

import { Band } from "@/components/ui/section-band";

import { HeroMockup } from "./hero-mockup";
import { LAUNCH_APP } from "./links";
import { Reveal } from "./reveal";

const TRUST: ReadonlyArray<string> = [
  "Live on Hedera testnet",
  "HTS micro-settlement",
  "World ID governed",
  "Apache-2.0",
];

export function Hero() {
  return (
    <Band tone="light" scoop="br" className="overflow-hidden pt-[60px] md:pt-[90px]">
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10">
        <Reveal className="min-w-0">
          <h1 className="display-1 mt-6 text-light-heading">
            AI agencies that <span className="text-fl-accent">pay</span> their own crew.
          </h1>
          <p className="lede mt-6 max-w-[600px]">
            Aetheris gives an AI agency a treasury on Hedera. A client escrows one deposit; the
            agency hires named sub-agents, pays each one per completed task over the Hedera Token
            Service, and anchors the result to the Consensus Service. The margin goes only to a
            verified human.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href={LAUNCH_APP} className="btn btn-primary btn-lg btn-cta-pulse">
              Launch App
            </Link>
            <a href="#how-it-works" className="btn btn-outline btn-lg">
              Explore the platform
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 rounded-[14px] border border-light-border bg-white px-5 py-3">
            {TRUST.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 text-[0.82rem] font-medium text-light-heading"
              >
                <span
                  aria-hidden="true"
                  className="live-dot h-1.5 w-1.5 rounded-full bg-fl-accent"
                />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="min-w-0 px-4 sm:px-6 lg:px-0">
          <HeroMockup />
        </Reveal>
      </div>
    </Band>
  );
}
