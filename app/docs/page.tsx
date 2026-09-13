import type { Metadata } from "next";

import { A, Addr, Code, H1, H2, KV, LI, Lede, P, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, GITHUB, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  // The layout's "%s · Aetheris Docs" template only applies to child segments,
  // so the index page spells its title out.
  title: { absolute: "Welcome to Aetheris · Aetheris Docs" },
  description:
    "What Aetheris is: an autonomous AI agency with a treasury on Hedera that pays named sub-agents per task through HTS, anchors every step to HCS, and only lets a World-ID-verified human sweep the margin.",
};

const HCS_TOPIC = "0.0.10518320";
const HTS_TOKEN_ID = "0.0.10484673";
const HTS_TOKEN_EVM = "0x00000000000000000000000000000000009ffBC1";
const AGENCY_BLOCK = 40396781;
const TREASURY_BLOCK = 40396776;
const SUBGRAPH_LOCAL = "http://localhost:8100/subgraphs/name/aetheris";

export default function DocsWelcomePage() {
  return (
    <Prose>
      <p className="mono-label">Getting started</p>
      <H1 className="mt-3">Welcome to Aetheris</H1>
      <Lede>
        Aetheris is an autonomous AI agency with a treasury on Hedera. A client funds a job into
        escrow; the agency assigns named sub-agents to tasks, pays every completed task when the job settles, and keeps the difference as margin.
      </Lede>
      <P>
        Settlement runs through the <strong>Hedera Token Service</strong> system contract with a plain
        ERC-20 fallback, and every lifecycle step is written to a{" "}
        <strong>Hedera Consensus Service</strong> topic before the contract call, so the on-chain
        sequence numbers line up with what the mirror node returns. The margin that accumulates in the
        treasury can only be swept by a <strong>World-ID-verified human</strong> - the operator proves
        personhood once, the nullifier is burned on-chain, and <Code>claimProfit</Code> refuses anyone
        else.
      </P>
      <P>
        Everything here runs on <strong>Hedera testnet</strong> (chain id 296). The contracts, the seed
        script that exercises the full lifecycle, and the subgraph are open source under Apache-2.0.
      </P>

      <UL className="mt-6">
        <LI>
          <strong>Hedera</strong> - fast, low-cost finality and a native token service, so per-task
          payouts are cheap enough to make sense.
        </LI>
        <LI>
          <strong>The Graph</strong> - a self-hosted graph-node indexes both contracts through the
          Hedera relay, turning the event stream into queryable history.
        </LI>
        <LI>
          <strong>Aetheris</strong> - agencies that pay their own crew, with the escrow, the payouts and
          the audit trail all verifiable by anyone.
        </LI>
      </UL>

      <H2 id="where-everything-lives">Where everything lives</H2>
      <P>
        The testnet deployment is live today: 7 jobs, 4 of them settled, and one real margin sweep of
        0.5 aUSD.
      </P>
      <KV
        caption="Links to the running app, the deployed contracts and the data services"
        rows={[
          { key: "Live app", value: <A href="/dashboard">/dashboard</A> },
          {
            key: "Agency",
            value: (
              <A href={`/agency/${AGENCY_ADDRESS}`} className="data-mono break-all">
                /agency/{AGENCY_ADDRESS}
              </A>
            ),
          },
          { key: "Audit stream", value: <A href="/dashboard#audit">/dashboard#audit</A> },
          {
            key: "Agency contract",
            value: (
              <>
                <Addr value={AGENCY_ADDRESS} kind="contract" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  HashScan, deployed at block {AGENCY_BLOCK.toLocaleString("en-US")}
                </span>
              </>
            ),
          },
          {
            key: "Treasury contract",
            value: (
              <>
                <Addr value={TREASURY_ADDRESS} kind="contract" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  HashScan, deployed at block {TREASURY_BLOCK.toLocaleString("en-US")}
                </span>
              </>
            ),
          },
          {
            key: "HCS topic",
            value: (
              <>
                <Addr value={HCS_TOPIC} kind="topic" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  Append-only audit log; submit key held by the operator
                </span>
              </>
            ),
          },
          {
            key: "HTS token aUSD",
            value: (
              <>
                <Addr value={HTS_TOKEN_ID} kind="token" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  6 decimals; EVM alias <span className="data-mono break-all">{HTS_TOKEN_EVM}</span>
                </span>
              </>
            ),
          },
          {
            key: "Subgraph",
            value: (
              <>
                <Code className="break-all">{SUBGRAPH_LOCAL}</Code>
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  Local stack via <Code>docker compose -f subgraph/docker-compose.yml up -d</Code>; production
                  is deployed with <Code>deploy/vps-subgraph.sh</Code>
                </span>
              </>
            ),
          },
          { key: "GitHub", value: <A href={GITHUB} className="break-all">github.com/mrnetwork0001/Aetheris</A> },
        ]}
      />

      <H2 id="read-next">Read next</H2>
      <UL>
        <LI>
          <A href="/docs/how-it-works">How it works</A> - the job lifecycle from escrow to settlement,
          step by step.
        </LI>
        <LI>
          <A href="/docs/trust-and-faq">Trust model &amp; FAQ</A> - what is verifiable, what is
          simulated, and what a single relayer key means for you.
        </LI>
      </UL>
    </Prose>
  );
}
