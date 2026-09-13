import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "The client",
  description:
    "How a client signs in with a passkey, gets testnet funds from the faucet, funds a job with approve and createJob, tracks deposits, and reclaims escrow with refundJob.",
};

const AUSDC = "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961";

const FAUCET_ROWS = [
  { key: "Route", value: <><Code>POST /api/faucet</Code> (<Code>app/api/faucet/route.ts</Code>)</> },
  { key: "Body", value: <Code>{'{"address": "0x..."}'}</Code> },
  {
    key: "Drips",
    value: (
      <>
        1 HBAR if the wallet holds under 0.5 HBAR (skipped otherwise), then 10 aUSDC minted from the
        open <Code>MockERC20.mint</Code> at <Addr value={AUSDC} short />.
      </>
    ),
  },
  { key: "Limits", value: <>3 drips per address per hour and 30 per hour overall, in memory.</> },
  { key: "Chain", value: <>Refuses unless the RPC reports chain id 296.</> },
  { key: "Signer", value: <>The deployer key (<Code>PRIVATE_KEY</Code>).</> },
] as const;

const FAUCET_ERRORS = [
  { key: <Code>400</Code>, value: <><Code>address</Code> is not a 20-byte EVM address.</> },
  { key: <Code>429 RATE_LIMITED</Code>, value: <>&quot;Faucet limit reached: 3 drips per address per hour.&quot;</> },
  { key: <Code>502</Code>, value: <>A transfer or mint failed on the relay.</> },
  { key: <Code>503 FAUCET_NOT_CONFIGURED</Code>, value: <><Code>PRIVATE_KEY</Code> is not set on the server.</> },
  { key: <Code>503 WRONG_CHAIN</Code>, value: <>The configured RPC is not Hedera testnet.</> },
] as const;

const DISABLED_REASONS = [
  "NEXT_PUBLIC_PRIVY_APP_ID is not set - no wallet can sign.",
  "Wallet initialising...",
  "Sign in to fund a job.",
  "No settlement token is known yet.",
  "No HBAR for gas - use the testnet faucet.",
  "No aUSDC to deposit - use the testnet faucet.",
  "Enter a positive amount.",
  "Amount exceeds your balance.",
] as const;

export default function ClientPage() {
  return (
    <Prose>
      <p className="mono-label">Roles</p>
      <H1 className="mt-3">The client</H1>
      <Lede>
        A client is any wallet that funds a job. You sign in with a passkey, get testnet HBAR and
        aUSDC from the faucet, approve the agency and deposit once. From then on the deposit sits in
        the treasury under your job id, and you can take it back any time before settlement.
      </Lede>

      <H2 id="sign-in">Signing in with a passkey</H2>
      <P>
        The sidebar&apos;s &quot;Sign in with passkey&quot; button (<Code>components/connect-button.tsx</Code>)
        opens Privy. <Code>lib/privy.ts</Code> offers email, Google, passkey and external wallet, in
        that order, and creates an embedded wallet on login for users who have none
        (<Code>createOnLogin: &quot;users-without-wallets&quot;</Code>). The default chain is Hedera
        testnet, chain id 296 (<Code>lib/chains.ts</Code>), so the embedded wallet is ready to sign
        Aetheris transactions without a network switch. After login the wallet menu shows the full
        address, a copy action and a reverse ENS lookup.
      </P>
      <P>
        <Code>components/app/role-context.tsx</Code> then decides what you are. If the wallet equals
        the operator, the Operator view opens. If the subgraph has indexed at least one job with your
        wallet as <Code>client</Code>, the Client view opens and the sidebar status line reads
        &quot;Client - N jobs funded by 0x...&quot;. A wallet with no jobs yet sees &quot;has no jobs yet -
        switch to Client to fund one&quot;; the toggle switches the view and remembers the choice.
      </P>
      <Callout tone="warn" label="Without Privy">
        If <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code> is unset, the button becomes a &quot;Demo session&quot;
        that shows a fixed demo address with a &quot;demo&quot; marker and a &quot;Privy not
        configured&quot; pill. It cannot sign anything: the fund form is disabled with the reason
        shown, and nothing is simulated.
      </Callout>

      <H2 id="faucet">The faucet</H2>
      <P>
        A fresh embedded wallet has no HBAR for gas and no tokens. The &quot;Testnet faucet (1 HBAR +
        10 aUSDC)&quot; button on the fund form calls the faucet with your wallet address; you can also
        call it directly.
      </P>
      <KV rows={FAUCET_ROWS} caption="Faucet route" />
      <Pre title="curl">{`curl -s -X POST http://localhost:3000/api/faucet \\
  -H 'content-type: application/json' \\
  -d '{"address":"0xYourWallet"}'

# 200
{ "ok": true, "to": "0x...",
  "hbar":  { "amount": "1", "tx": "0x...", "hashscan": "https://hashscan.io/testnet/transaction/0x..." },
  "token": { "symbol": "aUSDC", "amount": "10", "address": "${AUSDC}",
             "tx": "0x...", "hashscan": "https://hashscan.io/testnet/transaction/0x..." } }
# when the wallet already holds 0.5 HBAR or more:
  "hbar": { "skipped": "wallet already holds >= 0.5 HBAR" }`}</Pre>
      <KV rows={FAUCET_ERRORS} caption="Faucet errors" />
      <P>
        The faucet drips the ERC-20 aUSDC only. The HTS token aUSD needs a token association on the
        receiving account before it can be held, which an embedded wallet does not have by default,
        so the browser path uses the ERC-20 rail. See <A href="/docs/settlement">Settlement rails</A>.
      </P>

      <H2 id="fund">Funding a job</H2>
      <P>
        The &quot;New job&quot; card (<Code>components/app/fund-job-card.tsx</Code>) takes a token, a
        deposit and a spec URI (default <Code>ipfs://bafybeiaetherisclientjobspec</Code>). The token
        list is every token the subgraph has seen a job funded in. Submitting runs{" "}
        <Code>approveAndCreateJob</Code> in <Code>lib/write.ts</Code>, signed in the browser with viem
        against the wallet&apos;s EIP-1193 provider on chain 296:
      </P>
      <OL className="mt-6 space-y-4">
        <LI>
          <strong>Switch chain.</strong> <Code>getProvider()</Code> asks the wallet to switch to 296
          first. Embedded wallets accept; an external wallet may prompt.
        </LI>
        <LI>
          <strong>Approve the agency.</strong> <Code>allowance(you, agency)</Code> is read; if it is
          below the deposit, <Code>approve(agency, deposit)</Code> is signed and mined. The spender is{" "}
          <Code>AetherisAgency</Code> (<Addr value={AGENCY_ADDRESS} short />), not the treasury: the
          agency pulls the deposit and hands it to the treasury itself. The step is skipped when a
          previous approval still covers the amount.
        </LI>
        <LI>
          <strong>createJob.</strong> <Code>createJob(token, deposit, specURI)</Code> is signed with a
          fixed gas limit of 1,000,000. That is generous for an ERC-20 deposit; it is set that high
          because an HTS deposit routes through the token service system contract and needs far more
          than a plain transfer. The receipt is awaited and a non-success status throws.
        </LI>
      </OL>
      <P>
        Each step is listed under the form as it happens - <Code>approve - signing</Code>,{" "}
        <Code>pending</Code> with a HashScan link, <Code>mined</Code>, then the same for{" "}
        <Code>createJob</Code>. On success the notice links the <Code>createJob</Code> transaction and
        says the subgraph indexes it within about 10 seconds; the page refreshes itself 8 seconds
        later, and the job then appears under &quot;Your jobs&quot; here, in the operator&apos;s Job
        pipeline, and on the agency page. Failures are translated by <Code>explainWriteError</Code>:
        a rejected signature, not enough HBAR, or a named contract error such as{" "}
        <Code>ZeroAmount</Code>.
      </P>
      <P>The button is disabled, with the reason printed beside it, whenever one of these holds:</P>
      <UL>
        {DISABLED_REASONS.map((reason) => (
          <LI key={reason}>
            <Code>{reason}</Code>
          </LI>
        ))}
      </UL>
      <Callout label="What lands where">
        The deposit moves from your wallet into <Code>AetherisTreasury</Code> (
        <Addr value={TREASURY_ADDRESS} short />), which re-reads its own balance in{" "}
        <Code>recordEscrow</Code> and reverts <Code>SolvencyCheckFailed</Code> if the tokens did not
        arrive. The job is <Code>Funded</Code>. The browser path writes no HCS frame of its own;
        frames for a job&apos;s later steps are written by the operator&apos;s scripts, so a
        browser-funded job shows up in the audit stream from its first assignment onwards, not from
        creation.
      </Callout>

      <H2 id="your-jobs">Your jobs, deposits, refundable</H2>
      <P>
        <Code>components/app/client-workspace.tsx</Code> filters the indexed jobs to those whose{" "}
        <Code>client</Code> is your wallet and shows three tiles:
      </P>
      <UL>
        <LI>
          <strong>Jobs funded</strong> - the count, with &quot;by your wallet&quot; when signed in.
        </LI>
        <LI>
          <strong>Total deposited</strong> - the sum of <Code>depositRaw</Code> per token symbol,
          formatted with each token&apos;s decimals; escrowed on <Code>AetherisTreasury</Code>.
        </LI>
        <LI>
          <strong>Refundable</strong> - how many of your jobs are still <Code>Funded</Code> or{" "}
          <Code>Dispatched</Code>.
        </LI>
      </UL>
      <P>
        Below the tiles, &quot;Your jobs&quot; is the same job board the operator sees, restricted to
        your wallet, with each task&apos;s status and any HCS anchor. The panel carries the LIVE or
        DEMO DATA pill of the job loader; nothing on it is presented as chain data unless it came from
        the subgraph.
      </P>

      <H2 id="refunds">Refund rules</H2>
      <P>
        &quot;Refundable deposits&quot; appears only when you are signed in and have at least one
        refundable job. Each row&apos;s Refund button signs{" "}
        <Code>AetherisAgency.refundJob(jobId)</Code> (<Code>lib/write.ts</Code>, gas limit 1,000,000).
        The contract (<Code>contracts/AetherisAgency.sol</Code>) enforces:
      </P>
      <UL>
        <LI>
          The caller must be the job&apos;s client or the operator, else{" "}
          <Code>NotClientOrOperator</Code>.
        </LI>
        <LI>
          The job must be <Code>Funded</Code> or <Code>Dispatched</Code>, else{" "}
          <Code>InvalidJobStatus</Code>. A job that is <Code>Completed</Code> (every task done) can no
          longer be refunded; it can only be settled.
        </LI>
        <LI>
          The job becomes <Code>Refunded</Code>; every task still <Code>Assigned</Code> or{" "}
          <Code>Completed</Code> is set to <Code>Cancelled</Code> and emits <Code>TaskCancelled</Code>.
          Completed-but-unpaid work is not paid on a refund.
        </LI>
        <LI>
          <Code>treasury.refundEscrow(jobId, client)</Code> returns the full deposit to the client and{" "}
          <Code>JobRefunded(jobId, client, token, amount)</Code> is emitted.
        </LI>
      </UL>
      <P>
        On success the row&apos;s note links the transaction on HashScan and the page refreshes after 8
        seconds so the job shows as <Code>Refunded</Code>.
      </P>

      <H2 id="signed-out">Signed out: the client picker</H2>
      <P>
        Without a wallet the Client view is still real, just not personal.{" "}
        <Code>app/(app)/layout.tsx</Code> loads up to 100 indexed jobs, counts them per client and
        passes the list, sorted by job count, into the role context. The workspace shows a
        &quot;Viewing client&quot; select of those addresses with their job counts, the heading
        becomes &quot;Client jobs&quot;, and the note says &quot;sign in to see and manage your
        own&quot;. The refund section and the sign-in-gated parts of the fund form stay hidden because
        there is no wallet to sign with.
      </P>
      <H3 id="chain-facts">Chain facts a client should know</H3>
      <UL>
        <LI>
          Hedera testnet only, chain id 296, relay <Code>https://testnet.hashio.io/api</Code>. Every link
          the app shows goes to <Code>https://hashscan.io/testnet</Code>.
        </LI>
        <LI>
          The agency can commit sub-agent fees only up to your deposit (<Code>FeeExceedsDeposit</Code>);
          on settlement, whatever was not paid out becomes the agency&apos;s margin, not a refund. See{" "}
          <A href="/docs/jobs-and-escrow">Jobs &amp; escrow</A>.
        </LI>
        <LI>
          The faucet and the World ID relay both spend from the deployer&apos;s key, which is why both
          are rate-limited.
        </LI>
      </UL>
    </Prose>
  );
}
