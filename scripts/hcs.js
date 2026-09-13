/**
 * Hedera Consensus Service helper for the seed / ops scripts (CommonJS).
 *
 * `submit(topicId, payload)` publishes one compact JSON audit record to an HCS
 * topic with the operator account from `.env` and returns the consensus-assigned
 * sequence number. Callers pass that sequence number into the contracts wherever
 * the ABI takes one (`completeTask`), so the (topicId, sequenceNumber) pair the
 * chain emits in `TaskCompleted` / `HcsLogAnchored` is exactly what the mirror
 * node serves at `/api/v1/topics/{topicId}/messages/{sequenceNumber}`.
 *
 * Message shape (compact, no whitespace):
 *   { evt, jobId, taskId?, agent?, amount?, token?, resultHash?, tx?, ts }
 *
 * Env: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY (falls back to PRIVATE_KEY - the
 * deployer's ECDSA key is the topic's submit key), HEDERA_MIRROR_NODE_URL.
 */
require("dotenv").config();

const {
  Client, PrivateKey, AccountId, TopicId,
  TopicMessageSubmitTransaction, TokenMintTransaction,
} = require("@hashgraph/sdk");

const MIRROR = (process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com").replace(/\/+$/, "");

let _client = null;

/** Parse the operator key, accepting 0x-prefixed / raw ECDSA hex or DER. */
function parseKey(raw) {
  const s = raw.trim();
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  for (const parse of [
    () => PrivateKey.fromStringECDSA(hex),
    () => PrivateKey.fromStringDer(s),
    () => PrivateKey.fromStringED25519(hex),
  ]) {
    try { return parse(); } catch { /* try next encoding */ }
  }
  throw new Error("HEDERA_OPERATOR_KEY / PRIVATE_KEY is not a valid ECDSA, DER or ED25519 key");
}

/** Lazily build one shared testnet client with the operator from .env. */
function client() {
  if (_client) return _client;
  const operatorId = (process.env.HEDERA_OPERATOR_ID || "").trim();
  const raw = (process.env.HEDERA_OPERATOR_KEY || process.env.PRIVATE_KEY || "").trim();
  if (!operatorId) throw new Error("HEDERA_OPERATOR_ID is not set");
  if (!raw) throw new Error("HEDERA_OPERATOR_KEY (or PRIVATE_KEY) is not set");
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  _client = (network === "mainnet" ? Client.forMainnet() : Client.forTestnet())
    .setOperator(AccountId.fromString(operatorId), parseKey(raw));
  return _client;
}

/** Close the shared client (call once at the end of a script). */
function close() {
  if (_client) { try { _client.close(); } catch { /* already closed */ } _client = null; }
}

/** Serialise a payload in the canonical compact form used on the topic. */
function encode(payload) {
  const withTs = { ...payload, ts: payload.ts || new Date().toISOString() };
  // bigint -> string so amounts survive JSON.stringify.
  return JSON.stringify(withTs, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 * Submit one message. Returns the data a caller needs to anchor it on-chain and
 * to verify it against the mirror node afterwards.
 *
 * @param {string} topicId       e.g. "0.0.10518320"
 * @param {object} payload       compact record; `ts` is added when missing
 * @returns {Promise<{sequenceNumber:number, consensusTimestamp:string, transactionId:string, message:string}>}
 */
async function submit(topicId, payload) {
  const c = client();
  const message = encode(payload);
  const response = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message)
    .execute(c);
  const receipt = await response.getReceipt(c);
  if (!receipt.topicSequenceNumber) throw new Error(`HCS submit to ${topicId} returned no sequence number`);
  // The record carries the consensus timestamp the mirror node will report.
  const record = await response.getRecord(c);
  return {
    sequenceNumber: Number(receipt.topicSequenceNumber.toString()),
    consensusTimestamp: record.consensusTimestamp.toString(),
    transactionId: response.transactionId.toString(),
    message,
  };
}

/**
 * Fetch one message from the mirror node, retrying while the mirror catches up
 * (it typically lags consensus by a few seconds).
 *
 * @returns {Promise<{sequenceNumber:number, consensusTimestamp:string, contents:string}|null>}
 */
async function mirrorMessage(topicId, sequenceNumber, { attempts = 15, delayMs = 2000 } = {}) {
  const url = `${MIRROR}/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const m = await res.json();
      return {
        sequenceNumber: Number(m.sequence_number),
        consensusTimestamp: m.consensus_timestamp,
        contents: Buffer.from(m.message, "base64").toString("utf8"),
      };
    }
    if (res.status !== 404) throw new Error(`mirror node ${res.status} for ${url}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/**
 * Mint more of an HTS fungible token with the operator's supply key.
 * Only used when the deployer's balance cannot cover a job deposit.
 */
async function mintHts(tokenId, amount) {
  const c = client();
  const rx = await (await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(Number(amount))
    .execute(c)).getReceipt(c);
  return rx.status.toString();
}

module.exports = { submit, mirrorMessage, mintHts, encode, client, close, MIRROR };
