import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "gold" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-aether-glow to-[#4a58e0] text-white border border-white/20 shadow-[0_10px_30px_-12px_rgb(109_124_255_/_0.9)] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-white/[0.06] text-white border border-white/10 hover:bg-white/[0.1] active:bg-white/[0.08]",
  ghost: "bg-transparent text-slate-300 border border-transparent hover:bg-white/[0.06] hover:text-white",
  outline:
    "bg-transparent text-aether-cyan border border-aether-cyan/40 hover:bg-aether-cyan/10 hover:border-aether-cyan/70",
  gold:
    "bg-gradient-to-b from-aether-gold to-[#e0a12f] text-[#2a1c00] border border-white/25 font-semibold shadow-[0_10px_30px_-12px_rgb(255_200_87_/_0.8)] hover:brightness-110",
  danger:
    "bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-sm gap-2.5 rounded-xl sm:text-base",
  icon: "h-9 w-9 rounded-lg",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading = false, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[filter,background-color,border-color,transform] duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aether-cyan",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
        />
      ) : null}
      {children}
    </button>
  );
});
