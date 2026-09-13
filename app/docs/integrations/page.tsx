import type { Metadata } from "next";

import { A, Callout, Code, H1, H2, H3, KV, LI, Lede, P, Pre, Prose, UL } from "@/components/docs/prose";

export const metadata: Metadata = {
  title: "World ID, 1inch, Privy, ENS",
  description:
    "What each partner integration does in Aetheris, the exact environment variables, where the code lives, and the honest limit of each one.",
};

const WORLD_ID_ENV = [
  { key: <Code>NEXT_PUBLIC_WORLD_ID_APP_ID</Code>, value: <>The <Code>app_...</Code> id from the Developer Portal. Public; shipped to the browser for IDKit. Without it <Code>/api/operator/verify</Code> answers 503 and the gate falls back to a labelled simulation.</> },
  { key: <Code>NEXT_PUBLIC_WORLD_ID_ACTION</Code>, value: <>Action identifier created under the app&apos;s Actions tab. <Code>aetheris-operator</Code>; case-sensitive.</> },
  { key: <Code>WORLD_ID_RP_ID</Code>, value: <>Relying-party id (<Code>rp_...</Code>). Used to sign the request context and as the path of the v4 verify endpoint.</> },
  { key: <Code>WORLD_ID_RP_SIGNING_KEY</Code>, value: <>Relying-party signing key, hex. Server-only; <Code>app/api/worldid/rp-context/route.ts</Code> signs a nonce with it before the widget opens.</> },
  { key: <Code>WORLD_ID_API_BASE</Code>, value: <>Verifier origin; defaults to <Code>https://developer.worldcoin.org</Code> in <Code>lib/worldid.ts</Code>.</> },
  { key: <Code>WORLD_ID_ROUTER_ADDRESS</Code>, value: <>Constructor argument for the agency. Left unset on Hedera, which puts the contract in explicit bypass mode.</> },
  { key: <Code>WORLD_ID_GROUP_ID</Code>, value: <>Credential group id passed to the router; <Code>1</Code> is Orb.</> },
] as const;

const ONEINCH_ENV = [
  { key: <Code>ONEINCH_API_KEY</Code>, value: <>Bearer token for <Code>api.1inch.dev</Code>. Server-only; <Code>lib/oneinch.ts</Code> calls <Code>assertServerOnly</Code> before every request.</> },
  { key: <Code>NEXT_PUBLIC_ONEINCH_BASE_URL</Code>, value: <>API origin; defaults to <Code>https://api.1inch.dev</Code>.</> },
] as const;

const PRIVY_ENV = [
  { key: <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code>, value: <>Privy app id from the dashboard. Public by design. <Code>components/providers.tsx</Code> mounts <Code>PrivyProvider</Code> only when it looks like a real id (18 or more alphanumeric characters).</> },
  { key: <Code>PRIVY_APP_SECRET</Code>, value: <>Privy server secret, reserved for server-side token verification. <Code>lib/privy.ts</Code> documents it and never references it; no route in this repository reads it today.</> },
] as const;

const ENS_ENV = [
  { key: <Code>NEXT_PUBLIC_ENS_RPC_URL</Code>, value: <>Ethereum mainnet RPC tried first; defaults to <Code>https://ethereum-rpc.publicnode.com</Code>.</> },
  { key: <Code>AETHERIS_ENS_NAME</Code>, value: <>The name the agency publishes as its identity at deploy time (<Code>aetheris.eth</Code>).</> },
] as const;

export default function IntegrationsPage() {
  return (
    <Prose>
      <p className="mono-label">Integrations</p>
      <H1 className="mt-3">World ID, 1inch, Privy, ENS</H1>
      <Lede>
        Four partner integrations, each doing one job: World ID gates the operator, 1inch quotes swaps
        for the operator&apos;s EVM wallet, Privy signs clients in with a passkey, and ENS names
        addresses. For each one, here is what it does, the exact env vars, where the code is, and the
        limit we state rather than hide.
      </Lede>

      {/* -- World ID -- */}
      <H2 id="world-id">World ID</H2>
      <P>
        <strong>What it does.</strong> Proves the operator is one human before margin can leave the
        treasury. The browser runs IDKit v4 (<Code>IDKitRequestWidget</Code> with the{" "}
        <Code>ProofOfHuman</Code> preset, <Code>allow_legacy_proofs=false</Code>) against a
        server-signed request context; the raw result is verified server-side at{" "}
        <Code>POST https://developer.worldcoin.org/api/v4/verify/{"{rp_id}"}</Code>; then{" "}
        <Code>verifyOperator</Code> is relayed to the agency with the deployer key so the RP-scoped
        nullifier is burned on-chain. A second proof from the same human returns{" "}
        <Code>409 NULLIFIER_ALREADY_USED</Code>. The full sequence is on{" "}
        <A href="/docs/operator#world-id">The operator</A>.
      </P>
      <KV rows={WORLD_ID_ENV} caption="World ID environment variables" />
      <H3>Where in the code</H3>
      <UL>
        <LI><Code>components/worldid-gate.tsx</Code> - the widget, the request-context fetch, the relay call and the result card.</LI>
        <LI><Code>app/api/worldid/rp-context/route.ts</Code> - signs the IDKit v4 <Code>rp_context</Code> (300 s TTL).</LI>
        <LI><Code>lib/worldid.ts</Code> - <Code>verifyWorldIdV4</Code>, <Code>isIdKitResultV4</Code>, <Code>extractV4Nullifier</Code>; the legacy v3 <Code>verifyWorldIdProof</Code> is kept for older proofs.</LI>
        <LI><Code>app/api/operator/verify/route.ts</Code> - verify, check <Code>nullifierHashUsed</Code>, relay <Code>verifyOperator</Code>, map reverts to 409 / 400 / 502.</LI>
        <LI><Code>app/api/verify-worldid/route.ts</Code> - verification only, no relay; accepts a v4 result or a legacy <Code>{"{proof, signal}"}</Code>.</LI>
        <LI><Code>lib/operator-registry.ts</Code>, <Code>lib/worldid-status.ts</Code> - the on-chain reads and the cached readiness probe behind the dashboard badge.</LI>
        <LI><Code>contracts/AetherisAgency.sol</Code> - <Code>verifyOperator</Code>, <Code>nullifierHashUsed</Code>, <Code>isVerifiedOperator</Code>, <Code>worldIdVerificationBypassed</Code>, <Code>setWorldId</Code>.</LI>
      </UL>
      <Callout tone="warn" label="Honest limit">
        No World ID router is deployed on Hedera, so the agency runs in explicit bypass mode: the
        constructor emitted <Code>WorldIdBypassActive</Code>, and <Code>verifyOperator</Code> emits{" "}
        <Code>OperatorVerifiedWithoutProof</Code> instead of calling <Code>router.verifyProof</Code>.
        The Groth16 proof is checked by World ID&apos;s cloud verifier, not by the contract; only the
        nullifier burn and its replay protection are on-chain. The dashboard badge says &quot;bypass
        mode&quot; whenever this is the case. The app id is a production app, so proofs must come from
        World App; Simulator proofs are not accepted.
      </Callout>

      {/* -- 1inch -- */}
      <H2 id="oneinch">1inch</H2>
      <P>
        <strong>What it does.</strong> Gives the operator swap quotes and unsigned swap calldata from the
        1inch Swap API v6.0 through two server-side proxy routes, so <Code>ONEINCH_API_KEY</Code> never
        reaches the browser. <Code>POST /api/swap/quote</Code> takes{" "}
        <Code>{"{chainId, src, dst, amount}"}</Code> and returns a normalised quote (
        <Code>dstAmount</Code>, <Code>estimatedGas</Code>, <Code>protocols</Code>);{" "}
        <Code>POST /api/swap/build</Code> adds <Code>from</Code> and optional <Code>slippage</Code>{" "}
        (0 to 50, default 1) and returns <Code>{"{to, data, value, gas?}"}</Code>. The build route never
        signs or broadcasts. Both validate addresses and base-unit amounts, reject same-token pairs,
        and answer 400 for a chain outside the supported list.
      </P>
      <Pre title="supported chains (lib/oneinch.ts)">{`Ethereum   1
Arbitrum   42161
Base       8453
Optimism   10
Polygon    137`}</Pre>
      <KV rows={ONEINCH_ENV} caption="1inch environment variables" />
      <H3>Where in the code</H3>
      <UL>
        <LI><Code>lib/oneinch.ts</Code> - <Code>getQuote</Code>, <Code>buildSwapTx</Code>, <Code>getTokenBalances</Code>; bounded retry with backoff on 429 and 5xx, 1inch&apos;s own error text re-thrown on 4xx.</LI>
        <LI><Code>app/api/swap/quote/route.ts</Code>, <Code>app/api/swap/build/route.ts</Code> - the proxies.</LI>
        <LI><Code>components/treasury-panel.tsx</Code> - the &quot;Rebalance via 1inch v6.0&quot; form at <Code>/dashboard#swap</Code>.</LI>
        <LI><Code>contracts/AetherisTreasury.sol</Code> - <Code>rebalance(...)</Code>, an owner-only accounting entry for a swap executed off-chain; the app UI does not call it.</LI>
      </UL>
      <Callout tone="warn" label="Honest limit">
        1inch does not serve Hedera, and the treasury&apos;s holdings are on Hedera. The panel therefore
        quotes reference pairs (WETH, USDC, USDT on Arbitrum, Base and Ethereum) as a routing tool for
        the operator&apos;s own EVM wallet; it is not a treasury rebalance, and the panel says so
        above the form. Without an API key the quote route answers 502 <Code>UPSTREAM_ERROR</Code> (the
        missing-env error surfaces as an upstream failure) and the panel shows a
        locally computed figure labelled &quot;Simulated quote&quot; with the server&apos;s reason.
      </Callout>

      {/* -- Privy -- */}
      <H2 id="privy">Privy</H2>
      <P>
        <strong>What it does.</strong> Signs users in and gives them a wallet that can sign on Hedera.{" "}
        <Code>lib/privy.ts</Code> configures login methods <Code>email</Code>, <Code>google</Code>,{" "}
        <Code>passkey</Code> and <Code>wallet</Code>; embedded Ethereum wallets are created on login
        for users without one (<Code>createOnLogin: &quot;users-without-wallets&quot;</Code>) with
        Privy&apos;s wallet UIs kept on; the default chain is Hedera testnet (296) and the supported
        chains are Hedera plus the five 1inch venues from <Code>lib/chains.ts</Code>. The role context
        reads the connected wallet, switches it to 296 and hands its EIP-1193 provider to{" "}
        <Code>lib/write.ts</Code> for <Code>approve</Code>, <Code>createJob</Code> and{" "}
        <Code>refundJob</Code>. See <A href="/docs/client#sign-in">The client</A>.
      </P>
      <KV rows={PRIVY_ENV} caption="Privy environment variables" />
      <H3>Where in the code</H3>
      <UL>
        <LI><Code>lib/privy.ts</Code> - <Code>privyConfig</Code>, <Code>privyLoginMethods</Code>, <Code>isPrivyConfigured</Code>.</LI>
        <LI><Code>lib/chains.ts</Code> - <Code>hederaTestnet</Code> (id 296, HBAR, Hashio relay, HashScan) and <Code>aetherisChains</Code>.</LI>
        <LI><Code>components/providers.tsx</Code> - mounts <Code>PrivyProvider</Code> conditionally; exports <Code>PRIVY_ENABLED</Code>.</LI>
        <LI><Code>components/connect-button.tsx</Code> - &quot;Sign in with passkey&quot;, the wallet menu, and the labelled demo session when Privy is absent.</LI>
        <LI><Code>components/app/role-context.tsx</Code> - <Code>usePrivy</Code> / <Code>useWallets</Code> bridge, chain switch, provider hand-off.</LI>
      </UL>
      <Callout tone="warn" label="Honest limit">
        Privy only works when <Code>NEXT_PUBLIC_PRIVY_APP_ID</Code> is set and the app&apos;s URL is in
        the allowed origins of the Privy dashboard; a login attempt from an unlisted origin fails
        inside Privy&apos;s modal. Without an app id the UI shows a demo session that cannot sign, and
        the fund form is disabled with that reason. External wallets may refuse the switch to chain
        296 if they do not know it; <Code>lib/write.ts</Code> then tries{" "}
        <Code>wallet_addEthereumChain</Code>.
      </Callout>

      {/* -- ENS -- */}
      <H2 id="ens">ENS</H2>
      <P>
        <strong>What it does.</strong> Turns addresses into names and back. <Code>lib/ens.ts</Code>{" "}
        builds one viem public client on Ethereum mainnet with a <Code>fallback</Code> transport:{" "}
        <Code>NEXT_PUBLIC_ENS_RPC_URL</Code> first, then publicnode, drpc, ankr and cloudflare, each
        with an 8 s timeout and one retry. It exposes <Code>resolveEnsName</Code>,{" "}
        <Code>lookupEnsAddress</Code>, <Code>getEnsAvatar</Code>, <Code>getEnsTextRecord</Code> and{" "}
        <Code>getEnsIdentity</Code>, every one returning <Code>null</Code> on failure so a dead RPC can
        never break a render. <Code>GET /api/ens?name=...</Code> or <Code>?address=...</Code> keeps the
        client on the server and returns <Code>{"{address, name, avatar, source}"}</Code>, where{" "}
        <Code>source</Code> is <Code>live</Code> when anything resolved and <Code>unconfigured</Code>{" "}
        otherwise, cached for five minutes.
      </P>
      <P>
        In the UI: the wallet menu reverse-resolves the connected address (&quot;Resolved via ENS&quot;
        or &quot;No reverse ENS record&quot;); the agency page accepts <Code>/agency/&lt;name&gt;</Code>{" "}
        as well as an address; the Mission Control header shows the agency&apos;s ENS name from the
        subgraph when it has one; and <Code>verifyOperator</Code> stores an <Code>ensName</Code>{" "}
        alongside the verification, defaulting to <Code>aetheris.eth</Code> in the relay.
      </P>
      <KV rows={ENS_ENV} caption="ENS environment variables" />
      <H3>Where in the code</H3>
      <UL>
        <LI><Code>lib/ens.ts</Code> - the mainnet client and resolvers.</LI>
        <LI><Code>app/api/ens/route.ts</Code> - the HTTP route, backed by <Code>resolveEnsProfile</Code> in <Code>components/aetheris-server.ts</Code>.</LI>
        <LI><Code>components/use-ens.ts</Code>, <Code>components/connect-button.tsx</Code>, <Code>app/(app)/agency/[id]/page.tsx</Code> - the consumers.</LI>
      </UL>
      <Callout tone="warn" label="Honest limit">
        ENS records live on Ethereum mainnet, not on Hedera. The client is read-only and used for
        display; it never sends a transaction. The name the agency publishes on-chain is a string the
        operator supplied at deploy and verify time, not something the contract checks against the ENS
        registry. When every mainnet RPC in the list is down, names simply disappear and raw addresses
        are shown.
      </Callout>
    </Prose>
  );
}
