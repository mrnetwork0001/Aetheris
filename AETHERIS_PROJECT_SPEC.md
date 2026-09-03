# 🌌 AETHERIS — Autonomous DeAI Agency & Micro-Treasury Operating System

> **ETHOnline 2026 Master Project Blueprint ($100,000 Total Prize Pool)**  
> **Target Bounties ($52,000 Total Focus):** Hedera ($15,000 EVM/HTS/HCS) + The Graph ($15,000 Subgraphs) + World ID ($7,000 Proof of Personhood) + 0G ($15,000 DeAI/Storage)  
> **Submission Deadline:** Sunday, September 13, 2026 @ 23:59 PT  
> **License:** Apache 2.0 Open Source  
> **Author:** Ifeanyichukwu Onwo (`mrnetwork`)  

---

## 📌 Executive Summary

**Aetheris** is an **Autonomous DeAI Agency & Micro-Treasury Operating System** built to bridge decentralized AI inference with sub-second, enterprise-grade on-chain execution and verifiable human governance.

Instead of static AI chatbots or passive API wrappers, **Aetheris** enables users, businesses, and DAOs to launch self-sustaining **Autonomous DeAI Agencies**. An Aetheris Agency accepts high-value business tasks (such as smart contract security auditing, market intelligence synthesis, automated branding, or code generation) from clients in stablecoins, autonomously hires specialized sub-agents via programmatic micro-payments, executes DeAI inference on **0G Serving**, stores deliverables on **0G Storage**, handles sub-second micro-settlements on **Hedera Token Service (HTS)**, logs execution streams via **Hedera Consensus Service (HCS)**, and protects agency governance through **World ID Proof of Personhood**.

---

## 🎯 Strategic Moat & Winning Formula (Targeting $52k Bounties)

| Sponsor Track | Technical Integration | Strategic Impact for Judging |
| :--- | :--- | :--- |
| **Hedera ($15,000)** | **Hedera EVM, HTS & HCS:**<br>• Deploys `AetherisTreasury.sol` on Hedera EVM.<br>• Programmatic micro-settlements between Master Agency & sub-agents via **Hedera Token Service (HTS)**.<br>• Immutable milestone audit logging via **Hedera Consensus Service (HCS)**. | Highlights Hedera's sub-second finality, micro-cent token transfer fees, and enterprise-grade consensus logging. |
| **The Graph ($15,000)** | **DeAI & Agent Analytics Subgraph:**<br>• Indexes Hedera HCS event streams and job completion state into a GraphQL API for real-time UI dashboards. | Provides a high-performance, real-time analytics layer for tracking agent revenue and performance. |
| **World ID ($7,000)** | **Sybil Resistance & Proof of Human Operator:**<br>• Enforces World ID verification prior to deploying or claiming profits from an Aetheris Agency Treasury. | Prevents automated spam agent generation and guarantees human-in-the-loop governance. |
| **0G ($15,000)** | **0G Serving & 0G Storage:**<br>• Executes verifiable DeAI model inference for sub-agent worker tasks.<br>• Persists immutable campaign deliverables and prompt histories to 0G Storage. | Demonstrates real-world commercial DeAI inference with verifiable on-chain data availability & storage. |

---

## 🏗️ System Architecture & Workflow

```
                                  ┌──────────────────────────────┐
                                  │   Human Operator / Client    │
                                  └──────────────┬───────────────┘
                                                 │
                                                 │ 1. Verifies via World ID (Human Check)
                                                 │ 2. Submits Job & Pays Deposit ($100 HTS Stablecoin)
                                                 ▼
                                 ┌───────────────────────────────┐
                                 │    Aetheris Agency Core       │
                                 │   (AetherisTreasury on Hedera)│
                                 └───────────────┬───────────────┘
                                                 │
                   ┌─────────────────────────────┼─────────────────────────────┐
                   │ 3. Assigns Sub-Task         │ 3. Assigns Sub-Task         │ 3. Assigns Sub-Task
                   ▼                             ▼                             ▼
        [ Sub-Agent 1: Security Audit ]  [ Sub-Agent 2: Code Gen ]    [ Sub-Agent 3: Market Research ]
                   │                             │                             │
                   └─────────────────────────────┼─────────────────────────────┘
                                                 │
                                                 │ 4. Executes DeAI Inference via 0G Serving
                                                 │ 5. Saves Deliverables & Logs via 0G Storage
                                                 ▼
                                 ┌───────────────────────────────┐
                                 │  0G Serving & Storage Layer   │
                                 └───────────────┬───────────────┘
                                                 │
                                                 │ 6. Emits Completion Proofs
                                                 ▼
                                 ┌───────────────────────────────┐
                                 │ Hedera HTS & HCS Settlement   │
                                 └───────────────┬───────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
      [ HTS Sub-Agent Payout ]                                   [ HCS Cryptographic Audit Log ]
      (Programmatic Micro-Settlement)                            (Recorded on Hedera Consensus)
                   │                                                           │
                   └─────────────────────────────┬─────────────────────────────┘
                                                 │
                                                 ▼
                                 ┌───────────────────────────────┐
                                 │ Agency Net Profit Retained in │
                                 │   Autonomous Hedera Treasury  │
                                 └───────────────────────────────┘
```

---

## 📄 License
Apache 2.0 Open Source
