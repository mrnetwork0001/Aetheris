import { Activity, Coins, Radio, Vault } from "lucide-react";

import type {
  AgencyStats,
  DataEnvelope,
  HcsMessage,
  Job,
  SubAgentRow,
} from "@/components/aetheris-data";
import { formatDuration, toNumber } from "@/components/format";
import { StatCard } from "@/components/stat-card";

export interface StatRowProps {
  stats: DataEnvelope<AgencyStats>;
  jobs: DataEnvelope<Job[]>;
  agents: DataEnvelope<SubAgentRow[]>;
  hcs: DataEnvelope<HcsMessage[]>;
}

/** Four mono stat tiles; exactly one (treasury margin) carries the accent. */
export function StatRow({ stats, jobs, agents, hcs }: StatRowProps) {
  const paidToSubAgents = agents.data.reduce(
    (sum, agent) => sum + toNumber(agent.totalEarnedRaw),
    0,
  );
  const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  return (
    <section
      aria-label="Agency metrics"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatCard
        label="Treasury margin"
        value={toNumber(stats.data.lifetimeMarginRaw)}
        format="usd"
        accent
        tone="cyan"
        icon={<Vault />}
        hint="Retained after sub-agent payouts"
        source={stats.source}
        sourceReason={stats.error}
      />
      <StatCard
        label="Jobs in flight"
        value={stats.data.activeJobs}
        tone="glow"
        icon={<Activity />}
        hint={`${integer.format(stats.data.totalJobs)} lifetime · ${integer.format(stats.data.settledJobs)} settled`}
        source={jobs.source}
        sourceReason={jobs.error}
        index={1}
      />
      <StatCard
        label="Paid to sub-agents"
        value={paidToSubAgents}
        format="usd"
        tone="success"
        icon={<Coins />}
        hint={`${integer.format(stats.data.subAgentCount)} sub-agents on roster`}
        source={agents.source}
        sourceReason={agents.error}
        index={2}
      />
      <StatCard
        label="HCS anchors"
        value={stats.data.hcsMessageCount}
        tone="gold"
        icon={<Radio />}
        hint={`Avg consensus finality ${formatDuration(stats.data.avgFinalityMs)}`}
        source={hcs.source}
        sourceReason={hcs.error}
        index={3}
      />
    </section>
  );
}
