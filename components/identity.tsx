import * as React from "react";

import { cn, shortAddress } from "@/lib/utils";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Gradient pairs drawn from the fl palette so every avatar sits in the same family. */
const PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["#079ab7", "#0b3a4a"],
  ["#079ab7", "#10b981"],
  ["#10b981", "#064e3b"],
  ["#f59e0b", "#7c2d12"],
  ["#6366f1", "#079ab7"],
  ["#ef4444", "#7f1d1d"],
  ["#a3a3a3", "#262626"],
  ["#22d3ee", "#079ab7"],
];

const SIZES = {
  sm: "h-7 w-7 text-[0.6rem]",
  md: "h-9 w-9 text-[0.68rem]",
  lg: "h-12 w-12 text-sm",
} as const;

export interface AgentAvatarProps {
  seed: string;
  label?: string | null;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Deterministic identicon: a circular gradient derived from the address bytes. */
export function AgentAvatar({
  seed,
  label,
  avatarUrl,
  size = "md",
  className,
}: AgentAvatarProps) {
  const h = hash(seed.toLowerCase());
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = 100 + (h % 160);
  const initials = (label ?? seed.replace(/^0x/, ""))
    .replace(/\.eth$/i, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "border border-[color:var(--c-border-hi)] font-mono font-semibold text-white",
        SIZES[size],
        className,
      )}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` }}
      aria-hidden="true"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]">{initials}</span>
      )}
    </span>
  );
}

export interface ShortAddressProps extends React.HTMLAttributes<HTMLSpanElement> {
  address: string;
  /** Show the full address on hover (default true). */
  full?: boolean;
}

/** Mono `0x1234…cdef` — the full address stays in the title for copy/inspect. */
export function ShortAddress({ address, full = true, className, ...props }: ShortAddressProps) {
  return (
    <span
      className={cn("font-mono text-[0.8rem] tabular-nums fg-2", className)}
      title={full ? address : undefined}
      {...props}
    >
      {shortAddress(address)}
    </span>
  );
}

export interface IdentityProps {
  seed: string;
  /** ENS name when resolved; falls back to the short address. */
  name?: string | null;
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Avatar + primary name (ENS or short address) + secondary short address when a name exists. */
export function Identity({ seed, name, avatarUrl, size = "md", className }: IdentityProps) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <AgentAvatar seed={seed} label={name} avatarUrl={avatarUrl} size={size} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13.5px] font-medium fg">
          {name ?? <ShortAddress address={seed} className="fg" />}
        </span>
        {name ? <ShortAddress address={seed} className="text-[11px]" /> : null}
      </span>
    </span>
  );
}
