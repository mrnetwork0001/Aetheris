"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { cn } from "@/lib/utils";

/** Which band the text sits on — the mask is painted in that band's background. */
export type WipeTone = "light" | "dark";

type WipeTag = "h1" | "h2" | "h3" | "p" | "div";

export interface WipeTextProps {
  /** Visual lines, split by hand (DESIGN.md §9.2). Each renders as its own block. */
  lines: readonly string[];
  tone: WipeTone;
  /** Wrapper element. Defaults to `h2`. */
  as?: WipeTag;
  className?: string;
  /** Applied to every `.wipe-line`. */
  lineClassName?: string;
  id?: string;
}

const MASK_COLOUR: Record<WipeTone, string> = {
  light: "#fff",
  dark: "#000",
};

/** Scroll window: `start: 'top 85%'`, `end: 'bottom 70%'`. */
const SCROLL_OFFSET = ["start 85%", "end 70%"] as const;

/**
 * Montserrat descenders poke below a 1.1 line-height. The line keeps
 * `overflow:hidden` (spec) but pads vertically and pulls the same amount back
 * with negative margins so glyphs are never clipped and layout is unchanged.
 */
const LINE_STYLE: React.CSSProperties = {
  position: "relative",
  display: "block",
  overflow: "hidden",
  padding: "0.08em 0",
  margin: "-0.08em 0",
};

interface WipeLineProps {
  text: string;
  index: number;
  count: number;
  progress: MotionValue<number>;
  colour: string;
  masked: boolean;
  className?: string;
}

/**
 * One visual line. Its mask `width` scrubs 100% → 0% across this line's slice
 * of the heading's (monotonic) scroll progress, so lines uncover in sequence.
 */
function WipeLine({ text, index, count, progress, colour, masked, className }: WipeLineProps) {
  const width = useTransform(progress, [index / count, (index + 1) / count], ["100%", "0%"]);

  return (
    <span className={cn("wipe-line", className)} style={LINE_STYLE}>
      {text}
      {masked ? (
        <motion.span
          aria-hidden="true"
          className="wipe-mask"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width,
            background: colour,
            pointerEvents: "none",
          }}
        />
      ) : null}
    </span>
  );
}

/**
 * Line-mask text wipe (DESIGN.md §9.2). Each hand-split line is covered by an
 * overlay in the band's own background colour; as the block scrolls through
 * the `start 85%` → `end 70%` window the overlays shrink from the right, so
 * the copy appears to be uncovered line by line.
 *
 * Guarantees:
 * - SSR and the hydration pass render NO mask — the text is fully visible
 *   without JavaScript. Masks mount only after the first client effect, when
 *   framer's scroll tracking is live and already knows the correct progress
 *   (a heading the user reloaded past is therefore never covered).
 * - Reduced motion → plain text, no mask, no scroll tracking output.
 * - The mask never fades or hides text through opacity; it is a solid overlay
 *   whose width is driven directly by scroll position, so no missed event can
 *   leave a line stranded — the next scroll tick repaints it.
 * - The wipe is MONOTONIC (§9.10: "masks fully open on any heading above the
 *   current scroll position"). The masks follow a running high-water mark of
 *   `scrollYProgress`, not the raw value, so scrolling down still scrubs the
 *   uncover line by line, but a line uncovered once never re-covers when the
 *   user scrolls back up — real content is never re-hidden.
 * - END-OF-DOCUMENT FAIL-SAFE. `end 70%` needs the block's bottom to travel to
 *   70% of the viewport; for a heading near the foot of the page on a tall
 *   viewport the document simply runs out of scroll first and `scrollYProgress`
 *   plateaus well below 1 — masks would cover real copy forever. So whenever
 *   scrolling is exhausted (`scrollY + innerHeight >= scrollHeight`) and the
 *   block is on screen, the peak is forced to 1. Checked once while arming (a
 *   page loaded scrolled to the bottom opens immediately) and then on passive,
 *   rAF-throttled `scroll`/`resize` events until the heading is fully open.
 */
export function WipeText({
  lines,
  tone,
  as = "h2",
  className,
  lineClassName,
  id,
}: WipeTextProps) {
  const ref = React.useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);

  const { scrollYProgress } = useScroll({ target: ref, offset: [...SCROLL_OFFSET] });

  // High-water mark of scroll progress. Only ever rises, so the downward wipe
  // scrubs exactly as before while scrolling back up leaves every opened line
  // open (§9.10 pass criterion: no heading above the viewport may be masked).
  const peakProgress = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (value > peakProgress.get()) peakProgress.set(value);
  });

  // Arm two frames after mount: framer measures the target in its own frame
  // loop right after hydration, so by then `scrollYProgress` already holds the
  // real value and a heading the user reloaded past mounts with its masks at 0%
  // instead of flashing covered for a frame. The peak is seeded from that same
  // measured value — `change` has not necessarily fired yet for a heading the
  // page loaded scrolled past, and the masks must open from their first frame.
  React.useEffect(() => {
    if (reduceMotion) return;

    // Fail-safe: when the page cannot scroll any further and the block is on
    // screen, the wipe must be fully open regardless of where the `end 70%`
    // offset would have landed. Returns true once the heading is fully open.
    const openIfScrollExhausted = (): boolean => {
      if (peakProgress.get() >= 1) return true;
      const el = ref.current;
      if (!el) return false;
      const { scrollY, innerHeight } = window;
      const { scrollHeight } = document.documentElement;
      const atDocumentEnd = scrollY + innerHeight >= scrollHeight - 1;
      if (atDocumentEnd && el.getBoundingClientRect().top < innerHeight) {
        peakProgress.set(1);
        return true;
      }
      return false;
    };

    let second = 0;
    let throttle = 0;
    let listening = false;

    const stopListening = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };

    const onScrollOrResize = () => {
      if (throttle !== 0) return;
      throttle = requestAnimationFrame(() => {
        throttle = 0;
        if (openIfScrollExhausted()) stopListening();
      });
    };

    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const current = scrollYProgress.get();
        if (current > peakProgress.get()) peakProgress.set(current);
        // Seed the fail-safe before the masks mount so a page loaded at the
        // bottom never paints a covered heading, not even for one frame.
        if (!openIfScrollExhausted()) {
          listening = true;
          window.addEventListener("scroll", onScrollOrResize, { passive: true });
          window.addEventListener("resize", onScrollOrResize, { passive: true });
        }
        setMounted(true);
      });
    });

    return () => {
      cancelAnimationFrame(first);
      if (second !== 0) cancelAnimationFrame(second);
      if (throttle !== 0) cancelAnimationFrame(throttle);
      stopListening();
    };
  }, [scrollYProgress, peakProgress, reduceMotion]);

  const masked = mounted && !reduceMotion;
  const colour = MASK_COLOUR[tone];
  const Tag = as;

  return (
    <Tag
      ref={ref as React.RefObject<HTMLHeadingElement & HTMLParagraphElement & HTMLDivElement>}
      id={id}
      className={cn("wipe-text relative", className)}
      data-wipe={masked ? "armed" : "plain"}
    >
      {lines.map((line, index) => (
        <WipeLine
          key={`${index}-${line}`}
          text={line}
          index={index}
          count={lines.length}
          progress={peakProgress}
          colour={colour}
          masked={masked}
          className={lineClassName}
        />
      ))}
    </Tag>
  );
}
