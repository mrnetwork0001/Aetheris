import type { Metadata } from "next";

import { A, Addr, Callout, Code, H1, H2, H3, KV, LI, Lede, OL, P, Pre, Prose, UL } from "@/components/docs/prose";

export const metadata: Metadata = {
  title: "Audit log",
  description:
    "How Aetheris writes every lifecycle step to a Hedera Consensus Service topic before the contract call, why the sequence numbers match on-chain, and how append-only corrections work.",
};

const HCS_TOPIC = "0.0.10518320";
const OPERATOR_ACCOUNT = "0.0.10484502";
const OPERATOR_EVM = "0x69677C85945796066B449c00F90A0582896F1F9b";
const MIRROR = "https://testnet.mirrornode.hedera.com";
const MESSAGE_URL = (seq: number) => `https://testnet.mirrornode.hedera.com/api/v1/topics/${HCS_TOPIC}/messages/${seq}`;

/* Decoded frames returned by GET /api/hcs?limit=8 on 2026-09-13 (newest first). */
const REAL_FRAMES = `# 24  TaskCompleted   consensus 1789277166.379879104
{"evt":"TaskCompleted","jobId":7,"taskId":0,
 "agent":"0x836d433faffaa8113edb1cdbF7AfB036134e1c61",
 "resultHash":"0x86acc9d1bd5c8e333a5d6066b31d1121829b380a5a7aa3a3d39e43ae9a589e3f",
 "ts":"2026-09-13T05:26:05.802Z"}

# 23  SubAgentAssigned
{"evt":"SubAgentAssigned","jobId":7,"taskId":1,
 "agent":"0xC46b2ecd39741c46f8467B8bF3EF8d5B1757DBC1",
 "amount":"520000","token":"0x21DCc52AbbCAef92B4573dc8B0e1658417c85961",
 "ts":"2026-09-13T05:25:53.440Z"}

# 21  JobCreated
{"evt":"JobCreated","jobId":7,
 "token":"0x21DCc52AbbCAef92B4573dc8B0e1658417c85961","amount":"1800000",
 "ts":"2026-09-13T05:25:29.575Z"}

# 20  JobSettled
{"evt":"JobSettled","jobId":6,"amount":"830000","margin":"470000",
 "token":"0x21DCc52AbbCAef92B4573dc8B0e1658417c85961",
 "tx":"0xf09e95cbcecf5690b8dea4214eefd2361704dd9db61c0f3f1822968ac93ba5e4",
 "ts":"2026-09-13T05:25:26.387Z"}

# 19  MicroSettlement
{"evt":"MicroSettlement","jobId":6,"taskId":1,
 "agent":"0x836d433faffaa8113edb1cdbF7AfB036134e1c61",
 "amount":"380000","token":"0x21DCc52AbbCAef92B4573dc8B0e1658417c85961",
 "viaHts":false,
 "tx":"0xf09e95cbcecf5690b8dea4214eefd2361704dd9db61c0f3f1822968ac93ba5e4",
 "ts":"2026-09-13T05:25:23.686Z"}`;

const PROFIT_FRAME = `# 26  ProfitClaimed   (the one real margin sweep: 0.5 aUSD)
{"evt":"ProfitClaimed",
 "token":"0x00000000000000000000000000000000009ffBC1","amount":"500000",
 "to":"0x69677C85945796066B449c00F90A0582896F1F9b",
 "operator":"0x69677C85945796066B449c00F90A0582896F1F9b",
 "tx":"0x830486f9c20907b2db3a73e20a962fc6008b7121c65dbd3e9bfa2cbb81510c50",
 "block":40453585,
 "nullifierHash":"33191758600377127106447200483207683596308527199321386374340904067837022123",
 "ts":"2026-09-13T06:25:33.318Z"}`;

const CORRECTION_FRAME = `# 27  Correction   consensus 1789280736.723520104
{"evt":"Correction","voids":[25],"reason":"test frame; no on-chain event",
 "tx":null,"ts":"2026-09-13T06:25:35.933Z"}`;

const VOIDED_FRAME = `# 25  (voided by #27; still on the mirror node, dropped by readers)
{"evt":"ProfitClaimed",
 "operator":"0x69677c85945796066b449c00f90a0582896f1f9b",
 "amount":"$0.00",
 "nullifier":"33191758600377127106447200483207683596308527199321386374340904067837022123",
 "agency":"0x16fa9cc838ab5380f0ebe3c261a2f57e0fbabc81",
 "ts":"2026-09-13T06:10:21.632Z","src":"aetheris/api/hcs"}`;

const SEED_ORDER = `// scripts/seed.js
// TaskCompleted - HCS first; the returned sequence number is what the contract anchors.
const msg = await anchor({ evt: "TaskCompleted", jobId, taskId: i, agent, resultHash });
await agency.completeTask(jobId, i, resultHash, TOPIC, msg.sequenceNumber, { gasLimit: 600_000 });`;

const APPLY_CORRECTIONS = `// lib/hedera.ts
export function applyHcsCorrections(messages: HcsMessage[]): HcsMessage[] {
  const voided = new Set<string>();
  const corrections = new Set<string>();
  for (const m of messages) {
    const c = parseHcsCorrection(m);
    if (!c) continue;
    corrections.add(m.sequenceNumber);
    for (const seq of c.voids) voided.add(seq);
  }
  if (voided.size === 0) return messages;
  return messages.filter((m) => corrections.has(m.sequenceNumber) || !voided.has(m.sequenceNumber));
}`;

export default function AuditLogPage() {
  return (
    <Prose>
      <p className="mono-label">Protocol</p>
      <H1 className="mt-3">Audit log</H1>
      <Lede>
        Every lifecycle step in Aetheris is written to a single Hedera Consensus Service topic as a
        compact JSON frame <strong>before</strong> the matching contract call. HCS gives each frame a
        consensus timestamp and a sequence number that nobody - including the operator - can edit or
        delete afterwards.
      </Lede>
      <P>
        The log answers the question the contracts alone cannot: what did the agency intend to do, in
        what order, and with which deliverable hash, at the moment it did it. The contracts hold the
        money; the topic holds the narrative. The two are tied together by the sequence numbers that{" "}
        <Code>completeTask</Code> stores on-chain.
      </P>

      <H2 id="topic">The topic</H2>
      <KV
        caption="Identifiers for the Aetheris audit topic"
        rows={[
          {
            key: "Topic id",
            value: (
              <>
                <Addr value={HCS_TOPIC} kind="topic" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">Hedera testnet; append-only</span>
              </>
            ),
          },
          {
            key: "Submit key",
            value: (
              <>
                <Addr value={OPERATOR_ACCOUNT} kind="account" />
                <span className="mt-1 block text-[0.8rem] text-fl-dim">
                  The operator account (EVM alias{" "}
                  <span className="data-mono break-all">{OPERATOR_EVM}</span>). Only this key can append
                  frames; anyone can read them.
                </span>
              </>
            ),
          },
          {
            key: "Mirror node",
            value: (
              <Code className="break-all">
                {MIRROR}/api/v1/topics/{HCS_TOPIC}/messages/&lt;seq&gt;
              </Code>
            ),
          },
          {
            key: "Explorer",
            value: (
              <Code className="break-all">https://testnet.mirrornode.hedera.com/api/v1/topics/{HCS_TOPIC}/messages/&lt;seq&gt;</Code>
            ),
          },
          {
            key: "In the app",
            value: (
              <>
                <A href="/dashboard#audit">/dashboard#audit</A> and <Code>GET /api/hcs?limit=</Code>
              </>
            ),
          },
        ]}
      />
      <P>
        The writer is <Code>submitHcsMessage</Code> in <Code>lib/hedera.ts</Code>: a server-only
        function that loads <Code>@hashgraph/sdk</Code> dynamically, signs a{" "}
        <Code>TopicMessageSubmitTransaction</Code> with <Code>HEDERA_OPERATOR_ID</Code> /{" "}
        <Code>HEDERA_OPERATOR_KEY</Code>, and returns the sequence number from the receipt. The reader
        is <Code>readHcsMessages</Code> in the same file; it uses the mirror node REST API rather than a
        gRPC subscription so that a request handler never holds a long-lived stream open.
      </P>

      <H2 id="record-format">Record format</H2>
      <P>
        A frame is one JSON object, one line, no schema version field. The key set is small and
        stable:
      </P>
      <UL>
        <LI>
          <Code>evt</Code> - the event name. Mirrors the contract event it precedes:{" "}
          <Code>JobCreated</Code>, <Code>SubAgentAssigned</Code>, <Code>TaskCompleted</Code>,{" "}
          <Code>MicroSettlement</Code>, <Code>JobSettled</Code>, <Code>ProfitClaimed</Code>, and the
          log-only <Code>Correction</Code>.
        </LI>
        <LI>
          <Code>jobId</Code>, <Code>taskId?</Code> - the same identifiers the contract uses. Task ids
          are zero-based indexes within a job.
        </LI>
        <LI>
          <Code>agent?</Code>, <Code>token?</Code>, <Code>amount?</Code> - the sub-agent, the
          settlement token and the amount in base units (6 decimals for both aUSD and aUSDC), as
          strings so nothing is lost to JSON number precision.
        </LI>
        <LI>
          <Code>resultHash?</Code> - the 32-byte hash of the deliverable committed by{" "}
          <Code>completeTask</Code>.
        </LI>
        <LI>
          <Code>tx?</Code> - the Hedera EVM transaction hash, present on frames written after a
          settlement transaction (the seed writes <Code>MicroSettlement</Code> and{" "}
          <Code>JobSettled</Code> frames once it has the receipt).
        </LI>
        <LI>
          <Code>ts</Code> - the writer&apos;s wall clock in ISO 8601. Informational only; the
          authoritative time is the consensus timestamp the mirror node assigns.
        </LI>
      </UL>
      <P>
        These are real frames decoded from <Code>GET /api/hcs?limit=8</Code> on the running app. Frames
        #21 to #24 are the start of job 7; #19 and #20 close out job 6 over the ERC-20 rail
        (<Code>viaHts: false</Code>):
      </P>
      <Pre title="GET /api/hcs - decoded contents">{REAL_FRAMES}</Pre>
      <P>
        The <Code>ProfitClaimed</Code> frame carries extra fields because a margin sweep has more to
        prove: the recipient, the block, and the World ID nullifier that authorised it.
      </P>
      <Pre title="GET /api/hcs - frame #26">{PROFIT_FRAME}</Pre>

      <H2 id="anchor-first">Anchor first, then call the contract</H2>
      <P>
        The order is deliberate. For every step the writer submits the HCS frame, waits for the
        receipt, and only then sends the contract transaction. For <Code>TaskCompleted</Code> the
        relationship is stronger than ordering: the sequence number returned by the receipt is an
        argument to the contract call.
      </P>
      <Pre title="scripts/seed.js">{SEED_ORDER}</Pre>
      <P>
        <Code>AetherisAgency.completeTask(jobId, taskId, resultHash, hcsTopicId, hcsSequenceNumber)</Code>{" "}
        stores the result hash and emits two events: <Code>TaskCompleted</Code> and{" "}
        <Code>HcsLogAnchored(jobId, messageHash, topicId, sequenceNumber)</Code>. So for every completed
        task there are three records of the same <Code>(topicId, sequenceNumber)</Code> pair:
      </P>
      <OL>
        <LI>the frame on the mirror node, at that sequence number;</LI>
        <LI>
          the <Code>HcsLogAnchored</Code> event in the transaction receipt on Hedera EVM;
        </LI>
        <LI>
          the <Code>HcsAnchor</Code> and <Code>Task.hcsSequenceNumber</Code> entities in the subgraph,
          indexed from that event.
        </LI>
      </OL>
      <P>
        Anyone can join them. The seed script does exactly that at the end of a run - its
        &quot;HCS anchors - mirror node vs on-chain vs subgraph&quot; table reads each anchored pair back
        from the emitted event and fetches the same sequence number from the mirror node, and reports a
        match only when all three agree. The contract also refuses an empty topic id
        (<Code>EmptyHcsTopic</Code>), so a task cannot be completed without naming its anchor.
      </P>
      <Callout label="Why not write the frame after the transaction?">
        If the frame came second, a transaction that succeeded on-chain could be left without a log
        entry by a crash in between, and the sequence number the contract stores would have to be
        guessed. Writing first means the contract call can reference a sequence number that already
        exists. The price is the opposite failure mode - a frame whose transaction never happened - and
        that is what corrections are for.
      </Callout>

      <H2 id="corrections">Corrections are append-only</H2>
      <P>
        HCS is immutable, so a mistaken frame can never be deleted. Instead the operator appends a{" "}
        <Code>Correction</Code> frame that names the sequence numbers it retracts and says why. The
        topic contains one today. Frame #25 was a <Code>ProfitClaimed</Code> frame composed by the{" "}
        <Code>POST /api/hcs</Code> relay (you can tell from <Code>src: &quot;aetheris/api/hcs&quot;</Code>{" "}
        and the formatted <Code>$0.00</Code> amount) with no corresponding on-chain event. Frame #27
        voids it:
      </P>
      <Pre title={`mirror node - message 27 (${MESSAGE_URL(27)})`}>{CORRECTION_FRAME}</Pre>
      <Pre title="mirror node - message 25 (retracted)">{VOIDED_FRAME}</Pre>
      <P>
        Both frames stay on the topic forever. What changes is how readers treat them.
      </P>

      <H3 id="how-readers-apply-corrections">How readers apply corrections</H3>
      <P>
        <Code>readHcsMessages</Code> in <Code>lib/hedera.ts</Code> fetches the newest frames from the
        mirror node, decodes each base64 payload, reassembles any frame the SDK split into 1,024-byte
        chunks (the chunks share an <Code>initial_transaction_id</Code>; the whole frame keeps the
        sequence number of chunk 1, which is where an on-chain anchor points), and passes the list
        through <Code>applyHcsCorrections</Code>:
      </P>
      <Pre title="lib/hedera.ts">{APPLY_CORRECTIONS}</Pre>
      <UL>
        <LI>
          A frame counts as a correction only if <Code>parseHcsCorrection</Code> accepts it:{" "}
          <Code>evt</Code> must be exactly <Code>&quot;Correction&quot;</Code> and <Code>voids</Code> must be
          an array; entries that are not plain non-negative integers (as numbers or numeric strings)
          are ignored. Anything else is an ordinary frame.
        </LI>
        <LI>
          Voided frames are dropped from the result. The correction itself is kept and rendered in the
          feed like any other frame, so what was retracted, and why, stays visible.
        </LI>
        <LI>
          A correction can never void itself or another correction: the filter keeps every sequence
          number in the <Code>corrections</Code> set regardless of what any <Code>voids</Code> list says.
          Retractions are themselves on the record.
        </LI>
        <LI>
          Because dropping frames would otherwise shorten the page, the reader over-fetches by{" "}
          <Code>CORRECTION_OVERFETCH = 10</Code> rows (capped at the mirror node&apos;s 100) and slices
          back to the requested limit afterwards.
        </LI>
      </UL>
      <P>
        This is why <Code>GET /api/hcs?limit=3</Code> returns #27, #26 and #24 - #25 is filtered out
        between them. A reader that goes straight to the mirror node sees #25 and must apply the same
        rule itself.
      </P>
      <Callout tone="warn" label="Scope of a correction">
        A correction changes what readers display. It does not change anything on-chain, and it cannot
        be used to hide a real transaction: the contract events remain, and the subgraph indexes them
        independently of the topic. The only frames that should ever be voided are ones with no
        on-chain counterpart - which is exactly the reason recorded on #27.
      </Callout>

      <H2 id="links">Linking to a frame</H2>
      <P>
        Every frame has a stable URL on HashScan that takes the topic id and the sequence number:
      </P>
      <Pre title="Per-frame link pattern (mirror node; HashScan lists the topic at /topic/<id>/messages)">{`https://testnet.mirrornode.hedera.com/api/v1/topics/${HCS_TOPIC}/messages/<seq>

# examples
${MESSAGE_URL(24)}   TaskCompleted, job 7 task 0
${MESSAGE_URL(26)}   ProfitClaimed, 0.5 aUSD
${MESSAGE_URL(27)}   Correction voiding #25`}</Pre>
      <P>
        The same pair resolves on the mirror node at{" "}
        <Code className="break-all">
          {MIRROR}/api/v1/topics/{HCS_TOPIC}/messages/&lt;seq&gt;
        </Code>
        , which returns the raw record with the payload base64-encoded in <Code>message</Code>. The app
        builds these links with <Code>hashscanUrl(&quot;topic&quot;, id)</Code> from{" "}
        <Code>lib/hedera.ts</Code>.
      </P>

      <H2 id="reading-and-writing">Reading and writing through the app</H2>
      <P>
        <Code>GET /api/hcs?limit=n</Code> (1 to 50, default 12) returns{" "}
        <Code>{`{ topicId, source, messages[] }`}</Code> with corrections already applied. When the topic
        is unset, empty or the mirror node is unreachable the route degrades to{" "}
        <Code>source: &quot;demo&quot;</Code> with a <Code>notice</Code> explaining why - it never presents
        demo frames as live ones, and the dashboard shows the corresponding pill.
      </P>
      <P>
        <Code>POST /api/hcs</Code> exists so the browser can anchor a frame without holding the operator
        key, and it is deliberately narrow: it writes only to the configured topic, accepts only a{" "}
        <Code>ProfitClaimed</Code> frame with the fixed field set <Code>{`{evt, operator, amount, nullifier}`}</Code>,
        re-composes the frame server-side (extra fields are rejected, the nullifier is read from the
        contract rather than the request), requires the named operator to be World-ID-verified in{" "}
        <Code>AetherisAgency</Code>, and is rate-limited to 5 writes per minute per IP. The full request
        and response shapes are on the{" "}
        <A href="/docs/contracts-and-api#http-api">Contracts &amp; HTTP API</A> page.
      </P>
      <Callout tone="warn" label="What the log proves">
        HCS proves that the holder of the submit key said a thing at a consensus-ordered time. It does
        not prove the sub-agent did the work: in the seed, result hashes are committed by the script
        and no model call is part of the contracts. The submit key is the same single operator key that
        deploys contracts and relays transactions. Treat the log as the operator&apos;s signed,
        tamper-evident diary - strong ordering and non-repudiation, not independent attestation.
      </Callout>
    </Prose>
  );
}
