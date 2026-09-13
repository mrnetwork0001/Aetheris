import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "accent"
  | "outline"
  | "ghost"
  /** @deprecated alias of `accent` kept for earlier call sites. */
  | "gold"
  /** @deprecated alias of `outline` kept for earlier call sites. */
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  accent: "btn-accent",
  outline: "btn-outline",
  ghost: "btn-ghost",
  gold: "btn-accent",
  danger: "btn-outline",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

interface ButtonBase {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Hero-style pulsing ring (DESIGN.md §9.5). Off under `prefers-reduced-motion`. */
  pulse?: boolean;
  className?: string;
  children?: React.ReactNode;
}

type AnchorRest = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBase | "href">;
type NativeRest = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBase>;

export type ButtonProps = ButtonBase &
  (({ href: string } & AnchorRest) | ({ href?: undefined } & NativeRest));

const EXTERNAL = /^(https?:|mailto:|tel:)/i;

function classes({
  variant = "primary",
  size = "md",
  pulse = false,
  className,
}: ButtonBase): string {
  return cn("btn", VARIANTS[variant], SIZES[size], pulse && "btn-cta-pulse", className);
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
    />
  );
}

/**
 * The one button. Pass `href` to render a link with identical styling —
 * internal paths go through `next/link`, absolute URLs render a plain anchor.
 * The ref is forwarded only for the native `<button>` form.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  props,
  ref,
) {
  if (props.href !== undefined) {
    const { href, variant, size, loading = false, pulse, className, children, ...rest } = props;
    const cls = classes({ variant, size, pulse, className });
    const inner = (
      <>
        {loading ? <Spinner /> : null}
        {children}
      </>
    );
    if (EXTERNAL.test(href)) {
      return (
        <a href={href} className={cls} aria-busy={loading || undefined} {...rest}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} aria-busy={loading || undefined} {...rest}>
        {inner}
      </Link>
    );
  }

  const {
    variant,
    size,
    loading = false,
    pulse,
    className,
    children,
    disabled,
    type,
    ...rest
  } = props;
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes({ variant, size, pulse, className })}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});
