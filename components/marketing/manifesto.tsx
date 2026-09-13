import { Band } from "@/components/ui/section-band";

import { WipeText } from "./wipe-text";

/** Extra bottom padding so the light band that tucks over this one never covers its copy. */
export const DARK_PB_SCOOP = "pb-[calc(var(--band-pad-y)+var(--fl-scoop))]";

/**
 * DESIGN.md §3.3 copy, split by hand into visual lines for the §9.2 wipe.
 * Each line is ≤ 44 characters so it holds on one row at 2rem Montserrat 700
 * inside the 900px column; narrower viewports wrap a line under its own mask.
 */
const MANIFESTO_LINES: readonly string[] = [
  "Most AI agents can't hold a budget,",
  "hire help, or prove what they did.",
  "Aetheris gives an agency a treasury, lets it",
  "pay sub-agents by the task in sub-second HTS",
  "settlements, and anchors every milestone to",
  "Hedera Consensus Service - so the work is",
  "auditable by anyone, not just the operator.",
];

export function Manifesto() {
  return (
    <Band tone="dark" tuck className={DARK_PB_SCOOP}>
      <WipeText
        as="p"
        tone="dark"
        lines={MANIFESTO_LINES}
        className="mx-auto max-w-[900px] text-center font-display text-[clamp(1.6rem,2.6vw,2rem)] font-bold leading-[1.35] tracking-[-0.02em] text-fl-fg"
      />
    </Band>
  );
}
