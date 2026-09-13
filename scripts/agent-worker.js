/**
 * Aetheris sub-agent worker (long-running, CommonJS, plain ethers v6).
 *
 * Loop, every POLL_MS:
 *   1. ask the subgraph for tasks assigned to this worker (status Assigned)
 *   2. confirm on-chain that the task is still Assigned to this address
 *   2b. when job.specURI is hcs://<topic>/<seq>, read the JobBrief frame from the
 *       mirror node (chunk-aware), check keccak256(text) and put the brief in the prompt
 *   3. run the role-aware prompt on the 0G Compute Router (OpenAI-compatible)
 *   4. anchor the deliverable on HCS: { evt: "Deliverable", ..., keccak256, text }
 *   5. completeTask(jobId, taskId, keccak256(text), topic, seq) signed by the worker
 *
 * The worker never completes a task without a real model response: any Router
 * failure logs and skips the task, which is retried on the next poll. The hashed
 * text is byte-for-byte the `text` field of the anchored frame, so a verifier
 * recomputes keccak256 over the mirror-node frame and compares it with the
 * on-chain resultHash.
 *
 *   node scripts/agent-worker.js        (npm run agent:worker)
 */
require("dotenv").config();

const { ethers } = require("ethers");
const hcs = require("./hcs");
const identity = require("./agent-identity");
const { parseHcsSpec } = require("./briefs");

const SUBGRAPH_URL = (process.env.SUBGRAPH_URL || process.env.NEXT_PUBLIC_SUBGRAPH_URL || "http://38.49.213.208:8100/subgraphs/name/aetheris").trim();
const POLL_MS = Math.max(2000, Number(process.env.POLL_MS || 10000));
const TOPIC = (process.env.HEDERA_HCS_TOPIC_ID || "").trim();
const ZG_API_KEY = (process.env.ZG_API_KEY || "").trim();
const ZG_BASE_URL = (process.env.ZG_BASE_URL || "https://router-api.0g.ai/v1").trim().replace(/\/+$/, "");
const ZG_MODEL = (process.env.ZG_MODEL || "glm-5.2").trim();
const PROVIDER_LABEL = "0G Compute Router";
const MAX_DELIVERABLE_CHARS = 2500;
const MAX_FRAME_BYTES = 3900;
const INFER_TIMEOUT_MS = 120_000;

const TASK_STATUS = ["None", "Assigned", "Completed", "Paid", "Cancelled"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${ts()}]`, ...a);

const handled = new Set();
let stopping = false;
let timer = null;

// ── Subgraph ────────────────────────────────────────────────────────────────

async function gql(query, variables) {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`subgraph HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const ASSIGNED_QUERY = `query Assigned($agent: String!) {
  tasks(where: { subAgent: $agent, status: Assigned }, first: 20, orderBy: assignedAt, orderDirection: asc) {
    id taskId role fee status hcsSequenceNumber
    job { id jobId specURI }
  }
}`;

async function fetchAssigned(address) {
  const data = await gql(ASSIGNED_QUERY, { agent: address.toLowerCase() });
  return data.tasks || [];
}

// ── Job briefs ──────────────────────────────────────────────────────────────

const MAX_BRIEF_CHARS = 3000;
/** specURI -> { title, text } | null (null = resolution failed; logged once, not retried). */
const briefCache = new Map();

/**
 * Resolve an hcs://<topic>/<seq> specURI to the JobBrief frame it points at. The frame
 * is read chunk-aware from the mirror node and accepted only when evt is "JobBrief" and
 * keccak256(text) equals the frame's own keccak256, so the prompt carries exactly the
 * text the client anchored. Any failure logs once and returns null; the caller falls
 * back to the plain specURI prompt.
 */
async function resolveBrief(specURI) {
  const ref = parseHcsSpec(specURI);
  if (!ref) return null;
  if (briefCache.has(specURI)) return briefCache.get(specURI);
  let brief = null;
  try {
    const frame = await hcs.mirrorMessage(ref.topicId, ref.sequenceNumber, { attempts: 3, delayMs: 1500 });
    if (!frame) throw new Error("mirror node has no such message");
    let payload;
    try { payload = JSON.parse(frame.contents); } catch { throw new Error("frame is not JSON"); }
    if (!payload || payload.evt !== "JobBrief") throw new Error(`frame evt is ${payload && payload.evt ? payload.evt : "missing"}, not JobBrief`);
    if (typeof payload.text !== "string" || !payload.text.trim()) throw new Error("frame has no text");
    if (payload.text.length > MAX_BRIEF_CHARS) throw new Error(`brief is ${payload.text.length} chars; max ${MAX_BRIEF_CHARS}`);
    const hash = ethers.keccak256(ethers.toUtf8Bytes(payload.text));
    if (typeof payload.keccak256 !== "string" || hash.toLowerCase() !== payload.keccak256.toLowerCase()) {
      throw new Error("keccak256(text) does not match the frame keccak256");
    }
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim().slice(0, 80) : `${payload.role || "job"} brief`;
    brief = { title, text: payload.text, role: payload.role || null, chunks: frame.chunks };
    log(`    brief "${title}" read from ${specURI} (${payload.text.length} chars, ${frame.chunks} chunk(s), hash ok)`);
  } catch (e) {
    log(`    brief ${specURI} unavailable - ${e.message.slice(0, 160)}; using the plain specURI prompt`);
  }
  briefCache.set(specURI, brief);
  return brief;
}

// ── 0G Compute Router ───────────────────────────────────────────────────────

function buildMessages(task, brief = null) {
  const feeAusd = (Number(task.fee) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const system =
    "You are an autonomous sub-agent inside the Aetheris agency on Hedera. The agency escrows a client deposit, " +
    "assigns you one task for a fixed fee, and pays you through the Hedera Token Service once the operator settles the job. " +
    "Your deliverable is hashed (keccak256), anchored verbatim on the Hedera Consensus Service and committed on-chain, " +
    "so write the final deliverable itself, not a plan or a conversation. Plain text only: no markdown headings, " +
    "no code fences, no bullet symbols other than a leading hyphen. Be concrete and concise. Hard limit: about " +
    `${MAX_DELIVERABLE_CHARS} characters.`;
  const header =
    `Task role: ${task.role}\n` +
    `Job: #${task.job.jobId}, task #${task.taskId}\n` +
    `Job specification URI: ${task.job.specURI}\n` +
    `Agreed fee: ${feeAusd} aUSD\n\n`;
  const user = brief
    ? header +
      `Job brief: ${brief.title}\n${brief.text}\n\n` +
      `Produce the ${task.role} deliverable that satisfies this brief. Follow its requirements exactly and do not restate them. ` +
      `Keep the whole answer under ${MAX_DELIVERABLE_CHARS} characters.`
    : header +
      `Produce the ${task.role} deliverable for this job. If the specification URI cannot be resolved from its name alone, ` +
      "state the assumptions you make in one short line, then deliver the best concrete result for that role. " +
      `Keep the whole answer under ${MAX_DELIVERABLE_CHARS} characters.`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

class RouterError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Token budget for one completion. glm-5.2 spends part of it on reasoning before the
 * visible answer, so the budget is well above the deliverable cap; a completion that
 * still stops on "length" is retried once with the larger budget.
 */
const MAX_TOKENS = 2400;
const MAX_TOKENS_RETRY = 4000;

async function routerOnce(messages, maxTokens = MAX_TOKENS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), INFER_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${ZG_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${ZG_API_KEY}` },
      body: JSON.stringify({ model: ZG_MODEL, messages, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new RouterError(`network error: ${e.name === "AbortError" ? "timeout after 120s" : e.message}`, { retryable: true });
  } finally {
    clearTimeout(t);
  }
  const raw = await res.text();
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new RouterError(`HTTP ${res.status}: ${raw.slice(0, 300)}`, { status: res.status, retryable });
  }
  let body;
  try { body = JSON.parse(raw); } catch { throw new RouterError("non-JSON response body", { retryable: true }); }
  const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  // The Router occasionally returns an empty choice; that is transient, so retry with backoff.
  if (typeof content !== "string" || !content.trim()) throw new RouterError("empty completion", { retryable: true });
  return {
    text: content.trim(),
    model: body.model || ZG_MODEL,
    usage: body.usage || null,
    id: body.id || null,
    finishReason: (body.choices[0] && body.choices[0].finish_reason) || null,
  };
}

/**
 * Chat completion with 3 attempts and backoff on 429 / 5xx / network failures.
 * A completion cut off by the token budget (finish_reason "length") is retried once
 * with a larger budget so the anchored deliverable is not a mid-sentence fragment;
 * if the second attempt is cut off too, it is accepted and logged.
 */
async function infer(messages) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const first = await routerOnce(messages);
      if (first.finishReason !== "length") return first;
      log(`    completion stopped on token budget (${MAX_TOKENS}); retrying once with ${MAX_TOKENS_RETRY}`);
      const second = await routerOnce(messages, MAX_TOKENS_RETRY);
      if (second.finishReason === "length") log("    completion still stopped on token budget; anchoring the shortened text");
      return second;
    } catch (e) {
      last = e;
      if (!(e instanceof RouterError) || !e.retryable || attempt === 3) break;
      const wait = 2000 * 2 ** (attempt - 1);
      log(`    router attempt ${attempt} failed (${e.message.slice(0, 120)}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw last;
}

// ── Deliverable framing ─────────────────────────────────────────────────────

/**
 * Build the HCS payload. If its compact JSON exceeds MAX_FRAME_BYTES the text is
 * shortened BEFORE hashing, so the hash always covers exactly the anchored text.
 */
function frameDeliverable({ task, agent, model, text }) {
  const frameTs = new Date().toISOString();
  let body = text.length > MAX_DELIVERABLE_CHARS ? text.slice(0, MAX_DELIVERABLE_CHARS).trimEnd() : text;
  const build = (t) => {
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes(t));
    const payload = {
      evt: "Deliverable",
      jobId: Number(task.job.jobId),
      taskId: Number(task.taskId),
      agent,
      role: task.role,
      model,
      provider: PROVIDER_LABEL,
      chars: t.length,
      keccak256: resultHash,
      text: t,
      ts: frameTs,
    };
    return { payload, resultHash, bytes: Buffer.byteLength(hcs.encode(payload), "utf8") };
  };
  let built = build(body);
  let truncated = false;
  while (built.bytes > MAX_FRAME_BYTES && body.length > 0) {
    const over = built.bytes - MAX_FRAME_BYTES;
    body = body.slice(0, Math.max(0, body.length - Math.max(16, over))).trimEnd();
    truncated = true;
    built = build(body);
  }
  if (body.length === 0) throw new Error("deliverable collapsed to zero length while fitting the HCS frame");
  return { ...built, text: body, truncated };
}

// ── Chain ───────────────────────────────────────────────────────────────────

async function onChainTask(agency, jobId, taskId) {
  const t = await agency.getTask(jobId, taskId);
  return { subAgent: ethers.getAddress(t.subAgent), status: Number(t.status), fee: t.fee, role: t.role };
}

// ── Main loop ───────────────────────────────────────────────────────────────

async function handleTask(task, { agencyWorker, agencyRead, worker }) {
  const jobId = BigInt(task.job.jobId);
  const taskId = BigInt(task.taskId);
  const label = `job #${task.job.jobId} task #${task.taskId} (${task.role})`;

  // The subgraph can lag; the chain is the truth on who owns the task and its status.
  const chain = await onChainTask(agencyRead, jobId, taskId);
  if (chain.subAgent !== worker.address) {
    log(`  skip ${label}: on-chain subAgent is ${chain.subAgent}, not this worker`);
    handled.add(task.id);
    return;
  }
  if (chain.status !== 1) {
    log(`  skip ${label}: on-chain status is ${TASK_STATUS[chain.status] || chain.status}; treating as handled`);
    handled.add(task.id);
    return;
  }

  const brief = await resolveBrief(task.job.specURI);
  log(`  inferring ${label} on ${ZG_MODEL}${brief ? " with the anchored brief" : ""} ...`);
  let completion;
  try {
    completion = await infer(buildMessages(task, brief));
  } catch (e) {
    log(`  SKIP ${label}: 0G Router failed - ${e.message.slice(0, 200)} (will retry next poll)`);
    return;
  }

  const frame = frameDeliverable({ task, agent: worker.address, model: completion.model, text: completion.text });
  if (frame.truncated) log(`    deliverable shortened to ${frame.text.length} chars to fit the ${MAX_FRAME_BYTES}-byte frame`);
  const chunks = Math.ceil(frame.bytes / 1024);
  if (chunks > 1) log(`    frame is ${frame.bytes} bytes; the SDK will split it into ${chunks} HCS chunks (the anchor points at chunk 1)`);

  let anchored;
  try {
    anchored = await hcs.submit(TOPIC, frame.payload);
  } catch (e) {
    log(`  SKIP ${label}: HCS submit failed - ${e.message.slice(0, 200)} (will retry next poll)`);
    return;
  }

  let receipt;
  try {
    const tx = await agencyWorker.completeTask(jobId, taskId, frame.resultHash, TOPIC, BigInt(anchored.sequenceNumber), { gasLimit: 600_000 });
    receipt = await tx.wait();
  } catch (e) {
    const now = await onChainTask(agencyRead, jobId, taskId).catch(() => null);
    if (now && now.status !== 1) {
      log(`  ${label}: completeTask reverted but the task is now ${TASK_STATUS[now.status]}; treating as handled`);
      handled.add(task.id);
      return;
    }
    log(`  SKIP ${label}: completeTask failed - ${(e.shortMessage || e.message).slice(0, 200)} (HCS seq ${anchored.sequenceNumber} stays anchored; will retry next poll)`);
    return;
  }

  handled.add(task.id);
  const usage = completion.usage
    ? ` tokens ${completion.usage.prompt_tokens ?? "?"}+${completion.usage.completion_tokens ?? "?"}`
    : "";
  log(
    `  DONE job ${task.job.jobId} task ${task.taskId} role ${task.role} model ${completion.model}${usage} ` +
    `HCS seq ${anchored.sequenceNumber} tx ${receipt.hash} https://hashscan.io/testnet/transaction/${receipt.hash}`,
  );
}

async function poll(ctx) {
  let tasks;
  try {
    tasks = await fetchAssigned(ctx.worker.address);
  } catch (e) {
    log(`subgraph query failed: ${e.message}`);
    return;
  }
  const fresh = tasks.filter((t) => !handled.has(t.id));
  if (fresh.length === 0) return;
  log(`${fresh.length} assigned task(s) to work on`);
  for (const task of fresh) {
    if (stopping) return;
    try {
      await handleTask(task, ctx);
    } catch (e) {
      log(`  SKIP job #${task.job.jobId} task #${task.taskId}: ${(e.shortMessage || e.message).slice(0, 200)}`);
    }
  }
}

async function main() {
  if (!ZG_API_KEY) {
    throw new Error(
      "ZG_API_KEY is empty. Paste your 0G Compute Router key (starts with sk-) into .env; the worker refuses to run without " +
      "real inference and will never fabricate a deliverable.",
    );
  }
  if (!ZG_API_KEY.startsWith("sk-")) log("warning: ZG_API_KEY does not start with sk-; the Router may reject it");
  if (!TOPIC) throw new Error("HEDERA_HCS_TOPIC_ID is not set in .env");

  const worker = await identity.loadOrCreateWorker();
  const wallet = new ethers.Wallet(worker.key, identity.provider());
  if (wallet.address !== worker.address) {
    throw new Error(`worker wallet ${wallet.address} does not match AGENT_WORKER_ADDRESS ${worker.address}`);
  }
  const agencyRead = identity.agencyContract();
  const agencyWorker = identity.agencyContract(wallet);

  const top = await identity.topUpIfLow(worker.address);
  console.log("Aetheris sub-agent worker");
  console.log(`  worker address ...... ${worker.address}  (Hedera ${worker.id})`);
  console.log(`  agency .............. ${identity.AGENCY}`);
  console.log(`  model ............... ${ZG_MODEL} via ${PROVIDER_LABEL} (${ZG_BASE_URL})`);
  console.log(`  subgraph ............ ${SUBGRAPH_URL}`);
  console.log(`  HCS topic ........... ${TOPIC}`);
  console.log(`  poll interval ....... ${POLL_MS} ms`);
  console.log(`  HBAR balance ........ ${top.balance.toFixed(4)}${top.toppedUp ? `  (topped up ${top.before.toFixed(4)} -> ${top.balance.toFixed(4)}, tx ${top.txHash})` : ""}`);

  const ctx = { worker, agencyRead, agencyWorker };
  const tick = async () => {
    if (stopping) return;
    await poll(ctx);
    if (!stopping) timer = setTimeout(tick, POLL_MS);
  };
  await tick();
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  log(`${signal} received - shutting down (${handled.size} task(s) handled this session)`);
  hcs.close();
  setTimeout(() => process.exit(0), 200).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((e) => {
  console.error("agent-worker failed to start:", e.shortMessage || e.message);
  hcs.close();
  process.exit(1);
});
