import * as React from "react";

import { cn } from "@/lib/utils";

export interface LogoMarkProps {
  /** Rendered box size in px. */
  size?: number;
  /** Use on white surfaces: the dark-ink variant of the mark. */
  light?: boolean;
  className?: string;
}

/** The Aetheris mark (square), transparent background, in the variant for the surface it sits on. */
export function LogoMark({ size = 28, light = false, className }: LogoMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={light ? "/brand/mark-light.png" : "/brand/mark-dark.png"}
      alt="Aetheris"
      width={size}
      height={size}
      decoding="async"
      className={cn("shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}

export interface LogoProps extends LogoMarkProps {
  /** Hide the wordmark (icon-rail sidebars). */
  wordmark?: boolean;
}

/** Mark + wordmark lockup. `size` is the rendered height in px. */
export function Logo({ size = 28, light = false, wordmark = true, className }: LogoProps) {
  if (!wordmark) return <LogoMark size={size} light={light} className={className} />;
  const src = light ? "/brand/wordmark-light.png" : "/brand/wordmark-dark.png";
  const srcSet = `${src} 1x, ${src.replace(".png", "@2x.png")} 2x`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={srcSet}
      alt="Aetheris"
      height={size}
      decoding="async"
      className={cn("block w-auto shrink-0 select-none", className)}
      style={{ height: size, width: "auto" }}
    />
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
