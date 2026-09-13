import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "The operator",
  description:
    "Who the Aetheris operator is, what Mission Control shows, how the World ID gate relays verifyOperator on Hedera, how margin is claimed, and the scripts the operator runs.",
};

const OPERATOR_ACCOUNT = "0.0.10484502";
const OPERATOR_EVM = "0x69677C85945796066B449c00F90A0582896F1F9b";
const HCS_TOPIC = "0.0.10518320";
const AUSD_EVM = "0x00000000000000000000000000000000009ffBC1";
const CLAIM_TX = "0x830486f9c20907b2db3a73e20a962fc6008b7121c65dbd3e9bfa2cbb81510c50";
const HCS_MESSAGE = (seq: number) =>
  `https://testnet.mirrornode.hedera.com/api/v1/topics/${HCS_TOPIC}/messages/${seq}`;
const HCS_MESSAGES_TAB = `https://hashscan.io/testnet/topic/${HCS_TOPIC}/messages`;

const OPERATOR_ROWS = [
  { key: "Hedera account", value: <Addr value={OPERATOR_ACCOUNT} kind="account" /> },
  { key: "EVM address", value: <Addr value={OPERATOR_EVM} kind="account" /> },
  {
    key: "Owns",
    value: (
      <>
        <Code>AetherisAgency</Code> (<Addr value={AGENCY_ADDRESS} short />) and{" "}
        <Code>AetherisTreasury</Code> (<Addr value={TREASURY_ADDRESS} short />), both OpenZeppelin{" "}
        <Code>Ownable</Code>.
      </>
    ),
  },
  {
    key: "Signs with",
    value: (
      <>
        <Code>PRIVATE_KEY</Code> for every EVM call (deploy, relay, faucet) and{" "}
        <Code>HEDERA_OPERATOR_KEY</Code> for HCS submits. The topic&apos;s submit key is this account.
      </>
    ),
  },
  {
    key: "Only the operator may",
    value: (
      <>
        <Code>assignSubAgent</Code>, <Code>cancelTask</Code>, <Code>settleJob</Code>,{" "}
        <Code>setWorldId</Code>, <Code>claimProfit</Code>. <Code>completeTask</Code> is open to the
        sub-agent or the operator; <Code>refundJob</Code> to the client or the operator.
      </>
    ),
  },
] as const;

const RELAY_STATUS_ROWS = [
  { key: <Code>200</Code>, value: <>Relayed. Body carries <Code>txHash</Code>, <Code>hashscan</Code>, <Code>nullifierHash</Code>, <Code>ensName</Code>, <Code>blockNumber</Code> and <Code>worldIdBypassed</Code>.</> },
  { key: <Code>400</Code>, value: <>Malformed body: no <Code>result</Code> or legacy <Code>proof</Code>, a zero nullifier, a <Code>signal</Code> that is not an EVM address, an invalid <Code>ensName</Code>, or an unexpected field.</> },
  { key: <Code>401 PROOF_REJECTED</Code>, value: <>World ID&apos;s verifier rejected the proof. Nothing was sent on-chain.</> },
  { key: <Code>409 NULLIFIER_ALREADY_USED</Code>, value: <>The nullifier is already burned in the agency - checked with <Code>nullifierHashUsed</Code> before sending, and again if the transaction reverts with <Code>NullifierAlreadyUsed</Code>.</> },
  { key: <Code>429 RATE_LIMITED</Code>, value: <>More than 5 relays per minute from one IP. The relay spends the deployer&apos;s HBAR.</> },
  { key: <Code>502</Code>, value: <>The verifier or the Hedera relay was unreachable, or the transaction reverted for another reason.</> },
  { key: <Code>503 WORLD_ID_NOT_CONFIGURED</Code>, value: <><Code>NEXT_PUBLIC_WORLD_ID_APP_ID</Code> is unset. The route never pretends success.</> },
  { key: <Code>503 RELAYER_NOT_CONFIGURED</Code>, value: <><Code>PRIVATE_KEY</Code> or <Code>NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS</Code> is missing or malformed.</> },
] as const;

export default function OperatorPage() {
  return (
    <Prose>
      <p className="mono-label">Roles</p>
      <H1 className="mt-3">The operator</H1>
      <Lede>
        The operator is the human who runs the agency: the address that deployed both contracts,
        dispatches work, settles jobs and is the only party who can take margin out of the treasury.
        On this deployment that is one key, and every step below is what that key actually does.
      </Lede>

      <H2 id="who">Who the operator is</H2>
      <P>
        <Code>scripts/deploy.js</Code> passes the deployer as <Code>initialOwner</Code> of{" "}
        <Code>contracts/AetherisAgency.sol</Code> and as owner of{" "}
        <Code>contracts/AetherisTreasury.sol</Code>, so &quot;operator&quot; and &quot;deployer&quot; are
        the same address. The app learns it from the <Code>Operator</Code> entity the subgraph indexes
        from <Code>AgencyDeployed</Code>, falling back to{" "}
        <Code>NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS</Code> with a caveat when the subgraph has not
        answered (<Code>components/aetheris-server.ts</Code>).
      </P>
      <KV rows={OPERATOR_ROWS} caption="The operator on Hedera testnet" />
      <Callout tone="warn" label="Single key">
        The same key deploys, relays <Code>verifyOperator</Code>, signs faucet drips, submits HCS
        frames and claims margin. That is fine for a testnet demo and stated plainly in{" "}
        <A href="/docs/trust-and-faq">Trust model &amp; FAQ</A>; a production agency would split the
        relayer, the faucet and the treasury owner.
      </Callout>

      <H2 id="mission-control">What Mission Control shows</H2>
      <P>
        <A href="/dashboard">/dashboard</A> is rendered per request by{" "}
        <Code>app/(app)/dashboard/page.tsx</Code>. The workspace is chosen by{" "}
        <Code>components/app/role-context.tsx</Code>: if the connected wallet equals the agency&apos;s
        operator the Operator view is shown; if it has funded at least one indexed job the Client view
        is shown; the Operator | Client toggle in the sidebar overrides either and remembers the choice
        in <Code>localStorage</Code> under <Code>aetheris.role</Code>. Signed out, the Operator view is
        the default.
      </P>
      <P>The Operator view is, top to bottom:</P>
      <UL>
        <LI>
          <strong>Header.</strong> The agency&apos;s ENS name or short address, the operator address, a
          &quot;Hedera testnet - 296&quot; pill, the LIVE / DEMO DATA pill and the World ID provenance
          badge (below).
        </LI>
        <LI>
          <strong>Stat row</strong> (<Code>components/app/stat-row.tsx</Code>): treasury margin retained
          after payouts, jobs in flight with lifetime and settled counts, total paid to sub-agents with
          the roster size, and the HCS anchor count with average consensus finality.
        </LI>
        <LI>
          <strong>Job pipeline</strong> (<Code>#jobs</Code>): every indexed job with its tasks, filterable
          by all / in flight / settled, linking to the agency contract on HashScan.
        </LI>
        <LI>
          <strong>Sub-agent leaderboard</strong> (<Code>#agents</Code>): earnings and latency indexed from{" "}
          <Code>MicroSettlement</Code> events by the subgraph.
        </LI>
        <LI>
          <strong>Treasury</strong> (<Code>#treasury</Code>, <Code>#swap</Code>): holdings read straight
          from <Code>AetherisTreasury</Code> over the relay plus the HBAR balance, and the 1inch quote
          form described in <A href="/docs/integrations#oneinch">Integrations</A>.
        </LI>
        <LI>
          <strong>Human operator required</strong> (<Code>#operator</Code>): the World ID gate and the
          margin sweep button, both owned by <Code>components/treasury-panel.tsx</Code>.
        </LI>
        <LI>
          <strong>HCS audit stream</strong> (<Code>#audit</Code>): the latest frames from topic{" "}
          <Addr value={HCS_TOPIC} kind="topic" /> with corrections applied.
        </LI>
      </UL>
      <H3 id="badge">The World ID badge never overstates</H3>
      <P>
        <Code>components/operator-verification-badge.tsx</Code> combines two on-chain reads from{" "}
        <Code>lib/operator-registry.ts</Code> - <Code>isVerifiedOperator(operator)</Code> and{" "}
        <Code>worldIdVerificationBypassed()</Code> - and shows exactly one of: &quot;World ID
        verified&quot; (router present, proof checked on-chain), &quot;Verified - bypass mode - no ZK
        proof on-chain&quot;, &quot;Verified - bypass mode - seed nullifier&quot; (the registration came
        from <Code>scripts/seed.js</Code>, not from a relayed proof), &quot;Operator unverified&quot; or
        &quot;World ID status unknown&quot;. On Hedera testnet today the honest answer is one of the two
        bypass labels.
      </P>

      <H2 id="world-id">The World ID gate</H2>
      <P>
        Sweeping margin is gated on proof of personhood. The browser half lives in{" "}
        <Code>components/worldid-gate.tsx</Code>, the server half in{" "}
        <Code>app/api/worldid/rp-context/route.ts</Code>, <Code>lib/worldid.ts</Code> and{" "}
        <Code>app/api/operator/verify/route.ts</Code>. The flow is IDKit v4 end to end:
      </P>
      <OL className="mt-6 space-y-4">
        <LI>
          <strong>Request context.</strong> &quot;Verify with World ID&quot; POSTs{" "}
          <Code>{"{action}"}</Code> to <Code>/api/worldid/rp-context</Code>. The route signs a nonce
          with <Code>WORLD_ID_RP_SIGNING_KEY</Code> (<Code>signRequest</Code> from{" "}
          <Code>@worldcoin/idkit-core</Code>, 300 s TTL) and returns{" "}
          <Code>{"{rp_id, nonce, created_at, expires_at, signature}"}</Code>. The key never reaches the
          browser. Without <Code>WORLD_ID_RP_ID</Code> and the key the route answers 503.
        </LI>
        <LI>
          <strong>Prove.</strong> <Code>IDKitRequestWidget</Code> opens with the app id, the action{" "}
          <Code>aetheris-operator</Code>, that <Code>rp_context</Code>, the <Code>proofOfHuman</Code>{" "}
          preset committed to the operator address as signal, and{" "}
          <Code>allow_legacy_proofs=false</Code>. The user scans with World App.
        </LI>
        <LI>
          <strong>Relay.</strong> The raw IDKit 4.0 result is POSTed as{" "}
          <Code>{"{result, signal, ensName?}"}</Code> to <Code>/api/operator/verify</Code>. The route
          rate-limits per IP (5 per minute), validates the shape and extracts the RP-scoped nullifier
          from <Code>responses[0].nullifier</Code>.
        </LI>
        <LI>
          <strong>Verify server-side.</strong> <Code>verifyWorldIdV4</Code> forwards the result unchanged
          to <Code>POST https://developer.worldcoin.org/api/v4/verify/{"{rp_id}"}</Code> (base overridable with{" "}
          <Code>WORLD_ID_API_BASE</Code>). A 4xx becomes <Code>401 PROOF_REJECTED</Code>; nothing is sent
          on-chain.
        </LI>
        <LI>
          <strong>Check the nullifier.</strong> <Code>nullifierHashUsed(nullifier)</Code> is read from
          the agency over the relay (ethers with <Code>batchMaxCount: 1</Code>, because Hashio rejects
          batched calls). If it is already burned the route answers{" "}
          <Code>409 NULLIFIER_ALREADY_USED</Code>.
        </LI>
        <LI>
          <strong>Burn it on-chain.</strong> The deployer key sends{" "}
          <Code>verifyOperator(signal, 0, nullifier, [0 x 8], ensName ?? &quot;aetheris.eth&quot;)</Code>.
          The contract reverts <Code>ZeroAddress</Code> / <Code>InvalidNullifier</Code> /{" "}
          <Code>NullifierAlreadyUsed</Code> first, then sets <Code>nullifierHashUsed</Code> before any
          external call, then marks <Code>isVerifiedOperator[signal]</Code>, stores the nullifier and ENS
          name, and emits <Code>OperatorVerified</Code>.
        </LI>
        <LI>
          <strong>Show the receipt.</strong> The gate renders the HashScan link for the{" "}
          <Code>verifyOperator</Code> transaction, the nullifier, and the on-chain note. A second proof
          from the same human is shown as &quot;Nullifier already burned on-chain&quot; from the 409.
        </LI>
      </OL>
      <KV rows={RELAY_STATUS_ROWS} caption="POST /api/operator/verify responses" />
      <H3 id="bypass">Announced bypass mode</H3>
      <P>
        There is no World ID router contract on Hedera, so the agency was deployed with{" "}
        <Code>WORLD_ID_ROUTER_ADDRESS</Code> unset. The constructor emits{" "}
        <Code>WorldIdBypassActive(agency, &quot;WORLD_ID_ROUTER_UNSET: zero-knowledge proofs are NOT
        verified on this deployment&quot;)</Code>, and inside <Code>verifyOperator</Code> the branch that
        would call <Code>router.verifyProof</Code> instead emits{" "}
        <Code>OperatorVerifiedWithoutProof(signal, nullifierHash)</Code>. Only the ZK check is skipped:
        the nullifier is burned exactly as it would be with a router, so replay protection holds. The
        view <Code>worldIdVerificationBypassed()</Code> reports the mode and the relay echoes it as{" "}
        <Code>worldIdBypassed: true</Code>. <Code>setWorldId(router, groupId)</Code> lets the owner
        attach a router later; clearing it emits <Code>WorldIdBypassActive</Code> again.
      </P>
      <Callout tone="warn" label="Simulated fallback">
        When the app id is missing or <Code>/api/worldid/rp-context</Code> answers 503, the gate falls
        back to a check labelled &quot;Simulated human check&quot; with a fixed placeholder nullifier and
        the note &quot;Nothing was sent to AetherisAgency&quot;. It is a demo of the UI path, not a
        verification, and the amber pill says so. The deployed app id is a production World ID app, so
        real proofs come from World App, not the Simulator.
      </Callout>

      <H2 id="claim-profit">Claiming margin</H2>
      <P>
        <Code>AetherisTreasury.claimProfit(token, amount, to)</Code> is <Code>onlyOwner</Code> and
        additionally requires <Code>IAetherisOperatorRegistry(agency).isVerifiedOperator(msg.sender)</Code>,
        otherwise it reverts <Code>OperatorNotVerified</Code>. It checks <Code>retainedMargin[token]</Code>{" "}
        (<Code>InsufficientMargin</Code> if short), debits it and <Code>totalObligations</Code>, pays
        through the same HTS-or-ERC-20 <Code>_payout</Code> used for sub-agents, and emits{" "}
        <Code>ProfitClaimed(operator, token, amount, nullifierHash)</Code> with the nullifier that
        verified the operator, so the subgraph can tie the payout to the proof. Escrow is untouchable
        by this path; only closed-job margin is claimable.
      </P>
      <H3 id="the-real-claim">The one real claim</H3>
      <P>
        <Code>scripts/claim-margin.js</Code> performed a single claim of 0.5 aUSD (500000 base units of{" "}
        <Addr value={AUSD_EVM} kind="token" short />) to the operator in transaction{" "}
        <Addr value={CLAIM_TX} kind="transaction" short /> at block 40453585. The script then anchored{" "}
        <A href={HCS_MESSAGE(26)}>frame #26</A> to the topic <em>after</em> the receipt - for a claim
        the chain is the source of truth, so the frame quotes the transaction hash it describes - and
        appended <A href={HCS_MESSAGE(27)}>Correction #27</A> voiding{" "}
        <A href={HCS_MESSAGE(25)}>frame #25</A>, a test frame that had no matching on-chain event.
        Readers (<Code>lib/hedera.ts</Code>) hide #25 and keep the correction visible. The frame links
        open the raw mirror-node record for each sequence number; HashScan lists the same frames under
        the topic&apos;s <A href={HCS_MESSAGES_TAB}>Messages tab</A>.
      </P>
      <Callout tone="warn" label="The dashboard sweep button">
        The &quot;Sweep margin to operator&quot; button in <Code>components/treasury-panel.tsx</Code>{" "}
        appears once the gate has a verification result and POSTs a <Code>ProfitClaimed</Code> frame to{" "}
        <Code>/api/hcs</Code>. It does <strong>not</strong> call <Code>claimProfit</Code>; the on-chain
        claim runs from the script above with the treasury owner&apos;s key. Frame #25 is what that
        button produced during testing, which is exactly why the correction mechanism exists.
      </Callout>

      <H2 id="scripts">Scripts the operator runs</H2>
      <Pre title="shell">{`npm run compile                      # hardhat compile
npm run test:contracts               # 37 tests in test/aetheris.test.js
npm run deploy:hedera                # scripts/deploy.js - prints .env + subgraph.yaml blocks
npx hardhat run scripts/seed.js --network hederaTestnet
npx hardhat run scripts/claim-margin.js --network hederaTestnet`}</Pre>
      <UL>
        <LI>
          <strong><Code>scripts/seed.js</Code></strong> drives a full lifecycle against the deployed
          contracts: Job A settled in aUSD over HTS with three tasks to the three Hedera-native
          sub-agents, Job B settled in aUSDC over ERC-20 with two tasks, and Job C left Dispatched with
          one task completed and one outstanding. For <Code>JobCreated</Code>,{" "}
          <Code>SubAgentAssigned</Code> and <Code>TaskCompleted</Code> the HCS frame is written first
          and its sequence number passed into <Code>completeTask</Code>; settlement frames are written
          from the receipt&apos;s events. If the HTS stage fails the ERC-20 stages still run.
        </LI>
        <LI>
          <strong><Code>scripts/claim-margin.js</Code></strong> audits every <Code>ProfitClaimed</Code>{" "}
          frame against the treasury&apos;s events since block 40396776, claims{" "}
          <Code>min(0.5 aUSD, retainedMargin(aUSD))</Code> with a 1,000,000 gas limit, anchors the
          truthful frame, and appends a <Code>Correction</Code> for any frame with no on-chain event.
        </LI>
        <LI>
          <strong><Code>scripts/hcs.js</Code></strong> is the shared helper both use to submit frames with{" "}
          <Code>HEDERA_OPERATOR_ID</Code> / <Code>HEDERA_OPERATOR_KEY</Code>; the app&apos;s{" "}
          <Code>POST /api/hcs</Code> does the same from the server.
        </LI>
      </UL>
      <Callout label="What the seed does not do">
        The sub-agent &quot;work&quot; in the seed is simulated by the script: it commits result hashes
        and completes tasks on the agents&apos; behalf. No model call is part of the contracts or the
        scripts. What is real is every deposit, assignment, HCS frame, settlement and payout.
      </Callout>
    </Prose>
  );
}
