import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, P, Prose, UL } from "@/components/docs/prose";

export const metadata: Metadata = {
  title: "Trust model & FAQ",
  description:
    "What the Aetheris contracts enforce, what the operator controls, what happens off-chain, the honest limits of the testnet deployment, and direct answers to the questions people ask.",
};

interface Faq {
  id: string;
  q: string;
  a: React.ReactNode;
}

const FAQ: ReadonlyArray<Faq> = [
  {
    id: "faq-bypass",
    q: "What does World ID bypass mode actually mean?",
    a: (
      <>
        There is no World ID router contract on Hedera, so <Code>AetherisAgency</Code> was deployed with
        a zero router address. In that state <Code>verifyOperator</Code> skips only the zero-knowledge
        proof check. Everything else still runs: the nullifier hash is burned before anything else
        happens, a second call with the same nullifier reverts with <Code>NullifierAlreadyUsed</Code>,
        and the caller is marked as a verified operator. The mode is announced on-chain - the
        constructor emits <Code>WorldIdBypassActive</Code> and every bypassed registration emits{" "}
        <Code>OperatorVerifiedWithoutProof</Code> - and <Code>worldIdVerificationBypassed()</Code> returns
        true. The owner can turn real verification on without redeploying via{" "}
        <Code>setWorldId(router, groupId)</Code>. The human check that does run today happens
        off-chain: the IDKit v4 result is verified against World ID&apos;s cloud verifier in{" "}
        <Code>lib/worldid.ts</Code> before the server relays the transaction.
      </>
    ),
  },
  {
    id: "faq-self-hosted",
    q: "Why is the subgraph self-hosted instead of on The Graph network?",
    a: (
      <>
        Hedera is not in The Graph&apos;s network registry, and Subgraph Studio offers neither Hedera
        mainnet nor testnet. The supported path, and the one Hedera&apos;s own subgraph guide documents,
        is a graph-node you run yourself pointed at the Hedera JSON-RPC relay. That is what{" "}
        <Code>subgraph/docker-compose.yml</Code> and <Code>deploy/vps-subgraph.sh</Code> do. The trade-off
        is that readers trust whoever runs the indexer; the mitigation is that every entity is derived
        from contract events anyone can re-index, and the manifest, schema and handlers are in the
        repository.
      </>
    ),
  },
  {
    id: "faq-anchored",
    q: "What exactly is anchored to the Hedera Consensus Service?",
    a: (
      <>
        Every lifecycle step is written to topic <Addr value="0.0.10518320" kind="topic" /> as compact
        JSON - <Code>{"{evt, jobId, taskId?, agent?, amount?, token?, resultHash?, tx?, ts}"}</Code> -
        before the contract call, so the sequence number the network assigns can be passed into{" "}
        <Code>completeTask</Code> and matches what the mirror node returns. The one exception is{" "}
        <Code>ProfitClaimed</Code>, which <Code>scripts/claim-margin.js</Code> anchors after the receipt
        because that frame quotes the transaction hash it describes. HCS is append-only: a mistaken
        frame is retracted by a <Code>{"{evt:\"Correction\", voids:[seq], reason}"}</Code> record, and{" "}
        <Code>lib/hedera.ts</Code> hides voided frames while keeping the correction itself visible.
        The topic&apos;s submit key is the operator, so the log is tamper-evident and ordered by
        consensus, but it is authored by one party.
      </>
    ),
  },
  {
    id: "faq-refund",
    q: "Can a client get the deposit back?",
    a: (
      <>
        Yes, while the job is <Code>Funded</Code> or <Code>Dispatched</Code>. <Code>refundJob(jobId)</Code>{" "}
        can be called by the client or the operator; it cancels any assigned or completed-but-unpaid
        tasks, and the treasury returns the full escrow to the client. Once <Code>settleJob</Code> has run
        the status is <Code>Settled</Code> and the escrow has been split between sub-agents and margin, so
        there is nothing left to refund.
      </>
    ),
  },
  {
    id: "faq-sweep",
    q: "Who can sweep the margin?",
    a: (
      <>
        Only the treasury owner, and only if the agency reports that address as a verified operator.{" "}
        <Code>AetherisTreasury.claimProfit(token, amount, to)</Code> is <Code>onlyOwner</Code> and reverts
        with <Code>OperatorNotVerified</Code> unless <Code>isVerifiedOperator(msg.sender)</Code> is true. It
        can only move <Code>retainedMargin[token]</Code>, never escrow. <Code>sweepSurplus</Code> is separate
        and can only move whatever the treasury holds above <Code>totalObligations</Code> - airdrops and
        accidental transfers. One real claim of 0.5 aUSD has been made on the testnet deployment.
      </>
    ),
  },
  {
    id: "faq-ai",
    q: "Is the AI real? Do the sub-agents actually do work?",
    a: (
      <>
        Not in what is on-chain today. The contracts never call a model; they record a{" "}
        <Code>resultHash</Code> and an HCS reference for each completed task. The seeded lifecycle is
        produced by <Code>scripts/seed.js</Code>, which simulates the sub-agents: the result hash it
        commits is <Code>keccak256(specURI#taskIndex)</Code>, and the script itself calls{" "}
        <Code>completeTask</Code> as the operator. The sub-agent accounts are real Hedera accounts that
        really receive HTS payouts; the work attributed to them is not. The protocol is the payment,
        escrow and audit layer that an actual agent runtime would plug into, and the page says so with
        DEMO DATA pills wherever a panel is not reading chain data.
      </>
    ),
  },
  {
    id: "faq-hts",
    q: "HTS or ERC-20 - which one is used and why both?",
    a: (
      <>
        <Code>AetherisTreasury._payout</Code> tries the Hedera Token Service system contract at{" "}
        <Code>0x0000000000000000000000000000000000000167</Code> first when the token is an HTS token
        and <Code>htsEnabled</Code> is on; the precompile answers with an int64 response code
        (<Code>SUCCESS</Code> is 22). If that fails it emits <Code>HtsPayoutFallback</Code> with the code and
        falls back to a standard ERC-20 <Code>safeTransfer</Code>. <Code>MicroSettlement.viaHts</Code> records
        which rail ran, and the subgraph exposes it as <Code>Settlement.viaHts</Code>. Both rails are
        exercised on testnet: an HTS settlement measured 2,360,527 gas against 229,111 for ERC-20. The
        fallback exists because a call to an empty account returns <Code>UNKNOWN</Code> (21), so a
        deployment without the precompile still settles instead of bricking.
      </>
    ),
  },
  {
    id: "faq-tokens",
    q: "Why aUSD and aUSDC? Are they real stablecoins?",
    a: (
      <>
        No. Both are test assets. <strong>aUSD</strong> (<Addr value="0.0.10484673" kind="token" />, 6
        decimals) is an HTS fungible token created by the seed so the HTS rail can be exercised; the
        treasury had to <Code>associateToken</Code> with it first. <strong>aUSDC</strong>{" "}
        (<Addr value="0x21DCc52AbbCAef92B4573dc8B0e1658417c85961" />, 6 decimals) is a
        plain test ERC-20 with an open <Code>mint</Code>, which is what lets the faucet hand out 10 aUSDC
        per drip and lets the client view fund a job from the browser. Neither is backed by anything.
      </>
    ),
  },
  {
    id: "faq-production",
    q: "Is this production ready?",
    a: (
      <>
        No. It is a testnet deployment built for ETHOnline 2026. The contracts have 37 Hardhat tests and
        guard the invariants described above, but they have not been audited; the operator, relayer
        and faucet are one key; World ID proofs are not verified on-chain; the indexer is a single
        self-hosted node; and <Code>worldIdVerificationBypassed()</Code> is documented in the source as
        something that must be false on any deployment that handles real value.
      </>
    ),
  },
  {
    id: "faq-1inch",
    q: "Does the 1inch panel rebalance the treasury?",
    a: (
      <>
        No. 1inch does not support Hedera, so <Code>/api/swap/quote</Code> and <Code>/api/swap/build</Code>{" "}
        quote pairs on Ethereum, Arbitrum, Base, Optimism and Polygon. It is a routing tool for the
        operator&apos;s EVM wallet. The treasury&apos;s <Code>rebalance</Code> function records the settled
        result of an off-chain swap for accounting and audit; it does not execute one.
      </>
    ),
  },
  {
    id: "faq-verify",
    q: "How can I check any of this myself?",
    a: (
      <>
        Read the contracts on HashScan (<Addr value="0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81" short />{" "}
        and <Addr value="0x10360383a6b43Fd22BE257bE334E9A9ad83B5598" short />), list the topic messages
        with <Code>GET /api/hcs?limit=</Code> or directly from the mirror node at{" "}
        <Code>https://testnet.mirrornode.hedera.com</Code>, and compare the subgraph&apos;s{" "}
        <Code>Settlement</Code> and <Code>HcsAnchor</Code> entities against the emitted events. The
        source for everything, including the seed, is at{" "}
        <A href="https://github.com/mrnetwork0001/Aetheris">github.com/mrnetwork0001/Aetheris</A>.
      </>
    ),
  },
];

export default function TrustAndFaqPage() {
  return (
    <Prose>
      <p className="mono-label">Trust</p>
      <H1 className="mt-3">Trust model &amp; FAQ</H1>
      <Lede>
        Aetheris is honest about where its guarantees come from. Some things are enforced by Solidity
        and cannot be bypassed by anyone, including the operator. Some things the operator decides.
        Some things happen off-chain and are only recorded. This page draws those three lines, then
        answers the questions people ask.
      </Lede>

      <H2 id="enforced">What the contracts enforce</H2>
      <P>
        These hold for every caller, operator included, and are tested in{" "}
        <Code>test/aetheris.test.js</Code>.
      </P>
      <UL>
        <LI>
          <strong>Escrow is solvent.</strong> <Code>createJob</Code> moves the deposit into the treasury,
          and <Code>AetherisTreasury.recordEscrow</Code> re-reads its own balance and reverts with{" "}
          <Code>SolvencyCheckFailed</Code> if the tokens did not land.
        </LI>
        <LI>
          <strong>Committed fees never exceed the deposit.</strong> <Code>assignSubAgent</Code> reverts
          with <Code>FeeExceedsDeposit</Code> when the running total would pass <Code>job.deposit</Code>.
        </LI>
        <LI>
          <strong>Only completed work is paid.</strong> <Code>settleJob</Code> pays tasks whose status is{" "}
          <Code>Completed</Code>, marks them <Code>Paid</Code>, and the margin is whatever escrow remains.
          Assigned-but-unfinished tasks earn nothing.
        </LI>
        <LI>
          <strong>Escrow and margin are separate pools.</strong> Escrow operations on the treasury are{" "}
          <Code>onlyAgency</Code>; <Code>claimProfit</Code> can draw only from <Code>retainedMargin</Code>;{" "}
          <Code>sweepSurplus</Code> can move only balance in excess of <Code>totalObligations</Code>.
        </LI>
        <LI>
          <strong>Refunds are bounded by status.</strong> <Code>refundJob</Code> works only while a job is{" "}
          <Code>Funded</Code> or <Code>Dispatched</Code>, only for the client or the operator, and returns
          the full escrow.
        </LI>
        <LI>
          <strong>Margin needs a verified human.</strong> <Code>claimProfit</Code> reverts with{" "}
          <Code>OperatorNotVerified</Code> unless the agency&apos;s <Code>isVerifiedOperator</Code> is true
          for the caller.
        </LI>
        <LI>
          <strong>A nullifier is burned once.</strong> <Code>verifyOperator</Code> marks the nullifier
          used before any external call and reverts on reuse - in bypass mode too.
        </LI>
        <LI>
          <strong>Bypass is never silent.</strong> A zero World ID router emits{" "}
          <Code>WorldIdBypassActive</Code> at construction and on <Code>setWorldId</Code>, and each bypassed
          registration emits <Code>OperatorVerifiedWithoutProof</Code>.
        </LI>
        <LI>
          <strong>Rail downgrades are visible.</strong> A failed HTS transfer emits{" "}
          <Code>HtsPayoutFallback</Code> with the Hedera response code before the ERC-20 path runs.
        </LI>
      </UL>

      <H2 id="operator">What the operator controls</H2>
      <P>
        The operator is the <Code>owner()</Code> of both contracts - the deployer. On Hedera testnet
        that is account <Addr value="0.0.10484502" kind="account" /> (
        <Addr value="0x69677C85945796066B449c00F90A0582896F1F9b" kind="account" short />).
      </P>
      <KV
        caption="Operator-only actions and where they are gated"
        rows={[
          {
            key: "Staffing a job",
            value: (
              <>
                <Code>assignSubAgent</Code>, <Code>cancelTask</Code>, and <Code>completeTask</Code> on behalf of
                a sub-agent are <Code>onlyOwner</Code> (the sub-agent may also complete its own task).
              </>
            ),
          },
          {
            key: "Settling",
            value: (
              <>
                <Code>settleJob</Code> is <Code>onlyOwner</Code>. A client cannot force settlement; the client
                can refund instead while the job is unsettled.
              </>
            ),
          },
          {
            key: "Treasury configuration",
            value: (
              <>
                <Code>setAgency</Code>, <Code>setHtsEnabled</Code>, <Code>associateToken</Code> and{" "}
                <Code>dissociateToken</Code>.
              </>
            ),
          },
          {
            key: "World ID router",
            value: (
              <>
                <Code>setWorldId(router, groupId)</Code> can enable real proof checking or re-enter bypass
                mode.
              </>
            ),
          },
          {
            key: "Margin",
            value: (
              <>
                <Code>claimProfit</Code> (after verification) and <Code>sweepSurplus</Code>.{" "}
                <Code>rebalance</Code> records an off-chain swap into the margin accounting.
              </>
            ),
          },
          {
            key: "Off-chain keys",
            value: (
              <>
                The same key is the HCS topic submit key, the World ID relayer in{" "}
                <Code>POST /api/operator/verify</Code>, and the faucet signer in <Code>POST /api/faucet</Code>.
              </>
            ),
          },
        ]}
      />
      <Callout tone="warn" label="Single key">
        One ECDSA key deploys, operates, relays, drips and writes the audit log. Compromise of that key
        lets an attacker assign and settle jobs and spend the faucet balance. It still cannot take
        escrow out of the treasury except by settling completed tasks to sub-agents or refunding
        clients, and it cannot claim margin without first registering a nullifier.
      </Callout>

      <H2 id="off-chain">What is off-chain</H2>
      <UL>
        <LI>
          <strong>The work.</strong> The contract stores a <Code>specURI</Code> and, per task, a{" "}
          <Code>resultHash</Code> plus an HCS topic and sequence number. Whether the hash corresponds to
          useful output is not something the chain can check.
        </LI>
        <LI>
          <strong>The audit frames.</strong> HCS orders and timestamps the frames by consensus and makes
          them immutable, but their content is authored by the operator. Corrections are append-only
          and stay visible.
        </LI>
        <LI>
          <strong>Proof of personhood.</strong> Today the World ID 4.0 result is verified by
          World ID&apos;s cloud verifier (<Code>lib/worldid.ts</Code>); the on-chain contract only burns
          the nullifier the server forwards.
        </LI>
        <LI>
          <strong>The index.</strong> The subgraph is one graph-node you or we run. It derives
          everything from contract events, so it can be re-indexed and checked, but it is not a
          decentralised network.
        </LI>
        <LI>
          <strong>Quotes and names.</strong> 1inch quotes come from the 1inch API for other EVM chains;
          ENS names are resolved on Ethereum mainnet through a public RPC (<Code>lib/ens.ts</Code>).
          Neither touches Hedera state.
        </LI>
      </UL>

      <H2 id="limits">Known limits</H2>
      <P>Stated plainly, because the UI states them too:</P>
      <UL>
        <LI>
          <strong>Single relayer and faucet key</strong> - the deployer key does everything the server
          signs.
        </LI>
        <LI>
          <strong>Testnet only</strong> - Hedera testnet, chain id 296; no mainnet deployment exists.
        </LI>
        <LI>
          <strong>World ID bypass on-chain</strong> - no router on Hedera, so the ZK proof is not
          checked by the contract.
        </LI>
        <LI>
          <strong>Self-hosted indexer</strong> - Hedera is not on The Graph network.
        </LI>
        <LI>
          <strong>1inch is not on Hedera</strong> - the swap panel routes for the operator&apos;s EVM
          wallet on other chains, it does not rebalance the treasury.
        </LI>
        <LI>
          <strong>Sub-agent work is simulated</strong> - the seed commits result hashes; no model call
          is part of the contracts.
        </LI>
        <LI>
          <strong>Panels are labelled</strong> - every panel carries a LIVE or DEMO DATA pill with the
          reason; nothing is presented as chain data that is not.
        </LI>
      </UL>

      <H2 id="faq">FAQ</H2>
      {FAQ.map((item) => (
        <section key={item.id} aria-labelledby={item.id}>
          <H3 id={item.id}>{item.q}</H3>
          <P>{item.a}</P>
        </section>
      ))}
    </Prose>
  );
}
