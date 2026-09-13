import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, GITHUB_CONTRACTS, TREASURY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "Contracts & HTTP API",
  description:
    "Deployed addresses, a function reference for AetherisAgency and AetherisTreasury, the frozen event list, and every HTTP route the app exposes with its request body, success shape and error codes.",
};

const AGENCY_BLOCK = 40396781;
const TREASURY_BLOCK = 40396776;
const HTS_PRECOMPILE = "0x0000000000000000000000000000000000000167";
const HTS_TOKEN_ID = "0.0.10484673";
const HTS_TOKEN_EVM = "0x00000000000000000000000000000000009ffBC1";
const ERC20_TOKEN = "0x21DCc52AbbCAef92B4573dc8B0e1658417c85961";
const OPERATOR_ACCOUNT = "0.0.10484502";
const OPERATOR_EVM = "0x69677C85945796066B449c00F90A0582896F1F9b";
const SUB_AGENT_ACCOUNTS = ["0.0.10484674", "0.0.10484676", "0.0.10484678"] as const;
const HCS_TOPIC = "0.0.10518320";

interface FnRow {
  sig: string;
  caller: string;
  emits: string;
  notes: React.ReactNode;
}

/**
 * Function reference. Each function is a stacked entry (signature, caller,
 * emits, notes) so the whole reference fits the 760px prose column and a
 * phone screen without horizontal scrolling.
 */
function FnTable({ caption, rows }: { caption: string; rows: ReadonlyArray<FnRow> }) {
  return (
    <ul aria-label={caption} className="mt-6 w-full list-none rounded-[12px] border border-fl-border bg-fl-card p-0">
      {rows.map((row) => (
        <li key={row.sig} className="border-b border-fl-border px-4 py-4 last:border-b-0 sm:px-5">
          <dl className="m-0">
            <div>
              <dt className="mono-label">Function</dt>
              <dd className="m-0 mt-1 font-mono text-[0.82rem] leading-[1.6] text-fl-fg [overflow-wrap:anywhere]">
                {row.sig}
              </dd>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="mono-label">Who may call</dt>
                <dd className="m-0 mt-1 text-[0.9rem] leading-[1.6] text-fl-fg2">{row.caller}</dd>
              </div>
              <div>
                <dt className="mono-label">Emits</dt>
                <dd className="m-0 mt-1 whitespace-pre-wrap font-mono text-[0.8rem] leading-[1.6] text-fl-fg2 [overflow-wrap:anywhere]">
                  {row.emits}
                </dd>
              </div>
            </div>
            <div className="mt-3">
              <dt className="mono-label">Notes</dt>
              <dd className="m-0 mt-1 text-[0.9rem] leading-[1.65] text-fl-fg2">{row.notes}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

const AGENCY_FUNCTIONS: ReadonlyArray<FnRow> = [
  {
    sig: "constructor(initialOwner, treasury, worldIdRouter, worldIdGroupId, worldIdAppId, worldIdAction, ensName)",
    caller: "Deployer",
    emits: "AgencyDeployed\nWorldIdBypassActive (if router = 0)",
    notes: (
      <>
        Binds the agency to its treasury and derives <Code>externalNullifierHash</Code> from the World ID
        app id and action. <Code>AgencyDeployed</Code> carries nullifier <Code>0</Code>; personhood is
        established afterwards.
      </>
    ),
  },
  {
    sig: "verifyOperator(address signal, uint256 root, uint256 nullifierHash, uint256[8] proof, string ensName)",
    caller: "Anyone (the app relays it with the deployer key)",
    emits: "OperatorVerified\nOperatorVerifiedWithoutProof (bypass)",
    notes: (
      <>
        Burns <Code>nullifierHash</Code> first (<Code>NullifierAlreadyUsed</Code> on replay,{" "}
        <Code>InvalidNullifier</Code> for 0), then calls the router&apos;s <Code>verifyProof</Code> if one
        is set. Marks <Code>signal</Code> verified and records its ENS name.
      </>
    ),
  },
  {
    sig: "setWorldId(address router, uint256 groupId)",
    caller: "Owner",
    emits: "WorldIdRouterUpdated\nWorldIdBypassActive (if router = 0)",
    notes: "Points the agency at a World ID router, or clears it to re-enter bypass mode.",
  },
  {
    sig: "createJob(address token, uint256 deposit, string specURI) returns (uint256 jobId)",
    caller: "Anyone - the caller becomes the client",
    emits: "JobCreated",
    notes: (
      <>
        <Code>nonReentrant</Code>. Pulls <Code>deposit</Code> via <Code>safeTransferFrom</Code> straight
        into the treasury, then calls <Code>treasury.recordEscrow</Code>. The client must approve the{" "}
        <strong>agency</strong>, not the treasury. Job ids start at 1.
      </>
    ),
  },
  {
    sig: "assignSubAgent(uint256 jobId, address subAgent, uint256 fee, string role) returns (uint256 taskId)",
    caller: "Owner",
    emits: "SubAgentAssigned",
    notes: (
      <>
        Job must be Funded or Dispatched. Reverts with <Code>FeeExceedsDeposit</Code> if committed fees
        would exceed the deposit, so a job is always solvent before work begins. Moves the job to
        Dispatched.
      </>
    ),
  },
  {
    sig: "completeTask(uint256 jobId, uint256 taskId, bytes32 resultHash, string hcsTopicId, uint64 hcsSequenceNumber)",
    caller: "The task's sub-agent or the owner",
    emits: "TaskCompleted\nHcsLogAnchored",
    notes: (
      <>
        Task must be Assigned; <Code>EmptyHcsTopic</Code> if the topic id is empty. Marks the job
        Completed when every task is complete. The sequence number is the one returned by the HCS
        receipt - see <A href="/docs/audit-log#anchor-first">Audit log</A>.
      </>
    ),
  },
  {
    sig: "cancelTask(uint256 jobId, uint256 taskId)",
    caller: "Owner",
    emits: "TaskCancelled",
    notes: "Task must be Assigned. Releases its fee back into the job's uncommitted balance (future margin).",
  },
  {
    sig: "settleJob(uint256 jobId) returns (uint256 paidToSubAgents, uint256 netMargin)",
    caller: "Owner",
    emits: "JobSettled\n(+ one MicroSettlement per paid task, from the treasury)",
    notes: (
      <>
        <Code>nonReentrant</Code>. Job must be Dispatched or Completed; status is set to Settled before
        any payout. Pays every Completed task through <Code>treasury.settleSubAgent</Code>, then{" "}
        <Code>closeEscrow</Code> sweeps the remainder into retained margin. Unfinished work is never paid.
      </>
    ),
  },
  {
    sig: "refundJob(uint256 jobId) returns (uint256 refunded)",
    caller: "The client or the owner",
    emits: "TaskCancelled (per open task)\nJobRefunded",
    notes: (
      <>
        <Code>nonReentrant</Code>. Job must be Funded or Dispatched (<Code>InvalidJobStatus</Code>{" "}
        otherwise); any other caller gets <Code>NotClientOrOperator</Code>. Cancels Assigned and Completed tasks and returns the whole escrow to the client.
      </>
    ),
  },
  {
    sig: "getJob(jobId) / getTask(jobId, taskId) / getTasks(jobId) / taskLength(jobId) / jobStatus(jobId)",
    caller: "View",
    emits: "-",
    notes: (
      <>
        <Code>Job</Code> and <Code>Task</Code> structs and counts. <Code>UnknownJob</Code> /{" "}
        <Code>UnknownTask</Code> on bad ids.
      </>
    ),
  },
  {
    sig: "isVerifiedOperator(address) / operatorNullifier(address) / operatorEnsName(address) / nullifierHashUsed(uint256)",
    caller: "View",
    emits: "-",
    notes: (
      <>
        The operator registry the treasury reads before releasing profit (<Code>IAetherisOperatorRegistry</Code>).
      </>
    ),
  },
  {
    sig: "worldIdVerificationBypassed() / externalNullifierHash() / worldIdGroupId() / jobCount()",
    caller: "View",
    emits: "-",
    notes: (
      <>
        <Code>worldIdVerificationBypassed()</Code> is true whenever no router is configured - it is true on
        the testnet deployment.
      </>
    ),
  },
];

const TREASURY_FUNCTIONS: ReadonlyArray<FnRow> = [
  {
    sig: "constructor(address initialOwner)",
    caller: "Deployer",
    emits: "-",
    notes: "The owner is the human operator who will own the retained margin.",
  },
  {
    sig: "setAgency(address newAgency)",
    caller: "Owner",
    emits: "AgencyUpdated",
    notes: (
      <>
        Wires the one contract allowed to open, spend and close escrows. Also the registry consulted by{" "}
        <Code>claimProfit</Code>.
      </>
    ),
  },
  {
    sig: "setHtsEnabled(bool enabled)",
    caller: "Owner",
    emits: "HtsEnabledUpdated",
    notes: "Circuit breaker. When false, every payout goes straight to ERC-20 transfer.",
  },
  {
    sig: "associateToken(address token) returns (int64 responseCode)",
    caller: "Owner",
    emits: "TokenAssociated",
    notes: (
      <>
        Must be called once per HTS token before the treasury can be funded in it. Accepts response code
        22 (SUCCESS) or 194 (TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT). Reverts <Code>HtsCallFailed</Code> on
        a chain without the HTS system contract.
      </>
    ),
  },
  {
    sig: "dissociateToken(address token) returns (int64 responseCode)",
    caller: "Owner",
    emits: "TokenDissociated",
    notes: "Fails at the HTS level if the treasury still holds a balance of the token.",
  },
  {
    sig: "recordEscrow(uint256 jobId, address token, uint256 amount)",
    caller: "Agency only",
    emits: "EscrowRecorded",
    notes: (
      <>
        Called after the agency has moved the deposit in. Adds to <Code>totalObligations[token]</Code> and
        reverts <Code>SolvencyCheckFailed</Code> if <Code>balanceOf(this)</Code> is below the new total -
        the transfer is proven by balance, not trusted.
      </>
    ),
  },
  {
    sig: "settleSubAgent(uint256 jobId, uint256 taskId, address subAgent, uint256 amount) returns (bool viaHts)",
    caller: "Agency only",
    emits: "MicroSettlement\nHtsPayoutFallback (if HTS failed)",
    notes: (
      <>
        <Code>nonReentrant</Code>. Debits the job&apos;s escrow and pays HTS-first with an ERC-20 fallback;{" "}
        <Code>viaHts</Code> records which rail moved the funds. <Code>InsufficientEscrow</Code> if the
        escrow cannot cover it.
      </>
    ),
  },
  {
    sig: "closeEscrow(uint256 jobId) returns (uint256 margin)",
    caller: "Agency only",
    emits: "-",
    notes: (
      <>
        Moves whatever is left in the escrow into <Code>retainedMargin[token]</Code>. Obligations are
        unchanged - the funds stay owed, now to the operator instead of the job.
      </>
    ),
  },
  {
    sig: "refundEscrow(uint256 jobId, address client) returns (uint256 refunded)",
    caller: "Agency only",
    emits: "EscrowRefunded",
    notes: (
      <>
        <Code>nonReentrant</Code>. Returns the remaining escrow to the client over the same dual rail.
      </>
    ),
  },
  {
    sig: "claimProfit(address token, uint256 amount, address to)",
    caller: "Owner, and must be a verified operator in the agency",
    emits: "ProfitClaimed",
    notes: (
      <>
        <Code>nonReentrant</Code>. <Code>AgencyNotSet</Code> if no agency is wired,{" "}
        <Code>OperatorNotVerified</Code> if <Code>isVerifiedOperator(msg.sender)</Code> is false,{" "}
        <Code>InsufficientMargin</Code> if <Code>retainedMargin[token]</Code> is short. The event echoes
        the operator&apos;s nullifier so the payout links back to the proof that authorised it.
      </>
    ),
  },
  {
    sig: "rebalance(address fromToken, address toToken, uint256 amountIn, uint256 amountOut, uint256 dstChainId, bytes32 oneInchTxHash)",
    caller: "Owner",
    emits: "TreasuryRebalanced",
    notes: (
      <>
        <Code>nonReentrant</Code>. Accounting record for a 1inch swap executed off-chain: debits{" "}
        <Code>amountIn</Code> of margin in <Code>fromToken</Code> and, for same-chain swaps only, credits{" "}
        <Code>amountOut</Code> in <Code>toToken</Code>. No token movement happens in this call.
      </>
    ),
  },
  {
    sig: "sweepSurplus(address token, address to) returns (uint256 surplus)",
    caller: "Owner",
    emits: "SurplusSwept",
    notes: (
      <>
        Moves only <Code>balanceOf(this) - totalObligations[token]</Code>, so it can never touch escrow
        or retained margin. For airdrops and accidental transfers.
      </>
    ),
  },
  {
    sig: "escrowToken(jobId) / escrowBalance(jobId) / isEscrowOpen(jobId)",
    caller: "View",
    emits: "-",
    notes: "Per-job escrow state.",
  },
  {
    sig: "htsAvailable() / isHtsToken(address) / retainedMargin(address) / totalObligations(address) / agency() / htsEnabled()",
    caller: "View",
    emits: "-",
    notes: (
      <>
        <Code>htsAvailable()</Code> probes <Code>0x167</Code> with a <Code>staticcall</Code> and is false on
        Hardhat and every non-Hedera chain. <Code>isHtsToken</Code> requires a full 64-byte{" "}
        <Code>(int64, bool)</Code> reply with code 22.
      </>
    ),
  },
];

const FROZEN_EVENTS = `// contracts/interfaces/IAetherisEvents.sol - FROZEN. Implemented verbatim by contracts/,
// indexed verbatim by subgraph/. Never change a signature without regenerating both.

// Identity & governance
event AgencyDeployed(address indexed agency, address indexed operator, string ensName, uint256 nullifierHash);
event OperatorVerified(address indexed operator, uint256 nullifierHash, string ensName);

// Job lifecycle
event JobCreated(uint256 indexed jobId, address indexed client, address indexed token, uint256 deposit, string specURI);
event SubAgentAssigned(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent, address token, uint256 fee, string role);
event TaskCompleted(uint256 indexed jobId, uint256 indexed taskId, bytes32 resultHash, string hcsTopicId, uint64 hcsSequenceNumber);
event MicroSettlement(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent, address token, uint256 amount, bool viaHts);
event JobSettled(uint256 indexed jobId, uint256 grossDeposit, uint256 paidToSubAgents, uint256 netMargin);

// Treasury operations
event TreasuryRebalanced(address indexed fromToken, address indexed toToken, uint256 amountIn, uint256 amountOut, uint256 dstChainId, bytes32 oneInchTxHash);
event ProfitClaimed(address indexed operator, address indexed token, uint256 amount, uint256 nullifierHash);
event HcsLogAnchored(uint256 indexed jobId, bytes32 messageHash, string topicId, uint64 sequenceNumber);`;

const LOCAL_EVENTS = `// AetherisAgency.sol - operational events, not part of the frozen set and not indexed
event WorldIdBypassActive(address indexed agency, string reason);
event OperatorVerifiedWithoutProof(address indexed operator, uint256 nullifierHash);
event WorldIdRouterUpdated(address indexed router, uint256 groupId);
event JobRefunded(uint256 indexed jobId, address indexed client, address indexed token, uint256 amount);
event TaskCancelled(uint256 indexed jobId, uint256 indexed taskId, address indexed subAgent);

// AetherisTreasury.sol
event TokenAssociated(address indexed token, int64 responseCode);
event TokenDissociated(address indexed token, int64 responseCode);
event HtsPayoutFallback(address indexed token, address indexed to, uint256 amount, int64 responseCode);
event AgencyUpdated(address indexed previousAgency, address indexed newAgency);
event HtsEnabledUpdated(bool enabled);
event EscrowRecorded(uint256 indexed jobId, address indexed token, uint256 amount);
event EscrowRefunded(uint256 indexed jobId, address indexed client, address indexed token, uint256 amount);
event SurplusSwept(address indexed token, address indexed to, uint256 amount);`;

const ERROR_ENVELOPE = `{
  "error": {
    "code": "BAD_REQUEST",
    "message": "\`limit\` must be an integer between 1 and 50.",
    "details": "optional, human-readable"
  }
}`;

const HCS_GET_SHAPE = `{
  "topicId": "${HCS_TOPIC}",
  "source": "live",            // or "demo", with a "notice" explaining why
  "messages": [
    { "sequenceNumber": "27", "contents": "{\\"evt\\":\\"Correction\\",...}", "consensusTimestamp": "1789280736.723520104" }
  ]
}`;

const HCS_POST_SHAPE = `// request
{ "message": "{\\"evt\\":\\"ProfitClaimed\\",\\"operator\\":\\"0x6967...1F9b\\",\\"amount\\":\\"$0.50\\",\\"nullifier\\":\\"3319...2123\\"}" }

// 201
{ "topicId": "${HCS_TOPIC}", "sequenceNumber": "28", "transactionId": "0.0.10484502@...", "frame": "<the server-composed JSON that was anchored>" }`;

const FAUCET_SHAPE = `// request
{ "address": "0x..." }

// 200
{
  "ok": true,
  "to": "0x...",
  "hbar": { "amount": "1", "tx": "0x...", "hashscan": "https://hashscan.io/testnet/transaction/0x..." },
        // or { "skipped": "wallet already holds >= 0.5 HBAR" }
  "token": { "symbol": "aUSDC", "amount": "10", "address": "${ERC20_TOKEN}", "tx": "0x...", "hashscan": "..." }
}`;

const RP_CONTEXT_SHAPE = `// request
{ "action": "aetheris-operator" }

// 200
{ "rp_context": { "rp_id": "...", "nonce": "...", "created_at": 1789280000, "expires_at": 1789280300, "signature": "..." } }`;

const OPERATOR_VERIFY_SHAPE = `// request (World ID 4.0)
{ "result": { "protocol_version": "4.0", "responses": [ ... ] }, "signal": "0x<operator address>", "ensName": "aetheris.eth" }
// or legacy (3.0)
{ "proof": { "merkle_root": "...", "nullifier_hash": "...", "proof": "...", "verification_level": "orb" }, "signal": "0x...", "ensName": "..." }

// 200
{
  "ok": true,
  "txHash": "0x...",
  "nullifierHash": "0x...",              // 32-byte hex
  "hashscan": "https://hashscan.io/testnet/transaction/0x...",
  "signal": "0x...",
  "ensName": "aetheris.eth",             // defaults to aetheris.eth when omitted
  "blockNumber": 40453000,
  "worldIdBypassed": true,               // contract ran without a router - true on testnet
  "verificationLevel": "orb"
}`;

const VERIFY_WORLDID_SHAPE = `// request: an IDKit 4.0 result, either as the body itself or wrapped as { "result": ... }
// 200
{ "success": true, "version": "4", "nullifierHash": "...", "verificationLevel": "orb" }

// request: legacy { "proof": {...}, "signal": "<string>" }
// 200
{ "success": true, "nullifierHash": "...", "verificationLevel": "orb" }`;

const SWAP_SHAPE = `// POST /api/swap/quote
{ "chainId": 8453, "src": "0x...", "dst": "0x...", "amount": "1000000" }
// 200
{ "quote": { "srcToken": "0x...", "dstToken": "0x...", "srcAmount": "1000000", "dstAmount": "...", "estimatedGas": "...", "protocols": [...] }, "chainId": 8453 }

// POST /api/swap/build
{ "chainId": 8453, "src": "0x...", "dst": "0x...", "amount": "1000000", "from": "0x<wallet>", "slippage": 1 }
// 200 - unsigned; nothing is broadcast
{ "tx": { "to": "0x...", "data": "0x...", "value": "0", "gas": "..." }, "chainId": 8453 }`;

const ENS_SHAPE = `// GET /api/ens?name=vitalik.eth   or   /api/ens?address=0x...
// 200 (cache-control: public, max-age=300, stale-while-revalidate=1800)
{ "address": "0x...", "name": "vitalik.eth", "avatar": "https://..." | null, "source": "live" }
// unresolvable names answer 200 with null fields and "source": "unconfigured"`;

export default function ContractsAndApiPage() {
  return (
    <Prose>
      <p className="mono-label">Protocol</p>
      <H1 className="mt-3">Contracts &amp; HTTP API</H1>
      <Lede>
        Two contracts on Hedera testnet hold the money and the rules; a handful of Next.js route
        handlers keep the keys that cannot live in a browser. This page is the reference for both:
        addresses, every external function, the frozen event set, and each HTTP route with its exact
        body, success shape and error codes.
      </Lede>
      <P>
        Sources: <A href={GITHUB_CONTRACTS}>contracts/</A> (<Code>AetherisAgency.sol</Code>,{" "}
        <Code>AetherisTreasury.sol</Code>, <Code>HederaTokenServiceLib.sol</Code>,{" "}
        <Code>interfaces/*.sol</Code>), covered by 37 Hardhat tests in <Code>test/aetheris.test.js</Code>.
        Route handlers are under <Code>app/api/**/route.ts</Code>; the shared error envelope is{" "}
        <Code>app/api/_lib/http.ts</Code>.
      </P>

      <H2 id="addresses">Addresses and blocks</H2>
      <KV
        caption="Deployed contracts, tokens and accounts on Hedera testnet"
        rows={[
          {
            key: "Network",
            value: (
              <>
                Hedera testnet, chain id <span className="data-mono">296</span>
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  JSON-RPC relay <span className="data-mono break-all">https://testnet.hashio.io/api</span> (rejects{" "}
                  <span className="data-mono">eth_getLogs</span> inside JSON-RPC batches); mirror node{" "}
                  <span className="data-mono break-all">https://testnet.mirrornode.hedera.com</span>
                </span>
              </>
            ),
          },
          {
            key: "AetherisAgency",
            value: (
              <>
                <Addr value={AGENCY_ADDRESS} kind="contract" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  deploy block {AGENCY_BLOCK.toLocaleString("en-US")}
                </span>
              </>
            ),
          },
          {
            key: "AetherisTreasury",
            value: (
              <>
                <Addr value={TREASURY_ADDRESS} kind="contract" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  deploy block {TREASURY_BLOCK.toLocaleString("en-US")}
                </span>
              </>
            ),
          },
          {
            key: "HTS system contract",
            value: (
              <>
                <span className="data-mono break-all">{HTS_PRECOMPILE}</span>
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  same address on every Hedera network; returns int64 response codes, SUCCESS = 22
                </span>
              </>
            ),
          },
          {
            key: "aUSD (HTS token)",
            value: (
              <>
                <Addr value={HTS_TOKEN_ID} kind="token" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  6 decimals; EVM alias <span className="data-mono break-all">{HTS_TOKEN_EVM}</span>
                </span>
              </>
            ),
          },
          {
            key: "aUSDC (test ERC-20)",
            value: (
              <>
                <Addr value={ERC20_TOKEN} kind="contract" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">6 decimals; open mint (used by the faucet)</span>
              </>
            ),
          },
          {
            key: "Operator",
            value: (
              <>
                <Addr value={OPERATOR_ACCOUNT} kind="account" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  EVM alias <span className="data-mono break-all">{OPERATOR_EVM}</span>; owner of both contracts,
                  deployer, relayer, faucet and HCS submit key
                </span>
              </>
            ),
          },
          {
            key: "Seeded sub-agents",
            value: (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {SUB_AGENT_ACCOUNTS.map((id) => (
                  <Addr key={id} value={id} kind="account" />
                ))}
              </span>
            ),
          },
          {
            key: "HCS audit topic",
            value: <Addr value={HCS_TOPIC} kind="topic" />,
          },
        ]}
      />
      <P>
        State today: 7 jobs created, 4 settled, one real <Code>claimProfit</Code> of 0.5 aUSD. The
        measured cost of a settlement is 2,360,527 gas over HTS against 229,111 gas over ERC-20.
      </P>

      <H2 id="agency">AetherisAgency</H2>
      <P>
        The agency owns the job and task state machines and the World ID operator registry. It is{" "}
        <Code>Ownable</Code> (the owner is the operator) and <Code>ReentrancyGuard</Code>ed where it hands
        control to token contracts. Job statuses: <Code>Funded</Code>, <Code>Dispatched</Code>,{" "}
        <Code>Completed</Code>, <Code>Settled</Code>, <Code>Refunded</Code>. Task statuses:{" "}
        <Code>Assigned</Code>, <Code>Completed</Code>, <Code>Paid</Code>, <Code>Cancelled</Code>.
      </P>
      <FnTable caption="AetherisAgency functions" rows={AGENCY_FUNCTIONS} />
      <H3 id="agency-errors">Custom errors</H3>
      <P className="data-mono text-[0.9rem] leading-[1.9]">
        ZeroAddress, ZeroAmount, UnknownJob(jobId), UnknownTask(jobId, taskId), InvalidJobStatus(jobId,
        actual), InvalidTaskStatus(jobId, taskId, actual), FeeExceedsDeposit(jobId, committed, deposit),
        NotTaskOwner(jobId, taskId, caller), NotClientOrOperator(jobId, caller),
        NullifierAlreadyUsed(nullifierHash), InvalidNullifier, EmptyHcsTopic
      </P>
      <Callout tone="warn" label="World ID bypass on Hedera">
        No World ID router is deployed on Hedera, so the agency was constructed with{" "}
        <Code>worldIdRouter = address(0)</Code> and emitted <Code>WorldIdBypassActive</Code> with the reason{" "}
        <Code>WORLD_ID_ROUTER_UNSET</Code>. In this mode <Code>verifyOperator</Code> skips only the
        Groth16 check; the nullifier is still burned before anything else happens, so replay protection
        is real. The proof itself is verified off-chain by <Code>POST /api/operator/verify</Code> before
        the relay ever calls the contract.
      </Callout>

      <H2 id="treasury">AetherisTreasury</H2>
      <P>
        The treasury holds every token the system touches and enforces one invariant: for each token,{" "}
        <Code>balanceOf(this) &gt;= totalObligations[token]</Code>, where obligations are open escrows plus
        retained margin. Only the wired agency can open, spend or close an escrow (<Code>onlyAgency</Code>);
        only the owner can move margin, and only if the agency says that owner is a verified human.
      </P>
      <FnTable caption="AetherisTreasury functions" rows={TREASURY_FUNCTIONS} />
      <H3 id="treasury-errors">Custom errors</H3>
      <P className="data-mono text-[0.9rem] leading-[1.9]">
        NotAgency(caller), ZeroAddress, ZeroAmount, AgencyNotSet, EscrowAlreadyOpen(jobId),
        EscrowNotOpen(jobId), InsufficientEscrow(jobId, requested, available), InsufficientMargin(token,
        requested, available), SolvencyCheckFailed(token, held, required), OperatorNotVerified(operator),
        TokenMismatch(expected, actual); from HederaTokenServiceLib: HtsCallFailed(selector,
        responseCode), HtsAmountOverflow(amount)
      </P>
      <P>
        The dual rail lives in the private <Code>_payout</Code>: if <Code>htsEnabled</Code> and{" "}
        <Code>HederaTokenServiceLib.isHtsToken(token)</Code> both hold, it tries{" "}
        <Code>transferToken</Code> on <Code>0x167</Code>; otherwise, or if HTS answers anything but 22, it
        emits <Code>HtsPayoutFallback</Code> with the response code and uses <Code>SafeERC20</Code>. The
        library maps empty or malformed return data to <Code>UNKNOWN = 21</Code> rather than 0, so a call
        to an address with no code (every non-Hedera chain) can never look like success. See{" "}
        <A href="/docs/settlement">Settlement rails</A>.
      </P>

      <H2 id="events">Events</H2>
      <P>
        Ten event signatures are frozen in <Code>contracts/interfaces/IAetherisEvents.sol</Code>. The
        contracts implement them verbatim and <Code>subgraph/subgraph.yaml</Code> indexes them verbatim;
        neither side may change a name, arity, type or <Code>indexed</Code> flag without updating the
        interface first and regenerating the subgraph ABI.
      </P>
      <Pre title="contracts/interfaces/IAetherisEvents.sol">{FROZEN_EVENTS}</Pre>
      <P>
        Each contract also emits operational events that are visible on HashScan but outside the frozen
        set, and therefore not indexed by the subgraph:
      </P>
      <Pre title="contract-local events">{LOCAL_EVENTS}</Pre>

      <H2 id="http-api">HTTP API</H2>
      <P>
        Every route runs on the Node runtime with <Code>dynamic = &quot;force-dynamic&quot;</Code>. Bodies
        must be JSON objects (arrays, primitives and malformed JSON are a 400). Errors share one envelope
        with a real status code and a stable <Code>code</Code>:
      </P>
      <Pre title="error envelope - app/api/_lib/http.ts">{ERROR_ENVELOPE}</Pre>
      <UL>
        <LI>
          <Code>400 BAD_REQUEST</Code> - validation; <Code>401 PROOF_REJECTED</Code> - World ID said no;{" "}
          <Code>403 OPERATOR_NOT_VERIFIED</Code> / <Code>NULLIFIER_MISMATCH</Code> - HCS write by an
          unverified operator; <Code>405 METHOD_NOT_ALLOWED</Code>; <Code>409 NULLIFIER_ALREADY_USED</Code>;{" "}
          <Code>429 RATE_LIMITED</Code> (with a <Code>retry-after</Code> header where the limiter is
          per-IP); <Code>502 UPSTREAM_ERROR</Code> - Hedera, World ID or 1inch failed;{" "}
          <Code>503 NOT_CONFIGURED</Code> and its specific variants - a required env var is missing, and
          nothing was attempted.
        </LI>
        <LI>
          Rate limiters are in-memory per process: 5 per minute per IP for{" "}
          <Code>POST /api/hcs</Code> and <Code>POST /api/operator/verify</Code>; 3 per address per hour and
          30 per hour overall for the faucet.
        </LI>
      </UL>

      <H3 id="api-hcs-get">GET /api/hcs</H3>
      <KV
        caption="GET /api/hcs"
        rows={[
          { key: "File", value: <Code>app/api/hcs/route.ts</Code> },
          {
            key: "Query",
            value: (
              <>
                <Code>limit</Code> integer 1 to 50 (default 12); <Code>topicId</Code> optional{" "}
                <Code>shard.realm.num</Code>, defaults to <Code>HEDERA_HCS_TOPIC_ID</Code>
              </>
            ),
          },
          {
            key: "Success",
            value: (
              <>
                200 <Code>{`{ topicId, source: "live" | "demo", notice?, messages[] }`}</Code> - frames newest first
                with corrections already applied
              </>
            ),
          },
          {
            key: "Errors",
            value: (
              <>
                400 on a bad <Code>limit</Code> or <Code>topicId</Code>. Never 5xx: an unset topic, an empty
                topic or an unreachable mirror node all answer 200 with <Code>source: &quot;demo&quot;</Code> and a{" "}
                <Code>notice</Code>.
              </>
            ),
          },
        ]}
      />
      <Pre title="response">{HCS_GET_SHAPE}</Pre>

      <H3 id="api-hcs-post">POST /api/hcs</H3>
      <KV
        caption="POST /api/hcs"
        rows={[
          {
            key: "Body",
            value: (
              <>
                <Code>{`{ message, topicId? }`}</Code> - <Code>message</Code> is a JSON string of at most 1024
                characters matching exactly <Code>{`{evt, operator, amount, nullifier}`}</Code> with{" "}
                <Code>evt = &quot;ProfitClaimed&quot;</Code>; <Code>amount</Code> is a formatted USD figure;{" "}
                <Code>nullifier</Code> a uint256 string or null. <Code>topicId</Code>, if present, must equal
                the configured topic.
              </>
            ),
          },
          {
            key: "Checks",
            value: (
              <>
                <Code>isVerifiedOperator(operator)</Code> must be true on-chain, and a supplied nullifier must
                equal <Code>operatorNullifier(operator)</Code>. The server composes the frame (adds{" "}
                <Code>agency</Code>, <Code>ts</Code>, <Code>src: &quot;aetheris/api/hcs&quot;</Code>) and signs
                with the operator key.
              </>
            ),
          },
          { key: "Success", value: <>201 <Code>{`{ topicId, sequenceNumber, transactionId, frame }`}</Code></> },
          {
            key: "Errors",
            value: (
              <>
                400 (shape, extra fields, wrong topic); 403 <Code>OPERATOR_NOT_VERIFIED</Code>,{" "}
                <Code>NULLIFIER_MISMATCH</Code>; 429 <Code>RATE_LIMITED</Code>; 502 <Code>UPSTREAM_ERROR</Code>{" "}
                (RPC read or HCS submit failed); 503 <Code>NOT_CONFIGURED</Code> (no topic or no agency
                address).
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{HCS_POST_SHAPE}</Pre>

      <H3 id="api-faucet">POST /api/faucet</H3>
      <KV
        caption="POST /api/faucet"
        rows={[
          { key: "File", value: <Code>app/api/faucet/route.ts</Code> },
          { key: "Body", value: <Code>{`{ address }`}</Code> },
          {
            key: "Effect",
            value: (
              <>
                Sends 1 HBAR if the wallet holds under 0.5, then mints 10 aUSDC via the test token&apos;s open{" "}
                <Code>mint</Code>. Signs with <Code>PRIVATE_KEY</Code>. Refuses unless the RPC reports chain 296.
              </>
            ),
          },
          { key: "Success", value: <>200 <Code>{`{ ok, to, hbar, token }`}</Code></> },
          {
            key: "Errors",
            value: (
              <>
                400; 429 <Code>RATE_LIMITED</Code> (3 drips per address per hour); 503{" "}
                <Code>FAUCET_NOT_CONFIGURED</Code>, <Code>WRONG_CHAIN</Code>; 502 <Code>UPSTREAM_ERROR</Code>.
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{FAUCET_SHAPE}</Pre>

      <H3 id="api-rp-context">POST /api/worldid/rp-context</H3>
      <KV
        caption="POST /api/worldid/rp-context"
        rows={[
          { key: "File", value: <Code>app/api/worldid/rp-context/route.ts</Code> },
          { key: "Body", value: <><Code>{`{ action }`}</Code> - non-empty, at most 256 characters</> },
          {
            key: "Effect",
            value: (
              <>
                Signs an IDKit v4 request context with <Code>WORLD_ID_RP_SIGNING_KEY</Code> (TTL 300 s) so the
                key never reaches the browser.
              </>
            ),
          },
          { key: "Success", value: <>200 <Code>{`{ rp_context: { rp_id, nonce, created_at, expires_at, signature } }`}</Code></> },
          {
            key: "Errors",
            value: (
              <>
                400; 503 <Code>NOT_CONFIGURED</Code> when <Code>WORLD_ID_RP_ID</Code> or the signing key is unset,
                or signing fails.
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{RP_CONTEXT_SHAPE}</Pre>

      <H3 id="api-operator-verify">POST /api/operator/verify</H3>
      <KV
        caption="POST /api/operator/verify"
        rows={[
          { key: "File", value: <Code>app/api/operator/verify/route.ts</Code> },
          {
            key: "Body",
            value: (
              <>
                <Code>{`{ result, signal, ensName? }`}</Code> (IDKit 4.0) or{" "}
                <Code>{`{ proof, signal, ensName? }`}</Code> (legacy). <Code>signal</Code> is the operator&apos;s
                EVM address; <Code>ensName</Code> must look like an ENS name. No other fields.
              </>
            ),
          },
          {
            key: "Effect",
            value: (
              <>
                Verifies at <Code>https://developer.worldcoin.org/api/v4/verify/{`{rp_id}`}</Code> (or the legacy
                verifier), checks <Code>nullifierHashUsed</Code>, then relays{" "}
                <Code>verifyOperator(signal, 0, nullifierHash, [0 x 8], ensName)</Code> with the deployer key
                and waits one confirmation.
              </>
            ),
          },
          {
            key: "Success",
            value: (
              <>
                200 <Code>{`{ ok, txHash, nullifierHash, hashscan, signal, ensName, blockNumber, worldIdBypassed, verificationLevel }`}</Code>
              </>
            ),
          },
          {
            key: "Errors",
            value: (
              <>
                400 <Code>BAD_REQUEST</Code>; 401 <Code>PROOF_REJECTED</Code>; 409{" "}
                <Code>NULLIFIER_ALREADY_USED</Code> (pre-check or revert); 429 <Code>RATE_LIMITED</Code>; 502{" "}
                <Code>UPSTREAM_ERROR</Code>; 503 <Code>WORLD_ID_NOT_CONFIGURED</Code>,{" "}
                <Code>RELAYER_NOT_CONFIGURED</Code>. GET answers 405.
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{OPERATOR_VERIFY_SHAPE}</Pre>

      <H3 id="api-verify-worldid">POST /api/verify-worldid</H3>
      <KV
        caption="POST /api/verify-worldid"
        rows={[
          { key: "File", value: <Code>app/api/verify-worldid/route.ts</Code> },
          {
            key: "Body",
            value: (
              <>
                An IDKit 4.0 result (bare or as <Code>{`{ result }`}</Code>), or legacy{" "}
                <Code>{`{ proof: { merkle_root, nullifier_hash, proof, verification_level }, signal }`}</Code>
              </>
            ),
          },
          {
            key: "Effect",
            value: "Verification only - nothing is sent on-chain. The operator flow uses /api/operator/verify instead.",
          },
          { key: "Success", value: <>200 <Code>{`{ success: true, version?, nullifierHash, verificationLevel }`}</Code></> },
          {
            key: "Errors",
            value: (
              <>
                400; 401 <Code>PROOF_REJECTED</Code>; 502 <Code>UPSTREAM_ERROR</Code>; 503{" "}
                <Code>NOT_CONFIGURED</Code>. GET answers 405.
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{VERIFY_WORLDID_SHAPE}</Pre>

      <H3 id="api-swap">POST /api/swap/quote and POST /api/swap/build</H3>
      <KV
        caption="1inch proxy routes"
        rows={[
          { key: "Files", value: <><Code>app/api/swap/quote/route.ts</Code>, <Code>app/api/swap/build/route.ts</Code></> },
          {
            key: "Body",
            value: (
              <>
                <Code>{`{ chainId, src, dst, amount }`}</Code>; build adds <Code>from</Code> and optional{" "}
                <Code>slippage</Code> (greater than 0, at most 50). <Code>amount</Code> is a decimal string in base units;{" "}
                <Code>src</Code> and <Code>dst</Code> must differ.
              </>
            ),
          },
          {
            key: "Chains",
            value: "Ethereum 1, Arbitrum 42161, Base 8453, Optimism 10, Polygon 137. Hedera (296) is not supported by 1inch and is rejected with a 400 listing the supported chains.",
          },
          {
            key: "Success",
            value: (
              <>
                quote: 200 <Code>{`{ quote, chainId }`}</Code>; build: 200 <Code>{`{ tx: { to, data, value, gas? }, chainId }`}</Code>{" "}
                - unsigned calldata, never broadcast by the server
              </>
            ),
          },
          {
            key: "Errors",
            value: (
              <>
                400; 502 <Code>UPSTREAM_ERROR</Code> (upstream failure, including a missing{" "}
                <Code>ONEINCH_API_KEY</Code>); 503 <Code>NOT_CONFIGURED</Code> only if the 1inch module
                itself fails to load. The key never reaches the browser.
              </>
            ),
          },
        ]}
      />
      <Pre title="request / response">{SWAP_SHAPE}</Pre>

      <H3 id="api-ens">GET /api/ens</H3>
      <KV
        caption="GET /api/ens"
        rows={[
          { key: "File", value: <Code>app/api/ens/route.ts</Code> },
          { key: "Query", value: <>exactly one of <Code>address</Code> (20-byte hex) or <Code>name</Code> (dot-separated ENS name)</> },
          { key: "Success", value: <>200 <Code>{`{ address, name, avatar, source: "live" | "unconfigured" }`}</Code></> },
          {
            key: "Errors",
            value: <>400 when neither or a malformed parameter is given. Resolution failures are 200 with null fields.</>,
          },
        ]}
      />
      <Pre title="request / response">{ENS_SHAPE}</Pre>

      <Callout tone="warn" label="One key behind every write route">
        The faucet, the operator relay and the HCS writer all sign with the deployer key, which is also
        the owner of both contracts and the topic&apos;s submit key. The rate limits are per process and
        reset on restart. This is a testnet deployment; a production operator would separate those roles
        and put the relayer behind real authentication.
      </Callout>
    </Prose>
  );
}
