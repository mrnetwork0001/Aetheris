---
name: aetheris-ethonline
description: Architecture, guidelines, contract specs, and prize strategy for Aetheris (Autonomous DeAI Agency & Micro-Treasury OS) built for ETHOnline 2026 targeting 0G, Hedera, World ID, and The Graph bounties.
---

# 🌌 Aetheris — ETHOnline 2026 Skill & Execution Guide

Use this skill whenever working on, reviewing, or developing **Aetheris** — the Autonomous DeAI Agency & Micro-Treasury Operating System built for ETHOnline 2026.

## 📌 Project Overview & Target
- **Target Event:** ETHOnline 2026 (ETHGlobal)
- **Target Bounties ($52,000 Focus):** Hedera ($15,000) + The Graph ($15,000) + World ID ($7,000) + 0G ($15,000)
- **Primary Track:** Open Track / DeAI / Autonomous Agents
- **Core Tech Stack:** Hedera EVM (Chain ID 296) + HTS + HCS + The Graph + World ID + 0G + Next.js 14

## 🏗️ Technical Architecture Rules

### 1. Hedera EVM & HTS/HCS Integration (`contracts/AetherisTreasury.sol`)
- Deploy core vault on Hedera EVM Testnet.
- Process sub-agent micro-payments via Hedera Token Service (HTS).
- Submit cryptographic task execution logs to Hedera Consensus Service (HCS).

### 2. The Graph Subgraph (`subgraph/schema.graphql`)
- Deploy custom Subgraph to index HCS logs and treasury balance updates for real-time UI dashboards.

### 3. World ID Integration (`lib/worldid.ts`)
- Verify operator Proof of Personhood via World ID before allowing treasury deployment or withdrawal.

### 4. 0G DeAI Serving & Storage (`lib/zerog.ts`)
- Execute model inference on 0G Serving and save output deliverables to 0G Storage.

## 🚨 Submission Checklist
- Deployed contracts on Hedera EVM Testnet.
- Live Subgraph on The Graph Studio.
- Public GitHub repo under Apache 2.0 / MIT License.
- 3-Minute Demo Video walkthrough.
