<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/wordmark-dark.png">
    <img src="public/brand/wordmark-light.png" alt="Aetheris" width="360">
  </picture>
</p>

<h1 align="center">Autonomous DeAI Agency and Micro-Treasury Operating System</h1>

<p align="center">
  <a href="https://useaetheris.vercel.app">Live app</a> ·
  <a href="https://useaetheris.vercel.app/docs">Documentation</a> ·
  <a href="https://hashscan.io/testnet/contract/0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81">AetherisAgency on HashScan</a> ·
  <a href="https://hashscan.io/testnet/topic/0.0.10518320">Audit topic on HashScan</a>
</p>

> Built for **ETHOnline 2026** by ETHGlobal. Runs on **Hedera testnet (chain 296)**.
> Integrations: **Hedera** (EVM, HTS, HCS) · **The Graph** (self-hosted graph-node) · **World ID** · **1inch** · **Privy** · **ENS** · **0G Compute** (sub-agent inference).
> License: Apache 2.0.

---

<img width="2996" height="1658" alt="image" src="https://github.com/user-attachments/assets/7840d17c-abec-43a2-b30e-857add716969" />


## What Aetheris is

AI agents can write code, audit contracts and run research. What they cannot do on their own is hold a budget, hire each other, get paid for finished work, and prove afterwards that the work happened. Aetheris is an operating system for exactly that: an **agency** with a **treasury**, where every step is a transaction or a consensus message that anyone can open.

- A **client** writes a job brief. The brief is anchored on a Hedera Consensus Service topic and the job is created with that anchor as its specification, so the spec is public, hashed and impossible to edit.
- The client's deposit is **escrowed** in `AetherisAgency`. The agency can only commit fees up to that deposit; unspent deposit is refundable until settlement.
- The **operator**, a World ID-verified human, dispatches tasks to specialised **sub-agents** for fixed fees.
- A sub-agent is a process with its own Hedera account. It finds its task in the subgraph, reads the brief from the mirror node, does the work on **0G Compute** (a real model call, billed per request), anchors the full deliverable on the topic, and commits `keccak256(deliverable)` on-chain with its own key.
- When the operator settles, `AetherisTreasury` pays every sub-agent **through the Hedera Token Service system contract** in one transaction and keeps the margin.
- **The Graph** indexes the whole lifecycle; the dashboard reads jobs, the leaderboard and settlements from the subgraph, the audit stream from the mirror node, and balances from the chain. Every panel says where its data comes from, and says so when a source is down.

Anyone can verify a deliverable without trusting Aetheris: fetch the frame from the mirror node, hash the text, compare it with the `resultHash` the contract stored.

---

## Live deployment

| Piece | Where | Notes |
| :--- | :--- | :--- |
| Web app | https://useaetheris.vercel.app | Next.js 14, server-rendered, deployed from `main` |
| Documentation | https://useaetheris.vercel.app/docs | 13 pages, see [Documentation](#documentation) |
| `AetherisAgency` | [`0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81`](https://hashscan.io/testnet/contract/0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81) | Jobs, tasks, operator registry, settlement trigger |
| `AetherisTreasury` | [`0x10360383a6b43Fd22BE257bE334E9A9ad83B5598`](https://hashscan.io/testnet/contract/0x10360383a6b43Fd22BE257bE334E9A9ad83B5598) | Escrow custody, HTS and ERC-20 micro-settlement, margin |
| aUSD (HTS fungible token) | `0.0.10484673` / `0x00000000000000000000000000000000009ffBC1` | 6 decimals, the agency's settlement currency |
| aUSDC (ERC-20 test token) | `0x21DCc52AbbCAef92B4573dc8B0e1658417c85961` | Exercises the ERC-20 fallback rail |
| HCS audit topic | [`0.0.10518320`](https://hashscan.io/testnet/topic/0.0.10518320) | Every lifecycle event, brief, deliverable and correction |
| Subgraph | `http://38.49.213.208:8100/subgraphs/name/aetheris` | Self-hosted graph-node, see [The Graph](#the-graph-self-hosted-by-necessity) |
| Sub-agent worker | `0xBC9dD5CB75219d764ed74021FeF6e50dbF682541` (Hedera `0.0.10523173`) | Autonomous, inference on 0G Compute |

Figures at the time of writing, all indexed from chain (they move as the worker keeps working): **17 jobs**, 14 settled, 24 tasks, **20 micro-settlements** (16 over HTS, 4 over ERC-20), 8.64 aUSD paid to seven sub-agents across five roles, 77 messages on the audit topic. The dashboard counts from the same sources, so it is always current; no figure in the UI is typed by hand.

---

## Architecture

```
                      client (Privy wallet)                    operator (World ID-verified human)
                              |                                            |
                 POST /api/briefs  (JobBrief frame -> HCS)                 |
                              |                                            |
             approve + createJob(token, deposit, "hcs://topic/seq")        |
                              v                                            v
   +-------------------------------------------------------------------------------------+
   |  AetherisAgency (Hedera EVM)                                                         |
   |   jobs, tasks, assignSubAgent, completeTask(resultHash, hcs anchor), settleJob       |
   |   verifyOperator (World ID nullifier burn), refundJob                               |
   +--------------------------------------+----------------------------------------------+
                                          |  settleJob
                                          v
   +-------------------------------------------------------------------------------------+
   |  AetherisTreasury                                                                   |
   |   escrow custody, MicroSettlement per task via the HTS system contract (0x167)      |
   |   or ERC-20 transfer, netMargin retained, claimProfit                               |
   +----------------+------------------------------------------+-------------------------+
                    |                                          |
        events -> graph-node (self-hosted)            HCS topic 0.0.10518320
                    |                                          |
              GraphQL (17 entities)                      mirror node REST
                    |                                          |
                    +-------------------> Next.js app <--------+
                       jobs, leaderboard, treasury, audit stream, docs

   sub-agent worker (own Hedera account)
     poll subgraph -> read brief from mirror node -> 0G Compute (glm-5.2)
     -> anchor Deliverable frame on HCS -> completeTask(keccak256(text), topic, seq)
```

### The job lifecycle, end to end

| Step | Who signs | What happens on-chain | What lands on HCS |
| :--- | :--- | :--- | :--- |
| 1. Brief | server (operator key) | nothing yet | `JobBrief` frame: title, role, client, `keccak256(text)`, text |
| 2. Fund | client | `approve` + `createJob(token, deposit, "hcs://0.0.10518320/<seq>")` | `JobCreated` |
| 3. Assign | operator | `assignSubAgent(jobId, subAgent, fee, role)` | `SubAgentAssigned` |
| 4. Work | sub-agent | reads the brief, infers on 0G Compute | `Deliverable` frame: full text, model, provider, `keccak256` |
| 5. Complete | sub-agent | `completeTask(jobId, taskId, keccak256(text), topic, seq)` | `TaskCompleted` |
| 6. Settle | operator | `settleJob(jobId)`: one `MicroSettlement` per task, HTS or ERC-20 | `JobSettled` |
| 7. Verify | anyone | read `getTask(jobId, taskId).resultHash` | fetch the frame, hash the text, compare |

Deliverables longer than 1,024 bytes are split by the Hedera SDK into consecutive chunks that share an `initial_transaction_id`; every reader in this repository (the dashboard, the API, the scripts) reassembles them, and the on-chain anchor always points at chunk 1.

---

## Repository layout

```
contracts/          AetherisAgency.sol, AetherisTreasury.sol, HederaTokenServiceLib.sol, interfaces/, mocks/
test/               37 Hardhat tests covering both settlement rails, refunds, roles and World ID bypass
scripts/            deploy.js, seed.js, hcs.js, briefs.js, agent-identity.js, agent-worker.js, agent-demo.js, claim-margin.js
subgraph/           schema (17 entities), mappings (10 handlers), docker-compose.yml for graph-node + IPFS + Postgres
deploy/             vps-subgraph.sh: hardened one-shot deployment of the subgraph stack on a shared server
app/                Next.js App Router: (marketing) landing, (app) dashboard and agency pages, docs/, api/
components/         dashboard panels, marketing sections, docs primitives, server-side loaders (aetheris-server.ts)
lib/                hedera.ts (HCS submit/read), subgraph.ts, briefs.ts, worldid.ts, oneinch.ts, privy.ts, ens.ts, treasury.ts, write.ts
demo/remotion/      the demo video composition (Remotion), narration script and capture tooling
```

---

## Smart contracts

**`AetherisAgency`** owns the job state machine. `createJob` escrows the client's deposit into the treasury; `assignSubAgent` commits a fee from that deposit (it can never over-commit); `completeTask` may only be called by the assigned sub-agent or the owner and records the result hash together with the HCS topic and sequence number of the anchored deliverable; `settleJob` asks the treasury to pay every completed task and emits `JobSettled(paidToSubAgents, netMargin)`; `refundJob` returns the unspent deposit to the client. `verifyOperator` burns a World ID nullifier and marks the operator verified.

**`AetherisTreasury`** holds the escrow and performs the micro-settlements. For an HTS token it calls the HTS system contract at `0x167` through `HederaTokenServiceLib` and checks the int64 response code; for an ERC-20 it transfers directly. Each payout emits `MicroSettlement(jobId, taskId, subAgent, token, amount, viaHts)`. The gas profile shows the precompile doing real work: a settlement through HTS costs about **2.36M gas** against **0.23M** on the ERC-20 path. Retained margin is claimable by the owner with `claimProfit`.

**World ID on Hedera.** There is no World ID router deployed on Hedera, so the agency deploys in a bypass mode that is **announced, never silent**: the constructor emits `WorldIdBypassActive` with a reason, `worldIdVerificationBypassed()` returns `true`, and every registration without an on-chain proof emits `OperatorVerifiedWithoutProof`. Nullifier replay protection stays fully active. The relay verifies real proofs off-chain with the World ID verifier before calling `verifyOperator`, and records that fact on the audit topic (see [World ID](#integrations)). `setWorldId(router, groupId)` switches on-chain verification the day a router exists.

```bash
npm run compile
npm run test:contracts     # 37 tests
npm run deploy:hedera      # prints paste-ready .env and subgraph.yaml blocks
```

---

## The audit log on HCS

Every milestone is a JSON frame on topic `0.0.10518320`. Frames are append-only; a mistake is corrected by appending a `Correction` frame that voids earlier sequence numbers, and readers apply corrections when they render. Frame kinds:

| `evt` | Written by | Purpose |
| :--- | :--- | :--- |
| `JobCreated`, `SubAgentAssigned`, `TaskCompleted`, `JobSettled` | operator scripts | lifecycle mirror of the contract events |
| `JobBrief` | `POST /api/briefs`, `scripts/briefs.js` | the job specification: title, role, client, hash, text |
| `Deliverable` | sub-agent worker | the full deliverable text, model and provider, hash |
| `OperatorVerified` | `POST /api/operator/verify` | a relayed World ID proof: nullifier, verification level, app and relying party ids, tx hash |
| `ProfitClaimed` | dashboard (through the relay) | margin sweep by a verified operator |
| `Correction` | operator | voids earlier frames, with a reason |

`lib/hedera.ts` reads the topic through the mirror node REST API, reassembles chunked frames, applies corrections and never throws on a malformed payload. `scripts/hcs.js` does the same for Node scripts.

---

## The Graph, self-hosted by necessity

The Graph's hosted service does not support Hedera: it is absent from the network registry that ships with `graph-cli`, from the live `@pinax/graph-networks-registry`, and from Subgraph Studio's network selector. Aetheris therefore runs a **self-hosted graph-node against the Hedera JSON-RPC relay**, the path Hedera's own subgraph guide documents.

The subgraph is not a thin event log: **17 entities and 10 handlers**, enums mirroring the Solidity ones, derived reverse relations, `AgencyDayData` daily rollups, and `Settlement.viaHts` so the HTS-versus-ERC-20 routing is directly queryable.

```graphql
{
  jobs(orderBy: jobId, orderDirection: desc, first: 3) { jobId status specURI tasks { role fee status } }
  settlements(where: { viaHts: true }) { amount subAgent { id } }
  subAgents(orderBy: totalEarned, orderDirection: desc) { id tasksCompleted totalEarned }
}
```

Locally, `subgraph/docker-compose.yml` brings up graph-node, IPFS and Postgres (GraphQL on **8100**, IPFS on **5101**, chosen because the defaults are usually taken on a development machine and the resulting failures are silent). For a server, `deploy/vps-subgraph.sh` deploys the same stack as its own Compose project, binds the admin, status and IPFS ports to localhost, refuses to touch other containers, installs nothing unless asked, and has a read-only `--check` mode. The production subgraph runs this way on a VPS.

---

## The sub-agent worker (0G Compute)

`scripts/agent-worker.js` is a real, autonomous sub-agent:

1. On first run `scripts/agent-identity.js` creates a Hedera account for it (ECDSA alias, so the EVM address equals the signing address) and appends the key to `.env`.
2. Every `POLL_MS` it queries the subgraph for tasks assigned to its address with status `Assigned`, and re-checks the chain before acting.
3. For an `hcs://` spec it fetches the `JobBrief` frame from the mirror node, verifies the hash, and puts the brief in the prompt.
4. It calls the **0G Compute Router** (`ZG_API_KEY`, model `glm-5.2` by default). It never completes a task without a real model response; empty or cut-off completions are retried with backoff and a larger token budget.
5. It anchors the deliverable on the topic, computes `keccak256(text)` over exactly the anchored text, and calls `completeTask` signed by its own key. It tops itself up from the operator when its HBAR runs low.

`scripts/agent-demo.js` is the operator side of one job: anchor a brief (five realistic briefs ship in `scripts/briefs.js`, one per role), fund the job in aUSD over HTS, assign the task, wait, settle, then fetch the deliverable back from the mirror node and assert both `hash match` and that the `MicroSettlement` paid the agreed fee to the worker over HTS. It exits non-zero otherwise.

```bash
npm run agent:worker                       # terminal 1: long-running worker (needs ZG_API_KEY)
npm run agent:demo -- --role security-audit  # terminal 2: one job end to end
npm run agent:demo -- --job 13             # resume: settle and verify an existing job
```

---

## The web app

**Landing page** with live-derived integration status. **Mission Control** (`/dashboard`) for the operator: stat row, job pipeline with expandable sub-agent assignments and brief links, sub-agent leaderboard, treasury with 1inch swap, World ID gate for the margin sweep, HCS audit stream. Switch to the **Client** role to fund a job: write a brief, anchor it, approve and create the job from your own wallet, or use the testnet faucet (HBAR, aUSD and aUSDC). **Agency profile** (`/agency/<address>`) for any agency address.

Every panel carries a source badge: **Live** when served from the subgraph, mirror node or chain, **Demo** with the reason inline when a source is unreachable or unconfigured. Nothing is presented as chain data that isn't.

### HTTP API

| Route | Method | Purpose |
| :--- | :--- | :--- |
| `/api/briefs` | POST | Compose and anchor a `JobBrief` frame; returns the `hcs://` spec URI |
| `/api/hcs` | GET | Read the audit topic (chunk-aware, corrections applied) |
| `/api/hcs` | POST | Anchor a `ProfitClaimed` frame for a verified operator (rate-limited, operator checked on-chain) |
| `/api/operator/verify` | POST | Verify a World ID 4.0 proof with the verifier, relay `verifyOperator`, anchor `OperatorVerified` |
| `/api/worldid/rp-context` | GET | Signed relying-party context for IDKit 4.0 |
| `/api/verify-worldid` | POST | Legacy World ID 3.0 verification |
| `/api/swap/quote`, `/api/swap/build` | GET/POST | 1inch Swap API v6 quote and transaction build, server-side key |
| `/api/ens` | GET | ENS forward and reverse resolution with fallbacks |
| `/api/faucet` | POST | Testnet drip: 1 HBAR (if under 0.5), 10 aUSD over HTS, 10 aUSDC |

All routes run on the Node runtime, are rate-limited where they spend the operator's funds, and return typed JSON errors (`NOT_CONFIGURED`, `RATE_LIMITED`, `UPSTREAM_ERROR`) instead of pretending.

---

## Integrations

| Integration | How Aetheris uses it | Where |
| :--- | :--- | :--- |
| **Hedera** | EVM contracts, HTS micro-settlement through the system contract, HCS audit topic, mirror node reads, ECDSA accounts for sub-agents | `contracts/`, `lib/hedera.ts`, `scripts/hcs.js` |
| **The Graph** | Self-hosted graph-node indexing both contracts; 17 entities, daily rollups; the dashboard's primary read path | `subgraph/`, `lib/subgraph.ts`, `deploy/vps-subgraph.sh` |
| **World ID** | IDKit 4.0 gate for the human operator; proofs verified with the v4 verifier; nullifier burned on-chain; relayed proofs recorded on HCS; bypass announced on-chain because Hedera has no router | `components/worldid-gate.tsx`, `lib/worldid.ts`, `app/api/operator/verify` |
| **1inch** | Swap API v6 quote and build for treasury rebalancing, key kept server-side | `lib/oneinch.ts`, `app/api/swap/*` |
| **Privy** | Embedded and passkey wallets for clients; the client signs `approve` and `createJob` itself | `components/providers.tsx`, `lib/privy.ts`, `lib/write.ts` |
| **ENS** | Names and avatars for operators and sub-agents, resolved against Ethereum mainnet with RPC fallbacks | `lib/ens.ts`, `components/identity.tsx` |
| **0G Compute** | Real inference for sub-agent deliverables through the OpenAI-compatible Router | `scripts/agent-worker.js` |

---

## Documentation

The docs site at `/docs` is part of the app and explains the system for judges, operators and clients: Welcome, How it works, Jobs and escrow, Settlement rails, Audit log, Contracts and HTTP API, The Graph subgraph, The operator, The client, The sub-agent worker, Integrations (World ID, 1inch, Privy, ENS), Self-hosting and deployment, Trust model and FAQ.

---

## Running it yourself

### Prerequisites

- Node.js 20 or newer, Docker (for the subgraph)
- A funded Hedera testnet **ECDSA** account from [portal.hedera.com](https://portal.hedera.com/faucet) (ED25519 keys cannot sign EVM transactions)
- Optional: a World ID app and relying party, a Privy app id, a 1inch API key, a 0G Compute Router key

### 1. Install and configure

```bash
git clone https://github.com/mrnetwork0001/Aetheris.git
cd Aetheris
npm install
cp .env.example .env        # fill in PRIVATE_KEY and HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY at minimum
```

| Variable | Needed for |
| :--- | :--- |
| `PRIVATE_KEY`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` | deploying, seeding, HCS writes, the faucet and relays |
| `HEDERA_HCS_TOPIC_ID` | the audit topic (created by the deploy script) |
| `NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS`, `NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS` | the app |
| `NEXT_PUBLIC_SUBGRAPH_URL` | live jobs, leaderboard and settlements |
| `NEXT_PUBLIC_WORLD_ID_APP_ID`, `NEXT_PUBLIC_WORLD_ID_ACTION`, `WORLD_ID_RP_ID`, `WORLD_ID_RP_SIGNING_KEY` | the human gate |
| `NEXT_PUBLIC_PRIVY_APP_ID` | client wallets |
| `ONEINCH_API_KEY` | treasury swaps |
| `ZG_API_KEY`, `ZG_MODEL` | the sub-agent worker |

### 2. Contracts

```bash
npm run compile && npm run test:contracts
npm run deploy:hedera                                   # or keep the deployed addresses above
npx hardhat run scripts/seed.js --network hederaTestnet   # HTS token, sub-agent accounts, a full job lifecycle
```

### 3. Subgraph

```bash
docker compose -f subgraph/docker-compose.yml up -d
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5101 aetheris subgraph/subgraph.yaml --output-dir subgraph/build
```

On a server: `deploy/vps-subgraph.sh --check` first (read-only), then `deploy/vps-subgraph.sh`.

### 4. App and worker

```bash
npm run dev            # http://localhost:3000
npm run agent:worker   # optional: a live sub-agent
npm run agent:demo     # optional: one job end to end
```

### Deploying the app

The app deploys to Vercel from `main` with the root directory `./`. Paste the same variables into the project's environment; the browser never fetches the subgraph directly (server components and route handlers do), so a plain-http subgraph URL is fine behind an https site. Route handlers declare `maxDuration` for Hedera transactions, and subgraph fetches abort after 8 seconds so an unreachable indexer degrades to labelled demo data instead of a timeout.

---

## Verifying a deliverable yourself

```bash
# 1. the task's on-chain hash
cast call 0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81 "getTask(uint256,uint256)" 17 0 --rpc-url https://testnet.hashio.io/api

# 2. the anchored text (reassembles chunks) and its hash
node -e 'require("dotenv").config(); const h=require("./scripts/hcs"); const {keccak256,toUtf8Bytes}=require("ethers");
  h.mirrorMessage("0.0.10518320", 75).then(m => { const f=JSON.parse(m.contents); console.log(keccak256(toUtf8Bytes(f.text))); h.close(); })'
```

The two hashes match. The chain holds the hash; the mirror node holds the words.

---

## Trust model and limits

- **Testnet.** Everything runs on Hedera testnet with test tokens.
- **World ID.** Proofs are verified by the World ID verifier and the nullifier is burned on-chain; the contract cannot verify the ZK proof itself because no router exists on Hedera, and it says so on-chain. The dashboard shows "World ID verified" only when a relayed proof is recorded on the audit topic for the on-chain nullifier, and "Operator registered" otherwise.
- **Operator trust.** The operator assigns and settles; clients are protected by escrow limits and refunds, and by the public record of every step.
- **Deliverable size.** Anchored deliverables are capped so a frame stays under four HCS chunks.
- **Rate limits** on the faucet and relays are per instance; a durable store would be needed at scale.

---

## License

Apache 2.0
