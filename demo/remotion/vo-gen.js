// Generates the narration with ElevenLabs.
//   node vo-gen.js            all sections
//   VO_ONLY=v03 node vo-gen.js   one section (after the live figures are refreshed)
//   VO_SKIP=v03 node vo-gen.js   everything but one
// The key and voice are read from .env next to this file (never committed).
const fs = require('fs');
for (const line of fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Set ELEVENLABS_API_KEY'); process.exit(1); }
// Same voice as the earlier project videos.
const VOICE = process.env.ELEVENLABS_VOICE || 'CwhRBWXzGAHq8TQ4Fs17';
const MODEL = 'eleven_multilingual_v2';

// Every figure is read from chain at the time of writing (see fetch-stats.js) and is checkable.
// v03 carries the live counts: regenerate it after the last job that will appear in the video.
const SECTIONS = [
  ['00', "Aetheris. An autonomous agency with a treasury, on Hedera."],
  ['01', "AI agents can write code, audit contracts and run research. What they cannot do is hold a budget, hire each other, get paid for finished work, or prove afterwards that the work happened. Every agent economy so far runs on a human with a spreadsheet."],
  ['02', "Aetheris is an agency operating system. A client escrows a deposit. The operator, a verified human, dispatches tasks to specialised sub-agents for fixed fees. When the work lands, the treasury settles every fee in the same second through the Hedera Token Service, and every step is anchored on a Hedera Consensus Service topic that anyone can read."],
  ['03', "Everything on this page is read from chain. Seventeen jobs, fourteen settled, twenty micro-settlements, sixteen of them over HTS. No number here is typed in."],
  ['04', "A job starts with a brief. The client writes it, the server anchors it on the audit topic, and the job is created with that anchor as its spec. From this moment the specification is public, hashed, and impossible to edit."],
  ['05', "This is the operator side, unattended. The brief goes onto the topic. The deposit, one point two aUSD, is approved and escrowed with a real HTS transfer. The task is assigned to a sub-agent for forty cents. Then the operator waits."],
  ['06', "The sub-agent is a process holding its own Hedera account. It finds the task in the subgraph, reads the brief back from the mirror node, and does the work on 0G Compute, a real model call billed per request. The deliverable is hashed, anchored on the topic in full, and committed on-chain by the worker's own key."],
  ['07', "The operator settles. One transaction: the treasury pays the sub-agent forty cents through the HTS system contract, keeps the margin, and emits the record."],
  ['08', "Nothing here asks for trust. Fetch the frame from the mirror node, hash the text, and compare it with the result hash the contract stored. They match. The chain holds the hash. The mirror node holds the words."],
  ['09', "Mission control reads the same sources. Every panel says where its data comes from: The Graph for jobs and the leaderboard, the mirror node for the audit stream, the chain for the treasury. When a source is down, the panel says so instead of pretending."],
  ['10', "Built on six pieces that were hard to fake. Hedera for escrow, tokens and consensus. A self-hosted Graph node, because Hedera is not on the hosted service. World ID, so the operator with the keys is one human. 1inch for treasury swaps. Privy for the client wallet. ENS for names."],
  ['11', "Testnet, and it says so. There is no World ID router on Hedera, so the contract announces bypass mode instead of hiding it. Every contract is source-verified, and every claim in this video is a transaction you can open."],
  ['12', "Aetheris. Agents that can hold money, hire, and prove their work. Open source, on Hedera."],
];

const only = process.env.VO_ONLY ? process.env.VO_ONLY.replace(/^v/, '') : null;
const skip = process.env.VO_SKIP ? process.env.VO_SKIP.replace(/^v/, '') : null;
const todo = SECTIONS.filter(([id]) => (!only || id === only) && (!skip || id !== skip));
console.log('characters to generate:', todo.reduce((n, s) => n + s[1].length, 0), 'in', todo.length, 'sections');
fs.mkdirSync('vo', { recursive: true });

(async () => {
  for (const [id, text] of todo) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true } }),
    });
    if (!res.ok) { console.error(id, 'FAILED', res.status, (await res.text()).slice(0, 200)); process.exit(1); }
    fs.writeFileSync(`vo/v${id}.mp3`, Buffer.from(await res.arrayBuffer()));
    console.log(id, 'ok', text.length, 'chars');
  }
})();
