// Copies generated narration where Remotion can reach it, and reports each clip's duration
// so the scene timings in src/Meritr.tsx can be checked against the audio that will play.
const fs = require('fs');
const { execSync } = require('child_process');
fs.mkdirSync('public/vo', { recursive: true });
let total = 0;
for (const f of fs.readdirSync('vo').filter((f) => f.endsWith('.mp3')).sort()) {
  fs.copyFileSync(`vo/${f}`, `public/vo/${f}`);
  const d = Number(execSync(
    `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 vo/${f}`
  ).toString().trim());
  total += d;
  console.log(`  ${f}  ${d.toFixed(1)}s`);
}
console.log(`\n  narration total: ${total.toFixed(1)}s`);
