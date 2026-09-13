import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Band } from "@/components/ui/section-band";

import {
  AGENCY_ADDRESS,
  HASHSCAN_AGENCY,
  HASHSCAN_TREASURY,
  LAUNCH_APP,
  TREASURY_ADDRESS,
} from "./links";
import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

const CONTRACTS: ReadonlyArray<{ label: string; address: string; href: string }> = [
  { label: "AetherisAgency", address: AGENCY_ADDRESS, href: HASHSCAN_AGENCY },
  { label: "AetherisTreasury", address: TREASURY_ADDRESS, href: HASHSCAN_TREASURY },
];

export function Cta() {
  return (
    <Band tone="light" scoop="tr" tuck id="contracts" className="scroll-mt-16">
      <Reveal className="mx-auto max-w-[680px] text-center">
        <WipeText
          as="h2"
          tone="light"
          lines={["See what the", "contract does"]}
          className="display-2 text-light-heading"
        />
        <p className="mt-5 text-[1.05rem] leading-[1.65] text-light-body">
          AetherisAgency and AetherisTreasury are deployed on Hedera testnet and seeded with four
          jobs across every lifecycle state. Three settlements went through HTS, two through the
          ERC-20 fallback. Read the contracts on HashScan before you read our copy.
        </p>
        <div className="mt-8">
          <Link href={LAUNCH_APP} className="btn btn-primary btn-lg">
            Launch App
          </Link>
        </div>
        <ul className="mt-10 flex flex-col items-center gap-3">
          {CONTRACTS.map((item) => (
            <li key={item.label} className="w-full max-w-[560px]">
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer noopener"
                className="data-mono flex items-center justify-between gap-3 rounded-[10px] border border-light-border bg-white px-4 py-3 text-light-heading transition-colors hover:border-fl-accent"
              >
                <span className="shrink-0 text-[var(--light-muted)]">{item.label}</span>
                <span className="min-w-0 truncate">{item.address}</span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-fl-accentInk"
                />
              </a>
            </li>
          ))}
        </ul>
      </Reveal>
    </Band>
  );
}
