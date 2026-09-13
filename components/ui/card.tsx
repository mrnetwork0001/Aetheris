import * as React from "react";

import { cn } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export interface CardProps extends DivProps {
  /** Zero padding + clipped corners - for tables and lists that own their own gutters. */
  flush?: boolean;
  /** Dashed hairline - for empty / placeholder surfaces. */
  dashed?: boolean;
  /** Ecosystem card recipe (#0d0d0d, 16px radius, −6px hover lift - DESIGN.md §9.8). */
  eco?: boolean;
  /**
   * Force the light-card hover lift (−2px, soft shadow). Padded cards on light bands
   * already get it from context; use this for a card outside `.band--light` / `.on-light`.
   */
  lift?: boolean;
}

/**
 * `.fl-card` surface. Reads its colours from the contextual `--c-*` tokens, so
 * the same component is a black card on dark bands and a white card on light ones.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, flush = false, dashed = false, eco = false, lift = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "fl-card",
        flush && "fl-card--flush",
        dashed && "fl-card--dashed",
        eco && "fl-card--eco ecosystem-card",
        lift && "fl-card--lift",
        className,
      )}
      {...props}
    />
  );
});

/** Header row. Inside a padded card it bleeds to the edges; inside `flush` it just pads. */
export function CardHeader({ className, ...props }: DivProps) {
  return <div className={cn("fl-card__header", className)} {...props} />;
}

export function CardTitle({
  className,
  as: Tag = "h3",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return (
    <Tag
      className={cn("font-sans text-[1.05rem] font-semibold tracking-tight fg", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-xs leading-relaxed fg-2", className)} {...props} />;
}

export function CardBody({ className, ...props }: DivProps) {
  return <div className={cn("fl-card__body", className)} {...props} />;
}

/** Alias kept for earlier call sites. */
export const CardContent = CardBody;

export function CardFooter({ className, ...props }: DivProps) {
  return <div className={cn("fl-card__footer", className)} {...props} />;
}
