"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ConnectButton } from "./connect-button";
import { AetherisWordmark } from "./logo";
import { DEMO_AGENCY_ADDRESS } from "./aetheris-data";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/dashboard", label: "Mission Control" },
  { href: `/agency/${DEMO_AGENCY_ADDRESS}`, label: "Agency" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/agency")) return pathname.startsWith("/agency");
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-white/[0.08] bg-aether-void/80 backdrop-blur-xl"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="aether-container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="rounded-lg transition-opacity hover:opacity-85"
          aria-label="Aetheris home"
        >
          <AetherisWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-lg px-3 py-2 text-sm transition-colors",
                      active ? "text-white" : "text-slate-400 hover:text-slate-100",
                    )}
                  >
                    {item.label}
                    {active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-aether-cyan to-transparent"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08] md:hidden"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/[0.08] bg-aether-void/95 backdrop-blur-xl md:hidden">
          <nav aria-label="Mobile" className="aether-container py-3">
            <ul className="space-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                      isActive(item.href)
                        ? "bg-white/[0.06] text-white"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 sm:hidden">
              <ConnectButton />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
