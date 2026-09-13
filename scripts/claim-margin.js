/**
 * claim-margin.js — perform ONE real treasury margin claim and make the HCS
 * audit log truthful about it.
 *
 *   npx hardhat run scripts/claim-margin.js --network hederaTestnet
 *
 * Steps
 *   1. Audit: list every frame on the HCS topic, and flag each `ProfitClaimed`
 *      frame that has NO corresponding on-chain `ProfitClaimed` event on the
 *      treasury (cross-checked with `queryFilter` from FROM_BLOCK). Frames that a
 *      previous `Correction` already voided are skipped.
 *   2. Claim: read `treasury.retainedMargin(aUSD)` and call
 *      `claimProfit(aUSD, min(0.5 aUSD, available), deployer)` with gasLimit 1e6.
 *   3. Anchor AFTER the receipt: {evt:'ProfitClaimed', token, amount, to, tx,
 *      nullifierHash} — the chain is the source of truth, so anchor-after is the
 *      correct ordering here (the frame quotes the tx hash it describes).
 *   4. Append-only correction: {evt:'Correction', voids:[seq…],
 *      reason:'test frame; no on-chain event', tx:null}. Nothing is deleted —
 *      HCS is immutable; the reader (lib/hedera.ts readHcsMessages) honours
 *      Correction records by hiding voided sequence numbers while keeping the
 *      Correction itself visible.
 *
 * Env: PRIVATE_KEY (deployer = treasury owner = verified operator),
 *      HEDERA_HCS_TOPIC_ID, NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS,
 *      HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY (topic submit key).
 */
require("dotenv").config();
const { ethers } = require("hardhat");
const hcs = require("./hcs");

const TOPIC = (process.env.HEDERA_HCS_TOPIC_ID || "").trim();
const TREASURY = process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS;
const AUSD = "0x00000000000000000000000000000000009ffBC1"; // HTS aUSD, 6 dp
const MAX_CLAIM = 500_000n; // 0.5 aUSD
const GAS = 1_000_000;
const FROM_BLOCK = Number(process.env.AETHERIS_FROM_BLOCK || 40396776);

const log = (...a) => console.log(...a);
const rule = (t) => log("\n" + "─".repeat(74) + "\n  " + t + "\n" + "─".repeat(74));

/** Every message on the topic, oldest first, decoded. */
async function listTopic() {
  const out = [];
  let url = `${hcs.MIRROR}/api/v1/topics/${TOPIC}/messages?limit=100&order=asc`;
  while (url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`mirror node ${res.status} for ${url}`);
    const body = await res.json();
    for (const m of body.messages || []) {
      const contents = Buffer.from(m.message, "base64").toString("utf8");
      let payload = null;
      try { payload = JSON.parse(contents); } catch { /* non-JSON frame */ }
      out.push({ seq: Number(m.sequence_number), ts: m.consensus_timestamp, contents, payload });
    }
    url = body.links && body.links.next ? hcs.MIRROR + body.links.next : null;
  }
  return out;
}

/**
 * Sequence numbers of `ProfitClaimed` frames with no on-chain counterpart.
 * A frame is "backed" when it names a tx hash that emitted ProfitClaimed, or —
 * for frames without a tx — when an on-chain event with the same token+amount
 * exists. Already-voided sequence numbers are excluded.
 */
async function findFabricated(treasury, frames) {
  const head = await ethers.provider.getBlockNumber();
  const logs = await treasury.queryFilter(treasury.filters.ProfitClaimed(), FROM_BLOCK, head);
  log(`  on-chain ProfitClaimed events since block ${FROM_BLOCK} (head ${head}): ${logs.length}`);
  for (const l of logs) log(`     · block ${l.blockNumber} tx ${l.transactionHash} amount ${l.args.amount} token ${l.args.token}`);

  const byTx = new Set(logs.map((l) => l.transactionHash.toLowerCase()));
  const byAmount = new Set(logs.map((l) => `${l.args.token.toLowerCase()}:${l.args.amount.toString()}`));

  const alreadyVoided = new Set();
  for (const f of frames) {
    if (f.payload && f.payload.evt === "Correction" && Array.isArray(f.payload.voids)) {
      for (const s of f.payload.voids) alreadyVoided.add(Number(s));
    }
  }

  const fabricated = [];
  for (const f of frames) {
    const p = f.payload;
    if (!p || p.evt !== "ProfitClaimed" || alreadyVoided.has(f.seq)) continue;
    let backed = false;
    if (typeof p.tx === "string" && p.tx.startsWith("0x")) {
      backed = byTx.has(p.tx.toLowerCase());
    } else if (typeof p.token === "string" && /^\d+$/.test(String(p.amount))) {
      backed = byAmount.has(`${p.token.toLowerCase()}:${p.amount}`);
    }
    log(`  HCS #${f.seq} ProfitClaimed ${backed ? "✓ backed" : "✗ NO on-chain event"}  ${f.contents}`);
    if (!backed) fabricated.push(f.seq);
  }
  return fabricated;
}

async function main() {
  if (!TOPIC) throw new Error("HEDERA_HCS_TOPIC_ID missing from .env");
  if (!TREASURY) throw new Error("NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS missing from .env");
  const [deployer] = await ethers.getSigners();
  const treasury = await ethers.getContractAt("AetherisTreasury", TREASURY);

  rule("1 · audit the HCS topic against chain events");
  log(`  topic ............... ${TOPIC}`);
  log(`  treasury ............ ${TREASURY}`);
  log(`  deployer/operator ... ${deployer.address}`);
  const frames = await listTopic();
  log(`  frames on topic ..... ${frames.length}`);
  const fabricated = await findFabricated(treasury, frames);
  log(`  fabricated frames ... ${fabricated.length ? fabricated.join(", ") : "none"}`);

  rule("2 · claim retained aUSD margin (one real on-chain claim)");
  const available = await treasury.retainedMargin(AUSD);
  log(`  retainedMargin(aUSD)  ${available} (${ethers.formatUnits(available, 6)} aUSD)`);
  if (available === 0n) throw new Error("no retained aUSD margin to claim");
  const amount = available < MAX_CLAIM ? available : MAX_CLAIM;
  log(`  claiming ............ ${amount} (${ethers.formatUnits(amount, 6)} aUSD) → ${deployer.address}`);

  const tx = await treasury.claimProfit(AUSD, amount, deployer.address, { gasLimit: GAS });
  log(`  tx sent ............. ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error(`claimProfit reverted in ${tx.hash}`);
  log(`  mined ............... block ${receipt.blockNumber}, gas ${receipt.gasUsed}`);

  let claimed = null;
  for (const l of receipt.logs) {
    let p; try { p = treasury.interface.parseLog(l); } catch { continue; }
    if (p && p.name === "ProfitClaimed") claimed = p.args;
  }
  if (!claimed) throw new Error("receipt has no ProfitClaimed event");
  log(`  ProfitClaimed ....... operator ${claimed.operator} token ${claimed.token} amount ${claimed.amount} nullifier ${claimed.nullifierHash}`);
  log(`  hashscan ............ https://hashscan.io/testnet/transaction/${tx.hash}`);

  rule("3 · anchor the truthful ProfitClaimed frame (after the receipt)");
  const real = await hcs.submit(TOPIC, {
    evt: "ProfitClaimed",
    token: claimed.token,
    amount: claimed.amount.toString(),
    to: deployer.address,
    operator: claimed.operator,
    tx: tx.hash,
    block: receipt.blockNumber,
    nullifierHash: claimed.nullifierHash.toString(),
  });
  log(`  HCS #${real.sequenceNumber} @ ${real.consensusTimestamp}  ${real.message}`);

  let correction = null;
  if (fabricated.length) {
    rule("4 · append-only Correction voiding the fabricated frame(s)");
    correction = await hcs.submit(TOPIC, {
      evt: "Correction",
      voids: fabricated,
      reason: "test frame; no on-chain event",
      tx: null,
    });
    log(`  HCS #${correction.sequenceNumber} @ ${correction.consensusTimestamp}  ${correction.message}`);
  } else {
    rule("4 · no fabricated frames — no Correction needed");
  }

  rule("summary");
  log(`  claim tx ............ ${tx.hash}`);
  log(`  hashscan ............ https://hashscan.io/testnet/transaction/${tx.hash}`);
  log(`  ProfitClaimed seq ... ${real.sequenceNumber}`);
  if (correction) log(`  Correction seq ...... ${correction.sequenceNumber}  voids [${fabricated.join(", ")}]`);
  log(`  retainedMargin(aUSD)  ${await treasury.retainedMargin(AUSD)}`);
  hcs.close();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); hcs.close(); process.exit(1); });
