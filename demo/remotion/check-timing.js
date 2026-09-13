// Fails if a scene is shorter than the narration it carries, or if the film runs past 4:00.
//
// Both mistakes are silent otherwise. Remotion truncates audio at the end of its Sequence with
// no warning, so an over-long track simply loses its last words; and the duration used to be a
// hand-summed constant that once dropped an entire scene. This is the guard for both.
const { execSync } = require('child_process');
const fs = require('fs');

const LIMIT = 240;
const src = fs.readFileSync('src/Aetheris.tsx', 'utf8');
// Scans add(...) calls by walking balanced parentheses rather than with one regex: the footage
// cuts span many lines and carry nested JSX, and a line-oriented pattern silently reported them
// as having no narration - which is exactly the kind of quiet miss this file exists to catch.
const scenes = [];
for (let i = src.indexOf('add('); i !== -1; i = src.indexOf('add(', i + 1)) {
  if (!/^add\(\s*s\(/.test(src.slice(i, i + 40))) continue; // the footage cuts break the line after add(
  let depth = 0;
  let j = i + 3; // at the '(' of add(
  for (; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(i, j + 1);
  const m = body.match(/^add\(\s*s\(([\d.]+)\)/);
  if (!m) continue;
  const dur = Number(m[1]);
  const vo = body.match(/'(v\d\d)'\s*,?\s*\)$/) || body.match(/,\s*'(v\d\d)'/);
  scenes.push({ dur, vo: vo ? vo[1] : undefined });
}

let total = 0;
let bad = 0;
for (const sc of scenes) {
  total += sc.dur;
  if (!sc.vo) { console.log(`  ${String(sc.dur).padStart(5)}s  (silent)`); continue; }
  const f = `public/vo/${sc.vo}.mp3`;
  if (!fs.existsSync(f)) { console.log(`  ${String(sc.dur).padStart(5)}s  ${sc.vo}  (not generated)`); continue; }
  const d = Number(execSync(`ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 ${f}`).toString().trim());
  const ok = sc.dur >= d;
  if (!ok) bad++;
  console.log(`  ${String(sc.dur).padStart(5)}s  ${sc.vo}  narration ${d.toFixed(1)}s  ${ok ? 'ok' : 'CLIPPED by ' + (d - sc.dur).toFixed(1) + 's'}`);
}
console.log(`\n  total ${total.toFixed(1)}s  (limit ${LIMIT}s)`);
if (bad) { console.error(`\n  ${bad} scene(s) shorter than their narration`); process.exit(1); }
if (total > LIMIT) { console.error(`\n  over the ${LIMIT}s limit by ${(total - LIMIT).toFixed(1)}s`); process.exit(1); }
console.log('  timing ok');
