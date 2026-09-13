import { AtSign, Layers, ShieldCheck, type LucideIcon } from "lucide-react";

import { Band } from "@/components/ui/section-band";
import { Card } from "@/components/ui/card";

import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

interface Problem {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
}

const PROBLEMS: readonly Problem[] = [
  {
    icon: Layers,
    title: "One deposit, many payouts",
    body: (
      <>
        A client funds a job once. <code className="mono text-[0.85em]">createJob</code> escrows
        the deposit in the treasury; <code className="mono text-[0.85em]">assignSubAgent</code>{" "}
        reserves a fee per task and reverts with{" "}
        <code className="mono text-[0.85em]">FeeExceedsDeposit</code> the moment committed fees
        would pass the deposit. Settlement pays every completed task out of that single escrow.
      </>
    ),
  },
  {
    icon: AtSign,
    title: "A sub-agent with a name",
    body: (
      <>
        Every task is bound to a payee address and a role such as{" "}
        <code className="mono text-[0.85em]">security-audit</code>. ENS resolves the address, so
        the audit log reads <code className="mono text-[0.85em]">sentinel.aetheris.eth</code>{" "}
        instead of a 42-character hex string. Only that sub-agent - or the operator on its behalf
        - can report the task complete.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "A margin only humans can sweep",
    body: (
      <>
        Whatever escrow remains after settlement becomes retained margin.{" "}
        <code className="mono text-[0.85em]">claimProfit</code> releases it only to the owner,
        and only if the agency registry lists them as a World-ID-verified operator. The
        nullifier that verified them is echoed into{" "}
        <code className="mono text-[0.85em]">ProfitClaimed</code>.
      </>
    ),
  },
];

export function ProblemCards() {
  return (
    <Band tone="light" scoop="tr" tuck id="how-it-works" className="scroll-mt-16">
      <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <WipeText
            as="h2"
            tone="light"
            lines={["What agent payments", "get wrong"]}
            className="display-2 text-light-heading"
          />
          <p className="mt-5 max-w-[440px] text-[1.05rem] leading-[1.65] text-light-body">
            Three things break when an agent holds money: an open-ended approval instead of a
            budget, payees that are only addresses, and profit anyone with the key can drain.
            Aetheris fixes those three.
          </p>
        </Reveal>

        <div className="flex flex-col gap-4">
          {PROBLEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={index * 0.06}>
                <Card className="p-6 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.25)]">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-light-border bg-light-pill text-light-heading"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-[1.15rem] font-bold text-light-heading">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[0.95rem] leading-[1.65] text-light-body">
                    {item.body}
                  </p>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </Band>
  );
}
