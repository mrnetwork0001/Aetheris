import * as React from "react";

import { cn } from "@/lib/utils";

export interface LogoMarkProps {
  /** Rendered box size in px. */
  size?: number;
  /** Use on white bands: the core turns near-black so the mark keeps its contrast. */
  light?: boolean;
  className?: string;
}

/**
 * Geometric mark: an accent ring with a solid core and a single notch that
 * reads as the "settlement path" leaving the ring. No gradients, no ids -
 * safe to render any number of times on one page.
 */
export function LogoMark({ size = 28, light = false, className }: LogoMarkProps) {
  const core = light ? "#111111" : "#ffffff";
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="Aetheris"
      className={cn("shrink-0", className)}
    >
      <circle cx="16" cy="16" r="12.5" fill="none" stroke="#079ab7" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="5.4" fill={core} />
      <path d="M22.6 9.4 28 4" stroke={core} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="28" cy="4" r="2.2" fill="#079ab7" />
    </svg>
  );
}

export interface LogoProps extends LogoMarkProps {
  /** Hide the wordmark (icon-rail sidebars). */
  wordmark?: boolean;
}

/** Mark + "Aetheris" wordmark in Montserrat 700. */
export function Logo({ size = 28, light = false, wordmark = true, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} light={light} />
      {wordmark ? (
        <span
          className="font-display font-bold leading-none tracking-[-0.02em]"
          style={{ fontSize: `${Math.round(size * 0.68)}px`, color: light ? "#111111" : "#ffffff" }}
        >
          Aetheris
        </span>
      ) : null}
    </span>
  );
}

/** @deprecated legacy name; renders `LogoMark`. */
export function AetherisMark({ className }: { className?: string }) {
  return <LogoMark className={className} />;
}

/** @deprecated legacy name; renders `Logo`. */
export function AetherisWordmark({ className }: { className?: string }) {
  return <Logo className={className} />;
}
