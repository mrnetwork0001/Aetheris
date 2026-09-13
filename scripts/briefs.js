/**
 * Job briefs for the sub-agent demo (CommonJS, plain ethers v6).
 *
 * A brief is the human-readable specification a job is funded against. Instead of
 * storing a fake content id on-chain, the demo anchors the brief on the HCS audit
 * topic as a JobBrief frame and passes `hcs://<topicId>/<sequenceNumber>` to
 * `createJob` as the specURI. The worker resolves that URI on the mirror node,
 * checks keccak256(text) against the frame, and puts the brief into its prompt.
 *
 * Frame shape (compact JSON, `ts` added by scripts/hcs.js):
 *   { evt: "JobBrief", title, role, client, chars, keccak256, text }
 *
 * Exports: BRIEFS, briefFor(role), briefFrame(brief), anchorBrief(hcs, topicId, brief),
 * parseHcsSpec(spec), TITLE_MAX, BRIEF_MIN, BRIEF_MAX.
 */
const { ethers } = require("ethers");

const TITLE_MAX = 80;
const BRIEF_MIN = 40;
const BRIEF_MAX = 3000;

const BRIEFS = [
  {
    title: "Market scan: agent-to-agent payment rails on Hedera",
    role: "market-research",
    text:
      "Produce a short market scan of the landscape Aetheris competes in: protocols and products that let autonomous AI agents hire, pay and audit other agents on-chain. " +
      "Cover at least five comparable projects (escrow-based agent marketplaces, x402-style pay-per-call schemes, agent identity registries) and for each give chain, settlement asset, " +
      "how work is verified, and whether a public audit trail exists. Then position Aetheris against them on three axes: settlement cost (the HTS micro-settlement path on Hedera costs " +
      "about 2.36M gas per settleJob against 0.23M for the ERC-20 fallback, both at Hedera's fixed fee schedule), verifiability (every deliverable is hashed with keccak256 and the " +
      "text is anchored on HCS topic 0.0.10518320, so anyone can recompute the hash from the mirror node), and data access (job, task and settlement state are indexed by a " +
      "self-hosted Graph node because the hosted service has no Hedera network). Close with three concrete go-to-market recommendations for an ETHOnline demo audience and one " +
      "risk the team should not ignore. Deliver as plain text with short labelled paragraphs, no tables, under 2,500 characters.",
  },
  {
    title: "Security review of AetherisAgency escrow and settlement",
    role: "security-audit",
    text:
      "Review the escrow and settlement design of AetherisAgency and AetherisTreasury as described here and report findings ordered by severity. The agency owns job and task " +
      "records; the treasury owns the tokens and only accepts calls from the agency (onlyAgency). createJob pulls the client deposit with safeTransferFrom into the treasury and " +
      "then calls recordEscrow, which adds the deposit to totalObligations[token] and reverts with SolvencyCheckFailed if balanceOf is below the total obligations. assignSubAgent " +
      "is onlyOwner and reverts with FeeExceedsDeposit when committed fees would pass the deposit. completeTask is callable by the task's sub-agent or the operator and stores " +
      "resultHash plus an HCS topic id and sequence number. settleJob is onlyOwner and nonReentrant; it pays each Completed task through the HTS precompile (viaHts = true) or " +
      "an ERC-20 transfer fallback, then promotes the remainder to retained margin. refundJob is open to the client or the operator while the job is Funded or Dispatched and " +
      "cancels open tasks. For each finding state the affected function, the attacker or failure model, the impact, and a concrete fix. Pay particular attention to operator " +
      "trust (nothing forces the operator to settle), the precompile response-code handling, fee-on-transfer tokens, re-entrancy through HTS callbacks, and whether a sub-agent " +
      "can be paid for a task whose resultHash was never anchored. Finish with a one-paragraph overall risk rating. Plain text, under 2,500 characters.",
  },
  {
    title: "Operator runbook: verifying a deliverable from the mirror node",
    role: "technical-writing",
    text:
      "Write an operator-facing runbook that explains, step by step, how to verify an Aetheris deliverable without trusting the Aetheris UI. Inputs: a job id and task id on " +
      "AetherisAgency (Hedera testnet, chain 296, RPC https://testnet.hashio.io/api). Steps to cover: reading getTask(jobId, taskId) for resultHash; finding the TaskCompleted " +
      "event or the subgraph Task.hcsSequenceNumber for the topic id and sequence number; fetching GET /api/v1/topics/<topic>/messages/<seq> from https://testnet.mirrornode.hedera.com; " +
      "decoding the base64 message field; handling frames over 1,024 bytes, which the SDK splits into consecutive messages that share chunk_info.initial_transaction_id and must " +
      "be concatenated in chunk_info.number order before parsing; recomputing keccak256 over the UTF-8 bytes of the frame's text field; and comparing with resultHash. State " +
      "clearly what a match proves (the text was fixed at consensus time and is what the sub-agent committed to) and what it does not prove (quality, or which model produced " +
      "it). Include one short node snippet using ethers v6 and fetch. Audience: a technically literate operator who has not read the codebase. Plain text with numbered steps, " +
      "under 2,500 characters.",
  },
  {
    title: "Node script: chunk-aware HCS frame reader with hash check",
    role: "code-generation",
    text:
      "Write a self-contained Node.js 18+ CommonJS module, plain JavaScript, no dependencies other than ethers v6, that exports one async function " +
      "readFrame(topicId, sequenceNumber, options) for the Hedera mirror node. It must GET https://testnet.mirrornode.hedera.com/api/v1/topics/<topicId>/messages/<seq>, " +
      "retry on 404 while the mirror catches up (options.attempts, default 15; options.delayMs, default 2000), and throw on any other non-2xx status. When the row's " +
      "chunk_info.total is above 1, walk back to chunk 1 using chunk_info.number, fetch every chunk, verify each shares initial_transaction_id and arrives in order, and " +
      "concatenate the raw base64-decoded bytes before decoding UTF-8 so a multibyte character split at a chunk boundary survives. Return " +
      "{ sequenceNumber, consensusTimestamp, chunks, contents, payload, keccak256, hashMatches } where payload is the parsed JSON (null if the contents are not JSON), " +
      "keccak256 is ethers.keccak256(ethers.toUtf8Bytes(payload.text)) when a text field exists, and hashMatches compares it case-insensitively with payload.keccak256. " +
      "Add a small CLI guard (if require.main === module) that takes topic and sequence from argv and prints the result as JSON. Include JSDoc on the exported function " +
      "and handle AbortSignal.timeout for each fetch. Output the code only, as plain text without markdown fences, under 2,500 characters.",
  },
  {
    title: "Labelling guide for HCS audit frames on topic 0.0.10518320",
    role: "data-labelling",
    text:
      "Design a labelling scheme for the messages on the Aetheris HCS audit topic 0.0.10518320 so a reviewer can classify any frame consistently. Frames are compact JSON " +
      "with an evt field; known values include JobCreated, SubAgentAssigned, TaskCompleted, Deliverable, JobBrief, JobSettled, JobRefunded and Correction, and frames above " +
      "1,024 bytes appear as several consecutive messages that share chunk_info.initial_transaction_id. Define the label set with one line of guidance per label, covering " +
      "at least: lifecycle event, deliverable text, job brief, correction of an earlier frame, partial chunk of a larger frame, and malformed or unknown. Specify the decision " +
      "order a reviewer follows (for example: reassemble chunks first, then parse JSON, then read evt), the fields that must be checked for each label (jobId, taskId, " +
      "keccak256 matching the text, role slug from the set market-research, security-audit, technical-writing, code-generation, data-labelling), and how to record a " +
      "confidence score. Then label these three example frames and explain each decision in one line: (a) {\"evt\":\"TaskCompleted\",\"jobId\":7,\"taskId\":0,\"resultHash\":\"0x...\"}; " +
      "(b) a 1,024-byte message whose contents start mid-word and whose chunk_info.number is 2 of 3; (c) {\"evt\":\"Deliverable\",\"text\":\"...\",\"keccak256\":\"0x...\"} where " +
      "the recomputed hash does not match. Plain text, under 2,500 characters.",
  },
];

for (const b of BRIEFS) {
  if (b.title.length > TITLE_MAX) throw new Error(`brief "${b.role}" title exceeds ${TITLE_MAX} chars`);
  if (b.text.length < 600 || b.text.length > 1800) throw new Error(`brief "${b.role}" text is ${b.text.length} chars; expected 600..1800`);
}

/** The built-in brief for a role slug, or null. */
function briefFor(role) {
  return BRIEFS.find((b) => b.role === role) || null;
}

/** Validate a brief's title / text against the convention and return it normalised. */
function validateBrief({ title, role, text }) {
  const t = String(title || "").trim();
  const body = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) throw new Error("brief title is empty");
  if (t.length > TITLE_MAX) throw new Error(`brief title is ${t.length} chars; max ${TITLE_MAX}`);
  if (body.length < BRIEF_MIN || body.length > BRIEF_MAX) {
    throw new Error(`brief text is ${body.length} chars; expected ${BRIEF_MIN}..${BRIEF_MAX}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(role || ""))) throw new Error(`role "${role}" is not a slug`);
  return { title: t, role, text: body };
}

/**
 * Build the JobBrief frame. `keccak256` covers exactly `text`, so a reader can
 * recompute it from the mirror node and know the brief was not altered.
 *
 * @param {{title:string, role:string, client?:string|null, text:string}} brief
 */
function briefFrame({ title, role, client, text }) {
  const v = validateBrief({ title, role, text });
  const addr = client ? ethers.getAddress(client) : null;
  return {
    evt: "JobBrief",
    title: v.title,
    role: v.role,
    client: addr,
    chars: v.text.length,
    keccak256: ethers.keccak256(ethers.toUtf8Bytes(v.text)),
    text: v.text,
  };
}

/**
 * Anchor a brief on the audit topic and return the spec URI to store on the job.
 *
 * @param {{submit:(topicId:string, payload:object)=>Promise<{sequenceNumber:number}>}} hcs  scripts/hcs.js (or anything with the same submit)
 * @param {string} topicId
 * @param {{title:string, role:string, client?:string|null, text:string}} brief
 * @returns {Promise<{specURI:string, sequenceNumber:number, keccak256:string, frame:object, consensusTimestamp?:string, transactionId?:string}>}
 */
async function anchorBrief(hcs, topicId, brief) {
  if (!topicId) throw new Error("anchorBrief: topicId is empty");
  const frame = briefFrame(brief);
  const res = await hcs.submit(topicId, frame);
  const seq = Number(res.sequenceNumber);
  if (!Number.isInteger(seq) || seq <= 0) throw new Error("anchorBrief: HCS submit returned no sequence number");
  return {
    specURI: `hcs://${topicId}/${seq}`,
    sequenceNumber: seq,
    keccak256: frame.keccak256,
    frame,
    consensusTimestamp: res.consensusTimestamp,
    transactionId: res.transactionId,
  };
}

/**
 * Parse `hcs://<topicId>/<sequenceNumber>`. Returns null for anything else
 * (ipfs://, https://, opaque strings), never throws.
 */
function parseHcsSpec(spec) {
  if (typeof spec !== "string") return null;
  const m = /^hcs:\/\/(\d+\.\d+\.\d+)\/(\d+)$/i.exec(spec.trim());
  if (!m) return null;
  const sequenceNumber = Number(m[2]);
  if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber <= 0) return null;
  return { topicId: m[1], sequenceNumber };
}

module.exports = { BRIEFS, briefFor, validateBrief, briefFrame, anchorBrief, parseHcsSpec, TITLE_MAX, BRIEF_MIN, BRIEF_MAX };
