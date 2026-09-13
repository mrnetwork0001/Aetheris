import {
  ArrowLeftRight,
  BookOpen,
  Briefcase,
  Building2,
  LayoutDashboard,
  Radio,
  Users,
  Vault,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pathname the item lives on; hash items share `/dashboard`. */
  pathname: string;
  /** Fragment (without `#`) for in-page sections; `""` for the page itself. */
  hash: string;
}

export function navItems(agencyAddress: string): NavItem[] {
  return [
    { href: "/dashboard", label: "Mission Control", icon: LayoutDashboard, pathname: "/dashboard", hash: "" },
    { href: "/dashboard#jobs", label: "Jobs", icon: Briefcase, pathname: "/dashboard", hash: "jobs" },
    { href: "/dashboard#agents", label: "Sub-agents", icon: Users, pathname: "/dashboard", hash: "agents" },
    { href: "/dashboard#treasury", label: "Treasury", icon: Vault, pathname: "/dashboard", hash: "treasury" },
    { href: "/dashboard#audit", label: "Audit log", icon: Radio, pathname: "/dashboard", hash: "audit" },
    { href: "/dashboard#swap", label: "Swap", icon: ArrowLeftRight, pathname: "/dashboard", hash: "swap" },
    {
      href: `/agency/${agencyAddress}`,
      label: "Agency",
      icon: Building2,
      pathname: "/agency",
      hash: "",
    },
    { href: "/docs", label: "Docs", icon: BookOpen, pathname: "/docs", hash: "" },
  ];
}

export function isActive(item: NavItem, pathname: string | null, hash: string): boolean {
  if (pathname === null) return false;
  if (item.pathname === "/agency") return pathname.startsWith("/agency");
  if (item.pathname === "/docs") return pathname === "/docs" || pathname.startsWith("/docs/");
  if (pathname !== item.pathname) return false;
  return hash === item.hash;
}
