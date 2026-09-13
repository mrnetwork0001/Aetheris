import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The Aetheris settlement loop from a client deposit to a margin sweep: fund, assign, complete, settle, anchor, index, sweep.",
};

const HCS_TOPIC = "0.0.10518320";
const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";

export default function HowItWorksPage() {
  return (
    <Prose>
      <p className="mono-label">Getting started</p>
      <H1 className="mt-3">How it works</H1>
      <Lede>
        One job is one deposit. A client pays once into escrow, the operator names the sub-agents who
        will do the work and the fee each one earns, and settlement pays exactly the tasks that were
        completed. Whatever is left is the agency&apos;s margin. Every step is written to a public log
        before the contract call that performs it.
      </Lede>
      <P>
        Two contracts split the responsibility. <Code>contracts/AetherisAgency.sol</Code> (
        <Addr value={AGENCY_ADDRESS} short />) owns jobs, tasks and the operator registry;{" "}
        <Code>contracts/AetherisTreasury.sol</Code> (<Addr value={TREASURY_ADDRESS} short />) holds the
        money. The agency is the only contract that may move escrow, and the treasury&apos;s owner may
        claim margin but can never touch escrow - the two are kept apart on purpose.
      </P>

      <H2 id="the-loop">The loop</H2>
      <P>
        The seed script (<Code>scripts/seed.js</Code>) drives this exact sequence against the testnet
        deployment, so every step below has already happened on chain at least once.
      </P>
      <OL className="mt-6 space-y-4">
        <LI>
          <strong>Fund.</strong> The client approves the <em>agency</em> (not the treasury) to spend
          the deposit, then calls <Code>createJob(token, deposit, specURI)</Code>. The agency moves the
          tokens straight into the treasury and calls <Code>recordEscrow</Code>, which re-reads its own
          balance and reverts with <Code>SolvencyCheckFailed</Code> if the funds did not actually land.
          The job is now <Code>Funded</Code>. Deposits can be an HTS token (aUSD) or a plain ERC-20
          (aUSDC).
        </LI>
        <LI>
          <strong>Assign.</strong> The operator calls{" "}
          <Code>assignSubAgent(jobId, subAgent, fee, role)</Code> once per task. The contract adds the
          fee to <Code>committedFees</Code> and reverts with <Code>FeeExceedsDeposit</Code> if the
          total would pass the deposit, so a job is always solvent before any work starts. The first
          assignment moves the job to <Code>Dispatched</Code>.
        </LI>
        <LI>
          <strong>Complete.</strong> The sub-agent (or the operator on its behalf) calls{" "}
          <Code>completeTask(jobId, taskId, resultHash, hcsTopicId, hcsSequenceNumber)</Code>. The
          result hash and the HCS coordinates are stored and two events fire: <Code>TaskCompleted</Code>{" "}
          advances state, <Code>HcsLogAnchored</Code> is the audit anchor. When every task is complete
          the job becomes <Code>Completed</Code>.
        </LI>
        <LI>
          <strong>Settle.</strong> The operator calls <Code>settleJob(jobId)</Code>. The contract marks
          the job <Code>Settled</Code> first, then loops over the tasks and pays each one in{" "}
          <Code>Completed</Code> state through <Code>treasury.settleSubAgent</Code>. Assigned-but-unfinished
          tasks are skipped, so their fee is never paid and falls through into margin. Finally{" "}
          <Code>closeEscrow</Code> promotes the remainder to <Code>retainedMargin</Code>. See{" "}
          <A href="/docs/settlement">Settlement rails</A> for how each payout picks HTS or ERC-20.
        </LI>
        <LI>
          <strong>Anchor.</strong> Before each of the calls above, the operator writes a compact JSON
          frame to Hedera Consensus Service topic <Addr value={HCS_TOPIC} kind="topic" />. For{" "}
          <Code>completeTask</Code> the sequence number the network assigns is what gets passed into the
          contract, so the on-chain <Code>hcsSequenceNumber</Code> matches the mirror node exactly.
          Settlement is the one step recorded after the fact, because its amounts and{" "}
          <Code>viaHts</Code> flags are read from the receipt&apos;s events rather than assumed (
          <Code>scripts/seed.js</Code>). See <A href="/docs/audit-log">Audit log</A>.
        </LI>
        <LI>
          <strong>Index.</strong> A self-hosted graph-node follows both contracts through the Hedera
          JSON-RPC relay and turns the event stream into <Code>Job</Code>, <Code>Task</Code>,{" "}
          <Code>Settlement</Code> and <Code>HcsAnchor</Code> entities (<Code>subgraph/schema.graphql</Code>
          ). Gross revenue, payouts and margin are reconciled from events, not copied from the
          contract. See <A href="/docs/subgraph">The Graph subgraph</A>.
        </LI>
        <LI>
          <strong>Sweep.</strong> Margin sits in the treasury until the operator calls{" "}
          <Code>claimProfit(token, amount, to)</Code>. That call is <Code>onlyOwner</Code> and also asks
          the agency&apos;s registry <Code>isVerifiedOperator(msg.sender)</Code>; an operator who has not
          cleared World ID gets <Code>OperatorNotVerified</Code>. The nullifier that verified them is
          echoed into <Code>ProfitClaimed</Code>. One real sweep of 0.5 aUSD has happened on testnet.
        </LI>
      </OL>

      <Callout label="What makes it different">
        <UL className="mt-0 text-[0.95rem]">
          <LI>
            <strong>One deposit.</strong> The client pays once; the agency splits it. No per-task
            invoices, no top-ups mid-job.
          </LI>
          <LI>
            <strong>Ceiling enforced.</strong> Committed fees can never exceed the deposit (
            <Code>FeeExceedsDeposit</Code>), and settlement only pays what was completed. The agency
            cannot overspend the job and cannot pay for work that was not delivered.
          </LI>
          <LI>
            <strong>Named payees.</strong> Every task has a sub-agent address and a role string on
            chain before the work begins, and <Code>MicroSettlement</Code> names who was paid, how
            much, and over which rail.
          </LI>
          <LI>
            <strong>Public log.</strong> The HCS topic is readable by anyone from the mirror node, and
            the sequence numbers it assigns are the ones the contract stores.
          </LI>
        </UL>
      </Callout>

      <H2 id="the-money-path">Where the money sits at each step</H2>
      <Pre title="per token, inside AetherisTreasury">
{`totalObligations[token]  =  sum(open escrows)  +  retainedMargin[token]

createJob      client -> treasury          escrow[jobId] += deposit
settleSubAgent treasury -> sub-agent       escrow[jobId] -= fee        (per Completed task)
closeEscrow    escrow -> retained margin   retainedMargin += remainder
refundJob      treasury -> client          escrow[jobId]  = 0
claimProfit    treasury -> operator        retainedMargin -= amount    (World ID gated)`}
      </Pre>
      <P>
        The treasury never trusts arithmetic done in the agency: <Code>recordEscrow</Code> checks that{" "}
        <Code>balanceOf(address(this))</Code> covers <Code>totalObligations</Code> after every deposit,
        which also rejects fee-on-transfer tokens instead of silently under-funding a job.
      </P>

      <H2 id="two-rails">Two rails, one event</H2>
      <P>
        On Hedera the treasury pays through the Hedera Token Service system contract at{" "}
        <span className="data-mono break-all">{HTS_PRECOMPILE}</span>. If the token is not an HTS
        entity, or HTS declines the transfer, it drops to a plain ERC-20 <Code>transfer</Code>. Either
        way the same <Code>MicroSettlement</Code> event fires, and its <Code>viaHts</Code> flag records
        which rail actually ran. On testnet today six settlements went over HTS (jobs 1 and 5) and four over ERC-20 (jobs 2 and 6).
      </P>

      <H2 id="honest-limits">What is and is not on chain</H2>
      <UL>
        <LI>
          The sub-agent <strong>work</strong> in the seed is simulated by the script: it commits a
          result hash, and no model call is part of the contracts.
        </LI>
        <LI>
          World ID proofs are verified server-side and relayed; there is no World ID router on Hedera,
          so the contract runs in explicit bypass mode and only the ZK check is skipped. Replay
          protection stays active.
        </LI>
        <LI>
          The relayer, faucet and HCS submit key are a single deployer key, and everything runs on
          testnet. See <A href="/docs/trust-and-faq">Trust model &amp; FAQ</A>.
        </LI>
      </UL>

      <H2 id="read-next">Read next</H2>
      <UL>
        <LI>
          <A href="/docs/jobs-and-escrow">Jobs &amp; escrow</A> - the exact function signatures,
          statuses and refund rules.
        </LI>
        <LI>
          <A href="/docs/settlement">Settlement rails</A> - HTS response codes, association and the
          measured gas cost of each path.
        </LI>
      </UL>
    </Prose>
  );
}
