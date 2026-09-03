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

## 🚀 Quickstart & Setup Instructions

### 1. Prerequisites
- Node.js 18+ & Hardhat
- Python 3.11+
- Hedera Testnet Account & RPC

### 2. Installation & Contract Compilation
```bash
git clone https://github.com/mrnetwork/Aetheris.git
cd Aetheris
npm install
npm run compile
```

---

## 📄 License
Apache 2.0 Open Source
