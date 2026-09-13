/**
 * Single source of truth for the docs sidebar. Every `/docs/<slug>` page must
 * appear here exactly once; the layout's prev/next footer is derived from the
 * flattened order, so the order of groups and items is the reading order.
 */
export interface DocsTocItem {
  href: string;
  label: string;
}

export interface DocsTocGroup {
  group: string;
  items: ReadonlyArray<DocsTocItem>;
}

export const DOCS_TOC: ReadonlyArray<DocsTocGroup> = [
  {
    group: "Getting started",
    items: [
      { href: "/docs", label: "Welcome to Aetheris" },
      { href: "/docs/how-it-works", label: "How it works" },
    ],
  },
  {
    group: "Protocol",
    items: [
      { href: "/docs/jobs-and-escrow", label: "Jobs & escrow" },
      { href: "/docs/settlement", label: "Settlement rails" },
      { href: "/docs/audit-log", label: "Audit log" },
      { href: "/docs/contracts-and-api", label: "Contracts & HTTP API" },
    ],
  },
  {
    group: "Data",
    items: [{ href: "/docs/subgraph", label: "The Graph subgraph" }],
  },
  {
    group: "Roles",
    items: [
      { href: "/docs/operator", label: "The operator" },
      { href: "/docs/client", label: "The client" },
    ],
  },
  {
    group: "Integrations",
    items: [{ href: "/docs/integrations", label: "World ID, 1inch, Privy, ENS" }],
  },
  {
    group: "Operate",
    items: [{ href: "/docs/self-hosting", label: "Self-hosting & deployment" }],
  },
  {
    group: "Trust",
    items: [{ href: "/docs/trust-and-faq", label: "Trust model & FAQ" }],
  },
];

/** Every page in reading order. */
export const DOCS_PAGES: ReadonlyArray<DocsTocItem> = DOCS_TOC.flatMap((group) => group.items);

/** Strip a trailing slash (but keep `/`) and any hash/query so lookups match `href` exactly. */
export function normalizeDocsPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  const bare = pathname.split(/[?#]/)[0] ?? "";
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

/** True when `pathname` is the page at `href`. `/docs` matches only itself. */
export function isDocsActive(href: string, pathname: string | null | undefined): boolean {
  return normalizeDocsPath(pathname) === href;
}

export interface PrevNext {
  prev: DocsTocItem | null;
  next: DocsTocItem | null;
}

/** Neighbours of `pathname` in reading order. Unknown paths get no neighbours. */
export function prevNext(pathname: string | null | undefined): PrevNext {
  const current = normalizeDocsPath(pathname);
  const index = DOCS_PAGES.findIndex((page) => page.href === current);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? DOCS_PAGES[index - 1] ?? null : null,
    next: index < DOCS_PAGES.length - 1 ? DOCS_PAGES[index + 1] ?? null : null,
  };
}
