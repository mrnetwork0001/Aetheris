import Link from "next/link";

import { Logo } from "@/components/logo";

import {
  DOCS,
  ETHONLINE,
  GITHUB,
  GITHUB_CONTRACTS,
  GITHUB_SEED,
  GITHUB_SUBGRAPH,
  HASHSCAN_AGENCY,
  X_PROFILE,
} from "./links";

interface FooterLink {
  label: string;
  href: string;
  icon?: string;
  external?: boolean;
}

const COLUMNS: ReadonlyArray<{ heading: string; links: readonly FooterLink[] }> = [
  {
    heading: "Protocol",
    links: [
      { label: "Contracts", href: GITHUB_CONTRACTS, external: true },
      { label: "Subgraph", href: GITHUB_SUBGRAPH, external: true },
      { label: "Seed script", href: GITHUB_SEED, external: true },
    ],
  },
  {
    heading: "Ecosystem",
    links: [
      { label: "Hedera", icon: "/partners/hedera.png", href: "https://hedera.com", external: true },
      { label: "The Graph", icon: "/partners/thegraph.png", href: "https://thegraph.com", external: true },
      { label: "World ID", icon: "/partners/worldid.png", href: "https://world.org/world-id", external: true },
      { label: "1inch", icon: "/partners/oneinch.png", href: "https://1inch.io", external: true },
      { label: "Privy", icon: "/partners/privy.png", href: "https://privy.io", external: true },
      { label: "ENS", icon: "/partners/ens.png", href: "https://ens.domains", external: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: DOCS, external: true },
      { label: "GitHub", href: GITHUB, external: true },
      { label: "HashScan", href: HASHSCAN_AGENCY, external: true },
      { label: "ETHOnline", href: ETHONLINE, external: true },
    ],
  },
];

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-fl-raised bg-fl-bg px-6 py-12 text-fl-fg md:px-[80px] md:py-[60px]">
      <div className="fl-container">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="max-w-[300px]">
            <Link href="/" aria-label="Aetheris home" className="inline-block rounded-md">
              <Logo size={28} />
            </Link>
            <p className="mt-4 text-[0.85rem] leading-[1.6] text-fl-fg2">
              Autonomous AI agencies with a treasury on Hedera. Escrowed jobs, HTS
              micro-settlement, HCS-anchored audit trail.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <a
                href={X_PROFILE}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Aetheris on X"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-fl-border text-fl-fg2 transition-colors hover:border-fl-borderHi hover:text-fl-fg"
              >
                <XIcon className="h-4 w-4" />
              </a>
              <a
                href={GITHUB}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Aetheris on GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-fl-border text-fl-fg2 transition-colors hover:border-fl-borderHi hover:text-fl-fg"
              >
                <GitHubIcon className="h-4 w-4" />
              </a>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="mono-label">{column.heading}</p>
              <ul className="mt-3 space-y-1.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      target={link.external ? "_blank" : undefined}
                      rel={link.external ? "noreferrer noopener" : undefined}
                      className="text-[0.88rem] text-fl-fg2 transition-colors hover:text-fl-fg"
                    >
                      {link.icon ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={link.icon} alt="" width={16} height={16} className="mr-2 inline-block h-4 w-4 rounded-[4px] align-[-3px] object-cover" loading="lazy" />
                      ) : null}
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

      </div>
    </footer>
  );
}
