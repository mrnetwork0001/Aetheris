import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { GITHUB } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "Self-hosting & deployment",
  description:
    "Run Aetheris yourself: install, configure every environment variable, compile and test the contracts, deploy to Hedera testnet, seed a lifecycle, index with a self-hosted graph-node locally or on a VPS, and ship the frontend to Vercel.",
};

const VPS_SCRIPT_RAW = "https://raw.githubusercontent.com/mrnetwork0001/Aetheris/main/deploy/vps-subgraph.sh";

/** Rows for the env table, grouped the way `.env.example` groups them. */
const HEDERA_ENV = [
  {
    key: <Code>HEDERA_TESTNET_RPC</Code>,
    value: (
      <>
        JSON-RPC relay used by Hardhat and the server. Defaults to{" "}
        <Code>https://testnet.hashio.io/api</Code> (chain id 296).
      </>
    ),
  },
  {
    key: <Code>PRIVATE_KEY</Code>,
    value: (
      <>
        Funded Hedera testnet <strong>ECDSA</strong> key. It deploys the contracts, relays{" "}
        <Code>verifyOperator</Code>, signs faucet drips and submits HCS frames. Server-only.
      </>
    ),
  },
  {
    key: <Code>HEDERA_OPERATOR_ID</Code>,
    value: (
      <>
        Hedera account id (<Code>0.0.x</Code>) of the key above. Required for HCS submits through the
        Hedera SDK.
      </>
    ),
  },
  {
    key: <Code>HEDERA_OPERATOR_KEY</Code>,
    value: (
      <>
        Private key used by the Hedera SDK client for HCS. <Code>lib/hedera.ts</Code> accepts DER,
        raw ECDSA hex or ED25519 hex and tries ECDSA first for raw hex.
      </>
    ),
  },
  {
    key: <Code>HEDERA_HCS_TOPIC_ID</Code>,
    value: (
      <>
        Consensus Service topic the audit log is written to. The deployed app uses{" "}
        <Addr value="0.0.10518320" kind="topic" />; its submit key is the operator.
      </>
    ),
  },
  { key: <Code>HEDERA_NETWORK</Code>, value: <>Hedera network name for the SDK client. <Code>testnet</Code>.</> },
  {
    key: <Code>HEDERA_MIRROR_NODE_URL</Code>,
    value: (
      <>
        Mirror node the server reads HCS messages from. Default{" "}
        <Code>https://testnet.mirrornode.hedera.com</Code>.
      </>
    ),
  },
  {
    key: <Code>NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS</Code>,
    value: (
      <>
        Deployed <Code>AetherisAgency</Code>. Public; shipped to the browser for the client view. Printed by{" "}
        <Code>npm run deploy:hedera</Code>.
      </>
    ),
  },
  {
    key: <Code>NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS</Code>,
    value: <>Deployed <Code>AetherisTreasury</Code>. Public.</>,
  },
  {
    key: <Code>NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS</Code>,
    value: (
      <>
        Fallback operator address shown only when the subgraph has not yet indexed the agency&apos;s
        Operator entity. Unset renders the zero address with a caveat; the live path never shows a
        fixture.
      </>
    ),
  },
  {
    key: <Code>AETHERIS_HTS_TOKEN_ADDRESS</Code>,
    value: (
      <>
        EVM long-zero address of an HTS token (<Code>0.0.x</Code> mapped to <Code>0x...</Code>). If set,{" "}
        <Code>scripts/deploy.js</Code> associates the treasury with it after deployment. The treasury and
        every sub-agent must be associated before that token can be escrowed or paid out.
      </>
    ),
  },
  {
    key: <Code>AETHERIS_ENS_NAME</Code>,
    value: <>ENS name the agency publishes as its identity (constructor argument). Default <Code>aetheris.eth</Code>.</>,
  },
] as const;

const WORLD_ID_ENV = [
  {
    key: <Code>NEXT_PUBLIC_WORLD_ID_APP_ID</Code>,
    value: (
      <>
        App id from the World ID Developer Portal (<Code>app_...</Code>; <Code>app_staging_...</Code> apps
        accept Simulator proofs). Public: IDKit needs it in the browser. Unset, <Code>/api/operator/verify</Code>{" "}
        answers 503 <Code>WORLD_ID_NOT_CONFIGURED</Code> and the UI shows a labelled simulated check.
      </>
    ),
  },
  {
    key: <Code>NEXT_PUBLIC_WORLD_ID_ACTION</Code>,
    value: (
      <>
        Action identifier created under the app&apos;s Actions tab. Case-sensitive. The deployed app uses{" "}
        <Code>aetheris-operator</Code>.
      </>
    ),
  },
  {
    key: <Code>WORLD_ID_RP_ID</Code>,
    value: (
      <>
        Relying-party id (<Code>rp_...</Code>) for IDKit v4. <Code>lib/worldid.ts</Code> verifies results at{" "}
        <Code>POST /api/v4/verify/{"{rp_id}"}</Code>.
      </>
    ),
  },
  {
    key: <Code>WORLD_ID_RP_SIGNING_KEY</Code>,
    value: (
      <>
        Hex signing key of the relying party. <Code>app/api/worldid/rp-context</Code> signs a nonce with it
        before the widget opens. Server-only secret - never prefix it <Code>NEXT_PUBLIC_</Code>.
      </>
    ),
  },
  {
    key: <Code>WORLD_ID_API_BASE</Code>,
    value: <>Base URL of the World ID verifier. Default <Code>https://developer.worldcoin.org</Code>.</>,
  },
  {
    key: <Code>WORLD_ID_ROUTER_ADDRESS</Code>,
    value: (
      <>
        World ID router passed to the agency constructor. Leave unset to deploy in explicit bypass mode
        (the contract emits <Code>WorldIdBypassActive</Code>; replay protection stays on). No router exists
        on Hedera today.
      </>
    ),
  },
  { key: <Code>WORLD_ID_GROUP_ID</Code>, value: <>Credential group id passed to the constructor. <Code>1</Code> is Orb.</> },
] as const;

const INTEGRATION_ENV = [
  {
    key: <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code>,
    value: (
      <>
        Privy app id. Required for login and embedded wallets (<Code>lib/privy.ts</Code>). The app&apos;s
        URL must be in the Privy app&apos;s allowed origins.
      </>
    ),
  },
  { key: <Code>PRIVY_APP_SECRET</Code>, value: <>Privy server secret. Server-only.</> },
  {
    key: <Code>ONEINCH_API_KEY</Code>,
    value: (
      <>
        1inch Swap API v6.0 key. Used only by the proxy routes <Code>/api/swap/quote</Code> and{" "}
        <Code>/api/swap/build</Code>; it never reaches the browser. Without it the routes return a typed
        502.
      </>
    ),
  },
  {
    key: <Code>NEXT_PUBLIC_ONEINCH_BASE_URL</Code>,
    value: <>1inch API base. Default <Code>https://api.1inch.dev</Code>.</>,
  },
  {
    key: <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code>,
    value: (
      <>
        GraphQL endpoint of your graph-node, for example{" "}
        <Code>http://localhost:8100/subgraphs/name/aetheris</Code> locally or{" "}
        <Code>http://VPS:8000/subgraphs/name/aetheris</Code> in production. Panels that depend on it show
        DEMO DATA when it is unset.
      </>
    ),
  },
  {
    key: <Code>GRAPH_DEPLOY_KEY</Code>,
    value: (
      <>
        Reserved for The Graph&apos;s hosted deploy flow. Not used by the self-hosted path, which
        deploys over the admin port instead.
      </>
    ),
  },
  {
    key: <Code>NEXT_PUBLIC_ENS_RPC_URL</Code>,
    value: (
      <>
        Ethereum mainnet RPC for ENS resolution. <Code>lib/ens.ts</Code> falls back to
        publicnode / drpc / ankr / cloudflare when this is unset or failing. Default{" "}
        <Code>https://ethereum-rpc.publicnode.com</Code>.
      </>
    ),
  },
] as const;

const VERCEL_ENV = [
  "HEDERA_TESTNET_RPC",
  "PRIVATE_KEY",
  "HEDERA_OPERATOR_ID",
  "HEDERA_OPERATOR_KEY",
  "HEDERA_HCS_TOPIC_ID",
  "HEDERA_NETWORK",
  "HEDERA_MIRROR_NODE_URL",
  "NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS",
  "NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS",
  "NEXT_PUBLIC_AETHERIS_OPERATOR_ADDRESS",
  "AETHERIS_HTS_TOKEN_ADDRESS",
  "AETHERIS_ENS_NAME",
  "NEXT_PUBLIC_WORLD_ID_APP_ID",
  "NEXT_PUBLIC_WORLD_ID_ACTION",
  "WORLD_ID_RP_ID",
  "WORLD_ID_RP_SIGNING_KEY",
  "WORLD_ID_API_BASE",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "ONEINCH_API_KEY",
  "NEXT_PUBLIC_ONEINCH_BASE_URL",
  "NEXT_PUBLIC_SUBGRAPH_URL",
  "NEXT_PUBLIC_ENS_RPC_URL",
] as const;

export default function SelfHostingPage() {
  return (
    <Prose>
      <p className="mono-label">Operate</p>
      <H1 className="mt-3">Self-hosting &amp; deployment</H1>
      <Lede>
        Everything in Aetheris runs from one repository: Hardhat for the contracts, a self-hosted
        graph-node for the index, and a Next.js 14 app for the UI and HTTP API. This page walks the
        whole path from a fresh clone to a public deployment, and ends with the failures people
        actually hit.
      </Lede>

      <H2 id="prerequisites">Prerequisites</H2>
      <UL>
        <LI>
          <strong>Node.js 18+</strong> and npm.
        </LI>
        <LI>
          <strong>Docker</strong> with the compose plugin, for the graph-node stack.
        </LI>
        <LI>
          A funded <strong>Hedera testnet ECDSA account</strong> from{" "}
          <A href="https://portal.hedera.com/faucet">portal.hedera.com/faucet</A>. The JSON-RPC relay
          signs EVM transactions, so an ED25519 key cannot deploy or call the contracts.
        </LI>
        <LI>
          Optional accounts for the integrations you want live: a World ID app with an action and a
          relying party, a Privy app, a 1inch developer key.
        </LI>
      </UL>

      <H2 id="install">Clone and install</H2>
      <Pre title="shell">{`git clone ${GITHUB}.git
cd Aetheris
npm install
cp .env.example .env      # then fill in PRIVATE_KEY at minimum`}</Pre>
      <P>
        The repository is Apache-2.0. <Code>.env.example</Code> already carries the public defaults
        (relay, mirror node, World ID API base, ENS RPC), so the minimum to compile, test and deploy is a
        funded <Code>PRIVATE_KEY</Code>.
      </P>

      <H2 id="env">Environment variables</H2>
      <P>
        Every variable in <Code>.env.example</Code>, grouped the way the file groups them. Anything
        prefixed <Code>NEXT_PUBLIC_</Code> is bundled into the browser; everything else stays on the
        server.
      </P>

      <H3 id="env-hedera">Hedera EVM, HTS and HCS</H3>
      <KV caption="Hedera environment variables" rows={HEDERA_ENV} />

      <H3 id="env-worldid">World ID</H3>
      <KV caption="World ID environment variables" rows={WORLD_ID_ENV} />

      <H3 id="env-integrations">Privy, 1inch, The Graph, ENS</H3>
      <KV caption="Integration environment variables" rows={INTEGRATION_ENV} />

      <Callout label="Secrets">
        <Code>PRIVATE_KEY</Code>, <Code>HEDERA_OPERATOR_KEY</Code>, <Code>WORLD_ID_RP_SIGNING_KEY</Code>,{" "}
        <Code>PRIVY_APP_SECRET</Code> and <Code>ONEINCH_API_KEY</Code> are server-only. The deployer key is
        also the relayer and faucet key, so the server that holds it can spend from that account.
      </Callout>

      <H2 id="contracts">Compile and test the contracts</H2>
      <Pre title="shell">{`npm run compile           # hardhat compile (Solidity 0.8.24)
npm run test:contracts    # hardhat test - 37 tests in test/aetheris.test.js`}</Pre>
      <P>
        The tests cover both settlement rails. <Code>hardhat.config.js</Code> defines a single network,{" "}
        <Code>hederaTestnet</Code>, pointed at <Code>HEDERA_TESTNET_RPC</Code> with chain id 296 and{" "}
        <Code>PRIVATE_KEY</Code> as its only account.
      </P>

      <H2 id="deploy">Deploy to Hedera testnet</H2>
      <Pre title="shell">{`npm run deploy:hedera     # hardhat run scripts/deploy.js --network hederaTestnet`}</Pre>
      <P>
        <Code>scripts/deploy.js</Code> deploys <Code>AetherisTreasury</Code> then <Code>AetherisAgency</Code>,
        wires the agency into the treasury, associates the treasury with{" "}
        <Code>AETHERIS_HTS_TOKEN_ADDRESS</Code> when it is set, and prints paste-ready blocks for{" "}
        <Code>.env</Code> and <Code>subgraph/subgraph.yaml</Code> (addresses and start blocks). With{" "}
        <Code>WORLD_ID_ROUTER_ADDRESS</Code> unset the agency is constructed with a zero router and emits{" "}
        <Code>WorldIdBypassActive</Code> in the deployment transaction.
      </P>
      <P>
        To skip deployment and use the existing contracts, the reference deployment is{" "}
        <Addr value="0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81" /> (agency, block 40396781) and{" "}
        <Addr value="0x10360383a6b43Fd22BE257bE334E9A9ad83B5598" /> (treasury, block 40396776).
      </P>

      <H2 id="seed">Seed a job lifecycle</H2>
      <Pre title="shell">{`npx hardhat run scripts/seed.js --network hederaTestnet`}</Pre>
      <P>
        <Code>scripts/seed.js</Code> reuses the pre-created aUSD token (<Code>0.0.10484673</Code>) and
        the three Hedera-native sub-agents listed in its <Code>KNOWN_SUB_AGENTS</Code> roster (see{" "}
        <A href="/docs/settlement">Settlement rails</A>), checks the treasury&apos;s token association
        through <Code>ensureTreasuryAssociated</Code>, then runs jobs through every status. Each step is anchored to the HCS topic
        before the contract call, so the sequence numbers written into <Code>completeTask</Code> match
        what the mirror node returns. It needs <Code>HEDERA_OPERATOR_ID</Code>,{" "}
        <Code>HEDERA_OPERATOR_KEY</Code> and <Code>HEDERA_HCS_TOPIC_ID</Code> in addition to the deployer
        key. Without a seed the subgraph indexes an empty agency and the dashboard has nothing to show.
      </P>
      <Callout tone="warn" label="What the seed is">
        The sub-agent work in the seed is simulated by the script: the result hash committed on-chain is{" "}
        <Code>keccak256(specURI#taskIndex)</Code> (<Code>scripts/seed.js</Code>). No model call is part
        of the contracts or the seed.
      </Callout>

      <H2 id="subgraph-local">Subgraph: local graph-node</H2>
      <P>
        Hedera is not in The Graph&apos;s hosted network registry, so the index runs on a graph-node you
        operate, pointed at the Hedera JSON-RPC relay. <Code>subgraph/docker-compose.yml</Code> brings up
        graph-node, IPFS (kubo) and Postgres 14.
      </P>
      <Pre title="shell">{`docker compose -f subgraph/docker-compose.yml up -d
npm run codegen            # graph codegen subgraph/subgraph.yaml
npm run build:subgraph     # graph build subgraph/subgraph.yaml
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5101 \\
  aetheris subgraph/subgraph.yaml --output-dir subgraph/build`}</Pre>
      <KV
        caption="Local graph-node ports"
        rows={[
          { key: "GraphQL", value: <Code>http://localhost:8100/subgraphs/name/aetheris</Code> },
          { key: "Admin (create / deploy)", value: <Code>http://localhost:8020</Code> },
          { key: "Indexing status", value: <Code>http://localhost:8030</Code> },
          { key: "IPFS API (host side)", value: <Code>http://localhost:5101</Code> },
          { key: "Postgres", value: <Code>localhost:5432</Code> },
        ]}
      />
      <P>
        Two values must agree: the label before the colon in the compose file&apos;s{" "}
        <Code>ethereum: &quot;hedera-testnet:...&quot;</Code> and <Code>network:</Code> in{" "}
        <Code>subgraph/subgraph.yaml</Code>. Both say <Code>hedera-testnet</Code>. The compose file also
        sets <Code>GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER: 1</Code> because the relay has no block 0 and
        graph-node&apos;s chain-head probe fails on boot without it. Set{" "}
        <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code> to the GraphQL URL once the deploy finishes.
      </P>

      <H2 id="subgraph-vps">Subgraph: production on a VPS</H2>
      <P>
        <Code>deploy/vps-subgraph.sh</Code> is a one-shot installer for a Linux host. Run it as root:
      </P>
      <Pre title="shell (on the VPS)">{`curl -fsSL ${VPS_SCRIPT_RAW} | sudo bash
ufw allow 8000/tcp`}</Pre>
      <P>What the script does, in order:</P>
      <OL>
        <LI>Installs Docker through <Code>get.docker.com</Code> if it is missing and checks the compose plugin.</LI>
        <LI>
          Writes <Code>/opt/aetheris-subgraph/docker-compose.yml</Code>: graph-node, <Code>ipfs/kubo:v0.29.0</Code>{" "}
          and <Code>postgres:14</Code>, with <Code>ethereum: hedera-testnet:$HEDERA_TESTNET_RPC</Code>{" "}
          (default Hashio) and <Code>GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER: 1</Code>.
        </LI>
        <LI>
          Publishes <strong>only GraphQL (8000)</strong> on all interfaces. The admin port 8020, the
          status port 8030 and IPFS 5001 are bound to <Code>127.0.0.1</Code> so nobody can redeploy over
          your subgraph from the internet.
        </LI>
        <LI>Starts the stack and waits up to three minutes for the status port to answer.</LI>
      </OL>
      <P>
        Because the admin and IPFS ports are loopback-only, you deploy from your laptop through an SSH
        tunnel:
      </P>
      <Pre title="shell (on your laptop)">{`ssh -N -L 8020:127.0.0.1:8020 -L 5001:127.0.0.1:5001 user@VPS &
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5001 \\
  --version-label v0.0.1 aetheris subgraph/subgraph.yaml --output-dir subgraph/build`}</Pre>
      <P>
        GraphQL is then public at <Code>http://VPS:8000/subgraphs/name/aetheris</Code>; put that into{" "}
        <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code> on the frontend. Note the tunnel maps IPFS to local port
        5001, not 5101 as in the local compose file - stop any local stack first or pick another local
        port and pass it to <Code>--ipfs</Code>.
      </P>
      <Callout tone="warn">
        The script writes a fixed Postgres password (<Code>let-me-in</Code>) and pins{" "}
        <Code>graphprotocol/graph-node:latest</Code>. Postgres is not published outside the compose
        network, but change the password and pin a graph-node tag before relying on the host.
      </Callout>

      <H2 id="vercel">Frontend on Vercel</H2>
      <P>
        The app is a standard Next.js 14 project with no custom build step: import the repository,
        keep the default <Code>next build</Code>, and set the environment below. The API routes run as
        serverless functions, so every server-only secret must be present in the project&apos;s
        environment, not just locally.
      </P>
      <Pre title="env (Vercel project settings)">{VERCEL_ENV.join("\n")}</Pre>
      <UL>
        <LI>
          <Code>WORLD_ID_ROUTER_ADDRESS</Code> and <Code>WORLD_ID_GROUP_ID</Code> are deploy-time inputs to{" "}
          <Code>scripts/deploy.js</Code>; the frontend does not read them. <Code>GRAPH_DEPLOY_KEY</Code> is
          unused on the self-hosted path.
        </LI>
        <LI>
          Add the Vercel URL (and any preview URLs you use) to the Privy app&apos;s allowed origins, and
          to the World ID app if the portal asks for one.
        </LI>
        <LI>
          The faucet (<Code>POST /api/faucet</Code>) and the World ID relay (<Code>POST /api/operator/verify</Code>)
          keep their rate limits in process memory (<Code>app/api/faucet/route.ts</Code>: 3 drips per
          address per hour, 30 per hour overall). On serverless, each warm instance counts separately.
        </LI>
        <LI>
          The subgraph URL must be reachable from the browser and from the functions. A plain{" "}
          <Code>http://VPS:8000</Code> endpoint will be blocked as mixed content on an https page - put
          it behind TLS (a reverse proxy on the VPS) before pointing a production frontend at it.
        </LI>
      </UL>

      <H2 id="troubleshooting">Troubleshooting</H2>

      <H3 id="ts-ports">Ports 5001 and 8000 are already taken</H3>
      <P>
        On a development machine 5001 (macOS AirPlay, a local uvicorn or Flask server) and 8000 (local
        API servers, <Code>ssh -L</Code> tunnels) are frequently occupied. The local compose file
        therefore publishes IPFS on <strong>5101</strong> and GraphQL on <strong>8100</strong>. The
        failures when you get this wrong are silent and misleading: <Code>graph deploy</Code> reports{" "}
        <Code>Failed to upload to IPFS: Not Found</Code>, and GraphQL queries return another server&apos;s
        404 body. Always pass <Code>--ipfs http://localhost:5101</Code> locally and query 8100.
      </P>

      <H3 id="ts-hashio">Hashio rejects eth_getLogs in batches</H3>
      <P>
        The public relay refuses <Code>eth_getLogs</Code> inside a JSON-RPC batch. ethers v6 batches by
        default, so the server providers are created with <Code>batchMaxCount: 1</Code> (<Code>lib/treasury.ts</Code>,{" "}
        <Code>lib/operator-registry.ts</Code>). If you add a new provider and see log queries fail only
        in the app but not in Hardhat, this is why. graph-node issues its own single requests and is
        unaffected; if it is rate-limited, swap in your own relay through <Code>HEDERA_TESTNET_RPC</Code>.
      </P>

      <H3 id="ts-keys">ECDSA versus ED25519 keys</H3>
      <P>
        Hedera accounts can be ED25519 or ECDSA, but only ECDSA keys have an EVM address and can sign
        JSON-RPC transactions. Deploy, seed, the faucet and the relay all need an ECDSA{" "}
        <Code>PRIVATE_KEY</Code>. For the HCS client, <Code>lib/hedera.ts</Code> parses raw hex as ECDSA
        first: the SDK&apos;s <Code>fromStringDer</Code> silently accepts a raw 32-byte hex string and
        returns an ED25519 key for it, which signs as the wrong account and fails with{" "}
        <Code>INVALID_SIGNATURE</Code>. If your HCS submits fail that way, check the key type before
        anything else.
      </P>

      <H3 id="ts-privy">Privy: login opens and immediately fails</H3>
      <P>
        Privy checks the page origin against the allowed origins configured in its dashboard. Add every
        origin you serve the app from - <Code>http://localhost:3000</Code>, the Vercel production URL and
        any preview URL - or the modal rejects the login. Also confirm <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code>{" "}
        is set at build time; it is a public variable and is baked into the bundle.
      </P>

      <H3 id="ts-worldid">World ID: &quot;Action not found&quot; on the v2 verifier</H3>
      <P>
        Actions created in the current Developer Portal are World ID 4.0 actions scoped to the
        app&apos;s relying party. The legacy <Code>/api/v2/verify/{"{app_id}"}</Code> endpoint answers{" "}
        <Code>Action not found</Code> for them. Aetheris verifies IDKit v4 results at{" "}
        <Code>/api/v4/verify/{"{rp_id}"}</Code> instead (<Code>lib/worldid.ts</Code>,{" "}
        <Code>verifyWorldIdV4</Code>), which needs <Code>WORLD_ID_RP_ID</Code> and a server-signed request
        context from <Code>POST /api/worldid/rp-context</Code> (<Code>WORLD_ID_RP_SIGNING_KEY</Code>). If
        you see the v2 error, you are missing the relying-party values, not the action.
      </P>
    </Prose>
  );
}
