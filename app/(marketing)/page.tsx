import { ComparisonTable } from "@/components/marketing/comparison-table";
import { Cta } from "@/components/marketing/cta";
import { EcosystemRow } from "@/components/marketing/ecosystem-row";
import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { LedgerSection } from "@/components/marketing/ledger-section";
import { Manifesto } from "@/components/marketing/manifesto";
import { ProblemCards } from "@/components/marketing/problem-cards";

/** Landing page — DESIGN.md §3, sections 2–9 in order (nav and footer live in the layout). */
export default function HomePage() {
  return (
    <>
      <Hero />
      <Manifesto />
      <ProblemCards />
      <LedgerSection />
      <EcosystemRow
        live={{
          worldId: Boolean(process.env.NEXT_PUBLIC_WORLD_ID_APP_ID && process.env.WORLD_ID_RP_ID && process.env.WORLD_ID_RP_SIGNING_KEY),
          oneinch: Boolean(process.env.ONEINCH_API_KEY),
          privy: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID),
        }}
      />
      <ComparisonTable />
      <Faq />
      <Cta />
    </>
  );
}
