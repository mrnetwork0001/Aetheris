import type { Metadata } from "next";
import Link from "next/link";

import { DocsNav, DocsPager } from "@/components/docs/docs-nav";
import { Logo } from "@/components/logo";
import { AGENCY_ADDRESS, GITHUB } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: {
    default: "Aetheris Docs",
    template: "%s · Aetheris Docs",
  },
  description:
    "How Aetheris escrows client jobs, pays sub-agents per task through the Hedera Token Service, anchors every step to the Hedera Consensus Service, and indexes the history with The Graph.",
};

const TOP_LINKS: ReadonlyArray<{ href: string; label: string; external?: boolean }> = [
  { href: "/dashboard", label: "App" },
  { href: `/agency/${AGENCY_ADDRESS}`, label: "Agency" },
  { href: "/dashboard#audit", label: "Audit" },
  { href: GITHUB, label: "GitHub", external: true },
];

/**
 * Docs shell: hairline top bar, a 280px sticky table of contents, and the
 * prose column. Server component; only the active-item highlight and the
 * prev/next pager read the pathname on the client.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dot-grid flex min-h-screen flex-col bg-fl-bg text-fl-fg">
      <header className="sticky top-0 z-40 border-b border-fl-border bg-fl-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Aetheris home" className="shrink-0 rounded-md">
              <Logo size={24} />
            </Link>
            <span aria-hidden="true" className="h-4 w-px bg-fl-borderHi" />
            <Link href="/docs" className="mono-label !text-fl-fg2 transition-colors hover:!text-white">
              Docs
            </Link>
          </div>
          <nav aria-label="Site">
            <ul className="flex items-center gap-1">
              {TOP_LINKS.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mono-label block rounded-[8px] px-2.5 py-2 !text-fl-fg2 transition-colors hover:bg-fl-raised hover:!text-white"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="mono-label block rounded-[8px] px-2.5 py-2 !text-fl-fg2 transition-colors hover:bg-fl-raised hover:!text-white"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1280px] flex-1 gap-8 px-5 py-8 md:grid-cols-[280px_minmax(0,1fr)] md:gap-12 md:px-8 md:py-12">
        <aside className="md:sticky md:top-24 md:self-start md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:pr-2">
          <DocsNav />
        </aside>

        <main id="main" className="min-w-0">
          {children}
          <DocsPager className="mt-12 max-w-[760px]" />
        </main>
      </div>

      <footer className="border-t border-fl-border bg-fl-bg">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-5 py-6 text-[0.8rem] text-fl-dim sm:flex-row sm:items-center sm:justify-between md:px-8">
          <span>Aetheris - Apache-2.0 - built for ETHOnline 2026 by Ifeanyichukwu Onwo.</span>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer noopener"
            className="mono-label transition-colors hover:!text-white"
          >
            github.com/mrnetwork0001/Aetheris
          </a>
        </div>
      </footer>
    </div>
  );
}
