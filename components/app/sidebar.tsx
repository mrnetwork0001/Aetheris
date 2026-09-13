"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { ConnectButton } from "@/components/connect-button";
import { LogoMark } from "@/components/logo";

import { isActive, navItems, type NavItem } from "./nav-items";
import { RoleToggle } from "./role-toggle";

const COLLAPSE_KEY = "aetheris.sidebar";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "collapsed" : "open");
  } catch {
    /* storage unavailable */
  }
}

/** Tracks `location.hash` so `/dashboard#jobs`-style items can show an active state. */
export function useHash(): [string, (next: string) => void] {
  const [hash, setHash] = React.useState("");
  React.useEffect(() => {
    const sync = () => setHash(window.location.hash.replace(/^#/, ""));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  return [hash, setHash];
}

export interface NavLinksProps {
  items: NavItem[];
  collapsed?: boolean;
  onNavigate?: (item: NavItem) => void;
}

export function NavLinks({ items, collapsed = false, onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  const [hash, setHash] = useHash();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(item, pathname, hash);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.label : undefined}
              onClick={() => {
                setHash(item.hash);
                onNavigate?.(item);
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-[10px] text-[13.5px] font-medium transition-colors",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                active
                  ? "bg-fl-raised text-white"
                  : "fg-2 hover:bg-[#0f0f0f] hover:text-white",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface SidebarProps {
  agencyAddress: string;
}

/** 216px sidebar, collapsible to a 64px icon rail. Desktop only (`md:`). */
export function Sidebar({ agencyAddress }: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const items = React.useMemo(() => navItems(agencyAddress), [agencyAddress]);

  React.useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsed(next);
      return next;
    });
  }

  return (
    <aside
      aria-label="App navigation"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-fl-border bg-fl-card py-5 transition-[width] duration-200 md:flex",
        collapsed ? "w-16 px-2" : "w-[216px] px-3.5",
      )}
    >
      <div className={cn("flex items-center gap-2", collapsed ? "flex-col" : "justify-between")}>
        <Link
          href="/"
          className={cn("flex min-w-0 items-center gap-2.5 rounded-[8px]", collapsed && "justify-center")}
          aria-label="Aetheris home"
        >
          <LogoMark size={28} />
          {collapsed ? null : (
            <span className="min-w-0 leading-none">
              <span className="block font-display text-[15px] font-bold tracking-[-0.02em] text-white">
                Aetheris
              </span>
              <span className="mono-label mt-1 block whitespace-nowrap">Autonomous agency OS</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] fg-3 transition-colors hover:bg-fl-raised hover:text-white"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <RoleToggle compact={collapsed} className="mt-5" />

      <nav className="mt-5" aria-label="Primary">
        <NavLinks items={items} collapsed={collapsed} />
      </nav>

      <div className="mt-auto pt-6">
        {collapsed ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar to connect a wallet"
            title="Connect wallet"
            className="flex h-10 w-full items-center justify-center rounded-[10px] border border-fl-border bg-fl-card fg-2 transition-colors hover:border-fl-borderHi hover:text-white"
          >
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <div className="rounded-xl border border-fl-border bg-fl-card p-3">
            <p className="text-xs leading-relaxed fg-3">
              Connect a wallet to sweep margin or claim what your agents earned.
            </p>
            <div className="mt-3">
              <ConnectButton block />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
