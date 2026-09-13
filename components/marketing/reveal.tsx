"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Seconds. Stagger siblings with small increments (never > 0.15s on h1/h2). */
  delay?: number;
}

/**
 * `idle`   - SSR / pre-arm: rendered fully visible, no animation.
 * `hidden` - armed and off-screen: waits for the viewport to reach it.
 * `shown`  - revealed (or never needed hiding). Terminal; never goes back.
 */
type Phase = "idle" | "hidden" | "shown";

const VISIBLE = { opacity: 1, y: 0 } as const;
const HIDDEN = { opacity: 0, y: 24 } as const;
const INSTANT = { duration: 0 } as const;

/** Any part of the element intersects the viewport (DESIGN.md §9.1 rect check). */
function isOnScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < viewportHeight && rect.bottom > 0;
}

/**
 * Scroll reveal that is visible without JavaScript (DESIGN.md §9.1).
 *
 * The server and the hydration pass render the element fully opaque
 * (`initial={false}`, phase `idle`). On mount the element is measured inside
 * a `requestAnimationFrame`: if it is already on screen it is marked `shown`
 * and never hides (above-the-fold content never flickers); otherwise it hides
 * instantly and reveals on entry. Two independent triggers reveal it -
 * framer's `useInView` (IntersectionObserver) and a passive, rAF-throttled
 * scroll/resize rect check - and whichever fires first wins. `shown` is
 * terminal, so no later measurement can hide real content again.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const inView = useInView(ref, { once: true, amount: 0.15, margin: "0px 0px -8% 0px" });

  const show = React.useCallback(() => setPhase("shown"), []);

  // Arm on mount. Reduced motion → shown and stop.
  React.useEffect(() => {
    if (reduceMotion) {
      show();
      return;
    }
    const el = ref.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      setPhase((current) => {
        if (current === "shown") return current;
        return isOnScreen(el) ? "shown" : "hidden";
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, show]);

  // Trigger 1: IntersectionObserver via framer-motion.
  React.useEffect(() => {
    if (inView) show();
  }, [inView, show]);

  // Trigger 2 (fail-safe): passive scroll/resize listeners re-run the rect
  // check, throttled to one measurement per animation frame. Runs once on
  // arming too, so a layout shift between the arm frame and the first scroll
  // can never strand an on-screen element in `hidden`.
  React.useEffect(() => {
    if (phase !== "hidden") return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const check = () => {
      frame = 0;
      if (isOnScreen(el)) show();
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(check);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    schedule();

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [phase, show]);

  const hidden = phase === "hidden";

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      data-reveal={phase}
      initial={false}
      animate={hidden ? HIDDEN : VISIBLE}
      transition={hidden ? INSTANT : { duration: 0.5, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
