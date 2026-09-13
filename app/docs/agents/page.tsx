import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";
import { AGENCY_ADDRESS } from "@/components/marketing/links";

export const metadata: Metadata = {
  title: "The sub-agent worker",
  description:
    "What the Aetheris sub-agent worker is, how it polls the subgraph, infers on the 0G Compute Router, anchors the deliverable on HCS and completes the task on Hedera, and how anyone verifies the result.",
};

const HCS_TOPIC = "0.0.10518320";
const AUSD_EVM = "0x00000000000000000000000000000000009ffBC1";
const SUBGRAPH_PUBLIC = "http://38.49.213.208:8100/subgraphs/name/aetheris";
const MIRROR_EXAMPLE = `https://testnet.mirrornode.hedera.com/api/v1/topics/${HCS_TOPIC}/messages/<seq>`;

const IDENTITY_ROWS = [
  {
    key: "Created by",
    value: (
      <>
        <Code>scripts/agent-identity.js</Code> with the operator client from <Code>HEDERA_OPERATOR_ID</Code> /{" "}
        <Code>HEDERA_OPERATOR_KEY</Code>, the first time <Code>agent:worker</Code> or <Code>agent:demo</Code> runs.
      </>
    ),
  },
  {
    key: "Account",
    value: (
      <>
        <Code>AccountCreateTransaction</Code> with <Code>setECDSAKeyWithAlias</Code>, 2 HBAR initial balance and{" "}
        <Code>setMaxAutomaticTokenAssociations(-1)</Code>, so the HTS payout at settlement needs no manual associate.
      </>
    ),
  },
  {
    key: "Address",
    value: (
      <>
        The EVM alias of the key. It equals the address an ethers <Code>Wallet</Code> derives from{" "}
        <Code>AGENT_WORKER_KEY</Code>, which is what the relay resolves as <Code>msg.sender</Code>. The script
        asserts both derivations match before anything is written; a long-zero account would not pass{" "}
        <Code>NotTaskOwner</Code>.
      </>
    ),
  },
  {
    key: "Stored as",
    value: (
      <>
        <Code>AGENT_WORKER_KEY</Code>, <Code>AGENT_WORKER_ID</Code>, <Code>AGENT_WORKER_ADDRESS</Code> appended to{" "}
        <Code>.env</Code> with a comment. The key is never logged.
      </>
    ),
  },
  {
    key: "Gas",
    value: (
      <>
        <Code>topUpIfLow(address, 0.7, 1)</Code> sends 1 HBAR from the operator wallet when the worker is below 0.7
        HBAR; called once at start by both scripts.
      </>
    ),
  },
] as const;

const FRAME_ROWS = [
  { key: <Code>evt</Code>, value: <><Code>&quot;Deliverable&quot;</Code></> },
  { key: <><Code>jobId</Code>, <Code>taskId</Code></>, value: <>The task the frame completes.</> },
  { key: <Code>agent</Code>, value: <>The worker address (the <Code>subAgent</Code> on-chain).</> },
  { key: <Code>role</Code>, value: <>The task&apos;s role string, e.g. <Code>market-research</Code>.</> },
  { key: <><Code>model</Code>, <Code>provider</Code></>, value: <>The model the Router reported and <Code>&quot;0G Compute Router&quot;</Code>.</> },
  { key: <Code>chars</Code>, value: <>Length of <Code>text</Code>.</> },
  { key: <Code>keccak256</Code>, value: <>Hash of <Code>text</Code>; the same value is sent as <Code>resultHash</Code>.</> },
  { key: <Code>text</Code>, value: <>The deliverable, verbatim. This is the string that was hashed.</> },
  { key: <Code>ts</Code>, value: <>ISO timestamp set by the worker.</> },
] as const;

const ENV_ROWS = [
  { key: <Code>ZG_API_KEY</Code>, value: <>Required. 0G Compute Router key (<Code>sk-...</Code>). Empty means the worker exits at start with a clear message.</> },
  { key: <Code>ZG_BASE_URL</Code>, value: <>Default <Code>https://router-api.0g.ai/v1</Code>.</> },
  { key: <Code>ZG_MODEL</Code>, value: <>Default <Code>glm-5.2</Code>.</> },
  { key: <Code>SUBGRAPH_URL</Code>, value: <>Default <Code>{SUBGRAPH_PUBLIC}</Code>; falls back to <Code>NEXT_PUBLIC_SUBGRAPH_URL</Code>.</> },
  { key: <Code>POLL_MS</Code>, value: <>Default <Code>10000</Code> (minimum 2000).</> },
  { key: <Code>HEDERA_HCS_TOPIC_ID</Code>, value: <>The topic the frame is written to; its submit key is the operator.</> },
] as const;

export default function AgentsPage() {
  return (
    <Prose>
      <p className="mono-label">Roles</p>
      <H1 className="mt-3">The sub-agent worker</H1>
      <Lede>
        The worker is the process that does the work a task pays for. It owns one Hedera account, watches the
        subgraph for tasks assigned to that account, produces the deliverable with a real model call on the 0G
        Compute Router, anchors the text on the Hedera Consensus Service and completes the task on-chain with the
        hash of exactly that text. Settlement pays it in aUSD over the Hedera Token Service.
      </Lede>

      <H2 id="what">What the worker is</H2>
      <P>
        <Code>scripts/seed.js</Code> simulates sub-agents: the operator commits hashes on their behalf and no model is
        involved. <Code>scripts/agent-worker.js</Code> replaces that with an actual sub-agent. It signs{" "}
        <Code>completeTask</Code> with its own key, so the <Code>task.subAgent</Code> check in{" "}
        <Code>AetherisAgency</Code> (<Addr value={AGENCY_ADDRESS} short />) is exercised for real, and the
        deliverable it commits to is readable by anyone from the mirror node.
      </P>
      <KV rows={IDENTITY_ROWS} caption="The worker identity" />

      <H2 id="loop">The loop</H2>
      <OL className="mt-6 space-y-4">
        <LI>
          <strong>Poll the subgraph.</strong> Every <Code>POLL_MS</Code> the worker queries{" "}
          <Code>{'tasks(where: { subAgent: "<address>", status: Assigned })'}</Code> with <Code>id</Code>,{" "}
          <Code>taskId</Code>, <Code>role</Code>, <Code>fee</Code> and <Code>job {"{ jobId specURI }"}</Code>. Task
          ids already handled in this process are skipped. Before spending anything it reads{" "}
          <Code>getTask(jobId, taskId)</Code> and confirms the task is still <Code>Assigned</Code> to this address.
        </LI>
        <LI>
          <strong>Infer on 0G Compute.</strong> A short system prompt (&quot;You are an autonomous sub-agent inside
          the Aetheris agency on Hedera...&quot;) and a user prompt carrying the role, the job <Code>specURI</Code>{" "}
          and the fee are sent to <Code>POST {"{ZG_BASE_URL}"}/chat/completions</Code> with{" "}
          <Code>max_tokens: 900</Code>, a 120 s timeout and three attempts with backoff on 429, 5xx and network
          errors. The deliverable is <Code>choices[0].message.content</Code>, trimmed. Any failure logs and skips the
          task; it is picked up again on the next poll.
        </LI>
        <LI>
          <strong>Anchor on HCS.</strong> The frame below is submitted to topic{" "}
          <Addr value={HCS_TOPIC} kind="topic" /> through <Code>scripts/hcs.js</Code>. If the compact JSON would
          exceed 3,900 bytes the text is shortened first and the hash recomputed, so the hashed string and the
          anchored <Code>text</Code> field are always identical.
        </LI>
        <LI>
          <strong>Complete the task.</strong>{" "}
          <Code>completeTask(jobId, taskId, keccak256(text), topicId, sequenceNumber)</Code> is sent by the worker
          wallet with 600,000 gas. The contract stores <Code>resultHash</Code>, emits <Code>TaskCompleted</Code> and{" "}
          <Code>HcsLogAnchored</Code> with the same topic and sequence number, and moves the task to{" "}
          <Code>Completed</Code>. One log line per task records job, task, role, model, token usage, HCS sequence,
          transaction hash and its HashScan link.
        </LI>
        <LI>
          <strong>Get paid at settlement.</strong> When the operator calls <Code>settleJob</Code> the treasury pays
          the fee to the worker through the HTS precompile (<Code>MicroSettlement.viaHts = true</Code>) in aUSD{" "}
          <Addr value={AUSD_EVM} kind="token" short />. The worker does not settle; see the limits below.
        </LI>
      </OL>
      <KV rows={FRAME_ROWS} caption="The Deliverable frame" />

      <H3 id="briefs">Job briefs</H3>
      <P>
        A job&apos;s <Code>specURI</Code> is an opaque string to the contract, so the demo gives it a shape the
        worker can read: <Code>hcs://&lt;topicId&gt;/&lt;sequenceNumber&gt;</Code> points at a{" "}
        <Code>JobBrief</Code> frame on the audit topic,{" "}
        <Code>{'{ evt: "JobBrief", title, role, client, chars, keccak256, text }'}</Code>, where{" "}
        <Code>keccak256</Code> covers exactly <Code>text</Code>. <Code>scripts/agent-demo.js</Code> anchors the
        brief for the chosen role (<Code>scripts/briefs.js</Code> ships one per role; <Code>--title</Code> and{" "}
        <Code>--brief-file</Code> override it) before <Code>createJob</Code>, and stores the resulting URI on the
        job. Before inferring, the worker parses the URI, fetches the frame chunk-aware from the mirror node,
        checks <Code>evt</Code> and that <Code>keccak256(text)</Code> matches the frame, and puts{" "}
        <Code>Job brief: &lt;title&gt;</Code> plus the text into the user prompt. Briefs are cached per URI; if the
        frame is missing, malformed or fails the hash check the worker logs once and falls back to the plain
        specURI prompt, so a bad brief never blocks a task and never changes what is hashed and anchored.
      </P>

      <H2 id="run">How to run it</H2>
      <Pre title="shell">{`npm run agent:worker        # node scripts/agent-worker.js - long-running, Ctrl-C to stop
npm run agent:demo          # node scripts/agent-demo.js  - operator side, one job end to end
node scripts/agent-demo.js --role technical-writing                 # anchors the built-in brief for that role
node scripts/agent-demo.js --role security-audit --brief-file brief.txt --title "Escrow review"
node scripts/agent-demo.js --spec ipfs://your-spec                  # explicit specURI, no brief anchored`}</Pre>
      <P>
        Start the worker in one terminal. It prints its address, model, subgraph URL, poll interval and HBAR
        balance, tops itself up from the operator if low, and then waits. In a second terminal the demo creates the
        identity if it does not exist yet, anchors the job brief on HCS and prints its title, sequence number and
        mirror node URL, approves and funds a job with 1.20 aUSD over HTS, assigns one task at
        0.40 aUSD to the worker with the role you pass (default <Code>market-research</Code>), polls{" "}
        <Code>getTask</Code> until it is <Code>Completed</Code> (six minutes, with a reminder to start the worker
        if nothing happens), settles the job, and prints a summary: worker address, HCS sequence, on-chain{" "}
        <Code>resultHash</Code>, the deliverable text fetched back from the mirror node, <Code>hash match</Code>,
        the <Code>MicroSettlement</Code> amount and <Code>viaHts</Code> flag, and HashScan links for every
        transaction. The demo exits non-zero if the hash does not match.
      </P>
      <KV rows={ENV_ROWS} caption="Environment" />
      <Callout tone="warn" label="No key, no work">
        With <Code>ZG_API_KEY</Code> empty the worker refuses to start. It never falls back to a canned or locally
        generated response: a task is completed only with text that came back from the Router, and every request
        to the Router is billed on-chain to that key.
      </Callout>

      <H2 id="verify">How to verify a deliverable</H2>
      <P>
        Verification needs nothing from Aetheris. The chain holds the hash, the mirror node holds the text.
      </P>
      <OL className="mt-6 space-y-4">
        <LI>
          Read <Code>getTask(jobId, taskId)</Code> on the agency for <Code>resultHash</Code>, and the{" "}
          <Code>TaskCompleted</Code> event (or the subgraph&apos;s <Code>Task.hcsSequenceNumber</Code>) for the
          topic and sequence number.
        </LI>
        <LI>
          Fetch <Code>{MIRROR_EXAMPLE}</Code>. The <Code>message</Code> field is base64. HCS messages are capped at
          1,024 bytes, so a frame longer than that is split by the SDK into consecutive chunks, each with its own
          sequence number and a <Code>chunk_info {"{ initial_transaction_id, number, total }"}</Code>. The anchor
          points at chunk 1; when <Code>total</Code> is above 1, fetch the following sequence numbers with the same{" "}
          <Code>initial_transaction_id</Code>, concatenate the decoded chunks in <Code>number</Code> order, then parse
          the JSON. <Code>fetchFrame</Code> in <Code>scripts/agent-identity.js</Code>,{" "}
          <Code>mirrorMessage</Code> in <Code>scripts/hcs.js</Code> and the dashboard&apos;s{" "}
          <Code>readHcsMessages</Code> all do exactly this.
        </LI>
        <LI>
          Compute <Code>keccak256(utf8(frame.text))</Code> and compare with <Code>resultHash</Code>. Equal means
          the text on the mirror node is the deliverable the sub-agent committed to on-chain, byte for byte.
        </LI>
      </OL>
      <Pre title="node">{`const { ethers } = require("ethers");
const { fetchFrame } = require("./scripts/agent-identity");
const f = await fetchFrame("${HCS_TOPIC}", seq);      // reassembles chunks
const frame = JSON.parse(f.contents);
const hash = ethers.keccak256(ethers.toUtf8Bytes(frame.text));
console.log(hash === onChainResultHash, f.chunks, f.sequenceNumbers);`}</Pre>
      <H3 id="what-it-proves">What the match proves</H3>
      <P>
        That the text was fixed at the consensus timestamp of the frame and has not changed since, and that the
        worker committed to it on-chain. It does not prove the text is good, or that a particular model produced it:
        the <Code>model</Code> and <Code>provider</Code> fields are the worker&apos;s own statement, and the 0G
        Router&apos;s on-chain billing record is the place to corroborate that a request was made.
      </P>

      <H2 id="limits">Honest limits</H2>
      <UL>
        <LI>
          <strong>One identity per process.</strong> The worker serves one address. Running several workers means
          several accounts and several <Code>.env</Code> files; there is no multi-tenant mode.
        </LI>
        <LI>
          <strong>Deliverable size cap.</strong> The prompt asks for about 2,500 characters and the frame is capped at
          3,900 bytes, which the SDK splits into up to four 1,024-byte HCS chunks. A reader that shows one sequence
          number at a time (the dashboard audit stream included) sees a partial JSON for chunks of a Deliverable;
          only a chunk-aware reader reassembles it. Longer work would need an off-chain blob with the hash anchored.
        </LI>
        <LI>
          <strong>The Router bills per request.</strong> Every inference, including retries after a Router 5xx and
          re-runs of a task whose <Code>completeTask</Code> failed, costs the key&apos;s on-chain balance.
        </LI>
        <LI>
          <strong>The operator still settles.</strong> <Code>settleJob</Code> and <Code>assignSubAgent</Code> are{" "}
          <Code>onlyOwner</Code>. The worker is paid only when the operator settles, and nothing forces that.
        </LI>
        <LI>
          <strong>The HCS submit key is the operator&apos;s.</strong> Frames are written with{" "}
          <Code>HEDERA_OPERATOR_KEY</Code>, so the worker and the operator share a machine or a secret. A production
          worker would write to its own topic, or the topic would carry a threshold submit key.
        </LI>
        <LI>
          <strong>Subgraph lag.</strong> A task is seen when the subgraph has indexed <Code>SubAgentAssigned</Code>.
          The on-chain check before inferring guards against stale rows, not against late ones.
        </LI>
      </UL>
      <Callout label="Where this sits">
        The worker is a client of the contracts, not part of them. Everything in{" "}
        <A href="/docs/jobs-and-escrow">Jobs &amp; escrow</A> and <A href="/docs/settlement">Settlement rails</A>{" "}
        holds unchanged; the worker only changes who calls <Code>completeTask</Code> and what the hash points at.
      </Callout>
    </Prose>
  );
}
