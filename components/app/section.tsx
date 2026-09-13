import * as React from "react";

import { cn } from "@/lib/utils";

export interface SectionProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Anchor target for the sidebar (`/dashboard#jobs`). */
  id: string;
  title: string;
  description?: React.ReactNode;
  /** Right-aligned slot for a pill button or link. */
  action?: React.ReactNode;
}

/**
 * Dashboard section: header row (h2 1.05rem/600 + optional right-aligned
 * action) followed by whatever card the caller passes as children.
 * Server-safe - no hooks - so client panels may render it too.
 */
export function Section({
  id,
  title,
  description,
  action,
  className,
  children,
  ...props
}: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-6", className)}
      {...props}
    >
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="font-sans text-[1.05rem] font-semibold tracking-tight fg"
          >
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-xs leading-relaxed fg-2">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
