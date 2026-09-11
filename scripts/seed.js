/**
 * Seeds the deployed Aetheris contracts with a realistic set of jobs so the
 * subgraph has something to index and the dashboard has something to show.
 *
 * Produces, in order:
 *   Job 1 — settled through the Hedera Token Service precompile (viaHts: true)
 *   Job 2 — settled through the plain ERC-20 fallback (viaHts: false)
 *   Job 3 — dispatched, one task still outstanding
 *   Job 4 — funded, not yet dispatched
 *
 * The HTS stage needs a token created through the Hedera SDK, which needs an
 * operator account. HEDERA_OPERATOR_ID is optional here: when it is unset the
 * account id is resolved from the deployer's EVM address via the mirror node.
 *
 * If the HTS stage fails for any reason the script reports it and continues
 * with the ERC-20 stages, so a partial run still leaves indexable history.
 *
 *   npx hardhat run scripts/seed.js --network hederaTestnet
 */
require("dotenv").config();
const { ethers } = require("hardhat");

const MIRROR = process.env.HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";
const HTS_GAS = 1_000_000; // HTS precompile calls need considerably more than a plain transfer

const log = (...a) => console.log(...a);
const rule = (t) => log("\n" + "─".repeat(74) + "\n  " + t + "\n" + "─".repeat(74));

/** Resolve the Hedera account id (0.0.x) that owns an EVM address. */
async function accountIdFor(evmAddress) {
  const res = await fetch(`${MIRROR}/api/v1/accounts/${evmAddress}`);
  if (!res.ok) throw new Error(`mirror node ${res.status} for ${evmAddress}`);
  const body = await res.json();
  if (!body.account) throw new Error(`no account for ${evmAddress}`);
  return body.account;
}

/**
 * Create a fungible HTS token and three sub-agent accounts that can receive it.
 * Accounts are given unlimited auto-association so the treasury can pay them
 * without each one signing an association first.
 */
async function provisionHts(deployerAddress) {
  const {
    Client, PrivateKey, AccountId, Hbar,
    TokenCreateTransaction, TokenType, TokenSupplyType,
    AccountCreateTransaction, TransferTransaction,
  } = require("@hashgraph/sdk");

  const operatorId = (process.env.HEDERA_OPERATOR_ID || "").trim() || (await accountIdFor(deployerAddress));
  const raw = (process.env.HEDERA_OPERATOR_KEY || process.env.PRIVATE_KEY || "").trim();
  const key = PrivateKey.fromStringECDSA(raw.startsWith("0x") ? raw.slice(2) : raw);

  const client = Client.forTestnet().setOperator(AccountId.fromString(operatorId), key);
  log(`  operator ............ ${operatorId}`);

  const created = await (
    await new TokenCreateTransaction()
      .setTokenName("Aetheris USD")
      .setTokenSymbol("aUSD")
      .setTokenType(TokenType.FungibleCommon)
      .setSupplyType(TokenSupplyType.Infinite)
      .setDecimals(6)
      .setInitialSupply(1_000_000_000) // 1,000 aUSD at 6dp
      .setTreasuryAccountId(AccountId.fromString(operatorId))
      .setAdminKey(key)
      .setSupplyKey(key)
      .freezeWith(client)
      .sign(key)
  ).execute(client);

  const tokenId = (await created.getReceipt(client)).tokenId;
  const tokenEvm = ethers.getAddress("0x" + tokenId.toSolidityAddress());
  log(`  HTS token ........... ${tokenId}  (${tokenEvm})`);

  const subAgents = [];
  for (const role of ["security-audit", "code-generation", "market-research"]) {
    const agentKey = PrivateKey.generateECDSA();
    const receipt = await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(agentKey.publicKey)
        .setInitialBalance(new Hbar(1))
        .setMaxAutomaticTokenAssociations(-1) // unlimited: no association handshake needed
        .execute(client)
    ).getReceipt(client);

    const id = receipt.accountId;
    subAgents.push({ role, accountId: id.toString(), address: ethers.getAddress("0x" + id.toSolidityAddress()) });
    log(`  sub-agent ........... ${id}  ${role}`);
  }

  // Move the working balance to the deployer so it can fund jobs from the EVM side.
  await (
    await new TransferTransaction()
      .addTokenTransfer(tokenId, AccountId.fromString(operatorId), -500_000_000)
      .addTokenTransfer(tokenId, AccountId.fromString(await accountIdFor(deployerAddress)), 500_000_000)
      .freezeWith(client)
      .sign(key)
  ).execute(client);
  log(`  funded deployer ..... 500.000000 aUSD`);

  client.close();
  return { tokenEvm, subAgents };
}

/** Drive one job all the way from funding to settlement. */
async function runJob(agency, token, { deposit, specURI, tasks, complete, settle }) {
  const jobId = await agency.createJob.staticCall(token, deposit, specURI);
  await (await agency.createJob(token, deposit, specURI, { gasLimit: HTS_GAS })).wait();
  log(`  job #${jobId} created — ${specURI}`);

  for (const t of tasks) {
    await (await agency.assignSubAgent(jobId, t.address, t.fee, t.role, { gasLimit: 600_000 })).wait();
    log(`     ↳ assigned ${t.role} → ${t.address.slice(0, 10)}…  fee ${t.fee}`);
  }

  if (complete > 0) {
    for (let i = 0; i < complete; i++) {
      const resultHash = ethers.keccak256(ethers.toUtf8Bytes(`${specURI}#${i}`));
      const seq = 8900 + Number(jobId) * 10 + i;
      await (
        await agency.completeTask(jobId, i, resultHash, process.env.HEDERA_HCS_TOPIC_ID || "0.0.4915302", seq, {
          gasLimit: 600_000,
        })
      ).wait();
      log(`     ↳ task ${i} completed, HCS seq ${seq}`);
    }
  }

  if (settle) {
    const rc = await (await agency.settleJob(jobId, { gasLimit: 3_000_000 })).wait();
    log(`     ↳ SETTLED (gas ${rc.gasUsed})`);
  }
  return jobId;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const agencyAddr = process.env.NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS;
  const treasuryAddr = process.env.NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS;
  if (!agencyAddr || !treasuryAddr) throw new Error("agency/treasury address missing from .env");

  const agency = await ethers.getContractAt("AetherisAgency", agencyAddr);
  const treasury = await ethers.getContractAt("AetherisTreasury", treasuryAddr);

  log(`\n  deployer ............ ${deployer.address}`);
  log(`  agency .............. ${agencyAddr}`);
  log(`  treasury ............ ${treasuryAddr}`);

  // ── Operator personhood ────────────────────────────────────────────────
  rule("Registering the operator (World ID)");
  try {
    const already = await agency.isVerifiedOperator(deployer.address).catch(() => false);
    if (already) {
      log("  operator already verified — skipping");
    } else {
      await (
        await agency.verifyOperator(deployer.address, 0, ethers.toBigInt(ethers.hexlify(ethers.randomBytes(31))),
          [0, 0, 0, 0, 0, 0, 0, 0], "aetheris.eth", { gasLimit: 900_000 })
      ).wait();
      log("  operator verified (bypass mode — nullifier burned, ZK check skipped)");
    }
  } catch (e) {
    log("  ! verifyOperator failed:", e.shortMessage || e.message);
  }

  // ── Job 1: the HTS path ────────────────────────────────────────────────
  rule("Job 1 — settlement through the HTS precompile");
  let htsOk = false;
  try {
    const { tokenEvm, subAgents } = await provisionHts(deployer.address);

    log("  associating treasury with the token …");
    await (await treasury.associateToken(tokenEvm, { gasLimit: HTS_GAS })).wait();
    log("  treasury associated");

    const hts = await ethers.getContractAt("IERC20", tokenEvm);
    await (await hts.approve(agencyAddr, 300_000_000n, { gasLimit: HTS_GAS })).wait();

    await runJob(agency, tokenEvm, {
      deposit: 2_400_000n, // 2.40 aUSD
      specURI: "ipfs://bafybeigd7yaudit2vaultspec9x2ldq",
      tasks: [
        { ...subAgents[0], fee: 620_000n },
        { ...subAgents[1], fee: 480_000n },
        { ...subAgents[2], fee: 310_000n },
      ],
      complete: 3,
      settle: true,
    });
    htsOk = true;
  } catch (e) {
    log("  ! HTS stage failed:", e.shortMessage || e.message);
    log("    continuing with the ERC-20 stages so the run still leaves history.");
  }

  // ── Jobs 2-4: ERC-20 fallback ──────────────────────────────────────────
  rule("Jobs 2-4 — ERC-20 fallback path");
  const erc20 = await (await ethers.getContractFactory("MockERC20")).deploy("Aetheris USDC", "aUSDC", 6);
  await erc20.waitForDeployment();
  const erc20Addr = await erc20.getAddress();
  log(`  MockERC20 ........... ${erc20Addr}`);
  await (await erc20.mint(deployer.address, 100_000_000n)).wait();
  await (await erc20.approve(agencyAddr, 100_000_000n)).wait();

  const wallets = [0, 1, 2].map(() => ethers.Wallet.createRandom().address);

  await runJob(agency, erc20Addr, {
    deposit: 1_150_000n,
    specURI: "ipfs://bafybeic4market2intel7l2perpdexflow",
    tasks: [
      { address: wallets[0], fee: 400_000n, role: "market-research" },
      { address: wallets[1], fee: 350_000n, role: "data-labelling" },
    ],
    complete: 2,
    settle: true,
  });

  await runJob(agency, erc20Addr, {
    deposit: 1_600_000n,
    specURI: "ipfs://bafybeih5codegen4626adapterhts",
    tasks: [
      { address: wallets[1], fee: 520_000n, role: "code-generation" },
      { address: wallets[2], fee: 480_000n, role: "technical-writing" },
    ],
    complete: 1, // one still outstanding -> stays Dispatched
    settle: false,
  });

  await runJob(agency, erc20Addr, {
    deposit: 3_200_000n,
    specURI: "ipfs://bafybeitokenomics10kmontecarlo",
    tasks: [],
    complete: 0,
    settle: false, // stays Funded
  });

  rule("Done");
  log(`  jobs on chain ....... ${await agency.jobCount()}`);
  log(`  HTS settlement ...... ${htsOk ? "yes — MicroSettlement.viaHts = true" : "NOT exercised"}`);
  log(`  HashScan ............ https://hashscan.io/testnet/contract/${agencyAddr}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
