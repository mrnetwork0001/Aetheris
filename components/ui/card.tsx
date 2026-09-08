import * as React from "react";

import { cn } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Glass panel used across every surface. Deliberately unopinionated about
 * padding so dense data tables and roomy hero cards can share it.
 */
export const Card = React.forwardRef<HTMLDivElement, DivProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]",
        "shadow-[inset_0_1px_0_0_rgb(255_255_255_/_0.05),0_24px_60px_-40px_rgb(0_0_0_/_0.9)]",
        "backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  );
});

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  as: Tag = "h3",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return (
    <Tag
      className={cn("text-sm font-semibold tracking-tight text-white sm:text-base", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-xs leading-relaxed text-slate-400", className)} {...props} />;
}

export function CardContent({ className, ...props }: DivProps) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-white/[0.06] px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}
