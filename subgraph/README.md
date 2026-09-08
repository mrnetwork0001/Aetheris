# Aetheris Subgraph

The real-time analytics layer for **Aetheris — Autonomous DeAI Agency & Micro-Treasury OS**.

This subgraph turns the raw Hedera EVM event stream into a queryable model of how an
autonomous agency actually earns: which client jobs were escrowed, which sub-agents were
hired for which role, which deliverables were anchored to Hedera Consensus Service, which
micro-payouts went through the **HTS precompile vs a plain ERC-20 transfer**, what margin
the agency retained, and how the treasury was rebalanced through 1inch.

- **Network:** Hedera EVM Testnet (chain id `296`), manifest network name `hedera-testnet`
- **Contract of record:** [`contracts/interfaces/IAetherisEvents.sol`](../contracts/interfaces/IAetherisEvents.sol) — a frozen interface. Every ABI fragment and handler here mirrors it verbatim.
- **Tooling:** `@graphprotocol/graph-cli` 0.98.x · `@graphprotocol/graph-ts` 0.38.x · `specVersion 1.2.0` · `apiVersion 0.0.9`

---

## Layout

```
subgraph/
├── schema.graphql            # 17 entities, real enums, @derivedFrom relations
├── subgraph.yaml             # 2 data sources — EDIT THE ADDRESSES HERE
├── networks.json             # optional address/startBlock config (see caveat below)
├── docker-compose.yml        # local graph-node + IPFS + Postgres for Hedera
├── queries.graphql           # 11 worked example queries
├── abis/
│   ├── AetherisAgency.json   # 7 event fragments, verbatim from IAetherisEvents.sol
│   └── AetherisTreasury.json # 3 event fragments + the `agency()` view
└── src/
    ├── helpers.ts            # get-or-create, day-data rollup, constants
    ├── agency.ts             # 7 handlers: identity, jobs, tasks, job settlement, HCS
    └── treasury.ts           # 3 handlers: HTS micro-settlements, 1inch swaps, profit claims
```

### Which contract emits what

The 10 frozen events are split across two deployed contracts, and the manifest follows
the implementation exactly:

| Contract | Events |
| --- | --- |
| `AetherisAgency` | `AgencyDeployed` · `OperatorVerified` · `JobCreated` · `SubAgentAssigned` · `TaskCompleted` · `JobSettled` · `HcsLogAnchored` |
| `AetherisTreasury` | `MicroSettlement` · `TreasuryRebalanced` · `ProfitClaimed` |

`MicroSettlement` is emitted by `AetherisTreasury.settleSubAgent()`, so on that event
`event.address` is the **treasury**, not the agency. `handleMicroSettlement` therefore
resolves the owning agency from `Job.agency` (written when `AetherisAgency.createJob()`
fired), falling back to an `eth_call` on the treasury's `agency()` view only when the job
is unknown — which is why the treasury ABI carries that one function fragment.

---

## 1. Build

> **Run these from the repository root** (that is where `node_modules/` lives).
>
> **`--output-dir` is not optional.** graph-cli writes generated code to `./generated`
> *relative to the current working directory*. The mappings import from `../generated/...`,
> i.e. `subgraph/generated/`, which is also what the repo `.gitignore` expects — so the
> output dir must be passed explicitly:

```bash
npx graph codegen subgraph/subgraph.yaml --output-dir subgraph/generated
npx graph build   subgraph/subgraph.yaml --output-dir subgraph/build
```

Both should end with `Types generated successfully` and `Build completed: subgraph/build/subgraph.yaml`.

<details>
<summary>Optional: make the root <code>npm run codegen</code> / <code>npm run build:subgraph</code> scripts work too</summary>

The scripts currently in the root `package.json` omit the output dir, so they would emit
`generated/` at the repo root and break the mapping imports. Append the flag:

```jsonc
"codegen":        "graph codegen subgraph/subgraph.yaml --output-dir subgraph/generated",
"build:subgraph": "graph build   subgraph/subgraph.yaml --output-dir subgraph/build"
```
</details>

---

## 2. Paste in the deployed addresses

`subgraph.yaml` ships with placeholders:

```yaml
address: "0x0000000000000000000000000000000000000000"
startBlock: 0
```

Deploy the contracts first:

```bash
npm run deploy:hedera        # hardhat run scripts/deploy.js --network hederaTestnet
```

`scripts/deploy.js` prints the deployed **AetherisAgency** and **AetherisTreasury** addresses
and the deployment block number. Paste them into the two `source:` blocks in
`subgraph.yaml` — there are **four** values to replace in total (two addresses, two start blocks).

Then re-run codegen + build.

**Notes**

- `startBlock: 0` technically works but forces a full-history scan of Hedera testnet and is
  extremely slow. Always use the real deployment block.
- The two data sources take **different** addresses — `AetherisAgency` and
  `AetherisTreasury` are separate deployments (see *Which contract emits what* above).
  Don't paste the same address into both.
- `networks.json` carries the same values for `graph deploy --network hedera-testnet`.
  ⚠️ That flag **rewrites `subgraph.yaml` in place and strips every comment from it**. If you
  use it, keep the file under version control so you can see what changed.

---

## 3. Deploy

### 3a. The Graph Studio

```bash
npx graph auth <DEPLOY_KEY>            # key from https://thegraph.com/studio
npx graph deploy <SUBGRAPH_SLUG> subgraph/subgraph.yaml \
  --output-dir subgraph/build \
  --version-label v0.0.1
```

> **Read this before you rely on Studio.**
>
> **Hedera is not in The Graph's hosted network registry.** The registry that ships with
> graph-cli 0.98.1 (`@graphprotocol/graph-cli/config/TheGraphNetworksRegistry.json`, and the
> live `@pinax/graph-networks-registry`) lists **156 networks — none of them Hedera**:
>
> ```
> $ node -e "require('@pinax/graph-networks-registry').NetworksRegistry.fromLatestVersion()
>     .then(r => console.log(r.networks.filter(n => /hed/i.test(n.id)).length))"
> 0
> ```
>
> `graph codegen` and `graph build` do **not** consult that registry, which is why this
> subgraph compiles cleanly with `network: hedera-testnet`. `graph deploy` doesn't consult it
> either — but Studio validates the network server-side when you create the subgraph, so
> creating a `hedera-testnet` subgraph in the Studio UI may be rejected. Use 3b for a
> guaranteed-working deployment, and treat Studio as a nice-to-have.

### 3b. Self-hosted graph-node (the supported Hedera path)

This is the route [Hedera's own subgraph guide](https://docs.hedera.com/evm/tools/other/the-graph)
documents — a local graph-node pointed at the Hashio JSON-RPC relay.

```bash
docker compose -f subgraph/docker-compose.yml up -d

npx graph create --node http://localhost:8020/ aetheris
npx graph deploy \
  --node http://localhost:8020/ \
  --ipfs http://localhost:5001 \
  aetheris subgraph/subgraph.yaml \
  --output-dir subgraph/build \
  --version-label v0.0.1
```

Query it at **`http://localhost:8000/subgraphs/name/aetheris`**
(playground: `http://localhost:8000/subgraphs/name/aetheris/graphql`),
indexing status at `http://localhost:8030/graphql`.

The compose file sets `ethereum: "hedera-testnet:https://testnet.hashio.io/api"`. The label
before the colon **must match `network:` in `subgraph.yaml`** — both say `hedera-testnet`.
It also sets `GRAPH_ETHEREUM_GENESIS_BLOCK_NUMBER: 1`, because Hedera exposes no block 0
over the JSON-RPC relay and graph-node's genesis probe fails without it.

---

## Data model

17 entities. Addresses and hashes are `Bytes`, amounts are `BigInt` (raw base units — HTS
tokens don't expose `decimals()` uniformly, so scaling happens in the UI), ratios are
`BigDecimal`. Reverse relations are all `@derivedFrom`, so no handler ever maintains an
unbounded array by hand.

| Entity | id | What it answers |
| --- | --- | --- |
| `Protocol` | `"aetheris"` | Singleton dashboard header |
| `Operator` | operator address | Who is World-ID verified, what have they withdrawn |
| `Agency` | agency contract address | Revenue, cost, retained margin, HTS/ERC-20 split |
| `SubAgent` | sub-agent address | **The agent-performance leaderboard** |
| `AgentRoleStat` | `{subAgent}-{role}` | Per-specialization breakdown for one agent |
| `Token` | token address | Per-token deposits, payouts, whether HTS-routed |
| `Job` | `{jobId}` | Escrow → dispatch → completion → settlement lifecycle |
| `Task` | `{jobId}-{taskId}` | One sub-agent assignment + its HCS proof |
| `JobSettlement` | `{jobId}` | Close-out: gross, paid out, net margin, margin rate |
| `Settlement` | `{txHash}-{logIndex}` | One micro-payment, with `viaHts` + `rail` |
| `Rebalance` | `{txHash}-{logIndex}` | 1inch swap, with `crossChain` derived from `dstChainId` |
| `ProfitClaim` | `{txHash}-{logIndex}` | World-ID-gated margin withdrawal |
| `HcsAnchor` | `{txHash}-{logIndex}` | Immutable HCS audit trail (`topicId` + `sequenceNumber`) |
| `AgencyDayData` | `{agency}-{dayId}` | **Daily time series per agency** |
| `ProtocolDayData` | `{dayId}` | Daily time series protocol-wide |
| `ActiveSubAgentMarker`, `ActiveAgencyMarker` | internal | O(1) distinct-counting markers |

### Enums mirror the Solidity enums exactly

`JobStatus` → `None · Funded · Dispatched · Completed · Settled · Refunded`
`TaskStatus` → `None · Assigned · Completed · Paid · Cancelled`
plus `SettlementRail` → `HTS · ERC20`, derived from the `viaHts` boolean so payout routing
is filterable in one predicate.

### Time-series aggregation

`AgencyDayData` and `ProtocolDayData` are keyed on `timestamp / 86400`. Every handler that
touches value or throughput folds into the open day bucket, and `AgencyDayData` also carries
`cumulativeGrossRevenue` / `cumulativeNetMargin` snapshots so cumulative charts need no
client-side running sum.

`uniqueSubAgents` (daily) and `Agency.uniqueSubAgentCount` (lifetime) are maintained with
`ActiveSubAgentMarker` rows rather than array scans, so distinct-counting stays O(1) per
event no matter how many agents an agency hires.

### Aggregate discipline

Every counter on `Agency`, `SubAgent`, `Operator`, `Token`, `Job` and `Protocol` is
incremented in place. Nothing is ever recomputed by loading children. `Settlement`,
`JobSettlement`, `Rebalance`, `ProfitClaim` and `HcsAnchor` are declared
`@entity(immutable: true)` — they are written exactly once, which lets graph-node skip
copy-on-write versioning for the highest-volume tables.

---

## Example queries

See [`queries.graphql`](./queries.graphql) — 11 ready-to-paste queries covering the protocol
header, the agency league table, the sub-agent leaderboard, a full job trace (escrow →
dispatch → HCS proof → payout → margin), the HTS-vs-ERC-20 routing split, both daily time
series, 1inch rebalances, World ID governance, and the HCS audit trail.

Smoke test once indexed:

```graphql
{
  protocol(id: "aetheris") { jobCount settlementCount htsSettlementCount netMargin }
  subAgents(first: 5, orderBy: totalEarned, orderDirection: desc) {
    id roles tasksCompleted totalEarned completionRate
  }
}
```

---

## AssemblyScript notes (for whoever edits `src/`)

The mappings are AssemblyScript, not TypeScript. Two traps that will bite you:

1. **Never write `x == null` against a nullable `Bytes` or `BigInt` field.** `ByteArray` and
   `BigInt` define non-nullable `@operator("==")` overloads, and comparing one to `null`
   makes the AssemblyScript compiler crash with a bare `AssertionError: assertion failed`
   and no source location. Assign to a local and test truthiness instead:
   ```ts
   let existing = agency.operator;   // Bytes | null
   if (!existing) { /* unset */ }
   ```
   `string` fields are fine with `== null` — AS's `String.__eq` accepts nullables.
2. **Array fields need a round trip.** `entity.roles.push(x)` is silently lost; read the
   array into a local, push, then assign it back (see `addRoleToSubAgent`).

Also: entities are loaded exactly once per handler and passed by reference into helpers, so
a helper's mutations are never lost to a second in-memory copy. Keep that invariant.

---

## Known gap: `Refunded` / `Cancelled` are currently unreachable

`JobStatus.Refunded` and `TaskStatus.Cancelled` exist in the frozen
`IAetherisEvents.sol` enums, but the interface declares **no event** that would move a job
or task into those states. The implementation does emit `JobRefunded(...)` and
`TaskCancelled(...)`, but those signatures live only in `AetherisAgency.sol` — they are not
part of the frozen contract of record, so this subgraph does not index them and no entity
will ever carry those two enum values.

To close the gap, add the two events to `IAetherisEvents.sol` first (that file is the
single source of truth and is owned by the contracts side), then add the matching ABI
fragments, `eventHandlers` entries and handlers here.

---

## Checklist before submitting

- [ ] Contracts deployed to Hedera testnet; four placeholder values replaced in `subgraph.yaml`
- [ ] `npx graph codegen subgraph/subgraph.yaml --output-dir subgraph/generated` clean
- [ ] `npx graph build subgraph/subgraph.yaml --output-dir subgraph/build` clean
- [ ] Deployed (Studio if it accepts the network, otherwise the local node in `docker-compose.yml`)
- [ ] Demo transactions sent so the leaderboard and day-data series have real rows
- [ ] Frontend `NEXT_PUBLIC_SUBGRAPH_URL` pointed at the query endpoint
