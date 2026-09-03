# 🌌 ANTIGRAVITY_AETHERIS — Persistent Project Context Directive

> **Project Name:** AETHERIS  
> **Target Event:** ETHOnline 2026 (ETHGlobal)  
> **Submission Deadline:** September 13, 2026 @ 23:59 PT  
> **Target Bounties ($54,000 Total Pool Focus):** Hedera ($15,000) + The Graph ($15,000) + World ID ($7,000) + 1inch ($7,000) + Privy ($5,000) + ENS ($5,000)  
> **Core Stack:** Hedera EVM + HTS / HCS + The Graph Subgraph + World ID (IDKit) + 1inch API + Privy Auth  

---

## 📌 Core Directives for Aetheris Development

1. **Master Spec Source of Truth:**  
   Always consult [AETHERIS_PROJECT_SPEC.md](file:///Users/mrnetwork/Aetheris/AETHERIS_PROJECT_SPEC.md).

2. **Technical Architecture Guidelines:**
   - **Hedera Integration:** Deploy `AetherisAgency.sol` and `AetherisTreasury.sol` on Hedera EVM Testnet (Chain ID 296).
   - **The Graph:** Deploy custom Subgraph to index HCS events and treasury balance state.
   - **World ID:** Implement `WorldID.verifyProof` to protect operator vault claim authority.
   - **1inch:** Route multi-chain agent asset swaps via 1inch Swap API.
   - **Privy:** Provide passkey logins and embedded smart contract wallets.

3. **Submission Requirements Checklist:**
   - Public GitHub repository under Apache 2.0 / MIT License.
   - Deployed smart contracts on Hedera EVM Testnet.
   - Live Subgraph on The Graph Studio.
   - 3-Minute Demo Video walkthrough.

4. **Repository Key Files:**
   - Master Spec: `AETHERIS_PROJECT_SPEC.md`
   - Directives: `ANTIGRAVITY_AETHERIS.md`
   - Skill Instructions: `.agents/skills/aetheris-ethonline/SKILL.md`
