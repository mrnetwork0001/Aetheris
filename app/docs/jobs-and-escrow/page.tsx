import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS, TREASURY_ADDRESS } from "@/components/marketing/links";
import { Pill, statusTone } from "@/components/ui/pill";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Jobs & escrow",
  description:
    "How a client funds a job, how the operator commits fees against it, every job and task status, and who can refund or cancel what.",
};

interface StatusRow {
  status: string;
  code: string;
  meaning: string;
  next: string;
}

/** Mirrors `enum JobStatus` in contracts/interfaces/IAetherisEvents.sol. */
const JOB_STATUSES: ReadonlyArray<StatusRow> = [
  { status: "None", code: "0", meaning: "Never created. Any call on this id reverts with UnknownJob.", next: "createJob" },
  { status: "Funded", code: "1", meaning: "Client deposit is in the treasury; no task assigned yet.", next: "assignSubAgent, refundJob" },
  { status: "Dispatched", code: "2", meaning: "At least one sub-agent has a task.", next: "assignSubAgent, completeTask, cancelTask, settleJob, refundJob" },
  { status: "Completed", code: "3", meaning: "completedCount == taskCount: every live task reported complete.", next: "settleJob" },
  { status: "Settled", code: "4", meaning: "Completed tasks paid, remainder promoted to retained margin. Terminal.", next: "-" },
  { status: "Refunded", code: "5", meaning: "Escrow returned to the client; open tasks cancelled. Terminal.", next: "-" },
];

/** Mirrors `enum TaskStatus` in contracts/interfaces/IAetherisEvents.sol. */
const TASK_STATUSES: ReadonlyArray<StatusRow> = [
  { status: "None", code: "0", meaning: "Index out of range; getTask reverts with UnknownTask.", next: "-" },
  { status: "Assigned", code: "1", meaning: "Fee reserved against the deposit, work not yet reported.", next: "completeTask, cancelTask" },
  { status: "Completed", code: "2", meaning: "Result hash and HCS coordinates stored; not yet paid.", next: "settleJob" },
  { status: "Paid", code: "3", meaning: "Fee streamed to the sub-agent during settleJob. Terminal.", next: "-" },
  { status: "Cancelled", code: "4", meaning: "Cancelled by the operator, or swept up by a refund. Fee never paid. Terminal.", next: "-" },
];

function StatusTable({ rows, caption }: { rows: ReadonlyArray<StatusRow>; caption: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[12px] border border-fl-border bg-fl-card">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <THead>
          <TR>
            <TH>Status</TH>
            <TH mono>Enum</TH>
            <TH>Meaning</TH>
            <TH>Allowed next calls</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.status}>
              <TD>
                <Pill tone={row.status === "None" ? "muted" : statusTone(row.status)} dot={row.status !== "None"}>
                  {row.status}
                </Pill>
              </TD>
              <TD mono>{row.code}</TD>
              <TD className="text-fl-fg2">{row.meaning}</TD>
              <TD mono>{row.next}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export default function JobsAndEscrowPage() {
  return (
    <Prose>
      <p className="mono-label">Protocol</p>
      <H1 className="mt-3">Jobs &amp; escrow</H1>
      <Lede>
        A job is one client deposit held by the treasury and a list of tasks the operator commits
        against it. The contract will not let committed fees pass the deposit, will not pay a task
        that was never completed, and will hand the whole escrow back to the client for as long as
        the job is unsettled. This page is the reference for those rules as{" "}
        <Code>contracts/AetherisAgency.sol</Code> actually enforces them.
      </Lede>
      <P>
        The agency (<Addr value={AGENCY_ADDRESS} short />) owns the job and task records; the treasury
        (<Addr value={TREASURY_ADDRESS} short />) owns the tokens. Every function that moves money on
        the treasury is <Code>onlyAgency</Code>, and the agency is the only address wired in through{" "}
        <Code>setAgency</Code>. Statuses and event signatures are frozen in{" "}
        <Code>contracts/interfaces/IAetherisEvents.sol</Code>, which the subgraph indexes verbatim.
      </P>

      <H2 id="signatures">Function signatures</H2>
      <P>
        Copied from <Code>contracts/AetherisAgency.sol</Code>. <Code>onlyOwner</Code> is the operator;
        anything else is open to the caller named in the comment.
      </P>
      <Pre title="contracts/AetherisAgency.sol">
{`// client: must have approved THIS contract (the agency) for deposit of token
function createJob(address token, uint256 deposit, string calldata specURI)
    external nonReentrant returns (uint256 jobId);

// operator
function assignSubAgent(uint256 jobId, address subAgent, uint256 fee, string calldata role)
    external onlyOwner returns (uint256 taskId);

// the task's sub-agent, or the operator on its behalf
function completeTask(
    uint256 jobId,
    uint256 taskId,
    bytes32 resultHash,
    string calldata hcsTopicId,
    uint64 hcsSequenceNumber
) external;

// operator
function cancelTask(uint256 jobId, uint256 taskId) external onlyOwner;

// operator
function settleJob(uint256 jobId)
    external onlyOwner nonReentrant returns (uint256 paidToSubAgents, uint256 netMargin);

// the job's client, or the operator
function refundJob(uint256 jobId) external nonReentrant returns (uint256 refunded);

// views
function getJob(uint256 jobId) external view returns (Job memory);
function getTask(uint256 jobId, uint256 taskId) external view returns (Task memory);
function getTasks(uint256 jobId) external view returns (Task[] memory);
function taskLength(uint256 jobId) external view returns (uint256);
function jobStatus(uint256 jobId) external view returns (JobStatus);
uint256 public jobCount;`}
      </Pre>
      <P>
        Job ids are 1-based (<Code>jobId = ++jobCount</Code>); task ids are the 0-based index into the
        job&apos;s task array. <Code>taskLength</Code> counts every task ever pushed, including cancelled
        ones, while <Code>Job.taskCount</Code> is decremented by <Code>cancelTask</Code>.
      </P>

      <H2 id="create-job">createJob: approve the agency, not the treasury</H2>
      <P>
        The client is whoever calls <Code>createJob</Code>. The function pulls the deposit with{" "}
        <Code>IERC20(token).safeTransferFrom(msg.sender, address(treasury), deposit)</Code>, so the
        allowance has to be granted to the <strong>agency address</strong> even though the tokens end
        up in the treasury. An allowance on the treasury does nothing. The browser flow in{" "}
        <Code>lib/write.ts</Code> (<Code>approveAndCreateJob</Code>) reads the current allowance for the
        agency first and only sends the <Code>approve</Code> transaction when it is short, then signs{" "}
        <Code>createJob</Code> on chain 296.
      </P>
      <P>
        Once the tokens have moved, the agency calls <Code>treasury.recordEscrow(jobId, token, deposit)</Code>.
        The treasury does not trust the amount it is told: it adds the deposit to{" "}
        <Code>totalObligations[token]</Code>, reads its own <Code>balanceOf</Code>, and reverts with{" "}
        <Code>SolvencyCheckFailed(token, held, required)</Code> if the balance does not cover every
        obligation it now carries (<Code>contracts/AetherisTreasury.sol</Code>). A fee-on-transfer token
        therefore fails at funding time instead of leaving a job under-collateralised.
      </P>
      <KV
        caption="createJob inputs"
        rows={[
          {
            key: <Code>token</Code>,
            value: (
              <>
                Any ERC-20-compatible address. On testnet that is the HTS token aUSD{" "}
                <Addr value="0x00000000000000000000000000000000009ffBC1" kind="token" short /> (6 decimals)
                or the test ERC-20 aUSDC{" "}
                <Addr value="0x21DCc52AbbCAef92B4573dc8B0e1658417c85961" short /> (6 decimals). For an
                HTS token the treasury must already be associated; see{" "}
                <A href="/docs/settlement">Settlement rails</A>.
              </>
            ),
          },
          {
            key: <Code>deposit</Code>,
            value: "Gross deposit in the token's smallest unit. Zero reverts with ZeroAmount.",
          },
          {
            key: <Code>specURI</Code>,
            value: "Off-chain description of the work. Stored on the job and emitted in JobCreated; the contract never reads it.",
          },
        ]}
      />
      <P>
        The contract treats <Code>specURI</Code> as an opaque string, so the value is a convention between the
        client and the sub-agents. Three forms are in use: <Code>hcs://&lt;topicId&gt;/&lt;sequenceNumber&gt;</Code>{" "}
        points at a <Code>JobBrief</Code> frame anchored on the audit topic (title, role, client, the brief text and its{" "}
        <Code>keccak256</Code>), which is what <Code>scripts/agent-demo.js</Code> writes and the worker reads back from
        the mirror node before inferring (see <A href="/docs/agents#briefs">Job briefs</A>); <Code>ipfs://</Code>{" "}
        content ids for a specification stored off-chain; or any other opaque string, such as an HTTPS URL, which is
        stored and displayed as-is. Nothing on-chain validates the form, and a job funded with an unreadable URI is
        still a valid job.
      </P>

      <H2 id="fee-ceiling">assignSubAgent and FeeExceedsDeposit</H2>
      <P>
        Each call reserves one task&apos;s fee against the deposit. The check is a single line:
      </P>
      <Pre title="contracts/AetherisAgency.sol">
{`uint256 committed = job.committedFees + fee;
if (committed > job.deposit) revert FeeExceedsDeposit(jobId, committed, job.deposit);`}
      </Pre>
      <P>
        Because the sum of reserved fees can never exceed what the client put in, a job is solvent
        before any sub-agent starts work - there is no later top-up step and no way for the operator
        to promise more than the escrow holds. The first assignment moves the job from{" "}
        <Code>Funded</Code> to <Code>Dispatched</Code>; further assignments are allowed while the job is{" "}
        <Code>Funded</Code> or <Code>Dispatched</Code>, and refused once it is <Code>Completed</Code>,{" "}
        <Code>Settled</Code> or <Code>Refunded</Code> (<Code>InvalidJobStatus</Code>). The{" "}
        <Code>role</Code> string is free text the operator chooses, for example{" "}
        <Code>security-audit</Code> or <Code>code-generation</Code> in the seeded jobs.
      </P>
      <P>
        The test <Code>refuses to commit more in fees than the client deposited</Code> in{" "}
        <Code>test/aetheris.test.js</Code> assigns a fee of <Code>DEPOSIT + 1</Code> and expects the
        custom error.
      </P>

      <H2 id="complete">completeTask</H2>
      <P>
        Callable by the task&apos;s <Code>subAgent</Code> or by the operator; anyone else gets{" "}
        <Code>NotTaskOwner</Code>. The task must be <Code>Assigned</Code>, and <Code>hcsTopicId</Code> may
        not be empty (<Code>EmptyHcsTopic</Code>) - a completion without an audit anchor is not a
        completion. The call stores <Code>resultHash</Code>, marks the task <Code>Completed</Code>, and
        emits both <Code>TaskCompleted</Code> and <Code>HcsLogAnchored</Code>. When{" "}
        <Code>completedCount</Code> reaches <Code>taskCount</Code> the job flips to{" "}
        <Code>Completed</Code>. How the sequence number is obtained before the call is covered in{" "}
        <A href="/docs/audit-log">Audit log</A>.
      </P>

      <H2 id="statuses">Statuses</H2>
      <H3 id="job-statuses">Job</H3>
      <StatusTable rows={JOB_STATUSES} caption="Job statuses and the calls allowed from each" />
      <H3 id="task-statuses">Task</H3>
      <StatusTable rows={TASK_STATUSES} caption="Task statuses and the calls allowed from each" />
      <P>
        The enum values are the integers the subgraph and the dashboard read back from{" "}
        <Code>jobStatus(jobId)</Code> and <Code>getTask(jobId, taskId).status</Code>.
      </P>

      <H2 id="settle">settleJob: pay what was completed, keep the rest</H2>
      <P>
        Allowed while the job is <Code>Dispatched</Code> or <Code>Completed</Code>, so the operator can
        settle a job with unfinished tasks on it. The function sets <Code>Settled</Code> before the
        payout loop (a malicious token cannot re-enter through another path), then walks every task
        and pays only those in <Code>Completed</Code> state via{" "}
        <Code>treasury.settleSubAgent(jobId, taskId, subAgent, fee)</Code>, marking each{" "}
        <Code>Paid</Code>. Tasks still <Code>Assigned</Code> are skipped and their fee is never paid.
        Finally <Code>treasury.closeEscrow(jobId)</Code> promotes whatever escrow remains to{" "}
        <Code>retainedMargin[token]</Code> and the agency emits{" "}
        <Code>JobSettled(jobId, grossDeposit, paidToSubAgents, netMargin)</Code>.
      </P>
      <Callout label="Margin is derived, not computed">
        <Code>netMargin</Code> is whatever <Code>closeEscrow</Code> finds left in the job&apos;s escrow
        after the payouts, not <Code>deposit - committedFees</Code>. Fees for tasks that were assigned
        but never completed fall through into margin automatically (test:{" "}
        <Code>keeps the fee of an assigned-but-unfinished task as margin</Code>). Once settled, a job
        cannot be refunded.
      </Callout>

      <H2 id="refunds">Refunds: who and when</H2>
      <P>
        <Code>refundJob(jobId)</Code> may be called by the job&apos;s <strong>client</strong> or by the{" "}
        <strong>operator</strong>; any other caller reverts with{" "}
        <Code>NotClientOrOperator(jobId, caller)</Code>. It is allowed only while the job is{" "}
        <Code>Funded</Code> or <Code>Dispatched</Code>. A job in <Code>Completed</Code> state - every task
        reported done but not yet settled - cannot be refunded, and neither can one that is already{" "}
        <Code>Settled</Code> or <Code>Refunded</Code>.
      </P>
      <UL>
        <LI>
          The job is marked <Code>Refunded</Code> first. Every task still <Code>Assigned</Code>{" "}
          <em>or</em> <Code>Completed</Code> is set to <Code>Cancelled</Code> and a{" "}
          <Code>TaskCancelled(jobId, taskId, subAgent)</Code> event fires for each.
        </LI>
        <LI>
          <Code>treasury.refundEscrow(jobId, client)</Code> returns the <strong>entire</strong> remaining
          escrow to the client, zeroes the record and reduces <Code>totalObligations</Code>. The
          transfer goes through the same HTS-first, ERC-20-fallback path as a payout.
        </LI>
        <LI>
          The agency emits <Code>JobRefunded(jobId, client, token, amount)</Code>.
        </LI>
      </UL>
      <Callout tone="warn" label="Completed-but-unsettled work is not paid on refund">
        Because a <Code>Dispatched</Code> job can hold tasks that are already <Code>Completed</Code>, a
        refund at that moment cancels them and returns their fee to the client. Sub-agents are only
        paid through <Code>settleJob</Code>. The operator is the only party who can settle, so the
        protection for a sub-agent is that the operator settles promptly; the protection for the
        client is that nothing leaves escrow until the operator does.
      </Callout>
      <P>
        In the app, the Client view lists the connected wallet&apos;s refundable escrow and signs{" "}
        <Code>refundJob</Code> in the browser (<Code>lib/write.ts</Code>, <Code>refundJob</Code>, with a
        1,000,000 gas limit because the HTS path costs far more than a plain transfer). The test{" "}
        <Code>refunds an unsettled job back to its client</Code> checks the client&apos;s balance
        returns to its pre-deposit value and <Code>totalObligations</Code> drops to zero.
      </P>

      <H2 id="cancel-task">cancelTask</H2>
      <P>
        <Code>cancelTask(jobId, taskId)</Code> is operator-only and works on an <Code>Assigned</Code> task
        only; a <Code>Completed</Code>, <Code>Paid</Code> or <Code>Cancelled</Code> task reverts with{" "}
        <Code>InvalidTaskStatus</Code>. It sets the task <Code>Cancelled</Code>, subtracts the fee from{" "}
        <Code>committedFees</Code> (freeing that room for another assignment) and decrements{" "}
        <Code>taskCount</Code>. If the remaining tasks are all complete the job becomes{" "}
        <Code>Completed</Code>. The job itself is not refunded by a cancel - the freed fee stays in
        escrow and, at settlement, becomes margin.
      </P>

      <H2 id="errors">Custom errors</H2>
      <KV
        caption="AetherisAgency custom errors"
        rows={[
          { key: <Code>ZeroAddress()</Code>, value: "token or subAgent was the zero address." },
          { key: <Code>ZeroAmount()</Code>, value: "deposit or fee was zero." },
          { key: <Code>UnknownJob(jobId)</Code>, value: "No job with that id (status None)." },
          { key: <Code>UnknownTask(jobId, taskId)</Code>, value: "taskId is past the end of the job's task array." },
          { key: <Code>InvalidJobStatus(jobId, actual)</Code>, value: "The job's current status does not permit this call; see the status table." },
          { key: <Code>InvalidTaskStatus(jobId, taskId, actual)</Code>, value: "The task's current status does not permit this call." },
          { key: <Code>FeeExceedsDeposit(jobId, committed, deposit)</Code>, value: "committedFees + fee would pass the deposit." },
          { key: <Code>NotTaskOwner(jobId, taskId, caller)</Code>, value: "completeTask from an address that is neither the task's sub-agent nor the operator." },
          { key: <Code>NotClientOrOperator(jobId, caller)</Code>, value: "refundJob from an address that is neither the job's client nor the operator." },
          { key: <Code>EmptyHcsTopic()</Code>, value: "completeTask with an empty hcsTopicId." },
        ]}
      />
      <P>
        The treasury adds its own: <Code>SolvencyCheckFailed</Code> on funding,{" "}
        <Code>InsufficientEscrow</Code> if a payout exceeds the job&apos;s balance,{" "}
        <Code>EscrowNotOpen</Code> / <Code>EscrowAlreadyOpen</Code> on double use of a job id, and{" "}
        <Code>NotAgency</Code> for any caller other than the wired agency (
        <Code>contracts/AetherisTreasury.sol</Code>).
      </P>

      <H2 id="on-chain-today">On chain today</H2>
      <P>
        Seven jobs exist on the testnet agency, four of them settled. They were driven by{" "}
        <Code>scripts/seed.js</Code> (<Code>npx hardhat run scripts/seed.js --network hederaTestnet</Code>
        ), which funds in aUSD and aUSDC, assigns tasks to the seeded sub-agents, completes them with
        real HCS sequence numbers and settles. The sub-agent work itself is simulated by the script:
        it commits a result hash, and no model call is part of the contracts.
      </P>

      <H2 id="read-next">Read next</H2>
      <UL>
        <LI>
          <A href="/docs/settlement">Settlement rails</A> - what happens inside{" "}
          <Code>treasury.settleSubAgent</Code>.
        </LI>
        <LI>
          <A href="/docs/client">The client</A> - the wallet-side flow for funding and refunding.
        </LI>
      </UL>
    </Prose>
  );
}
