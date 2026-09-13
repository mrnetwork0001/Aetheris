import { Pill } from "@/components/ui/pill";

const PIPELINE: ReadonlyArray<{
  id: string;
  spec: string;
  client: string;
  status: "Settled" | "Dispatched" | "Funded";
}> = [
  { id: "#4", spec: "security-audit · v2 treasury", client: "northwind.eth", status: "Settled" },
  { id: "#3", spec: "codegen · subgraph handlers", client: "acme.eth", status: "Dispatched" },
  { id: "#2", spec: "research · HTS fee model", client: "0x9f2c…41ab", status: "Funded" },
];

const STATUS_TONE = {
  Settled: "solid",
  Dispatched: "on",
  Funded: "off",
} as const;

/**
 * Pill for the dark card. The card sits inside a light band, whose contextual
 * tokens would recolour `Pill` for white paper - so the dark surface paints
 * its own colours explicitly instead of trusting the band context.
 */
function DarkPill({ tone, children }: { tone: "accent" | "emerald"; children: string }) {
  const colours =
    tone === "accent"
      ? "border-[#079ab740] bg-fl-accentSoft text-fl-accent"
      : "border-[#10b98140] bg-[#10b9811f] text-fl-emerald";
  return <span className={`fl-pill ${colours}`}>{children}</span>;
}

/**
 * The tilted product preview in the hero. Pure JSX - no images - so it
 * ships in the HTML, scales with its container, and stays crisp at any DPR.
 * Both cards share one grid cell, so the composition's height is always the
 * taller card and nothing spills into the copy below it on small screens.
 * The outer element is the `.hero-float` wrapper (§9.3) so both tilted cards
 * and the connector float as one unit.
 * Every grid track here and in the hero is `minmax(0, …)`: the cards'
 * nowrap pills and truncated rows would otherwise inflate the track's
 * min-content past the container on narrow screens, and the percentage
 * widths (cyclic against an `auto` track) would resolve against that.
 */
export function HeroMockup() {
  return (
    <div
      aria-hidden="true"
      className="hero-float relative mx-auto grid w-full min-w-0 max-w-[560px] grid-cols-[minmax(0,1fr)] select-none pb-8 pt-4"
    >
      {/* Light dashboard card */}
      <div className="on-light col-start-1 row-start-1 w-[82%] -rotate-3 sm:w-[74%] justify-self-start rounded-[14px] border border-light-border bg-white shadow-[0_30px_60px_-20px_rgb(0_0_0/0.35)]">
        <div className="flex items-center gap-1.5 border-b border-light-border px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
          <span className="mono-label ml-3">Mission Control</span>
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-center justify-between">
            <p className="font-display text-[0.95rem] font-bold text-light-heading">
              Job pipeline
            </p>
            <Pill tone="on" dot className="live-pill">
              Live
            </Pill>
          </div>
          <ul className="mt-3 divide-y divide-light-border">
            {PIPELINE.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5">
                <span className="data-mono w-7 shrink-0 text-[var(--light-muted)]">{row.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8rem] font-medium text-light-heading">
                    {row.spec}
                  </span>
                  <span className="data-mono block truncate text-[0.68rem] text-[var(--light-muted)]">
                    {row.client}
                  </span>
                </span>
                <Pill tone={STATUS_TONE[row.status]}>{row.status}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Dark ledger card - overlaps the light one from the top-right */}
      <div className="col-start-1 row-start-1 mt-[28%] w-[62%] rotate-6 sm:w-[58%] self-start justify-self-end rounded-[14px] border border-fl-borderHi bg-fl-card text-fl-fg shadow-[0_40px_80px_-24px_rgb(0_0_0/0.7)]">
        <div className="flex items-center justify-between border-b border-fl-border px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-fl-accent" />
            <span className="font-display text-[0.85rem] font-bold">Aetheris Ledger</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-fl-fg2">HCS</span>
        </div>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-[10px] border border-fl-border bg-fl-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.8rem] font-semibold">Micro-settlement</span>
              <DarkPill tone="emerald">Paid</DarkPill>
            </div>
            <dl className="data-mono mt-2 space-y-1 text-fl-fg2">
              <div className="flex justify-between gap-3">
                <dt>viaHts</dt>
                <dd className="text-fl-accent">true</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>amount</dt>
                <dd className="text-fl-fg">0.62 aUSD</dd>
              </div>
              <div className="flex min-w-0 justify-between gap-3">
                <dt>to</dt>
                <dd className="truncate text-fl-fg">sentinel.aetheris.eth</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-[10px] border border-fl-border bg-fl-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.8rem] font-semibold">HCS anchor</span>
              <DarkPill tone="accent">seq 1042</DarkPill>
            </div>
            <p className="data-mono mt-2 truncate text-fl-fg2">topic 0.0.4915302 · TaskCompleted</p>
          </div>
          <div className="shimmer-line" />
        </div>
      </div>

      {/* §9.7 Marching connector: Micro-settlement card → the dispatched sub-agent row.
          Overlay in percentage space; `non-scaling-stroke` keeps the 6/6 dash crisp
          however the composition is scaled. Decorative only. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 col-start-1 row-start-1 h-full w-full overflow-visible"
      >
        <path
          className="path-march"
          d="M 42 41 C 34 41, 30 36, 24 31"
        />
        <circle cx="24" cy="31" r="1.1" fill="#079ab7" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
