import * as React from "react";

import { cn } from "@/lib/utils";

export type BandTone = "light" | "dark";
export type BandScoop = "br" | "tr" | "bl" | "tl" | "none";

export interface BandProps extends React.HTMLAttributes<HTMLElement> {
  tone: BandTone;
  scoop?: BandScoop;
  id?: string;
  /** Overlap the previous band by the scoop radius so the curve is cut into it (DESIGN.md §2). */
  tuck?: boolean;
  /** Wrap children in the 1200px `.fl-container`. Default true. */
  container?: boolean;
  as?: "section" | "div" | "header" | "footer";
}

/**
 * Full-bleed light/dark band with one optional 200px (96px mobile) scooped corner.
 * Light bands switch the contextual `--c-*` tokens so nested primitives recolour.
 */
export function Band({
  tone,
  scoop = "none",
  tuck = false,
  container = true,
  as: Tag = "section",
  className,
  children,
  ...props
}: BandProps) {
  return (
    <Tag
      className={cn(
        "band",
        `band--${tone}`,
        scoop !== "none" && `scoop-${scoop}`,
        tuck && "band--tuck",
        className,
      )}
      {...props}
    >
      {container ? <div className="fl-container">{children}</div> : children}
    </Tag>
  );
}
