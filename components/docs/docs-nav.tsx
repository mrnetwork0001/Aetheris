"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { DOCS_TOC, isDocsActive, prevNext } from "./toc";

/**
 * Grouped docs table of contents. Client-only because the active item needs
 * the pathname; everything else is plain links that work before hydration.
 */
function TocList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-6">
      {DOCS_TOC.map((group) => (
        <div key={group.group}>
          <p className="mono-label px-3">{group.group}</p>
          <ul className="mt-2 flex flex-col">
            {group.items.map((item) => {
              const active = isDocsActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "block border-l-2 py-1.5 pl-3 pr-2 text-[0.9rem] leading-snug transition-colors",
                      active
                        ? "rounded-r-[8px] border-fl-accent bg-fl-raised font-medium text-fl-accent"
                        : "border-fl-border text-fl-fg2 hover:border-fl-borderHi hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Sticky sidebar on `md+`; a native `<details>` drawer titled "On this site" below it. */
export function DocsNav() {
  const ref = React.useRef<HTMLDetailsElement>(null);
  return (
    <>
      <nav aria-label="Docs" className="hidden md:block">
        <TocList />
      </nav>

      <details
        ref={ref}
        className="group rounded-[12px] border border-fl-border bg-fl-card md:hidden"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="mono-label !text-fl-fg2">On this site</span>
          <span
            aria-hidden="true"
            className="font-mono text-[0.75rem] text-fl-dim transition-transform group-open:rotate-90"
          >
            &gt;
          </span>
        </summary>
        <nav aria-label="Docs" className="border-t border-fl-border px-2 pb-4 pt-4">
          <TocList
            onNavigate={() => {
              if (ref.current) ref.current.open = false;
            }}
          />
        </nav>
      </details>
    </>
  );
}

/** Prev / next strip for the bottom of every docs page. */
export function DocsPager({ className }: { className?: string }) {
  const pathname = usePathname();
  const { prev, next } = prevNext(pathname);
  if (!prev && !next) return null;
  return (
    <nav
      aria-label="Previous and next page"
      className={cn("grid gap-3 border-t border-fl-border pt-6 sm:grid-cols-2", className)}
    >
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-1 rounded-[12px] border border-fl-border bg-fl-card px-4 py-3 transition-colors hover:border-fl-borderHi"
        >
          <span className="mono-label inline-flex items-center gap-1.5">
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Previous
          </span>
          <span className="text-[0.95rem] font-medium text-fl-fg2 transition-colors group-hover:text-white">
            {prev.label}
          </span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-1 rounded-[12px] border border-fl-border bg-fl-card px-4 py-3 text-right transition-colors hover:border-fl-borderHi"
        >
          <span className="mono-label inline-flex items-center gap-1.5">
            Next
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </span>
          <span className="text-[0.95rem] font-medium text-fl-fg2 transition-colors group-hover:text-white">
            {next.label}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
