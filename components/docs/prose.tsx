import * as React from "react";
import Link from "next/link";

import { cn, shortAddress } from "@/lib/utils";

/**
 * Typography primitives for `/docs`. All server-safe: no hooks, no handlers.
 * Classes are baked in so content pages stay plain JSX with no styling
 * decisions of their own.
 */

type Div = React.HTMLAttributes<HTMLDivElement>;
type Heading = React.HTMLAttributes<HTMLHeadingElement>;
type Para = React.HTMLAttributes<HTMLParagraphElement>;

/** Article wrapper: 760px measure, dark ground, Inter body. */
export function Prose({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <article
      className={cn("w-full max-w-[760px] min-w-0 pb-16 font-sans text-fl-fg", className)}
      {...props}
    />
  );
}

export function H1({ className, ...props }: Heading) {
  return (
    <h1
      className={cn(
        "font-display text-[2.4rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-white",
        className,
      )}
      {...props}
    />
  );
}

/** Section heading with a hairline above - the page's main rhythm. */
export function H2({ className, ...props }: Heading) {
  return (
    <h2
      className={cn(
        "mt-12 border-t border-fl-border pt-8 font-display text-[1.5rem] font-bold leading-[1.25] tracking-[-0.02em] text-white",
        className,
      )}
      {...props}
    />
  );
}

export function H3({ className, ...props }: Heading) {
  return (
    <h3
      className={cn(
        "mt-8 font-display text-[1.1rem] font-bold leading-[1.3] tracking-[-0.01em] text-white",
        className,
      )}
      {...props}
    />
  );
}

/** Body paragraph. `<strong>` inside renders white. */
export function P({ className, ...props }: Para) {
  return (
    <p
      className={cn(
        "mt-4 text-[1.02rem] leading-[1.7] text-fl-fg2 [&_strong]:font-semibold [&_strong]:text-white",
        className,
      )}
      {...props}
    />
  );
}

/** Lede under the H1: slightly larger, no top hairline. */
export function Lede({ className, ...props }: Para) {
  return (
    <p
      className={cn("mt-4 text-[1.12rem] leading-[1.65] text-fl-fg2 [&_strong]:text-white", className)}
      {...props}
    />
  );
}

export function UL({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      className={cn(
        "mt-4 list-disc space-y-2 pl-6 text-[1.02rem] leading-[1.7] text-fl-fg2 marker:text-fl-dim [&_strong]:font-semibold [&_strong]:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function OL({ className, ...props }: React.OlHTMLAttributes<HTMLOListElement>) {
  return (
    <ol
      className={cn(
        "mt-4 list-decimal space-y-2 pl-6 text-[1.02rem] leading-[1.7] text-fl-fg2 marker:font-mono marker:text-[0.85rem] marker:text-fl-dim [&_strong]:font-semibold [&_strong]:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function LI({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn("pl-1", className)} {...props} />;
}

/** Inline code chip. */
export function Code({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <code
      className={cn(
        "rounded-[6px] border border-fl-border bg-fl-raised px-1.5 py-0.5 font-mono text-[0.85em] text-fl-fg",
        className,
      )}
      {...props}
    />
  );
}

export interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
  /** Optional mono caption in the block's top-left (a filename, a shell, a language). */
  title?: string;
}

/** Code block. Scrolls horizontally inside itself; the page never does. */
export function Pre({ className, title, children, ...props }: PreProps) {
  return (
    <div className="mt-4 overflow-hidden rounded-[12px] border border-fl-border bg-fl-card">
      {title ? (
        <div className="flex items-center border-b border-fl-border px-4 py-2">
          <span className="mono-label">{title}</span>
        </div>
      ) : null}
      <pre
        className={cn(
          "overflow-x-auto p-4 font-mono text-[0.82rem] leading-[1.65] text-fl-fg",
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

export type CalloutTone = "note" | "warn";

export interface CalloutProps extends Div {
  tone?: CalloutTone;
  /** Mono label in the corner; defaults to NOTE / CAUTION. */
  label?: string;
}

/** Side note. `warn` is for honest limits and footguns, not for decoration. */
export function Callout({ tone = "note", label, className, children, ...props }: CalloutProps) {
  const warn = tone === "warn";
  return (
    <aside
      className={cn(
        "mt-6 rounded-[12px] border bg-fl-card p-4 pl-5 text-[0.95rem] leading-[1.65] text-fl-fg2 [&_strong]:font-semibold [&_strong]:text-white",
        warn ? "border-fl-warn/40 border-l-2 border-l-fl-warn" : "border-fl-border border-l-2 border-l-fl-accent",
        className,
      )}
      {...props}
    >
      <span className={cn("mono-label block", warn ? "!text-fl-warn" : "!text-fl-accent")}>
        {label ?? (warn ? "Caution" : "Note")}
      </span>
      <div className="mt-1.5">{children}</div>
    </aside>
  );
}

export interface KVRow {
  key: React.ReactNode;
  value: React.ReactNode;
}

export interface KVProps extends React.TableHTMLAttributes<HTMLTableElement> {
  rows: ReadonlyArray<KVRow>;
  /** Accessible caption (visually hidden). */
  caption?: string;
}

/** Two-column key/value table with hairline rows. Values may be links, addresses, chips. */
export function KV({ rows, caption, className, ...props }: KVProps) {
  return (
    <div className="mt-6 w-full overflow-x-auto rounded-[12px] border border-fl-border bg-fl-card">
      <table className={cn("w-full table-fixed border-collapse text-left text-[0.95rem]", className)} {...props}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-fl-border last:border-b-0">
              <th
                scope="row"
                className="w-[38%] align-top px-4 py-3 font-sans font-medium text-fl-fg2"
              >
                {row.key}
              </th>
              <td className="align-top px-4 py-3 text-fl-fg [overflow-wrap:anywhere]">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface AProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/** Accent link. Internal hrefs use `next/link`; external ones open in a new tab. */
export function A({ href, className, children, ...props }: AProps) {
  const external = /^(https?:)?\/\//.test(href) || href.startsWith("mailto:");
  const classes = cn(
    "text-fl-accent underline decoration-fl-accent/40 underline-offset-[3px] transition-colors hover:text-white hover:decoration-white/50",
    className,
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={classes} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {children}
    </Link>
  );
}

export type HashScanKind = "contract" | "account" | "token" | "topic" | "transaction";

export interface AddrProps {
  /** EVM address or Hedera id (0.0.x). */
  value: string;
  /** Which HashScan page to link to. */
  kind?: HashScanKind;
  /** Render the 0x1234…abcd form instead of the full value. */
  short?: boolean;
  /** Override the link target entirely. */
  href?: string;
  className?: string;
}

export function hashscanUrl(value: string, kind: HashScanKind = "contract"): string {
  return `https://hashscan.io/testnet/${kind}/${value}`;
}

/** Mono address linking to HashScan. Full by default; `short` for tight spots. */
export function Addr({ value, kind = "contract", short = false, href, className }: AddrProps) {
  return (
    <a
      href={href ?? hashscanUrl(value, kind)}
      target="_blank"
      rel="noreferrer noopener"
      title={value}
      className={cn(
        "data-mono break-all text-fl-accent underline decoration-fl-accent/40 underline-offset-[3px] transition-colors hover:text-white",
        className,
      )}
    >
      {short ? shortAddress(value) : value}
    </a>
  );
}
