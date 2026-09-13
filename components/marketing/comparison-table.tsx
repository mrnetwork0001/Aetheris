import { Check, X } from "lucide-react";

import { Band } from "@/components/ui/section-band";
import { Card } from "@/components/ui/card";

import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

const ROWS: ReadonlyArray<{ feature: string; wallet: string; aetheris: string }> = [
  {
    feature: "What you fund",
    wallet: "An open-ended approval",
    aetheris: "One escrowed deposit per job",
  },
  {
    feature: "Who gets paid",
    wallet: "Whoever holds the key",
    aetheris: "Named sub-agents, per completed task",
  },
  {
    feature: "Ceiling",
    wallet: "None",
    aetheris: "Committed fees can never exceed the deposit",
  },
  {
    feature: "Proof of work",
    wallet: "Logs on a server",
    aetheris: "HCS anchor per completion, indexed by The Graph",
  },
  {
    feature: "Who can sweep margin",
    wallet: "Any caller",
    aetheris: "A World-ID-verified human, nullifier burned once",
  },
];

export function ComparisonTable() {
  return (
    <Band tone="light" scoop="tr" tuck id="compare" className="scroll-mt-16">
      <Reveal className="mx-auto max-w-[640px] text-center">
        <WipeText
          as="h2"
          tone="light"
          lines={["Token approvals", "vs. Aetheris"]}
          className="display-2 text-light-heading"
        />
        <p className="mt-4 text-[1.05rem] leading-[1.65] text-light-body">
          The difference is what an agent can take from you, and whether anyone can check what
          it did with the money.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mx-auto mt-12 max-w-[960px]">
        <Card flush className="shadow-[0_24px_60px_-36px_rgb(0_0_0/0.3)]">
          <div className="w-full overflow-x-auto">
            <table className="fl-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Standard agent wallet</th>
                  <th scope="col">Aetheris</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.feature}>
                    <th
                      scope="row"
                      className="!font-sans !text-[0.9rem] !font-semibold !normal-case !tracking-normal !text-light-heading"
                    >
                      {row.feature}
                    </th>
                    <td className="text-[0.9rem] text-[var(--light-muted)]">
                      <span className="flex items-start gap-2">
                        <X
                          aria-hidden="true"
                          className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--light-muted)]"
                        />
                        <span className="italic">{row.wallet}</span>
                      </span>
                    </td>
                    <td className="text-[0.9rem] font-medium text-light-heading">
                      <span className="flex items-start gap-2">
                        <Check
                          aria-hidden="true"
                          className="mt-[3px] h-3.5 w-3.5 shrink-0 text-fl-accentInk"
                        />
                        <span>{row.aetheris}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>
    </Band>
  );
}
