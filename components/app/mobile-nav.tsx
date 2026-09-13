"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { ConnectButton } from "@/components/connect-button";
import { Logo } from "@/components/logo";

import { navItems } from "./nav-items";
import { RoleToggle } from "./role-toggle";
import { NavLinks } from "./sidebar";

export interface MobileNavProps {
  agencyAddress: string;
}

/**
 * Top bar for viewports below `md`. The menu is a native `<details>` so it
 * opens without JavaScript; JS only closes it after a link is chosen.
 *
 * The brand link is a sibling of the disclosure, not a child of `<summary>`,
 * so the bar exposes exactly two focus stops: the home link and the toggle.
 */
export function MobileNav({ agencyAddress }: MobileNavProps) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  const items = React.useMemo(() => navItems(agencyAddress), [agencyAddress]);

  return (
    <div className="sticky top-0 z-40 border-b border-fl-border bg-fl-card md:hidden">
      <Link
        href="/"
        className="absolute left-5 top-0 z-10 flex h-14 items-center gap-2.5 rounded-[8px]"
        aria-label="Aetheris home"
      >
        <Logo size={22} />
        <span className="leading-none">
          <span className="block font-display text-[15px] font-bold tracking-[-0.02em] text-white">
            Aetheris
          </span>
          <span className="mono-label mt-1 block">Autonomous agency OS</span>
        </span>
      </Link>

      <details ref={ref} className="group">
        <summary
          className="flex h-14 cursor-pointer list-none items-center justify-end px-5 [&::-webkit-details-marker]:hidden"
          aria-label="Toggle navigation"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-fl-border fg-2 group-open:text-white">
            <Menu className="h-4 w-4 group-open:hidden" aria-hidden="true" />
            <X className="hidden h-4 w-4 group-open:block" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t border-fl-border px-4 pb-4 pt-3">
          <RoleToggle />
          <nav className="mt-3" aria-label="Primary">
            <NavLinks
              items={items}
              onNavigate={() => {
                if (ref.current) ref.current.open = false;
              }}
            />
          </nav>
          <div className="mt-3 rounded-xl border border-fl-border bg-fl-card p-3">
            <p className="text-xs leading-relaxed fg-3">
              Connect a wallet to sweep margin or claim what your agents earned.
            </p>
            <div className="mt-3">
              <ConnectButton block />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
