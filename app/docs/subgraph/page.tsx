import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, GITHUB_SUBGRAPH, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "The Graph subgraph",
  description:
    "How the Aetheris subgraph indexes both contracts on Hedera testnet through a self-hosted graph-node: data sources, the 17 entities, example queries, and how to run it locally or on a VPS.",
};

const AGENCY_BLOCK = 40396781;
const TREASURY_BLOCK = 40396776;
const LOCAL_GRAPHQL = "http://localhost:8100/subgraphs/name/aetheris";

const QUERY_SETTLEMENTS = `{
  settlements(where: { viaHts: true }, orderBy: timestamp, orderDirection: desc) {
    id
    amount
    rail
    viaHts
    token { id }
    subAgent { id }
    job { jobId }
    transactionHash
  }
}`;

const QUERY_LEADERBOARD = `{
  subAgents(first: 10, orderBy: totalEarned, orderDirection: desc) {
    id
    tasksAssigned
    tasksCompleted
    tasksPaid
    totalEarned
    completionRate
    averageFee
    roles
    roleStats { role tasksCompleted totalEarned }
  }
}`;

const QUERY_DAYDATA = `{
  agencyDayDatas(
    where: { agency: "${AGENCY_ADDRESS.toLowerCase()}" }
    orderBy: date
    orderDirection: asc
  ) {
    date
    jobsCreated
    jobsSettled
    microSettlements
    htsMicroSettlements
    erc20MicroSettlements
    microSettledVolume
    revenue
    netMargin
    marginRate
    cumulativeNetMargin
  }
}`;

const LOCAL_RUN = `# 1. start graph-node + IPFS + Postgres (ports 8100, 8001, 8020, 8030, 8040, 5101, 5432)
docker compose -f subgraph/docker-compose.yml up -d

# 2. generate AssemblyScript bindings and compile the mappings
npm run codegen
npm run build:subgraph

# 3. register the name, then deploy through the admin port
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5101 \\
  aetheris subgraph/subgraph.yaml --output-dir subgraph/build

# 4. query
curl -s ${LOCAL_GRAPHQL} \\
  -H 'content-type: application/json' \\
  -d '{"query":"{ settlements(where:{viaHts:true}) { amount subAgent { id } } }"}'`;

const VPS_RUN = `# on the VPS: brings up the stack with only :8000 public
bash deploy/vps-subgraph.sh

# from your laptop: tunnel the admin and IPFS ports, then deploy as if local
ssh -N -L 8020:127.0.0.1:8020 -L 5001:127.0.0.1:5001 user@VPS &
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 \\
  aetheris subgraph/subgraph.yaml --output-dir subgraph/build

# GraphQL afterwards
http://VPS:8000/subgraphs/name/aetheris`;

export default function SubgraphPage() {
  return (
    <Prose>
      <p className="mono-label">Data</p>
      <H1 className="mt-3">The Graph subgraph</H1>
      <Lede>
        The subgraph turns the event stream from both contracts into queryable history: jobs, tasks,
        per-sub-agent earnings, every micro-settlement with the rail it used, every HCS anchor, and
        daily roll-ups. It runs on a self-hosted graph-node pointed at the Hedera JSON-RPC relay.
      </Lede>
      <P>
        Source lives in <A href={GITHUB_SUBGRAPH}>subgraph/</A>: the manifest{" "}
        <Code>subgraph/subgraph.yaml</Code>, the schema <Code>subgraph/schema.graphql</Code>, and the
        mappings <Code>subgraph/src/agency.ts</Code> and <Code>subgraph/src/treasury.ts</Code>. The app
        reads the endpoint from <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code>.
      </P>

      <H2 id="why-self-hosted">Why self-hosted</H2>
      <P>
        Hedera is not in The Graph&apos;s hosted network registry. The comment at the top of{" "}
        <Code>subgraph/docker-compose.yml</Code> records the check: <Code>@pinax/graph-networks-registry</Code>{" "}
        ships 156 networks and none of them is Hedera, so there is no Subgraph Studio or decentralised
        network target to deploy to. The supported path - and the one{" "}
        <A href="https://docs.hedera.com/evm/tools/other/the-graph">Hedera&apos;s own subgraph guide</A>{" "}
        prescribes - is a graph-node you run yourself, with its <Code>ethereum</Code> setting pointed at
        a Hedera JSON-RPC relay. Aetheris uses Hashio, <Code>https://testnet.hashio.io/api</Code>, under
        the network label <Code>hedera-testnet</Code>.
      </P>
      <P>
        Two things must agree or indexing silently never starts: the label before the colon in the
        compose file&apos;s <Code>ethereum: &quot;hedera-testnet:https://...&quot;</Code> and{" "}
        <Code>network: hedera-testnet</Code> in the manifest. Hedera&apos;s stock example calls it{" "}
        <Code>testnet</Code>; either works as long as both sides match.
      </P>
      <Callout label="Two Hedera-specific settings">
        The compose file sets <Code>GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER: 1</Code> because Hedera has no
        block 0 over the relay and graph-node&apos;s chain-head probe fails on boot otherwise. And the
        manifest carries the real deployment blocks as <Code>startBlock</Code> - starting from 0 would
        force a full-history scan of Hedera testnet.
      </Callout>

      <H2 id="manifest">The manifest</H2>
      <P>
        <Code>subgraph/subgraph.yaml</Code> is <Code>specVersion: 1.2.0</Code>, <Code>apiVersion: 0.0.9</Code>,{" "}
        <Code>indexerHints.prune: auto</Code>, and declares two data sources. The split follows what the
        contracts actually emit.
      </P>
      <H3 id="datasource-agency">AetherisAgency</H3>
      <KV
        caption="AetherisAgency data source"
        rows={[
          { key: "Address", value: <Addr value={AGENCY_ADDRESS} kind="contract" /> },
          { key: "startBlock", value: <span className="data-mono">{AGENCY_BLOCK.toLocaleString("en-US")}</span> },
          { key: "Mapping", value: <Code>subgraph/src/agency.ts</Code> },
          {
            key: "Handlers (7)",
            value: (
              <span className="data-mono text-[0.85rem] leading-[1.8]">
                handleAgencyDeployed, handleOperatorVerified, handleJobCreated, handleSubAgentAssigned,
                handleTaskCompleted, handleJobSettled, handleHcsLogAnchored
              </span>
            ),
          },
        ]}
      />
      <H3 id="datasource-treasury">AetherisTreasury</H3>
      <KV
        caption="AetherisTreasury data source"
        rows={[
          { key: "Address", value: <Addr value={TREASURY_ADDRESS} kind="contract" /> },
          { key: "startBlock", value: <span className="data-mono">{TREASURY_BLOCK.toLocaleString("en-US")}</span> },
          { key: "Mapping", value: <Code>subgraph/src/treasury.ts</Code> },
          {
            key: "Handlers (3)",
            value: (
              <span className="data-mono text-[0.85rem] leading-[1.8]">
                handleMicroSettlement, handleTreasuryRebalanced, handleProfitClaimed
              </span>
            ),
          },
        ]}
      />
      <P>
        <Code>MicroSettlement</Code> is emitted by the treasury, not the agency - it fires inside{" "}
        <Code>AetherisTreasury.settleSubAgent</Code>. The handler resolves the owning agency from the
        job (falling back to the treasury&apos;s <Code>agency()</Code> view) so agency aggregates stay
        correct. Every event signature is copied verbatim from the frozen{" "}
        <Code>contracts/interfaces/IAetherisEvents.sol</Code>; see the{" "}
        <A href="/docs/contracts-and-api#events">event list</A>.
      </P>

      <H2 id="entities">Entities</H2>
      <P>
        <Code>subgraph/schema.graphql</Code> defines 17 entities and three enums (<Code>JobStatus</Code>,{" "}
        <Code>TaskStatus</Code>, <Code>SettlementRail</Code>) that mirror the Solidity enums member for
        member. Addresses and hashes are <Code>Bytes</Code>; amounts are raw base-unit{" "}
        <Code>BigInt</Code> (decimals are resolved in the UI, since HTS tokens do not expose ERC-20{" "}
        <Code>decimals()</Code> uniformly); ratios are <Code>BigDecimal</Code>. Reverse relations use{" "}
        <Code>@derivedFrom</Code>, and every counter is a running aggregate - no handler ever recomputes
        a total by scanning children.
      </P>
      <UL>
        <LI>
          <strong>Protocol</strong> - singleton roll-up (<Code>id = &quot;aetheris&quot;</Code>): counts of
          agencies, operators, sub-agents, jobs, settlements (and how many went via HTS), revenue,
          margin, profit claimed.
        </LI>
        <LI>
          <strong>Operator</strong> - a World-ID-gated human: <Code>verified</Code>, <Code>nullifierHash</Code>,
          ENS name, agencies run, profit claimed.
        </LI>
        <LI>
          <strong>Agency</strong> - the agency contract: job and task counters, gross revenue, paid to
          sub-agents, <Code>netMargin</Code> and <Code>marginRate</Code>, HTS vs ERC-20 settlement counts,
          unique sub-agents, HCS anchor count.
        </LI>
        <LI>
          <strong>SubAgent</strong> - a worker address. This entity is the leaderboard:{" "}
          <Code>totalEarned</Code>, <Code>tasksCompleted</Code>, <Code>completionRate</Code>,{" "}
          <Code>averageFee</Code>, <Code>roles</Code>.
        </LI>
        <LI>
          <strong>AgentRoleStat</strong> - per-(sub-agent, role) breakdown, <Code>id = {"{subAgent}-{role}"}</Code>.
        </LI>
        <LI>
          <strong>Token</strong> - any token seen in a deposit, fee, settlement, claim or swap;{" "}
          <Code>seenViaHts</Code> flips once an HTS settlement used it.
        </LI>
        <LI>
          <strong>Job</strong> - a client-funded unit of work: client, token, deposit, <Code>specURI</Code>,{" "}
          <Code>status</Code>, <Code>totalTaskFees</Code> against <Code>deposit</Code> for a live margin
          view, timestamps per status.
        </LI>
        <LI>
          <strong>Task</strong> - one sub-agent assignment, <Code>id = {"{jobId}-{taskId}"}</Code>: role, fee,
          status, <Code>resultHash</Code>, <Code>hcsTopicId</Code>, <Code>hcsSequenceNumber</Code>, and the{" "}
          <Code>settlement</Code> that paid it.
        </LI>
        <LI>
          <strong>JobSettlement</strong> - immutable close-out record per <Code>JobSettled</Code>: gross
          deposit, paid to sub-agents, <Code>netMargin</Code>, <Code>marginRate</Code>.
        </LI>
        <LI>
          <strong>Settlement</strong> - one <Code>MicroSettlement</Code>, <Code>id = {"{txHash}-{logIndex}"}</Code>:
          amount, <Code>viaHts</Code> and the derived <Code>rail</Code> (HTS or ERC20), linked to job, task,
          sub-agent and token.
        </LI>
        <LI>
          <strong>Rebalance</strong> - one <Code>TreasuryRebalanced</Code>: from/to token, amounts,{" "}
          <Code>dstChainId</Code>, <Code>crossChain</Code>, the 1inch tx hash, <Code>executionRate</Code>.
        </LI>
        <LI>
          <strong>ProfitClaim</strong> - one <Code>ProfitClaimed</Code>: operator, token, amount, and the
          nullifier that authorised it.
        </LI>
        <LI>
          <strong>HcsAnchor</strong> - one <Code>HcsLogAnchored</Code>: <Code>messageHash</Code>,{" "}
          <Code>topicId</Code>, <Code>sequenceNumber</Code> - the join key to the mirror node.
        </LI>
        <LI>
          <strong>AgencyDayData</strong> - daily roll-up per agency keyed on <Code>timestamp / 86400</Code>:
          jobs, tasks, settlements by rail, volume, revenue, margin, unique sub-agents, cumulative totals.
        </LI>
        <LI>
          <strong>ProtocolDayData</strong> - the same daily roll-up protocol-wide, plus rebalances and
          active agencies.
        </LI>
        <LI>
          <strong>ActiveSubAgentMarker</strong>, <strong>ActiveAgencyMarker</strong> - internal
          de-duplication markers so unique counts can be maintained incrementally. Never queried by the
          UI.
        </LI>
      </UL>

      <H2 id="queries">Example queries</H2>
      <P>
        POST these to the GraphQL endpoint as <Code>{`{"query": "..."}`}</Code>. Amounts come back in
        base units; aUSD and aUSDC both have 6 decimals.
      </P>
      <H3 id="query-settlements">Settlements that went through HTS</H3>
      <P>
        The core Hedera claim, queryable directly. The live audit log shows job 6 settling over ERC-20
        (<Code>viaHts: false</Code>) because it was funded in the test ERC-20 aUSDC; jobs funded in the
        HTS token aUSD are paid through the HTS system contract and carry <Code>viaHts: true</Code>.
      </P>
      <Pre title="GraphQL">{QUERY_SETTLEMENTS}</Pre>
      <H3 id="query-leaderboard">Sub-agent leaderboard</H3>
      <Pre title="GraphQL">{QUERY_LEADERBOARD}</Pre>
      <H3 id="query-daydata">Daily revenue and throughput for the agency</H3>
      <Pre title="GraphQL">{QUERY_DAYDATA}</Pre>

      <H2 id="local">Running it locally</H2>
      <P>
        The local stack is <Code>subgraph/docker-compose.yml</Code>: graph-node, IPFS (kubo) and
        Postgres 14. Deploy with the Graph CLI through the admin port.
      </P>
      <Pre title="shell">{LOCAL_RUN}</Pre>
      <Callout label="Ports 8100 and 5101">
        The compose file publishes graph-node&apos;s GraphQL port 8000 on <strong>8100</strong> and
        IPFS&apos;s 5001 on <strong>5101</strong>, because 8000 and 5001 are frequently taken on a dev
        machine (local API servers, <Code>ssh -L</Code> tunnels, AirPlay on macOS). So the query URL is{" "}
        <Code className="break-all">{LOCAL_GRAPHQL}</Code> and <Code>graph deploy</Code> must be told{" "}
        <Code>--ipfs http://localhost:5101</Code>. Inside the compose network graph-node still talks to{" "}
        <Code>ipfs:5001</Code>; only the host-side port moved. The admin port stays at 8020 and the
        indexing-status port at 8030.
      </Callout>
      <Callout tone="warn" label="Do not pass --network to graph build">
        <Code>graph build --network ...</Code> rewrites <Code>subgraph.yaml</Code> in place and strips
        every comment in it. The npm scripts (<Code>codegen</Code>, <Code>build:subgraph</Code>) call the
        CLI without that flag; keep it that way and edit addresses by hand, keeping{" "}
        <Code>subgraph/networks.json</Code> in sync.
      </Callout>

      <H2 id="production">Production on a VPS</H2>
      <P>
        <Code>deploy/vps-subgraph.sh</Code> stands up the same three services on a server, but exposes
        only the GraphQL port publicly. The admin port 8020, the indexing-status port 8030 and IPFS 5001
        are bound to <Code>127.0.0.1</Code>, so nobody can redeploy over the subgraph from the internet;
        deployment happens through an SSH tunnel from your laptop.
      </P>
      <Pre title="shell">{VPS_RUN}</Pre>
      <OL>
        <LI>
          The script waits for <Code>http://127.0.0.1:8030/</Code> to answer, then reminds you to open
          port 8000 in the firewall (<Code>ufw allow 8000/tcp</Code>).
        </LI>
        <LI>
          With the tunnel up, <Code>localhost:8020</Code> and <Code>localhost:5001</Code> on your machine
          are the VPS ports, so the deploy command is the local one with <Code>5001</Code> in place of{" "}
          <Code>5101</Code>.
        </LI>
        <LI>
          Point <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code> at{" "}
          <Code>http://VPS:8000/subgraphs/name/aetheris</Code> and redeploy the app.
        </LI>
      </OL>
      <P>
        After a contract redeploy, <Code>npm run deploy:hedera</Code> (<Code>scripts/deploy.js</Code>)
        prints the new addresses and block numbers as a ready-to-paste <Code>subgraph.yaml</Code> block.
      </P>

      <H2 id="limits">Honest limits</H2>
      <UL>
        <LI>
          <strong>Self-hosted means single-indexer.</strong> There is no decentralised network of
          indexers attesting to this data, no curation, and no dispute mechanism - just a graph-node you
          (or we) operate. Anyone can verify it by running their own from the same manifest against the
          same relay.
        </LI>
        <LI>
          <strong>The relay is the data source.</strong> graph-node reads blocks and logs from Hashio,
          Hedera&apos;s public relay. If you are rate-limited, swap in your own relay or mirror-node RPC in
          the compose file&apos;s <Code>ethereum</Code> setting.
        </LI>
        <LI>
          <strong>Amounts are raw.</strong> The schema stores base units and leaves decimals to the
          reader, because HTS tokens do not expose <Code>decimals()</Code> uniformly through the EVM.
        </LI>
        <LI>
          <strong>Panels say where their data came from.</strong> Anything in the app that reads the
          subgraph carries a LIVE or DEMO DATA pill; when the endpoint is unreachable the panel says so
          rather than presenting seed data as indexed history.
        </LI>
      </UL>
    </Prose>
  );
}
