/**
 * Sub-agent worker identity (CommonJS, plain ethers v6 + @hashgraph/sdk).
 *
 * The worker is a Hedera testnet account whose EVM address is the ECDSA alias
 * of its key, so the address an ethers `Wallet` derives from AGENT_WORKER_KEY is
 * exactly the address the JSON-RPC relay resolves as `msg.sender`. That matters
 * because `AetherisAgency.completeTask` is restricted to `task.subAgent` (or the
 * owner): the assigned sub-agent must be the address the worker signs with.
 *
 * An account created with `setKeyWithoutAlias` would get a long-zero EVM address
 * (0x000...<num>) that differs from the ethers address of the same key, so the
 * account is created with `setECDSAKeyWithAlias` and both derivations are
 * asserted equal before anything is written to .env.
 *
 * Exports:
 *   loadOrCreateWorker()                 -> { key, id, address }   (appends to .env on first run)
 *   topUpIfLow(address, minHbar, amount) -> { balance, toppedUp, txHash? }
 *   provider(), operatorWallet(), agencyContract(signer?), treasuryInterface(), RPC, AGENCY, TREASURY
 *
 *   node scripts/agent-identity.js       # create (or show) the identity, never prints the key
 */
require("dotenv").config();

const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { AccountCreateTransaction, PrivateKey, Hbar } = require("@hashgraph/sdk");
const hcs = require("./hcs");

const RPC = (process.env.HEDERA_TESTNET_RPC || "https://testnet.hashio.io/api").trim();
const CHAIN_ID = 296;
const AGENCY = (process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS || "0x16fA9CC838Ab5380F0Ebe3C261a2F57E0FBAbc81").trim();
const TREASURY = (process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS || "0x10360383a6b43Fd22BE257bE334E9A9ad83B5598").trim();
const ENV_PATH = path.resolve(__dirname, "..", ".env");

const AGENCY_ABI = require("../artifacts/contracts/AetherisAgency.sol/AetherisAgency.json").abi;
const TREASURY_ABI = require("../artifacts/contracts/AetherisTreasury.sol/AetherisTreasury.json").abi;

let _provider = null;

/** Hashio rejects batched JSON-RPC, so the provider is built with batchMaxCount 1. */
function provider() {
  if (_provider) return _provider;
  _provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { batchMaxCount: 1, staticNetwork: true });
  return _provider;
}

/** The operator / deployer wallet (agency owner) from PRIVATE_KEY. */
function operatorWallet() {
  const raw = (process.env.PRIVATE_KEY || "").trim();
  if (!raw) throw new Error("PRIVATE_KEY is not set in .env (operator / deployer key)");
  return new ethers.Wallet(raw.startsWith("0x") ? raw : "0x" + raw, provider());
}

/** AetherisAgency bound to `signer` (defaults to the read-only provider). */
function agencyContract(signer) {
  return new ethers.Contract(AGENCY, AGENCY_ABI, signer || provider());
}

function treasuryInterface() {
  return new ethers.Interface(TREASURY_ABI);
}

/** Normalise a 0x / raw 32-byte hex private key to the form ethers expects. */
function normaliseKey(raw) {
  const s = String(raw).trim();
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("AGENT_WORKER_KEY is not a 32-byte hex ECDSA private key");
  return "0x" + hex.toLowerCase();
}

/** Read the three worker vars from process.env if all are present. */
function fromEnv() {
  const key = (process.env.AGENT_WORKER_KEY || "").trim();
  const id = (process.env.AGENT_WORKER_ID || "").trim();
  const address = (process.env.AGENT_WORKER_ADDRESS || "").trim();
  if (!key || !id || !address) return null;
  const normKey = normaliseKey(key);
  const wallet = new ethers.Wallet(normKey);
  const checked = ethers.getAddress(address);
  if (wallet.address !== checked) {
    throw new Error(
      `AGENT_WORKER_ADDRESS ${checked} does not match the address derived from AGENT_WORKER_KEY (${wallet.address})`,
    );
  }
  return { key: normKey, id, address: checked };
}

/** Append the worker vars to .env (creating a trailing newline first if needed). */
function appendToEnv({ key, id, address }) {
  let prefix = "";
  if (fs.existsSync(ENV_PATH)) {
    const buf = fs.readFileSync(ENV_PATH);
    if (buf.length > 0 && buf[buf.length - 1] !== 0x0a) prefix = "\n";
  }
  const block =
    `${prefix}\n# Sub-agent worker identity - auto-created by scripts/agent-identity.js on ${new Date().toISOString()}.\n` +
    "# ECDSA key with EVM alias: AGENT_WORKER_ADDRESS is both the Hedera account's EVM address and the ethers Wallet address.\n" +
    "# Keep AGENT_WORKER_KEY secret. The worker signs completeTask with it.\n" +
    `AGENT_WORKER_KEY=${key}\n` +
    `AGENT_WORKER_ID=${id}\n` +
    `AGENT_WORKER_ADDRESS=${address}\n`;
  fs.appendFileSync(ENV_PATH, block, { mode: 0o600 });
  process.env.AGENT_WORKER_KEY = key;
  process.env.AGENT_WORKER_ID = id;
  process.env.AGENT_WORKER_ADDRESS = address;
}

/** Mirror-node lookup of an account by EVM address; null while the mirror catches up. */
async function mirrorAccount(address, { attempts = 10, delayMs = 2000 } = {}) {
  const url = `${hcs.MIRROR}/api/v1/accounts/${address}`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status !== 404) throw new Error(`mirror node ${res.status} for ${url}`);
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/**
 * Create the worker account: ECDSA key + EVM alias, 2 HBAR, unlimited automatic
 * token associations (so the HTS payout at settlement needs no manual associate).
 */
async function createWorker() {
  const pk = PrivateKey.generateECDSA();
  const key = "0x" + pk.toStringRaw();
  const wallet = new ethers.Wallet(key);
  const sdkEvm = ethers.getAddress("0x" + pk.publicKey.toEvmAddress().replace(/^0x/, ""));
  if (sdkEvm !== wallet.address) {
    throw new Error(`SDK alias address ${sdkEvm} differs from the ethers address ${wallet.address}; refusing to create`);
  }

  const client = hcs.client();
  const response = await new AccountCreateTransaction()
    .setECDSAKeyWithAlias(pk)
    .setInitialBalance(new Hbar(2))
    .setMaxAutomaticTokenAssociations(-1)
    .setAccountMemo("Aetheris sub-agent worker")
    .execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.accountId) throw new Error("AccountCreateTransaction returned no accountId");
  const id = receipt.accountId.toString();

  // The contract sees msg.sender as the address the relay resolves for this key,
  // so the account's EVM address must be the alias form, not long-zero.
  const longZero = ethers.getAddress("0x" + receipt.accountId.toSolidityAddress());
  const acct = await mirrorAccount(wallet.address);
  const mirrorEvm = acct && acct.evm_address ? ethers.getAddress(acct.evm_address) : null;
  const mirrorId = acct ? acct.account : null;
  if (mirrorEvm && mirrorEvm !== wallet.address) {
    throw new Error(`mirror node reports EVM address ${mirrorEvm} for ${id}, expected ${wallet.address}`);
  }
  if (mirrorId && mirrorId !== id) {
    throw new Error(`mirror node resolves ${wallet.address} to ${mirrorId}, expected ${id}`);
  }

  appendToEnv({ key, id, address: wallet.address });
  console.log(`  worker account ...... ${id}`);
  console.log(`  worker address ...... ${wallet.address}  (EVM alias; long-zero form would be ${longZero})`);
  console.log(`  mirror node ......... ${acct ? "account visible, alias confirmed" : "not visible yet (alias asserted locally)"}`);
  console.log(`  .env ................ AGENT_WORKER_KEY / AGENT_WORKER_ID / AGENT_WORKER_ADDRESS appended`);
  return { key, id, address: wallet.address };
}

/** Return the worker identity from .env, creating the Hedera account on first use. */
async function loadOrCreateWorker() {
  const existing = fromEnv();
  if (existing) return existing;
  return createWorker();
}

/**
 * Read the worker's HBAR balance over JSON-RPC and transfer from the operator
 * wallet when it is below `minHbar`.
 */
async function topUpIfLow(address, minHbar = 0.7, amountHbar = 1) {
  const p = provider();
  const balanceWei = await p.getBalance(address);
  const balance = Number(ethers.formatEther(balanceWei));
  if (balance >= minHbar) return { balance, toppedUp: false };
  const op = operatorWallet();
  const tx = await op.sendTransaction({ to: address, value: ethers.parseEther(String(amountHbar)), gasLimit: 100_000 });
  await tx.wait();
  const after = Number(ethers.formatEther(await p.getBalance(address)));
  return { balance: after, toppedUp: true, txHash: tx.hash, before: balance };
}

/**
 * Fetch one HCS frame from the mirror node and reassemble it if the SDK chunked
 * it (messages over 1024 bytes are split; each chunk is its own sequence number
 * and carries chunk_info { initial_transaction_id, number, total }). The on-chain
 * anchor is the sequence number of chunk 1; later chunks follow it on the topic.
 *
 * @returns {Promise<{sequenceNumber:number, consensusTimestamp:string, contents:string, chunks:number, sequenceNumbers:number[]}|null>}
 */
async function fetchFrame(topicId, sequenceNumber, { attempts = 15, delayMs = 2000 } = {}) {
  const base = `${hcs.MIRROR}/api/v1/topics/${topicId}/messages/`;
  const getMsg = async (seq) => {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(base + seq, { headers: { Accept: "application/json" } });
      if (res.ok) return res.json();
      if (res.status !== 404) throw new Error(`mirror node ${res.status} for ${base}${seq}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  };
  const first = await getMsg(sequenceNumber);
  if (!first) return null;
  const decode = (m) => Buffer.from(m.message, "base64").toString("utf8");
  const info = first.chunk_info;
  const total = info && info.total ? Number(info.total) : 1;
  if (total <= 1) {
    return {
      sequenceNumber: Number(first.sequence_number),
      consensusTimestamp: first.consensus_timestamp,
      contents: decode(first),
      chunks: 1,
      sequenceNumbers: [Number(first.sequence_number)],
    };
  }
  if (Number(info.number) !== 1) {
    throw new Error(`message ${topicId}#${sequenceNumber} is chunk ${info.number}/${total}; the anchor must point at chunk 1`);
  }
  const txId = JSON.stringify(info.initial_transaction_id);
  const parts = [{ number: 1, text: decode(first), seq: Number(first.sequence_number) }];
  // Chunks are consecutive on the topic unless another submit interleaves; scan a little past total.
  for (let seq = sequenceNumber + 1; parts.length < total && seq <= sequenceNumber + total + 10; seq++) {
    const m = await getMsg(seq);
    if (!m) break;
    if (m.chunk_info && JSON.stringify(m.chunk_info.initial_transaction_id) === txId) {
      parts.push({ number: Number(m.chunk_info.number), text: decode(m), seq });
    }
  }
  if (parts.length !== total) throw new Error(`only ${parts.length}/${total} chunks of ${topicId}#${sequenceNumber} found on the mirror node`);
  parts.sort((a, b) => a.number - b.number);
  return {
    sequenceNumber: Number(first.sequence_number),
    consensusTimestamp: first.consensus_timestamp,
    contents: parts.map((p) => p.text).join(""),
    chunks: total,
    sequenceNumbers: parts.map((p) => p.seq),
  };
}

module.exports = {
  RPC, CHAIN_ID, AGENCY, TREASURY, AGENCY_ABI,
  provider, operatorWallet, agencyContract, treasuryInterface,
  loadOrCreateWorker, topUpIfLow, fetchFrame,
};

if (require.main === module) {
  (async () => {
    const had = !!fromEnv();
    const w = await loadOrCreateWorker();
    const bal = await topUpIfLow(w.address);
    console.log(`  identity ............ ${had ? "loaded from .env" : "created"}`);
    console.log(`  account / address ... ${w.id} / ${w.address}`);
    console.log(`  HBAR ................ ${bal.balance.toFixed(4)}${bal.toppedUp ? `  (topped up, tx ${bal.txHash})` : ""}`);
    console.log(`  HashScan ............ https://hashscan.io/testnet/account/${w.id}`);
    hcs.close();
  })().catch((e) => {
    console.error("agent-identity failed:", e.shortMessage || e.message);
    hcs.close();
    process.exit(1);
  });
}
