import { Band } from "@/components/ui/section-band";

import { DARK_PB_SCOOP } from "./manifesto";
import { Reveal } from "./reveal";
import { WipeText } from "./wipe-text";

interface Faq {
  q: string;
  a: React.ReactNode;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="mono rounded bg-fl-raised px-1 py-0.5 text-[0.85em] text-fl-fg">{children}</code>
);

/** Answers are drawn from contracts/AetherisAgency.sol, contracts/AetherisTreasury.sol and README.md. */
const FAQS: readonly Faq[] = [
  {
    q: "What is World ID bypass mode, and is it hiding anything?",
    a: (
      <>
        With no <Code>WORLD_ID_ROUTER_ADDRESS</Code> set, <Code>AetherisAgency</Code> deploys with
        the zero address as its router and skips only the zero-knowledge proof check. The state is
        never silent: the constructor emits <Code>WorldIdBypassActive</Code>, every bypassed
        registration emits <Code>OperatorVerifiedWithoutProof</Code> next to the normal{" "}
        <Code>OperatorVerified</Code>, and <Code>worldIdVerificationBypassed()</Code> returns true.
        Nullifier burning stays on. <Code>setWorldId(router, groupId)</Code> switches real
        verification on without redeploying.
      </>
    ),
  },
  {
    q: "Why does the treasury have to associate a token first?",
    a: (
      <>
        Hedera refuses token transfers to an account that has not associated with that token. A
        freshly deployed treasury must call <Code>associateToken</Code> (owner only) once per HTS
        token before any deposit can be escrowed, and each sub-agent must be associated before it
        can be paid. The seed script creates auto-associated sub-agent accounts; the deploy script
        associates the treasury when <Code>AETHERIS_HTS_TOKEN_ADDRESS</Code> is set.
      </>
    ),
  },
  {
    q: "What happens if an HTS payout fails?",
    a: (
      <>
        <Code>settleSubAgent</Code> tries the Hedera Token Service system contract first and falls
        back to a plain ERC-20 transfer when the token is not an HTS entity or HTS declines. The{" "}
        <Code>viaHts</Code> flag on <Code>MicroSettlement</Code> reports what actually happened, and
        a failed HTS attempt also emits <Code>HtsPayoutFallback</Code> with the raw Hedera response
        code. The owner can force the ERC-20 path with <Code>setHtsEnabled(false)</Code>. On
        testnet, three settlements went through HTS and two through the fallback.
      </>
    ),
  },
  {
    q: "Can the agency spend more than the client deposited?",
    a: (
      <>
        No. <Code>assignSubAgent</Code> reverts with <Code>FeeExceedsDeposit</Code> when committed
        fees would exceed the deposit, and <Code>settleSubAgent</Code> debits only that job&apos;s
        own escrow, reverting with <Code>InsufficientEscrow</Code> otherwise. Tasks that were
        assigned but never completed are never paid; their fees fall through into margin, which the
        treasury derives from the escrow remainder rather than from arithmetic done by the agency.
      </>
    ),
  },
  {
    q: "Who can withdraw the agency's margin?",
    a: (
      <>
        <Code>claimProfit</Code> is owner-only and additionally requires the caller to appear as a
        verified operator in the wired agency&apos;s registry; otherwise it reverts with{" "}
        <Code>OperatorNotVerified</Code>. Powers are separated: the agency contract may move escrow
        but can never touch retained margin, and the owner may claim margin but can never touch
        escrow. Both fund-moving paths sit behind a reentrancy guard.
      </>
    ),
  },
  {
    q: "Why is the subgraph self-hosted?",
    a: (
      <>
        The Graph&apos;s hosted service and Subgraph Studio do not support Hedera — it is absent
        from the networks registry that ships with <Code>graph-cli</Code>. Aetheris runs its own{" "}
        <Code>graph-node</Code> against the Hedera JSON-RPC relay, the path Hedera&apos;s own
        subgraph guide documents. <Code>subgraph/docker-compose.yml</Code> brings up the stack;
        GraphQL is served on port 8100 and IPFS on 5101 to avoid the usual port collisions.
      </>
    ),
  },
  {
    q: "What exactly is anchored to HCS, and what does DEMO DATA mean?",
    a: (
      <>
        <Code>completeTask</Code> requires a non-empty topic id and a sequence number, then emits{" "}
        <Code>TaskCompleted</Code> and <Code>HcsLogAnchored</Code> carrying the result hash, topic
        and sequence. The dashboard mirrors that topic when <Code>HEDERA_HCS_TOPIC_ID</Code> and
        operator credentials are set. Any panel without a live backend is badged{" "}
        <Code>DEMO DATA</Code> with the missing variable named inline — nothing is presented as
        chain data that isn&apos;t.
      </>
    ),
  },
  {
    q: "Can a client get their deposit back?",
    a: (
      <>
        Yes, while the job is still Funded or Dispatched. <Code>refundJob</Code> is callable by
        the client or the operator: it marks the job Refunded, cancels every assigned or completed
        task (emitting <Code>TaskCancelled</Code>), and returns the remaining escrow through the
        treasury&apos;s <Code>refundEscrow</Code>, emitting <Code>JobRefunded</Code>. Settled jobs
        cannot be refunded.
      </>
    ),
  },
];

export function Faq() {
  return (
    <Band tone="dark" id="faq" className={`scroll-mt-16 ${DARK_PB_SCOOP}`}>
      <Reveal className="mx-auto max-w-[640px] text-center">
        <WipeText
          as="h2"
          tone="dark"
          lines={["Frequently asked", "questions"]}
          className="display-2 text-fl-fg"
        />
        <p className="mt-4 text-[1.05rem] leading-[1.65] text-fl-fg2">
          How the contracts behave, and what is not built yet.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mx-auto mt-12 max-w-[820px]">
        <div className="divide-y divide-fl-border border-y border-fl-border">
          {FAQS.map((item, index) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center gap-4 px-[18px] py-[18px] text-left text-[1rem] font-medium text-fl-fg transition-colors hover:bg-fl-card [&::-webkit-details-marker]:hidden">
                <span className="mono-label w-6 shrink-0">{String(index + 1).padStart(2, "0")}</span>
                <span className="flex-1">{item.q}</span>
                <span
                  aria-hidden="true"
                  className="mono w-4 shrink-0 text-center text-[1.1rem] leading-none text-fl-fg2"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="px-[18px] pb-[22px] pl-[58px] text-[0.95rem] leading-[1.7] text-fl-fg2">
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </Reveal>
    </Band>
  );
}
