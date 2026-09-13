/**
 * Seeds the deployed Aetheris contracts with new jobs whose audit trail is REAL:
 * every lifecycle step is first written to the Hedera Consensus Service topic
 * (`HEDERA_HCS_TOPIC_ID`) and the consensus sequence number the network assigns
 * is what gets anchored on-chain through `completeTask(..., topicId, seq)`.
 *
 * Produces, in order (appended after whatever jobs already exist):
 *   Job A - HTS-settled: 3 tasks paid to the three Hedera-native sub-agents
 *           (long-zero addresses, unlimited auto-association) in aUSD 0.0.10484673
 *   Job B - ERC-20-settled: 2 tasks paid in the MockERC20 aUSDC
 *   Job C - Dispatched: 2 tasks, one completed, one outstanding
 *
 * Reuses what is already on chain - the sub-agents indexed by the subgraph, the
 * existing aUSD HTS token (minted with the supply key only if the deployer's
 * balance is short) and the existing MockERC20 - so nothing is provisioned twice.
 *
 * Per step, the HCS record goes FIRST for JobCreated / SubAgentAssigned /
 * TaskCompleted (the sequence number is then passed into the contract), and for
 * settlement one record per MicroSettlement plus one JobSettled is written from
 * the receipt's events (amounts / viaHts are read from the chain, not assumed).
 *
 * If the HTS stage fails the script reports it and continues with the ERC-20
 * stages, so a partial run still leaves indexable history.
 *
 *   npx hardhat run scripts/seed.js --network hederaTestnet
 */
require("dotenv").config();
const { ethers } = require("hardhat");
const hcs = require("./hcs");

const TOPIC = (process.env.HEDERA_HCS_TOPIC_ID || "").trim();
const SUBGRAPH = process.env.NEXT_PUBLIC_SUBGRAPH_URL || "http://localhost:8100/subgraphs/name/aetheris";
const HTS_GAS = 1_000_000; // HTS precompile calls need considerably more than a plain transfer

// Existing on-chain assets (Hedera testnet, chain 296).
const HTS_TOKEN_ID = "0.0.10484673"; // aUSD, 6 dp
const HTS_TOKEN_EVM = "0x00000000000000000000000000000000009ffBC1";
const ERC20_ADDR = "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961"; // MockERC20 aUSDC, 6 dp

// Fallback roster if the subgraph is unreachable - these are the sub-agents it
// already indexes (the first three are real Hedera accounts 0.0.10484674/6/8).
const KNOWN_SUB_AGENTS = [
  { id: "0x00000000000000000000000000000000009ffbc2", roles: ["security-audit"] },
  { id: "0x00000000000000000000000000000000009ffbc4", roles: ["code-generation"] },
  { id: "0x00000000000000000000000000000000009ffbc6", roles: ["market-research"] },
  { id: "0x30b0acaea82b95b0308a8a9eb6e4c529de5e9f68", roles: ["market-research"] },
  { id: "0x836d433faffaa8113edb1cdbf7afb036134e1c61", roles: ["data-labelling", "code-generation"] },
  { id: "0xc46b2ecd39741c46f8467b8bf3ef8d5b1757dbc1", roles: ["technical-writing"] },
];

const log = (...a) => console.log(...a);
const rule = (t) => log("\n" + "─".repeat(74) + "\n  " + t + "\n" + "─".repeat(74));
const isLongZero = (addr) => /^0x0{24}[0-9a-f]{16}$/i.test(addr);

/** Rows for the final verification table. */
const anchors = [];

async function gql(query) {
  const res = await fetch(SUBGRAPH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

/** Existing sub-agents, split into Hedera-native (long-zero) and plain EVM addresses. */
async function loadSubAgents() {
  let rows;
  try {
    rows = (await gql("{ subAgents(first: 50) { id roles } }")).subAgents;
    log(`  subgraph ............ ${rows.length} sub-agents indexed`);
  } catch (e) {
    rows = KNOWN_SUB_AGENTS;
    log(`  ! subgraph unreachable (${e.message}) - using the known on-chain roster`);
  }
  const all = rows.map((r) => ({ address: ethers.getAddress(r.id), roles: r.roles || [] }));
  return {
    hedera: all.filter((a) => isLongZero(a.address)),
    evm: all.filter((a) => !isLongZero(a.address)),
  };
}

/** Submit one HCS record and echo it. */
async function anchor(payload) {
  const r = await hcs.submit(TOPIC, payload);
  log(`     ⎘ HCS #${r.sequenceNumber}  ${payload.evt}  @ ${r.consensusTimestamp}`);
  return r;
}

/** Drive one job: fund → assign → complete → (settle), anchoring every step on HCS. */
async function runJob(agency, treasury, token, { deposit, specURI, tasks, complete, settle }) {
  const jobId = await agency.createJob.staticCall(token, deposit, specURI);

  // JobCreated - HCS first, then the chain.
  await anchor({ evt: "JobCreated", jobId: Number(jobId), token, amount: deposit });
  const created = await (await agency.createJob(token, deposit, specURI, { gasLimit: HTS_GAS })).wait();
  log(`  job #${jobId} created - ${specURI}  (tx ${created.hash})`);

  // SubAgentAssigned - HCS first, then the chain.
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    await anchor({ evt: "SubAgentAssigned", jobId: Number(jobId), taskId: i, agent: t.address, amount: t.fee, token });
    await (await agency.assignSubAgent(jobId, t.address, t.fee, t.role, { gasLimit: 600_000 })).wait();
    log(`     ↳ assigned ${t.role} → ${t.address.slice(0, 10)}…  fee ${t.fee}`);
  }

  // TaskCompleted - HCS first; the returned sequence number is what the contract anchors.
  for (let i = 0; i < complete; i++) {
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes(`${specURI}#${i}`));
    const msg = await anchor({ evt: "TaskCompleted", jobId: Number(jobId), taskId: i, agent: tasks[i].address, resultHash });
    const rc = await (
      await agency.completeTask(jobId, i, resultHash, TOPIC, msg.sequenceNumber, { gasLimit: 600_000 })
    ).wait();

    // Read the anchored pair back from the emitted events - this is the on-chain truth.
    const parsed = rc.logs.map((l) => { try { return agency.interface.parseLog(l); } catch { return null; } });
    const completed = parsed.find((p) => p && p.name === "TaskCompleted");
    const anchored = parsed.find((p) => p && p.name === "HcsLogAnchored");
    anchors.push({
      jobId: Number(jobId),
      taskId: i,
      hcsSeq: msg.sequenceNumber,
      sdkConsensus: msg.consensusTimestamp,
      eventTopic: completed ? completed.args.hcsTopicId : "?",
      eventSeq: completed ? Number(completed.args.hcsSequenceNumber) : NaN,
      anchoredSeq: anchored ? Number(anchored.args.sequenceNumber) : NaN,
      tx: rc.hash,
    });
    log(`     ↳ task ${i} completed, on-chain hcsSequenceNumber ${completed ? completed.args.hcsSequenceNumber : "?"}`);
  }

  // settleJob - the chain first (the amounts come from its events), then HCS.
  if (settle) {
    const rc = await (await agency.settleJob(jobId, { gasLimit: 3_000_000 })).wait();
    log(`     ↳ SETTLED (gas ${rc.gasUsed}, tx ${rc.hash})`);

    for (const l of rc.logs) {
      let p = null;
      try { p = treasury.interface.parseLog(l); } catch { /* not a treasury event */ }
      if (p && p.name === "MicroSettlement") {
        await anchor({
          evt: "MicroSettlement", jobId: Number(p.args.jobId), taskId: Number(p.args.taskId),
          agent: p.args.subAgent, amount: p.args.amount, token: p.args.token, viaHts: p.args.viaHts, tx: rc.hash,
        });
        continue;
      }
      try { p = agency.interface.parseLog(l); } catch { p = null; }
      if (p && p.name === "JobSettled") {
        await anchor({
          evt: "JobSettled", jobId: Number(p.args.jobId), amount: p.args.paidToSubAgents,
          margin: p.args.netMargin, token, tx: rc.hash,
        });
      }
    }
  }
  return jobId;
}

/** Make sure the deployer holds enough aUSD; mint with the supply key only if short. */
async function ensureHtsBalance(deployer, needed) {
  const erc = await ethers.getContractAt("IERC20", HTS_TOKEN_EVM);
  let bal = await erc.balanceOf(deployer);
  log(`  aUSD balance ........ ${ethers.formatUnits(bal, 6)}  (need ${ethers.formatUnits(needed, 6)})`);
  if (bal < needed) {
    const status = await hcs.mintHts(HTS_TOKEN_ID, needed - bal);
    bal = await erc.balanceOf(deployer);
    log(`  minted .............. ${ethers.formatUnits(needed - bal, 6)} aUSD → ${status}; balance now ${ethers.formatUnits(bal, 6)}`);
  }
  return erc;
}

/** Associate the treasury with aUSD only if the mirror node says it is not yet. */
async function ensureTreasuryAssociated(treasury, treasuryAddr) {
  const res = await fetch(`${hcs.MIRROR}/api/v1/accounts/${treasuryAddr}/tokens?token.id=${HTS_TOKEN_ID}`);
  const body = res.ok ? await res.json() : { tokens: [] };
  if ((body.tokens || []).some((t) => t.token_id === HTS_TOKEN_ID)) {
    log("  treasury already associated with aUSD - skipping");
    return;
  }
  await (await treasury.associateToken(HTS_TOKEN_EVM, { gasLimit: HTS_GAS })).wait();
  log("  treasury associated with aUSD");
}

/** Poll the subgraph until it has indexed a task's hcsSequenceNumber. */
async function subgraphSeq(jobId, taskId, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      const d = await gql(`{ task(id: "${jobId}-${taskId}") { hcsTopicId hcsSequenceNumber } }`);
      if (d.task && d.task.hcsSequenceNumber) return `${d.task.hcsTopicId}#${d.task.hcsSequenceNumber}`;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return "not indexed yet";
}

async function main() {
  if (!TOPIC) throw new Error("HEDERA_HCS_TOPIC_ID missing from .env - refusing to seed with a fake topic");
  const [deployer] = await ethers.getSigners();
  const agencyAddr = process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS;
  const treasuryAddr = process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS;
  if (!agencyAddr || !treasuryAddr) throw new Error("agency/treasury address missing from .env");

  const agency = await ethers.getContractAt("AetherisAgency", agencyAddr);
  const treasury = await ethers.getContractAt("AetherisTreasury", treasuryAddr);

  log(`\n  deployer ............ ${deployer.address}`);
  log(`  agency .............. ${agencyAddr}`);
  log(`  treasury ............ ${treasuryAddr}`);
  log(`  HCS topic ........... ${TOPIC}`);
  log(`  jobs before ......... ${await agency.jobCount()}`);

  // ── Operator personhood ────────────────────────────────────────────────
  rule("Registering the operator (World ID)");
  try {
    const already = await agency.isVerifiedOperator(deployer.address).catch(() => false);
    if (already) {
      log("  operator already verified - skipping");
    } else {
      await (
        await agency.verifyOperator(deployer.address, 0, ethers.toBigInt(ethers.hexlify(ethers.randomBytes(31))),
          [0, 0, 0, 0, 0, 0, 0, 0], "aetheris.eth", { gasLimit: 900_000 })
      ).wait();
      log("  operator verified (bypass mode - nullifier burned, ZK check skipped)");
    }
  } catch (e) {
    log("  ! verifyOperator failed:", e.shortMessage || e.message);
  }

  // ── Sub-agent roster (reused, never recreated) ─────────────────────────
  rule("Sub-agents (reusing the indexed roster)");
  const { hedera, evm } = await loadSubAgents();
  for (const a of hedera) log(`  hedera-native ....... ${a.address}  ${a.roles.join(", ")}`);
  for (const a of evm) log(`  evm ................. ${a.address}  ${a.roles.join(", ")}`);
  if (hedera.length < 3) throw new Error("need the three long-zero sub-agents for the HTS job");
  if (evm.length < 3) throw new Error("need three plain EVM sub-agents for the ERC-20 jobs");
  const byRole = (list, role, fallback) => list.find((a) => a.roles.includes(role)) || list[fallback];

  // ── Job A: the HTS path ────────────────────────────────────────────────
  rule("Job A - settlement through the HTS precompile (aUSD " + HTS_TOKEN_ID + ")");
  let htsOk = false;
  try {
    const deposit = 2_750_000n; // 2.75 aUSD
    const erc = await ensureHtsBalance(deployer.address, deposit);
    await ensureTreasuryAssociated(treasury, treasuryAddr);
    await (await erc.approve(agencyAddr, deposit, { gasLimit: HTS_GAS })).wait();
    log("  agency approved for the deposit");

    await runJob(agency, treasury, HTS_TOKEN_EVM, {
      deposit,
      specURI: "ipfs://bafybeihtsvault7audit2026q3reportbundle",
      tasks: [
        { address: byRole(hedera, "security-audit", 0).address, role: "security-audit", fee: 700_000n },
        { address: byRole(hedera, "code-generation", 1).address, role: "code-generation", fee: 560_000n },
        { address: byRole(hedera, "market-research", 2).address, role: "market-research", fee: 390_000n },
      ],
      complete: 3,
      settle: true,
    });
    htsOk = true;
  } catch (e) {
    log("  ! HTS stage failed:", e.shortMessage || e.message);
    log("    continuing with the ERC-20 stages so the run still leaves history.");
  }

  // ── Jobs B-C: ERC-20 path ──────────────────────────────────────────────
  rule("Jobs B-C - ERC-20 path (MockERC20 " + ERC20_ADDR + ")");
  const erc20 = await ethers.getContractAt("MockERC20", ERC20_ADDR);
  const ercNeeded = 1_300_000n + 1_800_000n;
  await (await erc20.mint(deployer.address, ercNeeded)).wait();
  await (await erc20.approve(agencyAddr, ercNeeded)).wait();
  log(`  minted + approved ... ${ethers.formatUnits(ercNeeded, 6)} aUSDC`);

  await runJob(agency, treasury, ERC20_ADDR, {
    deposit: 1_300_000n,
    specURI: "ipfs://bafybeierc20perpfunding5rateintelq3",
    tasks: [
      { address: byRole(evm, "market-research", 0).address, role: "market-research", fee: 450_000n },
      { address: byRole(evm, "data-labelling", 1).address, role: "data-labelling", fee: 380_000n },
    ],
    complete: 2,
    settle: true,
  });

  await runJob(agency, treasury, ERC20_ADDR, {
    deposit: 1_800_000n,
    specURI: "ipfs://bafybeisubgraph3indexer9migrationguide",
    tasks: [
      { address: byRole(evm, "code-generation", 1).address, role: "code-generation", fee: 560_000n },
      { address: byRole(evm, "technical-writing", 2).address, role: "technical-writing", fee: 520_000n },
    ],
    complete: 1, // one still outstanding -> stays Dispatched
    settle: false,
  });

  // ── Verification: mirror node ⇄ chain ⇄ subgraph ───────────────────────
  rule("HCS anchors - mirror node vs on-chain vs subgraph");
  const rows = [];
  for (const a of anchors) {
    const m = await hcs.mirrorMessage(TOPIC, a.hcsSeq);
    const sub = await subgraphSeq(a.jobId, a.taskId);
    const match = m && m.sequenceNumber === a.hcsSeq && a.eventSeq === a.hcsSeq && a.anchoredSeq === a.hcsSeq
      && a.eventTopic === TOPIC && m.consensusTimestamp === a.sdkConsensus;
    rows.push({
      jobId: a.jobId,
      taskId: a.taskId,
      hcsSeq: a.hcsSeq,
      mirrorConsensusTs: m ? m.consensusTimestamp : "not on mirror yet",
      onchainTopicSeq: `${a.eventTopic}#${a.eventSeq}`,
      hcsLogAnchoredSeq: a.anchoredSeq,
      subgraph: sub,
      match: match ? "OK" : "MISMATCH",
    });
  }
  console.table(rows);

  rule("Done");
  log(`  jobs on chain ....... ${await agency.jobCount()}`);
  log(`  HTS settlement ...... ${htsOk ? "yes - MicroSettlement.viaHts = true" : "NOT exercised"}`);
  log(`  HashScan ............ https://hashscan.io/testnet/contract/${agencyAddr}`);
  log(`  HCS topic ........... https://hashscan.io/testnet/topic/${TOPIC}`);
  hcs.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); hcs.close(); process.exit(1); });
