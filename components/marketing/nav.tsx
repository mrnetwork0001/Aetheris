"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

import { LAUNCH_APP, NAV_LINKS } from "./links";

/** DESIGN.md §9.9 — the nav turns solid once the page has scrolled past this. */
const SCROLL_THRESHOLD = 24;

/**
 * Sticky marketing nav (DESIGN.md §9.9). Transparent over the white hero;
 * after `scrollY > 24` it gets a translucent white ground, backdrop blur and
 * a hairline so it reads over every band. The nav stays light
 * throughout, so we do too — no dark swap. Everything is a plain link, so
 * the header works before hydration.
 */
export function Nav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      setScrolled(window.scrollY > SCROLL_THRESHOLD);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "on-light sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        open
          ? "border-black/10 bg-white"
          : scrolled
            ? "border-black/10 bg-white/85 backdrop-blur"
            : "border-transparent bg-transparent",
      )}
    >
      <div className="fl-wrap flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="Aetheris home" className="rounded-md">
          <Logo size={28} light />
        </Link>

        <div className="flex items-center gap-4">
          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((item) => (
                <li key={item.href}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md px-3 py-2 text-[0.9rem] font-medium text-light-body transition-colors hover:text-light-heading"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <a
                      href={item.href}
                      className="rounded-md px-3 py-2 text-[0.9rem] font-medium text-light-body transition-colors hover:text-light-heading"
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-light-border bg-white text-light-heading transition-colors hover:bg-light-pill md:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        id="marketing-mobile-menu"
        hidden={!open}
        className="border-t border-light-border bg-white md:hidden"
      >
        <nav aria-label="Mobile" className="fl-wrap py-3">
          <ul className="space-y-1">
            {NAV_LINKS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noreferrer noopener" : undefined}
                  onClick={() => setOpen(false)}
                  className="block rounded-[10px] px-3 py-2.5 text-[0.95rem] font-medium text-light-heading transition-colors hover:bg-light-pill"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href={LAUNCH_APP}
            onClick={() => setOpen(false)}
            className="btn btn-primary mt-3 w-full"
          >
            Launch App
          </Link>
        </nav>
      </div>
    </header>
  );
}
