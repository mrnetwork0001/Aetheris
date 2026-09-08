import * as React from "react";

import { cn } from "@/lib/utils";

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const PALETTES: ReadonlyArray<readonly [string, string]> = [
  ["#6d7cff", "#38e8ff"],
  ["#38e8ff", "#7cf5c8"],
  ["#ffc857", "#ff7a59"],
  ["#a78bfa", "#6d7cff"],
  ["#f472b6", "#a78bfa"],
  ["#34d399", "#38e8ff"],
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

/** Deterministic identicon: a gradient orb derived from the address bytes. */
export function AgentAvatar({
  seed,
  label,
  avatarUrl,
  size = "md",
  className,
}: AgentAvatarProps) {
  const h = hash(seed.toLowerCase());
  const [from, to] = PALETTES[h % PALETTES.length];
  const angle = h % 360;
  const initials = (label ?? seed.replace(/^0x/, ""))
    .replace(/\.eth$/i, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "border border-white/15 font-semibold text-black/70",
        SIZES[size],
        className,
      )}
      style={{ backgroundImage: `conic-gradient(from ${angle}deg, ${from}, ${to}, ${from})` }}
      aria-hidden="true"
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        initials
      )}
    </span>
  );
}
