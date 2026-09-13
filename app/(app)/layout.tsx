import * as React from "react";

import { DEMO_AGENCY_ADDRESS } from "@/components/aetheris-data";
import { loadAgencyStats, loadJobs } from "@/components/aetheris-server";
import { AppShell } from "@/components/app/app-shell";
import { RoleProvider, type ClientSummary } from "@/components/app/role-context";

/**
 * `(app)` route group: every page here renders inside the black sidebar shell.
 * The agency operator and the indexed clients are read on the server so the
 * Operator | Client toggle can say, from the connected wallet, what each role
 * means right now.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const agencyAddress = process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS ?? DEMO_AGENCY_ADDRESS;
  const [stats, jobs] = await Promise.all([loadAgencyStats(), loadJobs(100)]);

  const counts = new Map<string, number>();
  for (const job of jobs.data) {
    const key = job.client.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const clients: ClientSummary[] = Array.from(counts, ([address, n]) => ({ address, jobs: n })).sort((a, b) => b.jobs - a.jobs);

  return (
    <RoleProvider operator={stats.data.operator} clients={clients}>
      <AppShell agencyAddress={agencyAddress}>{children}</AppShell>
    </RoleProvider>
  );
}
