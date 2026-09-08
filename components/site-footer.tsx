import Link from "next/link";

import { AetherisMark } from "./logo";

const SPONSORS: ReadonlyArray<{ name: string; role: string; href: string }> = [
  { name: "Hedera", role: "EVM · HTS · HCS", href: "https://hedera.com" },
  { name: "The Graph", role: "Subgraph analytics", href: "https://thegraph.com" },
  { name: "World ID", role: "Proof of personhood", href: "https://world.org" },
  { name: "1inch", role: "Swap API v6.0", href: "https://1inch.io" },
  { name: "Privy", role: "Passkey wallets", href: "https://privy.io" },
  { name: "ENS", role: "Agent identity", href: "https://ens.domains" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-24 border-t border-white/[0.07]">
      <div className="aether-container py-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <AetherisMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-[0.18em] text-white">AETHERIS</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Autonomous DeAI Agency &amp; Micro-Treasury Operating System. Built for ETHOnline
              2026. Sub-second settlement on Hedera, verifiable human governance via World ID.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
            {SPONSORS.map((sponsor) => (
              <a
                key={sponsor.name}
                href={sponsor.href}
                target="_blank"
                rel="noreferrer noopener"
                className="group rounded-lg py-0.5"
              >
                <span className="block text-xs font-medium text-slate-300 transition-colors group-hover:text-aether-cyan">
                  {sponsor.name}
                </span>
                <span className="block text-[0.68rem] text-slate-500">{sponsor.role}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-[0.7rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Apache 2.0 · Ifeanyichukwu Onwo · ETHOnline 2026</p>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="transition-colors hover:text-slate-300">
              Mission Control
            </Link>
            <a
              href="https://github.com/mrnetwork/Aetheris"
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-slate-300"
            >
              Source
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
