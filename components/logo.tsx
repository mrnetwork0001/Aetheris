import * as React from "react";

import { cn } from "@/lib/utils";

/** Aetheris mark: an orbital ring bisected by an ascending settlement path. */
export function AetherisMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="Aetheris"
      className={cn("h-7 w-7", className)}
    >
      <defs>
        <linearGradient id="aetheris-mark-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38e8ff" />
          <stop offset="100%" stopColor="#6d7cff" />
        </linearGradient>
        <linearGradient id="aetheris-mark-b" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffc857" />
          <stop offset="100%" stopColor="#38e8ff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#aetheris-mark-a)" strokeWidth="1.4" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5"
        fill="none"
        stroke="url(#aetheris-mark-a)"
        strokeWidth="1"
        opacity="0.5"
        transform="rotate(-28 16 16)"
      />
      <path
        d="M9.5 22 16 9l6.5 13"
        fill="none"
        stroke="url(#aetheris-mark-b)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12.4 18h7.2" stroke="url(#aetheris-mark-b)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="9" r="1.9" fill="#ffc857" />
    </svg>
  );
}

export function AetherisWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <AetherisMark />
      <span className="text-[0.95rem] font-semibold tracking-[0.18em] text-white">AETHERIS</span>
    </span>
  );
}
