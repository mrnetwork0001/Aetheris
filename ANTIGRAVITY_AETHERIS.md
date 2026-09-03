# 🌌 ANTIGRAVITY_AETHERIS — Persistent Project Context Directive

> **Project Name:** AETHERIS  
> **Target Event:** ETHOnline 2026 (ETHGlobal)  
> **Submission Deadline:** September 13, 2026 @ 23:59 PT  
> **Target Bounties ($52,000 Total Pool Focus):** Hedera ($15,000) + The Graph ($15,000) + World ID ($7,000) + 0G ($15,000)  
> **Core Stack:** Hedera EVM + HTS / HCS + The Graph Subgraph + World ID (IDKit) + Solidity 0.8.24 + Next.js 14  

---

## 📌 Core Directives for Aetheris Development

1. **Master Spec Source of Truth:**  
   Always consult [AETHERIS_PROJECT_SPEC.md](file:///Users/mrnetwork/Aetheris/AETHERIS_PROJECT_SPEC.md).

2. **Technical Architecture Guidelines:**
   - **Hedera Integration:** Deploy `AetherisAgency.sol` and `AetherisTreasury.sol` on Hedera EVM Testnet (Chain ID 296).
   - **The Graph:** Deploy custom Subgraph to index HCS events and treasury balance state.
   - **World ID:** Implement `WorldID.verifyProof` to protect operator vault claim authority.
   - **0G Serving & Storage:** Store campaign deliverables to 0G Storage and route LLM prompts to 0G Serving.

3. **Submission Requirements Checklist:**
   - Public GitHub repository under Apache 2.0 / MIT License.
   - Deployed smart contracts on Hedera EVM Testnet.
   - Live Subgraph on The Graph Studio.
   - 3-Minute Demo Video walkthrough.

4. **Repository Key Files:**
   - Master Spec: `AETHERIS_PROJECT_SPEC.md`
   - Directives: `ANTIGRAVITY_AETHERIS.md`
   - Skill Instructions: `.agents/skills/aetheris-ethonline/SKILL.md`
