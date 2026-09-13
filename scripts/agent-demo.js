/**
 * Operator-side demo for the sub-agent worker (CommonJS, plain ethers v6).
 *
 *   1. make sure the worker identity exists and has HBAR
 *   1b. anchor the job brief for --role on the HCS audit topic as a JobBrief frame
 *       and use hcs://<topic>/<seq> as the job's specURI (scripts/briefs.js)
 *   2. approve + createJob with a 1.20 aUSD (HTS) deposit
 *   3. assignSubAgent(jobId, worker, 0.40 aUSD, role)
 *   4. wait for the worker (npm run agent:worker) to completeTask
 *   5. settleJob and print the MicroSettlement (viaHts, amount)
 *   6. fetch the deliverable frame back from the mirror node and check that
 *      keccak256(frame.text) equals the on-chain resultHash
 *
 *   node scripts/agent-demo.js [--role market-research] [--title "..."] [--brief-file path.txt]
 *   node scripts/agent-demo.js --spec ipfs://...       # explicit specURI, no brief is anchored
 *   node scripts/agent-demo.js --job 8 [--task 0]     # resume: skip funding, wait / settle / verify
 *
 * Exits non-zero when the hash does not match or the worker never completes.
 */
require("dotenv").config();

const { ethers } = require("ethers");
const fs = require("fs");
const hcs = require("./hcs");
const identity = require("./agent-identity");
const briefs = require("./briefs");

const HTS_TOKEN_ID = "0.0.10484673";
const HTS_TOKEN_EVM = "0x00000000000000000000000000000000009ffBC1";
const DEPOSIT = 1_200_000n; // 1.20 aUSD
const FEE = 400_000n; // 0.40 aUSD
const HTS_GAS = 1_000_000;
const TOPIC = (process.env.HEDERA_HCS_TOPIC_ID || "").trim();
const WAIT_TIMEOUT_MS = 10 * 60_000; // the Router can need a few retries before a non-empty completion
const WAIT_STEP_MS = 5_000;
const TASK_STATUS = ["None", "Assigned", "Completed", "Paid", "Cancelled"];
const JOB_STATUS = ["None", "Funded", "Dispatched", "Completed", "Settled", "Refunded"];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

const txUrl = (h) => `https://hashscan.io/testnet/transaction/${h}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const rule = (t) => log("\n" + "-".repeat(72) + "\n  " + t + "\n" + "-".repeat(72));
const fmt = (v) => ethers.formatUnits(v, 6);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value`);
  return v;
}

/**
 * Find the TaskCompleted event for (jobId, taskId). Hashio's eth_getLogs does not
 * honour indexed-topic filters reliably, so the event is fetched unfiltered in
 * 1000-block chunks and matched in JS.
 */
async function findTaskCompleted(agency, jobId, taskId, fromBlock, { attempts = 9, delayMs = 10_000 } = {}) {
  // Hashio's log index trails the head by several seconds: getTask can already report
  // Completed while eth_getLogs does not yet return the event. Retry with a fresh
  // head each time instead of failing on the first empty scan.
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const latest = await agency.runner.provider.getBlockNumber();
    let found = null;
    for (let start = Math.max(0, fromBlock); start <= latest; start += 1000) {
      const end = Math.min(latest, start + 999);
      const events = await agency.queryFilter("TaskCompleted", start, end);
      for (const ev of events) {
        if (ev.args.jobId === jobId && ev.args.taskId === taskId) found = ev;
      }
    }
    if (found) return found;
    if (attempt < attempts) {
      log(`  TaskCompleted not in the log index yet (head ${latest}); retrying in ${delayMs / 1000}s`);
      await sleep(delayMs);
    }
  }
  return null;
}

function parseLogs(iface, logs, name) {
  const out = [];
  for (const l of logs) {
    try {
      const p = iface.parseLog({ topics: [...l.topics], data: l.data });
      if (p && p.name === name) out.push(p);
    } catch { /* not this interface's event */ }
  }
  return out;
}

async function main() {
  if (!TOPIC) throw new Error("HEDERA_HCS_TOPIC_ID is not set in .env");
  const explicitSpec = argValue("--spec", null);
  const role = argValue("--role", "market-research");
  const titleOverride = argValue("--title", null);
  const briefFile = argValue("--brief-file", null);

  rule("Worker identity");
  const worker = await identity.loadOrCreateWorker();
  const top = await identity.topUpIfLow(worker.address);
  log(`  worker .............. ${worker.address}  (Hedera ${worker.id})`);
  log(`  worker HBAR ......... ${top.balance.toFixed(4)}${top.toppedUp ? `  (topped up, tx ${top.txHash})` : ""}`);

  const operator = identity.operatorWallet();
  const agency = identity.agencyContract(operator);
  const treasuryIface = identity.treasuryInterface();
  const token = new ethers.Contract(HTS_TOKEN_EVM, ERC20_ABI, operator);

  const owner = await agency.owner();
  if (ethers.getAddress(owner) !== operator.address) {
    throw new Error(`PRIVATE_KEY (${operator.address}) is not the agency owner (${owner}); assign/settle would revert`);
  }

  const resumeJob = argValue("--job", null);
  let jobId, taskId, fromBlock;
  let approveTx = null, createTx = null, assignTx = null;
  let spec = explicitSpec;
  let brief = null; // { title, role, text, sequenceNumber, keccak256, mirrorUrl } once anchored
  if (resumeJob !== null) {
    jobId = BigInt(resumeJob);
    taskId = BigInt(argValue("--task", "0"));
    const job = await agency.getJob(jobId);
    if (Number(job.status) === 0) throw new Error(`job #${jobId} does not exist`);
    if (Number(job.status) === 5) throw new Error(`job #${jobId} was refunded`);
    rule(`Resuming job #${jobId} task #${taskId} (${JOB_STATUS[Number(job.status)]})`);
    const t = await agency.getTask(jobId, taskId);
    if (ethers.getAddress(t.subAgent) !== worker.address) {
      throw new Error(`task #${taskId} of job #${jobId} is assigned to ${t.subAgent}, not the worker`);
    }
    spec = job.specURI;
    log(`  spec ................ ${job.specURI}`);
    fromBlock = (await agency.runner.provider.getBlockNumber()) - 20_000;
  } else {
    if (explicitSpec !== null) {
      rule("Job brief");
      log(`  --spec given; using ${explicitSpec} as the specURI without anchoring a brief`);
    } else {
      // The brief is the specification the job is funded against. It is anchored on the
      // audit topic first so the job's specURI points at a frame anyone can read back.
      const base = briefs.briefFor(role);
      if (!base && !briefFile) {
        throw new Error(`no built-in brief for role "${role}" (have: ${briefs.BRIEFS.map((b) => b.role).join(", ")}); pass --brief-file or --spec`);
      }
      const text = briefFile ? fs.readFileSync(briefFile, "utf8") : base.text;
      const title = titleOverride || (base ? base.title : `${role} brief`);
      rule(`Anchoring the job brief on HCS ${TOPIC}`);
      const anchored = await briefs.anchorBrief(hcs, TOPIC, { title, role, client: operator.address, text });
      spec = anchored.specURI;
      brief = {
        title: anchored.frame.title,
        role,
        text: anchored.frame.text,
        sequenceNumber: anchored.sequenceNumber,
        keccak256: anchored.keccak256,
        mirrorUrl: `${hcs.MIRROR}/api/v1/topics/${TOPIC}/messages/${anchored.sequenceNumber}`,
      };
      log(`  title ............... ${brief.title}`);
      log(`  brief ............... ${brief.text.length} chars${briefFile ? ` from ${briefFile}` : ` (built-in ${role})`}  keccak256 ${brief.keccak256}`);
      log(`  HCS seq ............. ${brief.sequenceNumber}  consensus ${anchored.consensusTimestamp}`);
      log(`  specURI ............. ${spec}`);
      log(`  mirror node ......... ${brief.mirrorUrl}`);
    }

    rule(`Funding the job - ${fmt(DEPOSIT)} aUSD (HTS ${HTS_TOKEN_ID})`);
    const bal = await token.balanceOf(operator.address);
    log(`  operator aUSD ....... ${fmt(bal)}`);
    if (bal < DEPOSIT) throw new Error(`operator holds ${fmt(bal)} aUSD, needs ${fmt(DEPOSIT)}`);
    approveTx = await token.approve(identity.AGENCY, DEPOSIT, { gasLimit: HTS_GAS });
    await approveTx.wait();
    log(`  approve ............. ${txUrl(approveTx.hash)}`);

    const previewJobId = await agency.createJob.staticCall(HTS_TOKEN_EVM, DEPOSIT, spec);
    createTx = await agency.createJob(HTS_TOKEN_EVM, DEPOSIT, spec, { gasLimit: HTS_GAS });
    const createRc = await createTx.wait();
    const created = parseLogs(agency.interface, createRc.logs, "JobCreated")[0];
    jobId = created ? created.args.jobId : previewJobId;
    if (created && created.args.jobId !== previewJobId) log(`  note: staticCall predicted job #${previewJobId}, event says #${jobId}`);
    fromBlock = createRc.blockNumber;
    log(`  job #${jobId} created ... spec ${spec}`);
    log(`  createJob ........... ${txUrl(createTx.hash)}`);

    rule(`Assigning ${role} to the worker - fee ${fmt(FEE)} aUSD`);
    assignTx = await agency.assignSubAgent(jobId, worker.address, FEE, role, { gasLimit: 600_000 });
    const assignRc = await assignTx.wait();
    const assigned = parseLogs(agency.interface, assignRc.logs, "SubAgentAssigned")[0];
    taskId = assigned ? assigned.args.taskId : 0n;
    log(`  task #${taskId} assigned to ${worker.address}`);
    log(`  assignSubAgent ...... ${txUrl(assignTx.hash)}`);
  }

  rule("Waiting for the worker to complete the task");
  const started = Date.now();
  let task = null;
  let lastReminder = 0;
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    task = await agency.getTask(jobId, taskId);
    const status = Number(task.status);
    if (status === 2 || status === 3) break;
    if (status === 4) throw new Error("task was cancelled while waiting");
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (elapsed - lastReminder >= 30) {
      lastReminder = elapsed;
      log(`  ${elapsed}s ... task still ${TASK_STATUS[status]}. worker idle? start it with npm run agent:worker`);
    }
    await sleep(WAIT_STEP_MS);
  }
  if (!task || (Number(task.status) !== 2 && Number(task.status) !== 3)) {
    throw new Error(`timed out after ${WAIT_TIMEOUT_MS / 60000} min waiting for completeTask - is the worker running?`);
  }
  const resultHash = task.resultHash;
  log(`  task #${taskId} is ${TASK_STATUS[Number(task.status)]}  resultHash ${resultHash}`);

  // The HCS anchor comes from the TaskCompleted event.
  const completed = await findTaskCompleted(agency, jobId, taskId, fromBlock);
  if (!completed) throw new Error(`TaskCompleted(${jobId}, ${taskId}) not found from block ${fromBlock}`);
  const hcsTopic = completed.args.hcsTopicId;
  const hcsSeq = Number(completed.args.hcsSequenceNumber);
  const completeTxHash = completed.transactionHash;
  log(`  completeTask ........ ${txUrl(completeTxHash)}`);
  log(`  HCS anchor .......... ${hcsTopic}#${hcsSeq}`);

  rule("Settling the job");
  let settleTx = null;
  let micro = [];
  if (Number((await agency.getJob(jobId)).status) === 4) {
    log(`  job #${jobId} is already Settled - skipping settleJob`);
  } else {
    settleTx = await agency.settleJob(jobId, { gasLimit: 3_000_000 });
    const settleRc = await settleTx.wait();
    micro = parseLogs(treasuryIface, settleRc.logs, "MicroSettlement");
    const settled = parseLogs(agency.interface, settleRc.logs, "JobSettled")[0];
    log(`  settleJob ........... ${txUrl(settleTx.hash)}  (gas ${settleRc.gasUsed})`);
    for (const m of micro) {
      log(`  MicroSettlement ..... task #${m.args.taskId} -> ${m.args.subAgent}  ${fmt(m.args.amount)} aUSD  viaHts ${m.args.viaHts}`);
    }
    if (settled) log(`  JobSettled .......... paid ${fmt(settled.args.paidToSubAgents)}  margin ${fmt(settled.args.netMargin)}`);
  }

  rule("Verifying the deliverable against the mirror node");
  const mirrorUrl = `${hcs.MIRROR}/api/v1/topics/${hcsTopic}/messages/${hcsSeq}`;
  const frame = await identity.fetchFrame(hcsTopic, hcsSeq);
  if (!frame) throw new Error(`mirror node has no message ${hcsTopic}#${hcsSeq} yet: ${mirrorUrl}`);
  log(`  frame ............... ${frame.chunks} chunk(s), seq ${frame.sequenceNumbers.join(", ")}, ${Buffer.byteLength(frame.contents)} bytes`);
  let payload = null;
  try { payload = JSON.parse(frame.contents); } catch { /* not JSON */ }
  const text = payload && typeof payload.text === "string" ? payload.text : null;
  const recomputed = text !== null ? ethers.keccak256(ethers.toUtf8Bytes(text)) : null;
  const match = recomputed !== null && recomputed.toLowerCase() === String(resultHash).toLowerCase();

  const job = await agency.getJob(jobId);
  const workerAusd = await token.balanceOf(worker.address);

  rule("Summary");
  log(`  job / task .......... #${jobId} / #${taskId}  (${JOB_STATUS[Number(job.status)]})`);
  log(`  specURI ............. ${spec}`);
  if (brief) {
    log(`  brief title ......... ${brief.title}`);
    log(`  brief HCS seq ....... ${brief.sequenceNumber}  keccak256 ${brief.keccak256}`);
    log(`  brief mirror node ... ${brief.mirrorUrl}`);
  }
  log(`  worker address ...... ${worker.address}  (Hedera ${worker.id})`);
  log(`  worker aUSD ......... ${fmt(workerAusd)}`);
  log(`  role / model ........ ${payload ? payload.role : "?"} / ${payload ? payload.model : "?"} (${payload ? payload.provider : "?"})`);
  log(`  HCS seq ............. ${hcsSeq}  (${frame.chunks} chunk(s): ${frame.sequenceNumbers.join(", ")})  consensus ${frame.consensusTimestamp}`);
  log(`  mirror node ......... ${mirrorUrl}`);
  log(`  on-chain resultHash . ${resultHash}`);
  log(`  keccak256(text) ..... ${recomputed || "n/a (frame has no text field)"}`);
  log(`  hash match: ${match}`);
  for (const m of micro) log(`  MicroSettlement ..... viaHts ${m.args.viaHts}  amount ${fmt(m.args.amount)} aUSD -> ${m.args.subAgent}`);
  if (approveTx) log(`  approve ............. ${txUrl(approveTx.hash)}`);
  if (createTx) log(`  createJob ........... ${txUrl(createTx.hash)}`);
  if (assignTx) log(`  assignSubAgent ...... ${txUrl(assignTx.hash)}`);
  log(`  completeTask ........ ${txUrl(completeTxHash)}`);
  if (settleTx) log(`  settleJob ........... ${txUrl(settleTx.hash)}`);
  log("\n  deliverable (from the mirror node):\n");
  log(text !== null ? text.split("\n").map((l) => "    " + l).join("\n") : "    <frame has no text field>");
  log("");

  // The payout must have gone to the worker, for exactly the assigned fee, over HTS.
  let payoutOk = true;
  if (settleTx) {
    const mine = micro.filter((m) => Number(m.args.taskId) === Number(taskId));
    payoutOk =
      mine.length === 1 &&
      String(mine[0].args.subAgent).toLowerCase() === worker.address.toLowerCase() &&
      BigInt(mine[0].args.amount) === FEE &&
      mine[0].args.viaHts === true;
    log(`  payout check: ${payoutOk} (one MicroSettlement for task #${taskId}, to the worker, ${fmt(FEE)} aUSD, viaHts)`);
  }

  hcs.close();
  if (!match) {
    console.error("hash mismatch: the anchored text does not hash to the on-chain resultHash");
    process.exit(2);
  }
  if (!payoutOk) {
    console.error("payout mismatch: the MicroSettlement did not pay the assigned fee to the worker over HTS");
    process.exit(3);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("agent-demo failed:", e.shortMessage || e.message);
  hcs.close();
  process.exit(1);
});
