# Aetheris demo video

The Remotion composition behind the ETHGlobal submission video: 1920x1080, 30 fps, under four minutes.

Everything that is not a screen recording is motion graphics and renders without any capture. Footage slots draw a labelled placeholder when a clip is missing, so the film always renders; `sync-clips.js` writes the manifest before every render.

## Pipeline

```bash
npm ci
cp .env.example .env                      # ELEVENLABS_API_KEY, ELEVENLABS_VOICE
node vo-gen.js && node vo-add.js          # narration, 13 sections (v03 carries live counts)
node scripts/capture-lean.mjs             # records the live site with Playwright + Google Chrome
node scripts/transcript.js                # parses public/logs/*.log (a real job run) into src/transcript.ts
node fetch-stats.js                       # writes src/stats.ts from the live subgraph and mirror node
node check-timing.js                      # every scene at least as long as its narration; total under 240 s
npm run render                            # out/aetheris-demo.mp4
```

No figure in the composition is typed by hand: counters come from `src/stats.ts`, terminal lines and transaction hashes from `src/transcript.ts`, both generated from the live system.
