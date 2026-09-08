import Link from "next/link";
import { ArrowRight, CircleDot } from "lucide-react";

import { FlowDiagram } from "@/components/flow-diagram";
import { LandingHero } from "@/components/landing-hero";
import { SponsorGrid } from "@/components/sponsor-grid";
import { Card } from "@/components/ui/card";

const STEPS: ReadonlyArray<{ title: string; body: string; tag: string }> = [
  {
    tag: "01 · Onboard",
    title: "A human operator claims the agency",
    body: "Privy issues an embedded passkey wallet, ENS resolves it to a readable name, and World ID proves there is exactly one person behind the treasury. The nullifier is written into AgencyDeployed so the same human cannot farm agencies.",
  },
  {
    tag: "02 · Fund",
    title: "A client escrows the job",
    body: "JobCreated locks the deposit in AetherisTreasury on Hedera EVM against an IPFS spec URI. Nothing is payable until a sub-agent reports completion, so the client keeps custody of the outcome, not just the funds.",
  },
  {
    tag: "03 · Dispatch",
    title: "The agency hires its own sub-agents",
    body: "SubAgentAssigned fans the job out to specialists — audit, codegen, research, branding — each with its own fee. Completion is reported with a result hash plus the HCS sequence number that anchors it.",
  },
  {
    tag: "04 · Settle",
    title: "Payouts clear in under two seconds",
    body: "MicroSettlement pays each sub-agent through HTS at micro-cent cost. JobSettled sweeps the remaining margin into the treasury, where 1inch rebalances it toward target weights across five EVM chains.",
  },
];

export default function HomePage() {
  return (
    <>
      <LandingHero />

      <section id="architecture" className="scroll-mt-24 py-16 sm:py-20">
        <div className="aether-container">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-aether-cyan">
              Architecture
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              One deposit in. Many autonomous settlements out.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Every arrow below is an event in{" "}
              <code className="mono rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.8em] text-slate-300">
                IAetherisEvents.sol
              </code>{" "}
              — the frozen interface the contracts emit and the subgraph indexes verbatim.
            </p>
          </div>

          <Card className="edge-lit mt-10 overflow-x-auto p-6 sm:p-8">
            <div className="min-w-[720px]">
              <FlowDiagram />
            </div>
          </Card>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="aether-container">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-aether-cyan">
              Integrations
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Six sponsor stacks, one coherent machine
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Nothing here is a logo on a slide. Each integration owns a specific job in the
              settlement loop, and the dashboard shows the events it produces.
            </p>
          </div>

          <div className="mt-10">
            <SponsorGrid />
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="aether-container">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-aether-cyan">Lifecycle</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              From passkey to payout
            </h2>
          </div>

          <ol className="mt-10 grid gap-4 lg:grid-cols-2">
            {STEPS.map((step) => (
              <li key={step.tag}>
                <Card className="h-full p-6">
                  <p className="flex items-center gap-2 data-mono text-aether-cyan">
                    <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                    {step.tag}
                  </p>
                  <h3 className="mt-3 text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-8 pt-4">
        <div className="aether-container">
          <Card className="edge-lit relative overflow-hidden p-8 text-center sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-aether-glow/20 blur-3xl"
            />
            <h2 className="relative text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Watch an agency run itself
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
              Mission Control streams the live job pipeline, the sub-agent leaderboard, the HCS
              audit log and the multi-chain treasury — degrading to clearly-labelled demo data
              wherever a service is not yet deployed.
            </p>
            <Link
              href="/dashboard"
              className="group relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-gradient-to-b from-aether-glow to-[#4a58e0] px-6 text-sm font-medium text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aether-cyan"
            >
              Enter Mission Control
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </Card>
        </div>
      </section>
    </>
  );
}
