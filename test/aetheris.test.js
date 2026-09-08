/**
 * Aetheris contract suite.
 *
 *   npx hardhat test
 *
 * Coverage map
 * ────────────
 *  • Full happy path: createJob -> assign 2 sub-agents -> completeTask -> settleJob,
 *    including exact margin arithmetic.
 *  • ERC-20 fallback settlement (`viaHts === false`).
 *  • Genuine HTS precompile settlement (`viaHts === true`) by installing a stateless
 *    mock of the Hedera Token Service system contract at 0x...167 with `hardhat_setCode`,
 *    so the real HederaTokenServiceLib code path — response-code decoding, association,
 *    dual-path fallback — executes unchanged. On the live Hedera testnet the same code
 *    talks to the real system contract; nothing in the library is stubbed out.
 *  • World ID: proof verification, bypass mode, nullifier replay rejection.
 *  • Access control on every privileged entry point.
 *  • ReentrancyGuard, proven with a hostile ERC-20 that re-enters mid-transfer.
 *  • Treasury rebalance accounting and refunds.
 */
const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const ZERO = ethers.ZeroAddress;
const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";

const HTS_SUCCESS = 22n;
const HTS_ALREADY_ASSOCIATED = 194n;

const JobStatus = { None: 0n, Funded: 1n, Dispatched: 2n, Completed: 3n, Settled: 4n, Refunded: 5n };
const TaskStatus = { None: 0n, Assigned: 1n, Completed: 2n, Paid: 3n, Cancelled: 4n };

const WORLD_ID_APP = "app_staging_aetheris";
const WORLD_ID_ACTION = "aetheris-operator";
const ENS_NAME = "aetheris.eth";

const SPEC_URI = "ipfs://bafyaetherisjobspec";
const HCS_TOPIC = "0.0.4991234";

const DEPOSIT = 1_000_000_000n; // 1,000.000000 units at 6 decimals
const FEE_A = 300_000_000n;     //   300.000000 — security audit
const FEE_B = 450_000_000n;     //   450.000000 — market intelligence
const EXPECTED_PAID = FEE_A + FEE_B;
const EXPECTED_MARGIN = DEPOSIT - EXPECTED_PAID; // 250.000000

const DUMMY_PROOF = [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
const REENTRANCY_SELECTOR = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);

/** Deploys the agency + treasury pair and wires them together. */
async function deployCore({ owner, worldIdRouter = ZERO }) {
  const Treasury = await ethers.getContractFactory("AetherisTreasury");
  const treasury = await Treasury.connect(owner).deploy(owner.address);
  await treasury.waitForDeployment();

  const Agency = await ethers.getContractFactory("AetherisAgency");
  const agency = await Agency.connect(owner).deploy(
    owner.address,
    await treasury.getAddress(),
    worldIdRouter,
    1n,
    WORLD_ID_APP,
    WORLD_ID_ACTION,
    ENS_NAME
  );
  await agency.waitForDeployment();

  await (await treasury.connect(owner).setAgency(await agency.getAddress())).wait();
  return { treasury, agency };
}

/** ERC-20-only world: no HTS system contract exists, so settlement uses the fallback. */
async function erc20Fixture() {
  const [owner, client, subAgentA, subAgentB, outsider] = await ethers.getSigners();

  const Token = await ethers.getContractFactory("MockERC20");
  const token = await Token.deploy("Mock USD Coin", "mUSDC", 6);
  await token.waitForDeployment();
  await (await token.mint(client.address, DEPOSIT * 10n)).wait();

  const { treasury, agency } = await deployCore({ owner });

  await (await token.connect(client).approve(await agency.getAddress(), ethers.MaxUint256)).wait();

  return { owner, client, subAgentA, subAgentB, outsider, token, treasury, agency };
}

/** Hedera-like world: the HTS system contract answers at 0x...167. */
async function htsFixture() {
  const [owner, client, subAgentA, subAgentB, outsider] = await ethers.getSigners();

  // Install a stateless HTS system-contract mock at the reserved Hedera address.
  const Precompile = await ethers.getContractFactory("MockHtsPrecompile");
  const precompile = await Precompile.deploy();
  await precompile.waitForDeployment();
  const runtimeCode = await ethers.provider.getCode(await precompile.getAddress());
  await network.provider.send("hardhat_setCode", [HTS_PRECOMPILE, runtimeCode]);

  const HtsToken = await ethers.getContractFactory("MockHtsToken");
  const htsToken = await HtsToken.deploy("Aetheris HTS USDC", "hUSDC", 6);
  await htsToken.waitForDeployment();
  await (await htsToken.mint(client.address, DEPOSIT * 10n)).wait();

  const Erc20 = await ethers.getContractFactory("MockERC20");
  const plainToken = await Erc20.deploy("Mock USD Coin", "mUSDC", 6);
  await plainToken.waitForDeployment();
  await (await plainToken.mint(client.address, DEPOSIT * 10n)).wait();

  const { treasury, agency } = await deployCore({ owner });

  await (await htsToken.connect(client).approve(await agency.getAddress(), ethers.MaxUint256)).wait();
  await (await plainToken.connect(client).approve(await agency.getAddress(), ethers.MaxUint256)).wait();

  return {
    owner, client, subAgentA, subAgentB, outsider,
    htsToken, plainToken, treasury, agency, precompile,
  };
}

/** Runs a job through create -> assign x2 -> complete x2 and returns the job id. */
async function runJobToCompletion({ agency, token, owner, client, subAgentA, subAgentB }) {
  await (await agency.connect(client).createJob(await token.getAddress(), DEPOSIT, SPEC_URI)).wait();
  const jobId = await agency.jobCount();

  await (await agency.connect(owner).assignSubAgent(jobId, subAgentA.address, FEE_A, "security-audit")).wait();
  await (await agency.connect(owner).assignSubAgent(jobId, subAgentB.address, FEE_B, "market-intelligence")).wait();

  await (await agency.connect(subAgentA).completeTask(jobId, 0, ethers.id("audit-report"), HCS_TOPIC, 101n)).wait();
  await (await agency.connect(subAgentB).completeTask(jobId, 1, ethers.id("market-report"), HCS_TOPIC, 102n)).wait();

  return jobId;
}

describe("Aetheris", function () {
  // ───────────────────────────────────────────────────────────────────────────
  describe("Deployment & wiring", function () {
    it("wires the treasury to the agency and reports HTS as unavailable off-Hedera", async function () {
      const { owner, treasury, agency } = await loadFixture(erc20Fixture);

      expect(await treasury.owner()).to.equal(owner.address);
      expect(await agency.owner()).to.equal(owner.address);
      expect(await treasury.agency()).to.equal(await agency.getAddress());
      expect(await agency.treasury()).to.equal(await treasury.getAddress());
      expect(await treasury.htsEnabled()).to.equal(true);
      expect(await treasury.htsAvailable()).to.equal(false);
    });

    it("emits AgencyDeployed and loudly announces World ID bypass mode", async function () {
      const [owner] = await ethers.getSigners();
      const Treasury = await ethers.getContractFactory("AetherisTreasury");
      const treasury = await Treasury.deploy(owner.address);
      await treasury.waitForDeployment();

      const Agency = await ethers.getContractFactory("AetherisAgency");
      const agency = await Agency.deploy(
        owner.address, await treasury.getAddress(), ZERO, 1n, WORLD_ID_APP, WORLD_ID_ACTION, ENS_NAME
      );
      const receipt = await agency.deploymentTransaction().wait();

      const parsed = receipt.logs.map((log) => {
        try { return agency.interface.parseLog(log); } catch { return null; }
      }).filter(Boolean);

      const deployed = parsed.find((e) => e.name === "AgencyDeployed");
      expect(deployed, "AgencyDeployed not emitted").to.not.equal(undefined);
      expect(deployed.args[0]).to.equal(await agency.getAddress());
      expect(deployed.args[1]).to.equal(owner.address);
      expect(deployed.args[2]).to.equal(ENS_NAME);
      expect(deployed.args[3]).to.equal(0n);

      const bypass = parsed.find((e) => e.name === "WorldIdBypassActive");
      expect(bypass, "WorldIdBypassActive not emitted").to.not.equal(undefined);
      expect(bypass.args[1]).to.contain("NOT verified");
      expect(await agency.worldIdVerificationBypassed()).to.equal(true);
    });

    it("rejects a zero owner or zero treasury", async function () {
      const [owner] = await ethers.getSigners();
      const Treasury = await ethers.getContractFactory("AetherisTreasury");
      await expect(Treasury.deploy(ZERO)).to.be.reverted;

      const treasury = await Treasury.deploy(owner.address);
      await treasury.waitForDeployment();
      const Agency = await ethers.getContractFactory("AetherisAgency");
      await expect(
        Agency.deploy(owner.address, ZERO, ZERO, 1n, WORLD_ID_APP, WORLD_ID_ACTION, ENS_NAME)
      ).to.be.revertedWithCustomError(Agency, "ZeroAddress");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Happy path — ERC-20 fallback settlement", function () {
    it("escrows the deposit and emits JobCreated with the frozen signature", async function () {
      const { agency, treasury, token, client } = await loadFixture(erc20Fixture);
      const tokenAddress = await token.getAddress();

      await expect(agency.connect(client).createJob(tokenAddress, DEPOSIT, SPEC_URI))
        .to.emit(agency, "JobCreated")
        .withArgs(1n, client.address, tokenAddress, DEPOSIT, SPEC_URI);

      expect(await token.balanceOf(await treasury.getAddress())).to.equal(DEPOSIT);
      expect(await treasury.escrowBalance(1n)).to.equal(DEPOSIT);
      expect(await treasury.escrowToken(1n)).to.equal(tokenAddress);
      expect(await treasury.totalObligations(tokenAddress)).to.equal(DEPOSIT);
      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Funded);
    });

    it("assigns sub-agents and anchors HCS receipts on completion", async function () {
      const ctx = await loadFixture(erc20Fixture);
      const { agency, token, owner, client, subAgentA, subAgentB } = ctx;
      const tokenAddress = await token.getAddress();

      await (await agency.connect(client).createJob(tokenAddress, DEPOSIT, SPEC_URI)).wait();

      await expect(agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit"))
        .to.emit(agency, "SubAgentAssigned")
        .withArgs(1n, 0n, subAgentA.address, tokenAddress, FEE_A, "security-audit");

      await expect(agency.connect(owner).assignSubAgent(1n, subAgentB.address, FEE_B, "market-intelligence"))
        .to.emit(agency, "SubAgentAssigned")
        .withArgs(1n, 1n, subAgentB.address, tokenAddress, FEE_B, "market-intelligence");

      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Dispatched);

      const resultHash = ethers.id("audit-report");
      const tx = agency.connect(subAgentA).completeTask(1n, 0n, resultHash, HCS_TOPIC, 101n);
      await expect(tx)
        .to.emit(agency, "TaskCompleted")
        .withArgs(1n, 0n, resultHash, HCS_TOPIC, 101n);
      await expect(tx)
        .to.emit(agency, "HcsLogAnchored")
        .withArgs(1n, resultHash, HCS_TOPIC, 101n);

      expect((await agency.getTask(1n, 0n)).status).to.equal(TaskStatus.Completed);
      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Dispatched); // one task still open

      await (await agency.connect(subAgentB).completeTask(1n, 1n, ethers.id("market-report"), HCS_TOPIC, 102n)).wait();
      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Completed);
    });

    it("settles every completed task and computes the margin exactly", async function () {
      const ctx = await loadFixture(erc20Fixture);
      const { agency, treasury, token, owner, subAgentA, subAgentB } = ctx;
      const tokenAddress = await token.getAddress();
      const jobId = await runJobToCompletion(ctx);

      const tx = agency.connect(owner).settleJob(jobId);

      await expect(tx)
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 0n, subAgentA.address, tokenAddress, FEE_A, false);
      await expect(tx)
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 1n, subAgentB.address, tokenAddress, FEE_B, false);
      await expect(tx)
        .to.emit(agency, "JobSettled")
        .withArgs(jobId, DEPOSIT, EXPECTED_PAID, EXPECTED_MARGIN);

      expect(await token.balanceOf(subAgentA.address)).to.equal(FEE_A);
      expect(await token.balanceOf(subAgentB.address)).to.equal(FEE_B);
      expect(await token.balanceOf(await treasury.getAddress())).to.equal(EXPECTED_MARGIN);

      expect(await treasury.retainedMargin(tokenAddress)).to.equal(EXPECTED_MARGIN);
      expect(await treasury.escrowBalance(jobId)).to.equal(0n);
      expect(await treasury.isEscrowOpen(jobId)).to.equal(false);
      expect(await treasury.totalObligations(tokenAddress)).to.equal(EXPECTED_MARGIN);

      const job = await agency.getJob(jobId);
      expect(job.status).to.equal(JobStatus.Settled);
      expect(job.paidOut).to.equal(EXPECTED_PAID);
      expect(job.netMargin).to.equal(EXPECTED_MARGIN);
      expect(job.deposit - job.paidOut).to.equal(job.netMargin);

      expect((await agency.getTask(jobId, 0n)).status).to.equal(TaskStatus.Paid);
      expect((await agency.getTask(jobId, 1n)).status).to.equal(TaskStatus.Paid);
    });

    it("keeps the fee of an assigned-but-unfinished task as margin", async function () {
      const { agency, treasury, token, owner, client, subAgentA, subAgentB } =
        await loadFixture(erc20Fixture);
      const tokenAddress = await token.getAddress();

      await (await agency.connect(client).createJob(tokenAddress, DEPOSIT, SPEC_URI)).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit")).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentB.address, FEE_B, "market-intelligence")).wait();
      await (await agency.connect(subAgentA).completeTask(1n, 0n, ethers.id("audit"), HCS_TOPIC, 1n)).wait();

      await expect(agency.connect(owner).settleJob(1n))
        .to.emit(agency, "JobSettled")
        .withArgs(1n, DEPOSIT, FEE_A, DEPOSIT - FEE_A);

      expect(await token.balanceOf(subAgentB.address)).to.equal(0n);
      expect(await treasury.retainedMargin(tokenAddress)).to.equal(DEPOSIT - FEE_A);
    });

    it("refuses to commit more in fees than the client deposited", async function () {
      const { agency, token, owner, client, subAgentA } = await loadFixture(erc20Fixture);
      await (await agency.connect(client).createJob(await token.getAddress(), DEPOSIT, SPEC_URI)).wait();

      await expect(agency.connect(owner).assignSubAgent(1n, subAgentA.address, DEPOSIT + 1n, "too-expensive"))
        .to.be.revertedWithCustomError(agency, "FeeExceedsDeposit");
    });

    it("refunds an unsettled job back to its client", async function () {
      const { agency, treasury, token, client, subAgentA, owner } = await loadFixture(erc20Fixture);
      const tokenAddress = await token.getAddress();
      const before = await token.balanceOf(client.address);

      await (await agency.connect(client).createJob(tokenAddress, DEPOSIT, SPEC_URI)).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit")).wait();

      await expect(agency.connect(client).refundJob(1n))
        .to.emit(agency, "JobRefunded")
        .withArgs(1n, client.address, tokenAddress, DEPOSIT);

      expect(await token.balanceOf(client.address)).to.equal(before);
      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Refunded);
      expect((await agency.getTask(1n, 0n)).status).to.equal(TaskStatus.Cancelled);
      expect(await treasury.totalObligations(tokenAddress)).to.equal(0n);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Hedera Token Service settlement path", function () {
    it("detects the system contract and distinguishes HTS tokens from plain ERC-20s", async function () {
      const { treasury, htsToken, plainToken } = await loadFixture(htsFixture);

      expect(await treasury.htsAvailable()).to.equal(true);
      expect(await treasury.isHtsToken(await htsToken.getAddress())).to.equal(true);
      expect(await treasury.isHtsToken(await plainToken.getAddress())).to.equal(false);
    });

    it("associates the treasury through the precompile and is idempotent", async function () {
      const { treasury, htsToken, owner } = await loadFixture(htsFixture);
      const tokenAddress = await htsToken.getAddress();

      expect(await htsToken.isAssociated(await treasury.getAddress())).to.equal(false);

      await expect(treasury.connect(owner).associateToken(tokenAddress))
        .to.emit(treasury, "TokenAssociated")
        .withArgs(tokenAddress, HTS_SUCCESS);
      expect(await htsToken.isAssociated(await treasury.getAddress())).to.equal(true);

      // Re-association returns TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT (194), treated as success.
      await expect(treasury.connect(owner).associateToken(tokenAddress))
        .to.emit(treasury, "TokenAssociated")
        .withArgs(tokenAddress, HTS_ALREADY_ASSOCIATED);
    });

    it("cannot be funded with an HTS token before the treasury is associated", async function () {
      const { agency, client, htsToken } = await loadFixture(htsFixture);
      await expect(
        agency.connect(client).createJob(await htsToken.getAddress(), DEPOSIT, SPEC_URI)
      ).to.be.revertedWithCustomError(htsToken, "NotAssociated");
    });

    it("settles sub-agents through the HTS precompile with viaHts === true", async function () {
      const ctx = await loadFixture(htsFixture);
      const { agency, treasury, htsToken, owner, subAgentA, subAgentB } = ctx;
      const tokenAddress = await htsToken.getAddress();

      await (await treasury.connect(owner).associateToken(tokenAddress)).wait();
      await (await htsToken.connect(subAgentA).associate()).wait();
      await (await htsToken.connect(subAgentB).associate()).wait();

      const jobId = await runJobToCompletion({ ...ctx, token: htsToken });
      const tx = agency.connect(owner).settleJob(jobId);

      await expect(tx)
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 0n, subAgentA.address, tokenAddress, FEE_A, true);
      await expect(tx)
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 1n, subAgentB.address, tokenAddress, FEE_B, true);
      await expect(tx).to.not.emit(treasury, "HtsPayoutFallback");

      expect(await htsToken.balanceOf(subAgentA.address)).to.equal(FEE_A);
      expect(await htsToken.balanceOf(subAgentB.address)).to.equal(FEE_B);
      expect(await treasury.retainedMargin(tokenAddress)).to.equal(EXPECTED_MARGIN);
    });

    it("still uses the ERC-20 fallback for non-HTS tokens on a Hedera-like chain", async function () {
      const ctx = await loadFixture(htsFixture);
      const { agency, treasury, plainToken, owner, subAgentA } = ctx;
      const jobId = await runJobToCompletion({ ...ctx, token: plainToken });

      await expect(agency.connect(owner).settleJob(jobId))
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 0n, subAgentA.address, await plainToken.getAddress(), FEE_A, false);
    });

    it("reverts settlement when a sub-agent has not associated the HTS token", async function () {
      const ctx = await loadFixture(htsFixture);
      const { agency, treasury, htsToken, owner, subAgentA } = ctx;

      await (await treasury.connect(owner).associateToken(await htsToken.getAddress())).wait();
      await (await htsToken.connect(subAgentA).associate()).wait();
      // subAgentB is deliberately left unassociated.

      const jobId = await runJobToCompletion({ ...ctx, token: htsToken });
      await expect(agency.connect(owner).settleJob(jobId))
        .to.be.revertedWithCustomError(htsToken, "NotAssociated");
    });

    it("falls back to ERC-20 when the operator disables the HTS route", async function () {
      const ctx = await loadFixture(htsFixture);
      const { agency, treasury, htsToken, owner, subAgentA, subAgentB } = ctx;
      const tokenAddress = await htsToken.getAddress();

      await (await treasury.connect(owner).associateToken(tokenAddress)).wait();
      await (await htsToken.connect(subAgentA).associate()).wait();
      await (await htsToken.connect(subAgentB).associate()).wait();

      const jobId = await runJobToCompletion({ ...ctx, token: htsToken });

      await expect(treasury.connect(owner).setHtsEnabled(false))
        .to.emit(treasury, "HtsEnabledUpdated")
        .withArgs(false);

      await expect(agency.connect(owner).settleJob(jobId))
        .to.emit(treasury, "MicroSettlement")
        .withArgs(jobId, 0n, subAgentA.address, tokenAddress, FEE_A, false);
    });

    it("reverts association on a chain with no HTS system contract", async function () {
      const { treasury, token, owner } = await loadFixture(erc20Fixture);
      const lib = await ethers.getContractFactory("HederaTokenServiceLib");
      await expect(treasury.connect(owner).associateToken(await token.getAddress()))
        .to.be.revertedWithCustomError(lib, "HtsCallFailed");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("World ID proof of personhood", function () {
    it("verifies an operator in bypass mode and flags the missing proof", async function () {
      const { agency, owner } = await loadFixture(erc20Fixture);
      const nullifier = 111222333n;

      const tx = agency.connect(owner).verifyOperator(owner.address, 1n, nullifier, DUMMY_PROOF, ENS_NAME);
      await expect(tx).to.emit(agency, "OperatorVerified").withArgs(owner.address, nullifier, ENS_NAME);
      await expect(tx).to.emit(agency, "OperatorVerifiedWithoutProof").withArgs(owner.address, nullifier);

      expect(await agency.isVerifiedOperator(owner.address)).to.equal(true);
      expect(await agency.operatorNullifier(owner.address)).to.equal(nullifier);
      expect(await agency.operatorEnsName(owner.address)).to.equal(ENS_NAME);
      expect(await agency.nullifierHashUsed(nullifier)).to.equal(true);
    });

    it("rejects a replayed nullifier hash", async function () {
      const { agency, owner, outsider } = await loadFixture(erc20Fixture);
      const nullifier = 987654321n;

      await (await agency.connect(owner).verifyOperator(owner.address, 1n, nullifier, DUMMY_PROOF, ENS_NAME)).wait();

      // Same signal, same nullifier.
      await expect(agency.connect(owner).verifyOperator(owner.address, 1n, nullifier, DUMMY_PROOF, ENS_NAME))
        .to.be.revertedWithCustomError(agency, "NullifierAlreadyUsed")
        .withArgs(nullifier);

      // A different signal cannot recycle the nullifier either — this is the Sybil guard.
      await expect(agency.connect(outsider).verifyOperator(outsider.address, 1n, nullifier, DUMMY_PROOF, "b.eth"))
        .to.be.revertedWithCustomError(agency, "NullifierAlreadyUsed")
        .withArgs(nullifier);
      expect(await agency.isVerifiedOperator(outsider.address)).to.equal(false);
    });

    it("rejects a zero nullifier and a zero signal", async function () {
      const { agency, owner } = await loadFixture(erc20Fixture);
      await expect(agency.connect(owner).verifyOperator(owner.address, 1n, 0n, DUMMY_PROOF, ENS_NAME))
        .to.be.revertedWithCustomError(agency, "InvalidNullifier");
      await expect(agency.connect(owner).verifyOperator(ZERO, 1n, 1n, DUMMY_PROOF, ENS_NAME))
        .to.be.revertedWithCustomError(agency, "ZeroAddress");
    });

    it("routes proofs to a configured World ID router and honours its verdict", async function () {
      const [owner] = await ethers.getSigners();
      const MockWorldID = await ethers.getContractFactory("MockWorldID");
      const router = await MockWorldID.deploy();
      await router.waitForDeployment();

      const { agency } = await deployCore({ owner, worldIdRouter: await router.getAddress() });
      expect(await agency.worldIdVerificationBypassed()).to.equal(false);

      // Router accepts -> operator registered, and NO bypass event is emitted.
      const good = agency.connect(owner).verifyOperator(owner.address, 1n, 42n, DUMMY_PROOF, ENS_NAME);
      await expect(good).to.emit(agency, "OperatorVerified").withArgs(owner.address, 42n, ENS_NAME);
      await expect(good).to.not.emit(agency, "OperatorVerifiedWithoutProof");

      // Router rejects -> the whole verification reverts.
      await (await router.setShouldRevert(true)).wait();
      await expect(agency.connect(owner).verifyOperator(owner.address, 1n, 43n, DUMMY_PROOF, ENS_NAME))
        .to.be.revertedWithCustomError(router, "InvalidProof");
      expect(await agency.nullifierHashUsed(43n)).to.equal(false); // reverted, so not consumed
    });

    it("exposes and flips the bypass flag via setWorldId", async function () {
      const [owner] = await ethers.getSigners();
      const MockWorldID = await ethers.getContractFactory("MockWorldID");
      const router = await MockWorldID.deploy();
      await router.waitForDeployment();

      const { agency } = await deployCore({ owner });
      expect(await agency.worldIdVerificationBypassed()).to.equal(true);

      await expect(agency.connect(owner).setWorldId(await router.getAddress(), 1n))
        .to.emit(agency, "WorldIdRouterUpdated")
        .withArgs(await router.getAddress(), 1n);
      expect(await agency.worldIdVerificationBypassed()).to.equal(false);

      await expect(agency.connect(owner).setWorldId(ZERO, 1n)).to.emit(agency, "WorldIdBypassActive");
      expect(await agency.worldIdVerificationBypassed()).to.equal(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Profit claims & treasury rebalancing", function () {
    async function settledFixture() {
      const ctx = await loadFixture(erc20Fixture);
      const jobId = await runJobToCompletion(ctx);
      await (await ctx.agency.connect(ctx.owner).settleJob(jobId)).wait();
      return { ...ctx, jobId };
    }

    it("blocks claimProfit until the operator clears World ID", async function () {
      const { treasury, token, owner } = await settledFixture();
      await expect(treasury.connect(owner).claimProfit(await token.getAddress(), EXPECTED_MARGIN, owner.address))
        .to.be.revertedWithCustomError(treasury, "OperatorNotVerified")
        .withArgs(owner.address);
    });

    it("pays the verified operator and echoes the nullifier into ProfitClaimed", async function () {
      const { treasury, agency, token, owner } = await settledFixture();
      const tokenAddress = await token.getAddress();
      const nullifier = 555000555n;

      await (await agency.connect(owner).verifyOperator(owner.address, 1n, nullifier, DUMMY_PROOF, ENS_NAME)).wait();

      const before = await token.balanceOf(owner.address);
      await expect(treasury.connect(owner).claimProfit(tokenAddress, EXPECTED_MARGIN, owner.address))
        .to.emit(treasury, "ProfitClaimed")
        .withArgs(owner.address, tokenAddress, EXPECTED_MARGIN, nullifier);

      expect(await token.balanceOf(owner.address)).to.equal(before + EXPECTED_MARGIN);
      expect(await treasury.retainedMargin(tokenAddress)).to.equal(0n);
      expect(await treasury.totalObligations(tokenAddress)).to.equal(0n);
    });

    it("rejects a claim larger than the retained margin", async function () {
      const { treasury, agency, token, owner } = await settledFixture();
      await (await agency.connect(owner).verifyOperator(owner.address, 1n, 7n, DUMMY_PROOF, ENS_NAME)).wait();
      await expect(treasury.connect(owner).claimProfit(await token.getAddress(), EXPECTED_MARGIN + 1n, owner.address))
        .to.be.revertedWithCustomError(treasury, "InsufficientMargin");
    });

    it("records a 1inch rebalance and moves the margin between tokens", async function () {
      const { treasury, token, owner } = await settledFixture();
      const fromToken = await token.getAddress();

      const Token = await ethers.getContractFactory("MockERC20");
      const toToken = await Token.deploy("Mock Wrapped HBAR", "mWHBAR", 8);
      await toToken.waitForDeployment();
      const toAddress = await toToken.getAddress();

      const amountIn = 100_000_000n;
      const amountOut = 99_500_000n;
      const txHash = ethers.id("0x1inch-swap-receipt");
      const chainId = (await ethers.provider.getNetwork()).chainId;

      // Mirror the off-chain swap so the treasury really holds what it now accounts for.
      await (await toToken.mint(await treasury.getAddress(), amountOut)).wait();

      await expect(treasury.connect(owner).rebalance(fromToken, toAddress, amountIn, amountOut, chainId, txHash))
        .to.emit(treasury, "TreasuryRebalanced")
        .withArgs(fromToken, toAddress, amountIn, amountOut, chainId, txHash);

      expect(await treasury.retainedMargin(fromToken)).to.equal(EXPECTED_MARGIN - amountIn);
      expect(await treasury.retainedMargin(toAddress)).to.equal(amountOut);
    });

    it("rejects a rebalance that exceeds the retained margin", async function () {
      const { treasury, token, owner } = await settledFixture();
      const chainId = (await ethers.provider.getNetwork()).chainId;
      await expect(
        treasury.connect(owner).rebalance(
          await token.getAddress(), await token.getAddress(),
          EXPECTED_MARGIN + 1n, 0n, chainId, ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(treasury, "InsufficientMargin");
    });

    it("sweeps only surplus above the solvency floor", async function () {
      const { treasury, token, owner, outsider } = await settledFixture();
      const tokenAddress = await token.getAddress();
      await (await token.mint(await treasury.getAddress(), 12345n)).wait();

      await expect(treasury.connect(owner).sweepSurplus(tokenAddress, outsider.address))
        .to.emit(treasury, "SurplusSwept")
        .withArgs(tokenAddress, outsider.address, 12345n);

      expect(await token.balanceOf(outsider.address)).to.equal(12345n);
      expect(await treasury.retainedMargin(tokenAddress)).to.equal(EXPECTED_MARGIN);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Access control", function () {
    it("restricts agency operator functions to the owner", async function () {
      const ctx = await loadFixture(erc20Fixture);
      const { agency, outsider, subAgentA } = ctx;
      const jobId = await runJobToCompletion(ctx);

      await expect(agency.connect(outsider).assignSubAgent(jobId, subAgentA.address, 1n, "x"))
        .to.be.revertedWithCustomError(agency, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);

      await expect(agency.connect(outsider).settleJob(jobId))
        .to.be.revertedWithCustomError(agency, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);

      await expect(agency.connect(outsider).cancelTask(jobId, 0n))
        .to.be.revertedWithCustomError(agency, "OwnableUnauthorizedAccount");

      await expect(agency.connect(outsider).setWorldId(ZERO, 1n))
        .to.be.revertedWithCustomError(agency, "OwnableUnauthorizedAccount");
    });

    it("lets only the assigned sub-agent or the operator complete a task", async function () {
      const { agency, token, owner, client, subAgentA, outsider } = await loadFixture(erc20Fixture);
      await (await agency.connect(client).createJob(await token.getAddress(), DEPOSIT, SPEC_URI)).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit")).wait();

      await expect(agency.connect(outsider).completeTask(1n, 0n, ethers.ZeroHash, HCS_TOPIC, 1n))
        .to.be.revertedWithCustomError(agency, "NotTaskOwner")
        .withArgs(1n, 0n, outsider.address);

      // The operator may report on a sub-agent's behalf.
      await expect(agency.connect(owner).completeTask(1n, 0n, ethers.id("r"), HCS_TOPIC, 1n))
        .to.emit(agency, "TaskCompleted");
    });

    it("rejects an empty HCS topic id", async function () {
      const { agency, token, owner, client, subAgentA } = await loadFixture(erc20Fixture);
      await (await agency.connect(client).createJob(await token.getAddress(), DEPOSIT, SPEC_URI)).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit")).wait();
      await expect(agency.connect(subAgentA).completeTask(1n, 0n, ethers.ZeroHash, "", 1n))
        .to.be.revertedWithCustomError(agency, "EmptyHcsTopic");
    });

    it("lets only the wired agency drive the treasury escrow", async function () {
      const { treasury, token, outsider, owner } = await loadFixture(erc20Fixture);
      const tokenAddress = await token.getAddress();

      await expect(treasury.connect(outsider).recordEscrow(1n, tokenAddress, DEPOSIT))
        .to.be.revertedWithCustomError(treasury, "NotAgency")
        .withArgs(outsider.address);

      await expect(treasury.connect(owner).settleSubAgent(1n, 0n, outsider.address, 1n))
        .to.be.revertedWithCustomError(treasury, "NotAgency")
        .withArgs(owner.address);

      await expect(treasury.connect(outsider).closeEscrow(1n))
        .to.be.revertedWithCustomError(treasury, "NotAgency");

      await expect(treasury.connect(outsider).refundEscrow(1n, outsider.address))
        .to.be.revertedWithCustomError(treasury, "NotAgency");
    });

    it("restricts treasury owner functions", async function () {
      const { treasury, token, outsider } = await loadFixture(erc20Fixture);
      const tokenAddress = await token.getAddress();

      await expect(treasury.connect(outsider).claimProfit(tokenAddress, 1n, outsider.address))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(treasury.connect(outsider).rebalance(tokenAddress, tokenAddress, 1n, 1n, 296n, ethers.ZeroHash))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(treasury.connect(outsider).setAgency(outsider.address))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(treasury.connect(outsider).setHtsEnabled(false))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(treasury.connect(outsider).associateToken(tokenAddress))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
      await expect(treasury.connect(outsider).sweepSurplus(tokenAddress, outsider.address))
        .to.be.revertedWithCustomError(treasury, "OwnableUnauthorizedAccount");
    });

    it("lets only the operator or the client refund a job", async function () {
      const { agency, token, client, outsider } = await loadFixture(erc20Fixture);
      await (await agency.connect(client).createJob(await token.getAddress(), DEPOSIT, SPEC_URI)).wait();
      await expect(agency.connect(outsider).refundJob(1n))
        .to.be.revertedWithCustomError(agency, "NotClientOrOperator")
        .withArgs(1n, outsider.address);
    });

    it("rejects operations on unknown jobs and tasks", async function () {
      const { agency, owner, subAgentA } = await loadFixture(erc20Fixture);
      await expect(agency.connect(owner).assignSubAgent(99n, subAgentA.address, 1n, "x"))
        .to.be.revertedWithCustomError(agency, "UnknownJob")
        .withArgs(99n);
      await expect(agency.connect(owner).settleJob(99n))
        .to.be.revertedWithCustomError(agency, "UnknownJob");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Reentrancy", function () {
    it("blocks a hostile token that re-enters the agency mid-settlement", async function () {
      const [owner, client, subAgentA] = await ethers.getSigners();

      const Hostile = await ethers.getContractFactory("ReentrantERC20");
      const hostile = await Hostile.deploy();
      await hostile.waitForDeployment();
      await (await hostile.mint(client.address, DEPOSIT)).wait();

      const { treasury, agency } = await deployCore({ owner });
      await (await hostile.connect(client).approve(await agency.getAddress(), ethers.MaxUint256)).wait();

      await (await agency.connect(client).createJob(await hostile.getAddress(), DEPOSIT, SPEC_URI)).wait();
      await (await agency.connect(owner).assignSubAgent(1n, subAgentA.address, FEE_A, "security-audit")).wait();
      await (await agency.connect(subAgentA).completeTask(1n, 0n, ethers.id("r"), HCS_TOPIC, 1n)).wait();

      // Arm the callback so the payout transfer re-enters AetherisAgency.refundJob().
      await (await hostile.arm(await agency.getAddress(), 1n)).wait();

      await expect(agency.connect(owner).settleJob(1n))
        .to.emit(agency, "JobSettled")
        .withArgs(1n, DEPOSIT, FEE_A, DEPOSIT - FEE_A);

      expect(await hostile.reentryAttempted()).to.equal(true);
      expect(await hostile.reentryReverted()).to.equal(true);
      expect(await hostile.lastRevertData()).to.equal(REENTRANCY_SELECTOR);

      // The re-entry changed nothing: settlement completed exactly once.
      expect(await hostile.balanceOf(subAgentA.address)).to.equal(FEE_A);
      expect(await treasury.retainedMargin(await hostile.getAddress())).to.equal(DEPOSIT - FEE_A);
      expect(await agency.jobStatus(1n)).to.equal(JobStatus.Settled);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  describe("Frozen event signatures (IAetherisEvents)", function () {
    const EXPECTED = {
      AgencyDeployed: "AgencyDeployed(address,address,string,uint256)",
      OperatorVerified: "OperatorVerified(address,uint256,string)",
      JobCreated: "JobCreated(uint256,address,address,uint256,string)",
      SubAgentAssigned: "SubAgentAssigned(uint256,uint256,address,address,uint256,string)",
      TaskCompleted: "TaskCompleted(uint256,uint256,bytes32,string,uint64)",
      MicroSettlement: "MicroSettlement(uint256,uint256,address,address,uint256,bool)",
      JobSettled: "JobSettled(uint256,uint256,uint256,uint256)",
      TreasuryRebalanced: "TreasuryRebalanced(address,address,uint256,uint256,uint256,bytes32)",
      ProfitClaimed: "ProfitClaimed(address,address,uint256,uint256)",
      HcsLogAnchored: "HcsLogAnchored(uint256,bytes32,string,uint64)",
    };

    const INDEXED = {
      AgencyDeployed: [true, true, false, false],
      OperatorVerified: [true, false, false],
      JobCreated: [true, true, true, false, false],
      SubAgentAssigned: [true, true, true, false, false, false],
      TaskCompleted: [true, true, false, false, false],
      MicroSettlement: [true, true, true, false, false, false],
      JobSettled: [true, false, false, false],
      TreasuryRebalanced: [true, true, false, false, false, false],
      ProfitClaimed: [true, true, false, false],
      HcsLogAnchored: [true, false, false, false],
    };

    it("matches the frozen interface byte-for-byte across both contracts", async function () {
      const { agency, treasury } = await loadFixture(erc20Fixture);
      const iface = new ethers.Interface(
        [...agency.interface.fragments, ...treasury.interface.fragments].filter((f) => f.type === "event")
      );

      for (const [name, signature] of Object.entries(EXPECTED)) {
        const fragment = iface.getEvent(name);
        expect(fragment, `${name} is not emitted by either contract`).to.not.equal(null);
        expect(fragment.format("sighash"), `${name} signature drift`).to.equal(signature);
        expect(fragment.topicHash, `${name} topic0 drift`).to.equal(ethers.id(signature));
        expect(fragment.inputs.map((i) => i.indexed === true), `${name} indexed drift`)
          .to.deep.equal(INDEXED[name]);
      }
    });
  });
});
