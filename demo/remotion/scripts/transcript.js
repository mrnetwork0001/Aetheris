// Writes src/transcript.ts from the real logs of the job that appears in the video.
//
// The terminal scenes type out lines from these files, so every hash, sequence number and
// amount on screen is the one the chain has - nothing in the composition is typed by hand.
//
//   node scripts/transcript.js
//
// Sources, in order of preference:
//   1. public/logs/demo.log + public/logs/worker.log  (job #17, written while it ran)
//   2. the earlier security-audit run + the worker's session log, if job #17 never finished
//
// If the marker file for job #17 does not yet say JOB17_DONE, this polls for it every 30s for
// up to 12 minutes before falling back, so the composition can be built while the job is live.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRATCH = '/private/tmp/claude-501/-Users-mrnetwork-Aetheris/cdfcb99d-a34f-44ac-9b1a-e02c2734d461/scratchpad';
const MARKER = path.join(SCRATCH, 'run-job17.out');
const LIVE = { demo: path.join(ROOT, 'public/logs/demo.log'), worker: path.join(ROOT, 'public/logs/worker.log') };
const FALLBACK = { demo: path.join(SCRATCH, 'jobs-demo-security-audit.log'), worker: path.join(SCRATCH, 'jobs-worker.log') };

const POLL_MS = 30_000;
const POLL_LIMIT_MS = 12 * 60_000;

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jobDone = () => {
  const marker = read(MARKER);
  // The marker is the authority, but a demo.log that already reached settlement counts too -
  // the marker is written by the wrapper script and can lag the log by a few seconds.
  return marker.includes('JOB17_DONE') || /settleJob \.+ https:/.test(read(LIVE.demo));
};

/* ── line classification ─────────────────────────────────────────────────── */

const HASHSCAN = /https:\/\/hashscan\.io\/testnet\/transaction\/(0x[0-9a-fA-F]{64})/g;

/** Shortens a HashScan URL to its hash - the scene shows the hash and says where to open it. */
const tidy = (text) =>
  text
    .replace(HASHSCAN, (_, h) => h)
    .replace(/(0x[0-9a-fA-F]{64})\s+\1/, '$1') // the worker's DONE line names the same tx twice
    .replace(/\s+$/, '');

const toneOf = (text) => {
  if (/^\$ /.test(text)) return 'cmd';
  if (/hash match: true|payout check: true|DONE job|JobSettled|is Completed/.test(text)) return 'ok';
  if (/0x[0-9a-fA-F]{64}/.test(text)) return 'tx';
  if (/failed|SKIP|still Assigned|retrying/.test(text)) return 'warn';
  if (/^(worker|agency|model|subgraph|HCS topic|poll interval|HBAR balance|operator aUSD|worker HBAR|worker aUSD) /.test(text)) return 'dim';
  return 'text';
};

/** demo.log has no timestamps: t is the line's order. Section rules become 'head' lines. */
const parseDemo = (raw) => {
  const out = [];
  const lines = raw.split('\n');
  let t = 0;
  let inSummary = false;
  let inDeliverable = false;
  const deliverable = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^-{20,}$/.test(line.trim())) continue;
    if (!line.trim()) continue;
    const trimmed = line.replace(/^\s{2}/, '').replace(/\s+$/, '');
    if (/^\s{2}\S/.test(line) && lines[i - 1] && /^-{20,}$/.test(lines[i - 1].trim())) {
      inSummary = trimmed === 'Summary';
      out.push({ t: t++, text: trimmed, tone: 'head' });
      continue;
    }
    if (/^\s{2}deliverable \(from the mirror node\):/.test(line)) { inDeliverable = true; continue; }
    if (inDeliverable) {
      if (/^\s{2}payout check/.test(line)) inDeliverable = false;
      else { deliverable.push(line.replace(/^\s{4}/, '').replace(/\s+$/, '')); continue; }
    }
    out.push({ t: t++, text: tidy(trimmed), tone: toneOf(tidy(trimmed)), summary: inSummary });
  }
  return { lines: out, deliverable };
};

/** worker.log lines carry [HH:MM:SS]: t is seconds since the first stamped line. */
const parseWorker = (raw, jobId) => {
  const out = [];
  let t0 = null;
  let keep = true; // header lines before the first stamp are always kept
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const m = line.match(/^\[(\d\d):(\d\d):(\d\d)\]\s*(.*)$/);
    if (!m) {
      const text = line.replace(/^\s{2}/, '').replace(/\s+$/, '');
      out.push({ t: 0, text: tidy(text), tone: /^Aetheris/.test(text) ? 'head' : toneOf(tidy(text)) });
      continue;
    }
    const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const text = tidy(m[4].replace(/\s+$/, ''));
    // The session log covers several jobs; keep the block belonging to the job in the video.
    if (/assigned task\(s\) to work on/.test(text)) keep = true;
    if (/inferring job #(\d+)/.test(text)) keep = Number(text.match(/inferring job #(\d+)/)[1]) === jobId;
    if (/^DONE job (\d+)/.test(text)) keep = Number(text.match(/^DONE job (\d+)/)[1]) === jobId;
    if (/brief ".*" read from/.test(text) && t0 === null) keep = true;
    if (!keep) continue;
    if (t0 === null) t0 = secs;
    out.push({ t: secs - t0, text, tone: toneOf(text), stamp: `${m[1]}:${m[2]}:${m[3]}` });
  }
  // The session log covers several jobs. Keep the header, then the block for this job: the
  // "assigned task(s)" and "brief read" lines that precede its "inferring" line, through DONE.
  const header = out.filter((l) => !l.stamp);
  const stamped = out.filter((l) => l.stamp);
  let start = stamped.findIndex((l) => new RegExp(`inferring job #${jobId}\\b`).test(l.text));
  while (start > 0 && /assigned task\(s\)|read from hcs:/.test(stamped[start - 1].text)) {
    start -= 1;
    if (/assigned task\(s\)/.test(stamped[start].text)) break;
  }
  const body = start >= 0 ? stamped.slice(start) : stamped;
  const end = body.findIndex((l) => new RegExp(`^DONE job ${jobId}\\b`).test(l.text));
  const cut = end >= 0 ? body.slice(0, end + 1) : body;
  const base = cut.length ? cut[0].t : 0;
  return header.concat(cut.map((l) => ({ ...l, t: l.t - base })));
};

/* ── facts pulled out of the lines, so scenes can lay them out as cards ──── */

const facts = (demoText, workerText) => {
  const g = (re, i = 1) => { const m = demoText.match(re); return m ? m[i] : ''; };
  const gw = (re, i = 1) => { const m = workerText.match(re); return m ? m[i] : ''; };
  const chunks = (g(/HCS seq \.+ \d+\s+\((\d+) chunk\(s\): ([\d, ]+)\)/, 2) || '').split(/,\s*/).filter(Boolean).map(Number);
  return {
    jobId: Number(g(/job \/ task \.+ #(\d+)/)),
    taskId: Number(g(/job \/ task \.+ #\d+ \/ #(\d+)/)),
    status: g(/job \/ task \.+ #\d+ \/ #\d+\s+\((\w+)\)/),
    title: g(/brief title \.+ (.+)/),
    role: g(/role \/ model \.+ ([\w-]+) \//),
    model: g(/role \/ model \.+ [\w-]+ \/ ([\w.-]+)/),
    briefChars: Number(g(/brief \.+ (\d+) chars/)),
    briefHash: g(/brief HCS seq \.+ \d+\s+keccak256 (0x[0-9a-fA-F]{64})/),
    briefSeq: Number(g(/brief HCS seq \.+ (\d+)/)),
    briefConsensus: g(/HCS seq \.+ \d+\s+consensus ([\d.]+)/),
    specURI: g(/specURI \.+ (hcs:\/\/[\d.\/]+)/),
    topic: g(/on HCS (0\.0\.\d+)/),
    token: g(/\(HTS (0\.0\.\d+)\)/),
    depositUsd: g(/Funding the job - ([\d.]+) aUSD/),
    feeUsd: g(/fee ([\d.]+) aUSD/),
    paidUsd: g(/JobSettled \.+ paid ([\d.]+)/),
    marginUsd: g(/JobSettled \.+ paid [\d.]+\s+margin ([\d.]+)/),
    gas: Number(g(/settleJob \.+ \S+\s+\(gas (\d+)\)/)),
    workerAddress: g(/worker address \.+ (0x[0-9a-fA-F]{40})/),
    workerHedera: g(/worker address \.+ 0x[0-9a-fA-F]{40}\s+\(Hedera (0\.0\.\d+)\)/),
    workerAusdAfter: g(/worker aUSD \.+ ([\d.]+)/),
    resultHash: g(/on-chain resultHash \. (0x[0-9a-fA-F]{64})/),
    textHash: g(/keccak256\(text\) \.+ (0x[0-9a-fA-F]{64})/),
    hashMatch: /hash match: true/.test(demoText),
    hcsSeq: Number(g(/HCS seq \.+ (\d+)\s+\(\d+ chunk/)),
    chunks,
    frameBytes: Number(g(/frame \.+ \d+ chunk\(s\), seq [\d, ]+, (\d+) bytes/)),
    consensus: g(/HCS seq \.+ \d+\s+\(\d+ chunk\(s\): [\d, ]+\)\s+consensus ([\d.]+)/),
    mirrorUrl: (demoText.match(/mirror node \.+ (https:\S+\/messages\/\d+)/g) || []).map((m) => m.replace(/.*(https:\S+)$/, '$1')).find((u) => u.endsWith('/messages/' + g(/HCS seq \.+ (\d+)\s+\(\d+ chunk/))) || '',
    briefMirrorUrl: g(/brief mirror node \. (https:\S+)/),
    tx: {
      approve: g(/approve \.+ (?:https:\/\/hashscan\.io\/testnet\/transaction\/)?(0x[0-9a-fA-F]{64})/),
      createJob: g(/createJob \.+ (?:https:\/\/hashscan\.io\/testnet\/transaction\/)?(0x[0-9a-fA-F]{64})/),
      assignSubAgent: g(/assignSubAgent \.+ (?:https:\/\/hashscan\.io\/testnet\/transaction\/)?(0x[0-9a-fA-F]{64})/),
      completeTask: g(/completeTask \.+ (?:https:\/\/hashscan\.io\/testnet\/transaction\/)?(0x[0-9a-fA-F]{64})/),
      settleJob: g(/settleJob \.+ (?:https:\/\/hashscan\.io\/testnet\/transaction\/)?(0x[0-9a-fA-F]{64})/),
    },
    viaHts: /MicroSettlement \.+ viaHts true/.test(demoText),
    tokens: gw(/tokens (\d+\+\d+)/),
    routerUrl: gw(/via 0G Compute Router \((https:\S+)\)/),
  };
};

/* ── main ────────────────────────────────────────────────────────────────── */

(async () => {
  const started = Date.now();
  while (!jobDone() && Date.now() - started < POLL_LIMIT_MS) {
    const waited = Math.round((Date.now() - started) / 1000);
    console.log(`  job #17 not finished yet (${waited}s) - polling ${MARKER}`);
    await sleep(POLL_MS);
  }

  let src = LIVE;
  let source = 'public/logs/demo.log + public/logs/worker.log';
  if (!jobDone() || !/settleJob \.+/.test(read(LIVE.demo))) {
    src = FALLBACK;
    source = 'scratchpad/jobs-demo-security-audit.log + scratchpad/jobs-worker.log (job #17 did not finish in time)';
    console.log('  falling back to the earlier security-audit run');
  }

  const demoRaw = read(src.demo);
  const workerRaw = read(src.worker);
  if (!demoRaw) { console.error('transcript: no demo log at', src.demo); process.exit(1); }

  const F = facts(demoRaw, workerRaw);
  const demo = parseDemo(demoRaw);
  const worker = parseWorker(workerRaw, F.jobId);

  const out =
    '// Generated by scripts/transcript.js from the real job logs. Do not edit by hand.\n' +
    `// source: ${source}\n` +
    "export type Tone = 'head' | 'cmd' | 'text' | 'dim' | 'tx' | 'ok' | 'warn';\n" +
    'export type Line = { t: number; text: string; tone: Tone; stamp?: string; summary?: boolean };\n' +
    `export const TRANSCRIPT = ${JSON.stringify({
      source,
      generatedAt: new Date().toISOString(),
      command: `npm run agent:demo -- --role ${F.role}`,
      ...F,
      deliverable: demo.deliverable,
      demo: demo.lines,
      worker,
    }, null, 2)} as const;\n`;

  fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src/transcript.ts'), out);
  console.log(`  transcript: job #${F.jobId} task #${F.taskId} (${F.status}) - ${demo.lines.length} demo lines, ${worker.length} worker lines`);
  console.log(`  settleJob ${F.tx.settleJob}`);
  console.log(`  resultHash ${F.resultHash}  hash match ${F.hashMatch}`);
  const missing = Object.entries({ ...F.tx, resultHash: F.resultHash, briefHash: F.briefHash, specURI: F.specURI }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { console.error('  missing facts:', missing.join(', ')); process.exit(1); }
})();
