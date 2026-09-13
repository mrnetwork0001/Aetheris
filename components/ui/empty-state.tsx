import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  link?: { href: string; label: string };
  className?: string;
}

/** Centered 20px icon · bold 15px title · ≤2-line body · accent link with an arrow. */
export function EmptyState({ icon, title, body, link, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center text-[color:var(--c-icon)] [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </div>
      ) : null}
      <h3 className={cn("font-sans text-[15px] font-bold tracking-normal fg", icon && "mt-4")}>
        {title}
      </h3>
      {body ? <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed fg-3">{body}</p> : null}
      {link ? (
        <Link
          href={link.href}
          className="mt-4 text-[13px] font-medium accent-ink hover:underline"
        >
          {link.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </div>
  );
}
