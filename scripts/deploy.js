/**
 * Aetheris — Hedera EVM deployment script.
 *
 *   npx hardhat run scripts/deploy.js --network hederaTestnet
 *
 * Deploys AetherisTreasury, then AetherisAgency, wires them together, optionally
 * associates the treasury with an HTS token, and prints ready-to-paste blocks for
 * `.env` and `subgraph/subgraph.yaml`.
 *
 * Every secret and address is read from the environment — nothing is hardcoded.
 *
 * Environment (see .env.example):
 *   PRIVATE_KEY                    required by hardhat.config.js to sign the deployment
 *   HEDERA_TESTNET_RPC             JSON-RPC relay (defaults to https://testnet.hashio.io/api)
 *   WORLD_ID_ROUTER_ADDRESS        optional; leave unset to deploy in explicit bypass mode
 *   WORLD_ID_GROUP_ID              optional; defaults to 1 (Orb-verified group)
 *   NEXT_PUBLIC_WORLD_ID_APP_ID    World ID app id, e.g. app_staging_...
 *   NEXT_PUBLIC_WORLD_ID_ACTION    World ID action, e.g. aetheris-operator
 *   AETHERIS_ENS_NAME              optional ENS name published in AgencyDeployed
 *   AETHERIS_HTS_TOKEN_ADDRESS     optional; EVM address of an HTS token to associate
 */
const { ethers, network } = require("hardhat");
require("dotenv").config();

const ZERO = "0x0000000000000000000000000000000000000000";

function envOr(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function line(char = "=") {
  return char.repeat(74);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer available. Set PRIVATE_KEY in .env (a funded Hedera testnet ECDSA key)."
    );
  }

  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const balance = await ethers.provider.getBalance(deployer.address);

  const worldIdRouter = envOr("WORLD_ID_ROUTER_ADDRESS", ZERO);
  const worldIdGroupId = BigInt(envOr("WORLD_ID_GROUP_ID", "1"));
  const worldIdAppId = envOr("NEXT_PUBLIC_WORLD_ID_APP_ID", "app_staging_aetheris");
  const worldIdAction = envOr("NEXT_PUBLIC_WORLD_ID_ACTION", "aetheris-operator");
  const ensName = envOr("AETHERIS_ENS_NAME", "aetheris.eth");
  const htsTokenAddress = envOr("AETHERIS_HTS_TOKEN_ADDRESS", "");

  console.log(line());
  console.log("  AETHERIS — Autonomous DeAI Agency & Micro-Treasury");
  console.log(line());
  console.log(`  network        : ${network.name} (chainId ${chainId})`);
  console.log(`  deployer       : ${deployer.address}`);
  console.log(`  balance        : ${ethers.formatEther(balance)} (native)`);
  console.log(`  world id router: ${worldIdRouter}${worldIdRouter === ZERO ? "  <-- BYPASS MODE" : ""}`);
  console.log(`  world id group : ${worldIdGroupId}`);
  console.log(`  world id app   : ${worldIdAppId}`);
  console.log(`  world id action: ${worldIdAction}`);
  console.log(`  ens name       : ${ensName}`);
  console.log(line());

  if (balance === 0n) {
    console.warn(
      "\n  WARNING: deployer balance is zero. Fund this account at https://portal.hedera.com/faucet\n"
    );
  }

  // ── 1. Treasury ────────────────────────────────────────────────────────────
  console.log("\n[1/4] Deploying AetherisTreasury ...");
  const Treasury = await ethers.getContractFactory("AetherisTreasury");
  const treasury = await Treasury.deploy(deployer.address);
  await treasury.waitForDeployment();
  const treasuryAddress = await treasury.getAddress();
  const treasuryTx = treasury.deploymentTransaction();
  const treasuryReceipt = treasuryTx ? await treasuryTx.wait() : null;
  console.log(`      -> AetherisTreasury @ ${treasuryAddress}`);

  // ── 2. Agency ──────────────────────────────────────────────────────────────
  console.log("\n[2/4] Deploying AetherisAgency ...");
  const Agency = await ethers.getContractFactory("AetherisAgency");
  const agency = await Agency.deploy(
    deployer.address,
    treasuryAddress,
    worldIdRouter,
    worldIdGroupId,
    worldIdAppId,
    worldIdAction,
    ensName
  );
  await agency.waitForDeployment();
  const agencyAddress = await agency.getAddress();
  const agencyTx = agency.deploymentTransaction();
  const agencyReceipt = agencyTx ? await agencyTx.wait() : null;
  console.log(`      -> AetherisAgency  @ ${agencyAddress}`);

  // ── 3. Wiring ──────────────────────────────────────────────────────────────
  console.log("\n[3/4] Wiring treasury -> agency ...");
  const wireTx = await treasury.setAgency(agencyAddress);
  await wireTx.wait();
  console.log(`      -> AetherisTreasury.agency = ${await treasury.agency()}`);

  // ── 4. Hedera Token Service ────────────────────────────────────────────────
  console.log("\n[4/4] Probing the Hedera Token Service system contract (0x...167) ...");
  let htsAvailable = false;
  try {
    htsAvailable = await treasury.htsAvailable();
  } catch (error) {
    htsAvailable = false;
  }
  console.log(`      -> HTS reachable on this chain: ${htsAvailable}`);

  if (htsAvailable && htsTokenAddress) {
    console.log(`      -> Associating treasury with HTS token ${htsTokenAddress} ...`);
    try {
      const assocTx = await treasury.associateToken(htsTokenAddress);
      const assocReceipt = await assocTx.wait();
      console.log(`         associated (tx ${assocReceipt.hash})`);
    } catch (error) {
      console.warn(`         association failed: ${error.shortMessage || error.message}`);
      console.warn("         Run treasury.associateToken(<tokenEvmAddress>) manually once the");
      console.warn("         token exists; Hedera refuses transfers to unassociated accounts.");
    }
  } else if (htsAvailable) {
    console.log("      -> AETHERIS_HTS_TOKEN_ADDRESS not set; skipping association.");
    console.log("         Create an HTS token, then call treasury.associateToken(<evmAddress>)");
    console.log("         BEFORE funding a job with it.");
  } else {
    console.log("      -> Not a Hedera network: settlement will use the ERC-20 fallback path.");
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  const treasuryBlock = treasuryReceipt ? treasuryReceipt.blockNumber : 0;
  const agencyBlock = agencyReceipt ? agencyReceipt.blockNumber : 0;
  const startBlock = Math.min(treasuryBlock || 0, agencyBlock || 0) || 0;

  console.log(`\n${line()}`);
  console.log("  DEPLOYMENT COMPLETE");
  console.log(line());
  console.log(`  AetherisTreasury : ${treasuryAddress}  (block ${treasuryBlock})`);
  console.log(`  AetherisAgency   : ${agencyAddress}  (block ${agencyBlock})`);
  if (chainId === 296) {
    console.log(`  HashScan         : https://hashscan.io/testnet/contract/${agencyAddress}`);
  }

  console.log(`\n${line("-")}`);
  console.log("  Paste into .env");
  console.log(line("-"));
  console.log(`NEXT_PUBLIC_AETHERIS_AGENCY_ADDRESS=${agencyAddress}`);
  console.log(`NEXT_PUBLIC_AETHERIS_TREASURY_ADDRESS=${treasuryAddress}`);

  console.log(`\n${line("-")}`);
  console.log("  Paste into subgraph/subgraph.yaml (dataSources[].source)");
  console.log(line("-"));
  console.log(`dataSources:
  - kind: ethereum
    name: AetherisAgency
    network: hedera-testnet
    source:
      address: "${agencyAddress}"
      abi: AetherisAgency
      startBlock: ${agencyBlock}
  - kind: ethereum
    name: AetherisTreasury
    network: hedera-testnet
    source:
      address: "${treasuryAddress}"
      abi: AetherisTreasury
      startBlock: ${treasuryBlock}`);
  console.log(`\n  (earliest indexable block across both contracts: ${startBlock})`);

  console.log(`\n${line("-")}`);
  console.log("  Post-deployment checklist");
  console.log(line("-"));
  if (worldIdRouter === ZERO) {
    console.log("  [!] WORLD ID BYPASS IS ACTIVE — zero-knowledge proofs are NOT verified.");
    console.log("      verifyOperator() still burns nullifiers (replay protection is live),");
    console.log("      but any caller can register an operator. Set WORLD_ID_ROUTER_ADDRESS");
    console.log("      and redeploy (or call setWorldId) before handling real value.");
  } else {
    console.log("  [ok] World ID router configured; proofs will be verified on-chain.");
  }
  console.log("  [ ] Call agency.verifyOperator(...) to unlock treasury.claimProfit(...).");
  console.log("  [ ] Create an HCS topic and export HEDERA_HCS_TOPIC_ID for completeTask().");
  console.log("  [ ] Associate the treasury with every HTS token you intend to escrow.");
  console.log("  [ ] Clients must approve the AGENCY (not the treasury) before createJob().");
  console.log(line());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
