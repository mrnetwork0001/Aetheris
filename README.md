# 🌌 Aetheris — Autonomous DeAI Agency & Micro-Treasury Operating System

> Built for **ETHOnline 2026** by ETHGlobal  
> **Target Bounties ($54,000 Total Focus):** Hedera ($15,000) + The Graph ($15,000) + World ID ($7,000) + 1inch ($7,000) + Privy ($5,000) + ENS ($5,000)  
> **Submission Deadline:** September 13, 2026 @ 23:59 PT  
> **Core Tech Stack:** Hedera EVM + HTS / HCS + The Graph + World ID + 1inch + Privy + Next.js 14  
> **License:** Apache 2.0 Open Source  

---

## 📌 Overview

**Aetheris** is an **Autonomous DeAI Agency & Micro-Treasury Operating System** built to bridge decentralized AI inference with sub-second, enterprise-grade on-chain execution and verifiable human governance.

- **Hedera EVM & HTS/HCS (`contracts/AetherisTreasury.sol`):** Deploys micro-treasuries on Hedera EVM, handles HTS token micro-settlements, and logs execution streams via Hedera Consensus Service (HCS).
- **The Graph Subgraph (`subgraph/`):** Indexes Hedera HCS event streams and job state into GraphQL APIs for real-time UI dashboards.
- **World ID Integration (`lib/worldid.ts`):** Protects agency governance through zero-knowledge Proof of Personhood.
- **1inch Integration (`lib/oneinch.ts`):** Routes multi-chain agent asset swaps via 1inch Swap API v6.0.
- **Privy Auth (`lib/privy.ts`):** Embedded passkey wallet creation for agency operators.

---

## 🔗 Deployed on Hedera Testnet (chain 296)

| Contract | Address | Explorer |
| :--- | :--- | :--- |
| `AetherisAgency` | `0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81` | [HashScan](https://hashscan.io/testnet/contract/0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81) |
| `AetherisTreasury` | `0x10360383a6b43Fd22BE257bE334E9A9ad83B5598` | [HashScan](https://hashscan.io/testnet/contract/0x10360383a6b43Fd22BE257bE334E9A9ad83B5598) |

Seeded with a full job lifecycle. Both settlement rails are exercised on-chain:

| Rail | Settlements | Evidence |
| :--- | :--- | :--- |
| **Hedera Token Service** | 3 | `MicroSettlement.viaHts = true`, HTS token `0.0.10484673`, sub-agents `0.0.10484674 / 10484676 / 10484678` |
| ERC-20 fallback | 2 | `MicroSettlement.viaHts = false` |

The gas profile is the clearest proof the precompile is doing real work:
settling through HTS costs **2,360,527 gas** against **229,111** for the
ERC-20 path.

Four jobs are indexed across every lifecycle state (Settled, Settled,
Dispatched, Funded). Gross revenue 3.55, paid to sub-agents 2.16, retained
margin 1.39 — reconciled independently by the subgraph from indexed events.

---

## 📊 The Graph — why this subgraph is self-hosted

**The Graph's hosted service does not support Hedera.** Hedera is absent from
the network registry that ships with `graph-cli` and from the live
`@pinax/graph-networks-registry` (156 networks, zero Hedera entries), and
Subgraph Studio's network selector offers neither Hedera mainnet nor testnet.

Aetheris therefore runs a **self-hosted `graph-node` against the Hedera
JSON-RPC relay** — the path [Hedera's own subgraph guide](https://docs.hedera.com/evm/tools/other/the-graph)
documents. `subgraph/docker-compose.yml` brings up the full stack.

The subgraph itself is not a thin event log: **17 entities, 10 handlers**,
real enums mirroring the Solidity ones, derived reverse relations, and
`AgencyDayData` daily time-series rollups. `Settlement.viaHts` makes the
HTS-versus-ERC-20 routing directly queryable:

```graphql
{ settlements(where: { viaHts: true }) { amount subAgent { id } } }
```

```bash
docker compose -f subgraph/docker-compose.yml up -d
npx graph create --node http://localhost:8020/ aetheris
npx graph deploy --node http://localhost:8020/ --ipfs http://localhost:5101 \
  aetheris subgraph/subgraph.yaml --output-dir subgraph/build
```

GraphQL endpoint: `http://localhost:8100/subgraphs/name/aetheris`

> IPFS is published on host port **5101** and GraphQL on **8100** rather than
> the defaults (5001, 8000), which are frequently occupied on a development
> machine. The resulting failures are silent and misleading — `graph-cli`
> reports `Failed to upload to IPFS: Not Found` and queries return another
> server's 404 body.

---

## 🚀 Quickstart & Setup Instructions

### 1. Prerequisites
- Node.js 18+ & Hardhat
- Python 3.11+
- Hedera Testnet Account & RPC

### 2. Installation & Contract Compilation
```bash
git clone https://github.com/mrnetwork0001/Aetheris.git
cd Aetheris
npm install
npm run compile
```

---

## 📄 License
Apache 2.0 Open Source
