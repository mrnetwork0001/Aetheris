import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { loadFont as loadDisplay } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { PRESENT_CLIPS, PRESENT_VO } from './clips';
import { STATS } from './stats';
import { TRANSCRIPT, type Line } from './transcript';

const DISPLAY = loadDisplay('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
const SANS = loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
const MONO = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] }).fontFamily;

/* Palette lifted from the site, so the video and the product agree.
   BG is pure black; text is white; the single accent is the site's cyan-teal. */
const BG = '#000000';
const SURFACE = '#0b0f14';
const TEXT = '#ffffff';
const BODY = 'rgba(255,255,255,0.86)';
const MUTED = 'rgba(255,255,255,0.62)';
const DIM = 'rgba(255,255,255,0.38)';
const LINE = 'rgba(255,255,255,0.06)';
const LINE2 = 'rgba(255,255,255,0.12)';
const ACCENT = '#079ab7';
const ACCENT_HI = '#3fc6e0';
const ACCENT_SOFT = 'rgba(7,154,183,0.14)';
const WARN = '#c9a55c';

const FPS = 30;
/** Seconds to frames. Every schedule in a scene is written in seconds, as the narration is. */
const T = (sec: number) => Math.round(sec * FPS);
const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const EASE = Easing.out(Easing.cubic);

/* ── primitives ─────────────────────────────────────────────────────────── */

/** 0 -> 1 over `dur` frames starting at `delay`, eased and clamped. */
const rise = (frame: number, delay: number, dur = 18) =>
  interpolate(frame - delay, [0, dur], [0, 1], { ...CLAMP, easing: EASE });

/** Same, but scheduled in seconds. */
const at = (frame: number, sec: number, dur = 0.6) => rise(frame, T(sec), T(dur));

/** Fade in, hold, fade out - so no scene ever cuts on a hard edge. */
const hold = (frame: number, total: number, inF = 14, outF = 14) =>
  Math.min(
    interpolate(frame, [0, inF], [0, 1], CLAMP),
    interpolate(frame, [total - outF, total], [1, 0], CLAMP),
  );

const count = (frame: number, startSec: number, durSec: number, to: number) =>
  interpolate(frame, [T(startSec), T(startSec + durSec)], [0, to], { ...CLAMP, easing: EASE });

/** The fine line grid from the site. Present but never loud; masked so the edges stay black. */
const Grid: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill
    style={{
      opacity,
      backgroundImage:
        'linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
      backgroundSize: '64px 64px',
      backgroundPosition: '-1px -1px',
      WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 82%)',
      maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 82%)',
    }}
  />
);

const Stage: React.FC<{ children: React.ReactNode; total: number; grid?: boolean }> = ({ children, total, grid = true }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: SANS, color: TEXT, opacity: hold(frame, total) }}>
      {grid ? <Grid /> : null}
      {children}
    </AbsoluteFill>
  );
};

/**
 * A slot for footage recorded from the live site.
 *
 * Renders the clip when it exists. When it does not - which is every render before the screen
 * capture is cut - it draws a labelled placeholder of the right length instead of failing, so
 * the composition stays renderable while the recordings are still being made. When a fallback
 * graphic is given, that carries the scene instead of the placeholder.
 */
const Footage: React.FC<{
  src: string; total: number; label: string; note: string; playbackRate?: number; fallback?: React.ReactNode;
}> = ({ src, total, label, note, playbackRate = 1, fallback }) => {
  const frame = useCurrentFrame();
  const o = hold(frame, total, 10, 10);
  // Asked of a generated manifest rather than caught at runtime: OffthreadVideo throws inside
  // the compositor when a source 404s, which no onError handler can intercept.
  const missing = !PRESENT_CLIPS.includes(src);

  if (missing && fallback) return <>{fallback}</>;

  if (missing) {
    return (
      <AbsoluteFill style={{ backgroundColor: BG, fontFamily: SANS, opacity: o }}>
        <Grid />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{
            border: `2px dashed ${LINE2}`, borderRadius: 20, padding: '56px 80px', textAlign: 'center',
            backgroundColor: 'rgba(255,255,255,0.02)', maxWidth: 1100,
          }}>
            <p style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: WARN, margin: 0 }}>RECORD THIS</p>
            <p style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 700, color: TEXT, margin: '18px 0 12px', letterSpacing: -0.5 }}>{label}</p>
            <p style={{ fontSize: 22, color: MUTED, margin: 0, lineHeight: 1.5 }}>{note}</p>
            <p style={{ fontFamily: MONO, fontSize: 14, color: DIM, marginTop: 24 }}>
              {(total / FPS).toFixed(1)}s at {playbackRate}x - public/{src}
            </p>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: BG, opacity: o }}>
      <OffthreadVideo src={staticFile(src)} playbackRate={playbackRate} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

/** Lower-third caption over footage. `from`/`until` are seconds; omit `until` to keep it up. */
const Caption: React.FC<{ kicker: string; line: string; from?: number; until?: number; children?: React.ReactNode }> =
  ({ kicker, line, from = 0.3, until, children }) => {
    const frame = useCurrentFrame();
    const r = at(frame, from, 0.5);
    const out = until === undefined ? 1 : interpolate(frame, [T(until) - 10, T(until)], [1, 0], CLAMP);
    const o = Math.min(r, out);
    return (
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 96, fontFamily: SANS }}>
        <div style={{ opacity: o, transform: `translateY(${(1 - r) * 18}px)`, display: 'flex', alignItems: 'flex-end', gap: 28 }}>
          <div style={{
            display: 'inline-block', padding: '22px 32px', borderRadius: 16,
            background: 'rgba(0,0,0,0.78)', border: `1px solid ${LINE2}`, backdropFilter: 'blur(10px)',
          }}>
            <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: ACCENT_HI, margin: 0 }}>{kicker}</p>
            <p style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, color: TEXT, margin: '10px 0 0', letterSpacing: -0.3 }}>{line}</p>
          </div>
          {children}
        </div>
      </AbsoluteFill>
    );
  };

const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; op?: number }> = ({ children, color = ACCENT_HI, op = 1 }) => (
  <p style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 3.5, textTransform: 'uppercase', color, margin: 0, opacity: op }}>{children}</p>
);

const Headline: React.FC<{ children: React.ReactNode; size?: number; op?: number; style?: React.CSSProperties }> =
  ({ children, size = 68, op = 1, style }) => (
    <p style={{
      fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.08, letterSpacing: -size * 0.025,
      color: TEXT, margin: '18px 0 0', opacity: op, ...style,
    }}>{children}</p>
  );

/** A surface card. */
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; lit?: boolean; op?: number }> =
  ({ children, style, lit = false, op = 1 }) => (
    <div style={{
      border: `1px solid ${lit ? ACCENT : LINE2}`, borderRadius: 18, background: lit ? ACCENT_SOFT : SURFACE,
      boxShadow: lit ? `0 0 0 1px ${ACCENT}33, 0 0 48px ${ACCENT}22` : 'none',
      padding: '26px 30px', opacity: op, ...style,
    }}>{children}</div>
  );

/** Content column: never closer than 160px to an edge at 1920. */
const Column: React.FC<{ children: React.ReactNode; width?: number; op?: number; align?: 'center' | 'flex-start' }> =
  ({ children, width = 1600, op = 1, align = 'center' }) => (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: align }}>
      <div style={{ width, opacity: op, paddingTop: align === 'flex-start' ? 110 : 0 }}>{children}</div>
    </AbsoluteFill>
  );

/* ── terminal ───────────────────────────────────────────────────────────── */

const toneColor = (tone: Line['tone']) =>
  tone === 'head' ? TEXT
    : tone === 'cmd' ? TEXT
    : tone === 'tx' ? ACCENT_HI
    : tone === 'ok' ? ACCENT_HI
    : tone === 'warn' ? WARN
    : tone === 'dim' ? DIM
    : BODY;

type Row = { at: number; line: Line | undefined };

/** First transcript line matching `re`. Scenes schedule real lines rather than retyped ones. */
const pick = (lines: ReadonlyArray<Line>, re: RegExp, nth = 0): Line | undefined => lines.filter((l) => re.test(l.text))[nth];

/**
 * A typed terminal. Each row starts at `at` seconds and is typed at `cps` characters per second;
 * the cursor sits at the end of whatever is being typed, then blinks on its own line.
 */
const Terminal: React.FC<{ rows: Row[]; title: string; height: number; fontSize?: number; cps?: number; width?: number | string }> =
  ({ rows, title, height, fontSize = 21, cps = 110, width = '100%' }) => {
    const frame = useCurrentFrame();
    const live = rows.filter((r): r is Row & { line: Line } => Boolean(r.line) && frame >= T(r.at));
    const blink = Math.floor(frame / 16) % 2 === 0;
    let typing = false;
    return (
      <div style={{
        width, height, border: `1px solid ${LINE2}`, borderRadius: 16, background: '#05070a',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px', borderBottom: `1px solid ${LINE}` }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.14)' }} />)}
          <span style={{ fontFamily: MONO, fontSize: 13, color: DIM, marginLeft: 12, letterSpacing: 1 }}>{title}</span>
        </div>
        <div style={{ padding: '20px 26px', fontFamily: MONO, fontSize, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {live.map((r, i) => {
            const n = Math.floor(((frame - T(r.at)) * cps) / FPS);
            const shown = r.line.text.slice(0, n);
            const isLast = i === live.length - 1;
            const done = n >= r.line.text.length;
            if (isLast && !done) typing = true;
            const head = r.line.tone === 'head';
            const cmd = r.line.tone === 'cmd';
            return (
              <div key={i} style={{ color: toneColor(r.line.tone), marginTop: head && i > 0 ? fontSize * 0.5 : 0, fontWeight: head ? 500 : 400 }}>
                {r.line.stamp ? <span style={{ color: DIM }}>[{r.line.stamp}] </span> : null}
                {cmd ? <span style={{ color: ACCENT_HI }}>$ </span> : null}
                {cmd ? shown.replace(/^\$ /, '') : shown}
                {isLast && !done ? <span style={{ color: ACCENT_HI }}>▌</span> : null}
              </div>
            );
          })}
          {!typing ? <div style={{ color: ACCENT_HI, opacity: blink ? 1 : 0 }}>▌</div> : null}
        </div>
      </div>
    );
  };

/* ── scenes ─────────────────────────────────────────────────────────────── */

/** 1. Title - the wordmark, the mark, one accent line. */
const Title: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 34 });
  const wipe = interpolate(frame, [4, 30], [100, 0], { ...CLAMP, easing: EASE });
  const line = at(frame, 0.9, 0.8);
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Img src={staticFile('brand/mark-dark.png')} style={{ position: 'absolute', width: 620, right: 120, top: 200, opacity: 0.05 * s }} />
        <div style={{ textAlign: 'center', transform: `scale(${0.96 + s * 0.04})` }}>
          <div style={{ clipPath: `inset(0 ${wipe}% 0 0)` }}>
            <Img src={staticFile('brand/wordmark-dark@2x.png')} style={{ width: 760, height: 'auto', display: 'block' }} />
          </div>
          <div style={{ height: 2, width: 760 * line, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_HI})`, margin: '26px auto 0' }} />
          <p style={{ fontSize: 30, color: MUTED, margin: '30px 0 0', fontWeight: 400, opacity: at(frame, 1.6, 0.7) }}>
            An autonomous agency with a treasury, on <span style={{ color: TEXT, fontWeight: 500 }}>Hedera</span>.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** 2. Problem - what agents can do, and the four things they cannot. */
const Problem: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const can = ['write code', 'audit contracts', 'run research'];
  const gaps: Array<[string, number]> = [['hold a budget', 4.4], ['hire each other', 6.6], ['get paid', 8.2], ['prove the work', 10.2]];
  const finale = at(frame, 12.6, 0.8);
  return (
    <Stage total={total}>
      <Column>
        <div style={{ opacity: 1 - finale * 0.9 }}>
          <Eyebrow op={at(frame, 0.2)}>the problem</Eyebrow>
          <Headline op={at(frame, 0.3)}>Agents can do the work.</Headline>
          <div style={{ display: 'flex', gap: 22, marginTop: 40 }}>
            {can.map((c, i) => {
              const r = at(frame, 0.8 + i * 1.0, 0.5);
              return (
                <div key={c} style={{
                  padding: '18px 34px', borderRadius: 999, border: `1px solid ${LINE2}`, background: SURFACE,
                  fontSize: 30, color: TEXT, fontWeight: 500, opacity: r, transform: `translateY(${(1 - r) * 14}px)`,
                }}>{c}</div>
              );
            })}
          </div>
          <p style={{ fontSize: 30, color: MUTED, margin: '56px 0 22px', opacity: at(frame, 4.0) }}>What they cannot do:</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, width: 1180 }}>
            {gaps.map(([g, t]) => {
              const r = at(frame, t, 0.55);
              return (
                <div key={g} style={{
                  display: 'flex', alignItems: 'center', gap: 22, padding: '22px 30px', borderRadius: 16,
                  border: `1px solid ${LINE2}`, background: SURFACE, opacity: r, transform: `translateX(${(1 - r) * -40}px)`,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 24, color: ACCENT_HI }}>&#215;</span>
                  <span style={{ fontSize: 32, color: TEXT, fontWeight: 500 }}>{g}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Column>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: finale }}>
        <div style={{ background: 'rgba(0,0,0,0.94)', padding: '40px 64px', borderRadius: 22, border: `1px solid ${LINE2}`, transform: `translateY(${(1 - finale) * 20}px)` }}>
          <p style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, letterSpacing: -1.5, margin: 0, color: TEXT, textAlign: 'center' }}>
            Every agent economy so far runs on
          </p>
          <p style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, letterSpacing: -1.5, margin: '8px 0 0', color: ACCENT_HI, textAlign: 'center' }}>
            a human with a spreadsheet.
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/** 3. Architecture - the diagram draws in sync with the sentence. */
const Architecture: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const W = 1680; const NW = 330; const NH = 186; const TOP = 30;
  const xs = [0, 450, 900, 1350];
  const Node: React.FC<{ i: number; t: number; title: string; sub: string; mono?: string; lit?: boolean; children?: React.ReactNode }> =
    ({ i, t, title, sub, mono, lit, children }) => {
      const r = at(frame, t, 0.6);
      return (
        <div style={{
          position: 'absolute', left: xs[i], top: TOP, width: NW, height: NH, boxSizing: 'border-box',
          border: `1px solid ${lit ? ACCENT : LINE2}`, borderRadius: 18, background: lit ? ACCENT_SOFT : SURFACE,
          padding: '22px 24px', opacity: r, transform: `translateY(${(1 - r) * 16}px)`,
          boxShadow: lit ? `0 0 40px ${ACCENT}22` : 'none',
        }}>
          <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: -0.4, margin: 0, color: TEXT }}>{title}</p>
          <p style={{ fontSize: 19, color: MUTED, margin: '8px 0 0', lineHeight: 1.35 }}>{sub}</p>
          {mono ? <p style={{ fontFamily: MONO, fontSize: 11, color: DIM, margin: '12px 0 0', letterSpacing: -0.2, whiteSpace: 'nowrap' }}>{mono}</p> : null}
          {children}
        </div>
      );
    };
  const Arrow: React.FC<{ from: number; t: number; label: string }> = ({ from, t, label }) => {
    const p = at(frame, t, 0.5);
    const x1 = xs[from] + NW; const x2 = xs[from + 1]; const y = TOP + NH / 2;
    return (
      <>
        <line x1={x1 + 8} y1={y} x2={x1 + 8 + (x2 - x1 - 16) * p} y2={y} stroke={ACCENT} strokeWidth={2} />
        <polygon points={`${x2 - 8},${y} ${x2 - 20},${y - 7} ${x2 - 20},${y + 7}`} fill={ACCENT} opacity={p > 0.95 ? 1 : 0} />
        <text x={(x1 + x2) / 2} y={y - 16} fill={MUTED} fontFamily={MONO} fontSize={12.5} textAnchor="middle" opacity={p}>{label}</text>
      </>
    );
  };
  const barY = 360; const barH = 96;
  const bar = at(frame, 16.2, 0.8);
  const anchors = [1, 2, 3];
  return (
    <Stage total={total}>
      <Column width={W}>
        <Eyebrow op={at(frame, 0.2)}>how it works</Eyebrow>
        <Headline op={at(frame, 0.3)} size={62}>An agency operating system.</Headline>
        <div style={{ position: 'relative', width: W, height: barY + barH + 20, marginTop: 40 }}>
          <svg width={W} height={barY + barH + 20} style={{ position: 'absolute', inset: 0 }}>
            <Arrow from={0} t={3.4} label="deposit" />
            <Arrow from={1} t={5.6} label="dispatch" />
            <Arrow from={2} t={10.8} label="work lands" />
            {anchors.map((i, k) => {
              const p = at(frame, 17.4 + k * 0.7, 0.5);
              const x = xs[i] + NW / 2; const y1 = TOP + NH + 10;
              return (
                <g key={i}>
                  <line x1={x} y1={y1} x2={x} y2={y1 + (barY - 10 - y1) * p} stroke={ACCENT} strokeWidth={2} strokeDasharray="6 8" />
                  <circle cx={x} cy={barY - 10} r={5} fill={ACCENT} opacity={p > 0.95 ? 1 : 0} />
                </g>
              );
            })}
          </svg>
          <Node i={0} t={2.5} title="Client" sub="escrows a deposit in aUSD" mono={`HTS token ${TRANSCRIPT.token}`} />
          <Node i={1} t={3.8} title="AetherisAgency" sub="holds escrow; one verified human dispatches" mono={STATS.agency} />
          <Node i={2} t={6.0} title="Sub-agents" sub="fixed fee per task" lit>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {['0.40', '0.40', '0.40'].map((f, k) => (
                <span key={k} style={{
                  fontFamily: MONO, fontSize: 12, color: ACCENT_HI, border: `1px solid ${ACCENT}66`, borderRadius: 8, whiteSpace: 'nowrap',
                  padding: '4px 8px', opacity: at(frame, 6.8 + k * 0.45, 0.35),
                }}>{f} aUSD</span>
              ))}
            </div>
          </Node>
          <Node i={3} t={11.2} title="AetherisTreasury" sub="settles every fee in the same second via HTS" mono={STATS.treasury} />
          <div style={{
            position: 'absolute', left: 0, top: barY, width: W, height: barH, boxSizing: 'border-box',
            border: `1px solid ${ACCENT}`, borderRadius: 18, background: ACCENT_SOFT, padding: '20px 30px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: bar,
            transform: `scaleX(${0.6 + bar * 0.4})`, transformOrigin: 'center',
          }}>
            <div>
              <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, margin: 0, color: TEXT, letterSpacing: -0.4 }}>Hedera Consensus Service topic</p>
              <p style={{ fontSize: 19, color: MUTED, margin: '6px 0 0' }}>every step anchored; anyone can read it from the mirror node</p>
            </div>
            <p style={{ fontFamily: MONO, fontSize: 22, color: ACCENT_HI, margin: 0 }}>{STATS.topic}</p>
          </div>
        </div>
        <p style={{ fontFamily: MONO, fontSize: 15, color: DIM, marginTop: 26, letterSpacing: 1, opacity: at(frame, 13.2) }}>
          HEDERA TESTNET · CHAIN 296 · SETTLEMENT VIA THE HTS SYSTEM CONTRACT
        </p>
      </Column>
    </Stage>
  );
};

/** 4. Live counters over the landing footage. */
const Counters: React.FC = () => {
  const frame = useCurrentFrame();
  const htsShare = Math.round((STATS.htsSettlements / Math.max(1, STATS.settlements)) * 100);
  const tiles: Array<[string, number, string]> = [
    ['jobs', STATS.jobs, ''], ['settled', STATS.settledJobs, ''], ['micro-settlements', STATS.settlements, ''], ['over HTS', htsShare, '%'],
  ];
  return (
    <div style={{ display: 'flex', gap: 16, opacity: at(frame, 0.8) }}>
      {tiles.map(([k, v, unit], i) => (
        <div key={k} style={{
          padding: '18px 26px', borderRadius: 16, background: 'rgba(0,0,0,0.78)', border: `1px solid ${LINE2}`,
          backdropFilter: 'blur(10px)', minWidth: 150, opacity: at(frame, 0.9 + i * 0.15, 0.4),
        }}>
          <p style={{ fontFamily: MONO, fontSize: 40, color: ACCENT_HI, margin: 0, fontWeight: 500 }}>
            {Math.round(count(frame, 1.0 + i * 0.15, 2.4, v))}{unit}
          </p>
          <p style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 2, color: DIM, margin: '6px 0 0', textTransform: 'uppercase' }}>{k}</p>
        </div>
      ))}
    </div>
  );
};

/** 5. Brief - a written brief becomes a JobBrief frame, then the job's spec. Fallback for brief.mp4. */
const BriefGraphic: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const F = TRANSCRIPT;
  const Step: React.FC<{ t: number; children: React.ReactNode; lit?: boolean; width: number }> = ({ t, children, lit, width }) => {
    const r = at(frame, t, 0.6);
    return <Card lit={lit} op={r} style={{ width, boxSizing: 'border-box', transform: `translateY(${(1 - r) * 16}px)`, minHeight: 300 }}>{children}</Card>;
  };
  const Arrow: React.FC<{ t: number }> = ({ t }) => (
    <div style={{ width: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: at(frame, t, 0.4) }}>
      <span style={{ color: ACCENT, fontSize: 34 }}>&#8594;</span>
    </div>
  );
  const words: Array<[string, number]> = [['public.', 10.2], ['hashed.', 11.2], ['impossible to edit.', 12.2]];
  return (
    <Stage total={total}>
      <Column>
        <Eyebrow op={at(frame, 0.2)}>a job starts with a brief</Eyebrow>
        <Headline op={at(frame, 0.3)} size={60}>Written once. Anchored before the job exists.</Headline>
        <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 44 }}>
          <Step t={1.6} width={480}>
            <Eyebrow color={DIM}>the client writes it</Eyebrow>
            <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, margin: '14px 0 12px', letterSpacing: -0.3, lineHeight: 1.25 }}>{F.title}</p>
            {[1, 0.8, 0.9, 0.6, 0.85].map((w, i) => (
              <div key={i} style={{ height: 9, width: `${w * 100}%`, background: 'rgba(255,255,255,0.10)', borderRadius: 4, marginTop: 12, opacity: at(frame, 2.0 + i * 0.12, 0.3) }} />
            ))}
            <p style={{ fontFamily: MONO, fontSize: 13, color: DIM, margin: '18px 0 0' }}>{F.briefChars} chars · role {F.role}</p>
          </Step>
          <Arrow t={3.4} />
          <Step t={3.7} width={520} lit>
            <Eyebrow>anchored on the audit topic</Eyebrow>
            <div style={{ fontFamily: MONO, fontSize: 15.5, lineHeight: 1.6, color: BODY, marginTop: 14, wordBreak: 'break-all' }}>
              <div><span style={{ color: DIM }}>type      </span>JobBrief</div>
              <div><span style={{ color: DIM }}>topic     </span>{F.topic}</div>
              <div><span style={{ color: DIM }}>seq       </span><span style={{ color: ACCENT_HI }}>{F.briefSeq}</span></div>
              <div><span style={{ color: DIM }}>consensus </span>{F.briefConsensus}</div>
              <div style={{ marginTop: 8, opacity: at(frame, 4.6, 0.4) }}><span style={{ color: DIM }}>keccak256 </span><span style={{ color: ACCENT_HI }}>{F.briefHash}</span></div>
            </div>
          </Step>
          <Arrow t={6.0} />
          <Step t={6.3} width={480}>
            <Eyebrow color={DIM}>the job is created with it</Eyebrow>
            <p style={{ fontFamily: MONO, fontSize: 15, color: DIM, margin: '14px 0 6px' }}>createJob(spec)</p>
            <p style={{ fontFamily: MONO, fontSize: 26, color: ACCENT_HI, margin: 0, wordBreak: 'break-all' }}>{F.specURI}</p>
            <p style={{ fontFamily: MONO, fontSize: 13, color: DIM, margin: '18px 0 6px' }}>job #{F.jobId} · tx</p>
            <p style={{ fontFamily: MONO, fontSize: 13.5, color: MUTED, margin: 0, wordBreak: 'break-all', opacity: at(frame, 7.2, 0.4) }}>{F.tx.createJob}</p>
          </Step>
        </div>
        <div style={{ display: 'flex', gap: 26, marginTop: 44, alignItems: 'baseline' }}>
          <span style={{ fontSize: 26, color: MUTED, opacity: at(frame, 9.4) }}>From this moment the specification is</span>
          {words.map(([w, t]) => (
            <span key={w} style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, letterSpacing: -0.8, color: TEXT, opacity: at(frame, t, 0.4) }}>{w}</span>
          ))}
        </div>
      </Column>
    </Stage>
  );
};

/** 6. Operator terminal - the real demo log, typed on the narration's schedule. */
const Operator: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const L = TRANSCRIPT.demo;
  const cmd: Line = { t: 0, text: `$ ${TRANSCRIPT.command}`, tone: 'cmd' };
  const rows: Row[] = [
    { at: 0.3, line: cmd },
    { at: 1.2, line: pick(L, /^Anchoring the job brief/) },
    { at: 1.7, line: pick(L, /^title /) },
    { at: 2.4, line: pick(L, /^brief \.+ \d+ chars/) },
    { at: 3.4, line: pick(L, /^HCS seq \.+ \d+\s+consensus/) },
    { at: 4.0, line: pick(L, /^specURI /) },
    { at: 5.2, line: pick(L, /^Funding the job/) },
    { at: 5.8, line: pick(L, /^operator aUSD/) },
    { at: 6.8, line: pick(L, /^approve /) },
    { at: 8.0, line: pick(L, /^job #\d+ created/) },
    { at: 8.8, line: pick(L, /^createJob /) },
    { at: 10.6, line: pick(L, /^Assigning /) },
    { at: 11.4, line: pick(L, /^task #\d+ assigned/) },
    { at: 12.2, line: pick(L, /^assignSubAgent /) },
    { at: 13.8, line: pick(L, /^Waiting for the worker/) },
    { at: 14.8, line: pick(L, /still Assigned/) },
  ];
  return (
    <Stage total={total}>
      <Column>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', opacity: at(frame, 0.2) }}>
          <div>
            <Eyebrow>the operator side, unattended</Eyebrow>
            <Headline size={52}>One brief. Three transactions. Then it waits.</Headline>
          </div>
          <div style={{ textAlign: 'right', opacity: at(frame, 6.6) }}>
            <p style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 2.5, color: ACCENT_HI, margin: 0, textTransform: 'uppercase' }}>real transactions</p>
            <p style={{ fontFamily: MONO, fontSize: 14, color: DIM, margin: '6px 0 0' }}>open any hash on hashscan.io/testnet</p>
          </div>
        </div>
        <div style={{ marginTop: 30 }}>
          <Terminal rows={rows} title={`operator · ${TRANSCRIPT.command}`} height={720} fontSize={19} />
        </div>
      </Column>
    </Stage>
  );
};

/** 7. Worker - the sub-agent's own log beside the pipeline it walks. */
const Worker: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const L = TRANSCRIPT.worker;
  const rows: Row[] = [
    { at: 0.3, line: pick(L, /^Aetheris sub-agent worker/) },
    { at: 0.8, line: pick(L, /^worker address/) },
    { at: 1.4, line: pick(L, /^agency /) },
    { at: 2.0, line: pick(L, /^model /) },
    { at: 2.6, line: pick(L, /^subgraph /) },
    { at: 3.1, line: pick(L, /^HCS topic /) },
    { at: 4.4, line: pick(L, /assigned task\(s\)/) },
    { at: 6.2, line: pick(L, /read from hcs:/) },
    { at: 8.8, line: pick(L, /^inferring job/) },
    { at: 13.2, line: pick(L, /frame is \d+ bytes/) },
    { at: 16.8, line: pick(L, /^DONE job/) },
  ];
  const steps: Array<[string, string, number]> = [
    ['subgraph', 'finds the assigned task', 4.4],
    ['mirror node', `reads the brief back from ${TRANSCRIPT.specURI}`, 6.2],
    ['0G Compute Router', `${TRANSCRIPT.model} · billed per request`, 8.8],
    ['HCS topic', `deliverable anchored in full · seq ${TRANSCRIPT.hcsSeq}`, 13.2],
    ['completeTask', 'result hash committed on-chain', 16.8],
  ];
  return (
    <Stage total={total}>
      <Column>
        <Eyebrow op={at(frame, 0.2)}>the sub-agent</Eyebrow>
        <Headline op={at(frame, 0.3)} size={52}>A process with its own Hedera account.</Headline>
        <div style={{ display: 'flex', gap: 36, marginTop: 30, alignItems: 'stretch' }}>
          <Terminal rows={rows} title="npm run agent:worker" height={660} fontSize={18.5} cps={130} width={1040} />
          <div style={{ width: 524, display: 'flex', flexDirection: 'column' }}>
            {steps.map(([name, sub, t], i) => {
              const lit = at(frame, t, 0.4);
              return (
                <React.Fragment key={name}>
                  <div style={{
                    border: `1px solid ${lit > 0.5 ? ACCENT : LINE2}`, borderRadius: 14, padding: '14px 20px',
                    background: lit > 0.5 ? ACCENT_SOFT : SURFACE, opacity: 0.45 + lit * 0.55,
                    boxShadow: lit > 0.5 ? `0 0 30px ${ACCENT}22` : 'none',
                  }}>
                    <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 22, margin: 0, color: lit > 0.5 ? TEXT : MUTED, letterSpacing: -0.3 }}>{name}</p>
                    <p style={{ fontFamily: MONO, fontSize: 13, color: lit > 0.5 ? ACCENT_HI : DIM, margin: '6px 0 0', wordBreak: 'break-all' }}>{sub}</p>
                  </div>
                  {i < steps.length - 1 ? (
                    <div style={{ width: 2, height: 22, background: at(frame, t + 0.6, 0.3) > 0.5 ? ACCENT : LINE2, marginLeft: 30 }} />
                  ) : null}
                </React.Fragment>
              );
            })}
            <div style={{ marginTop: 'auto', opacity: at(frame, 17.6, 0.6) }}>
              <p style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: DIM, margin: 0, textTransform: 'uppercase' }}>signed by the worker key</p>
              <p style={{ fontFamily: MONO, fontSize: 22, color: ACCENT_HI, margin: '6px 0 0' }}>{short(TRANSCRIPT.workerAddress)} <span style={{ color: DIM, fontSize: 15 }}>· Hedera {TRANSCRIPT.workerHedera}</span></p>
            </div>
          </div>
        </div>
      </Column>
    </Stage>
  );
};

/** 8. Settlement - one transaction, from the real log. */
const Settlement: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const F = TRANSCRIPT;
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - T(3.6), fps, config: { damping: 200 }, durationInFrames: 26 });
  return (
    <Stage total={total}>
      <Column width={1400}>
        <Eyebrow op={at(frame, 0.2)}>the operator settles</Eyebrow>
        <Headline op={at(frame, 0.3)} size={56}>One transaction.</Headline>
        <Card op={at(frame, 0.8)} style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 15, letterSpacing: 2, color: DIM }}>SETTLEJOB · JOB #{F.jobId}</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: DIM }}>gas {F.gas.toLocaleString()}</span>
          </div>
          <p style={{ fontFamily: MONO, fontSize: 22, color: ACCENT_HI, margin: '14px 0 0', wordBreak: 'break-all' }}>{F.tx.settleJob}</p>
        </Card>
        <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
          <Card lit op={at(frame, 3.4, 0.6)} style={{ flex: 1.4, transform: `scale(${0.97 + pop * 0.03})` }}>
            <Eyebrow>MicroSettlement</Eyebrow>
            <p style={{ fontFamily: MONO, fontSize: 72, color: TEXT, margin: '10px 0 0', fontWeight: 500, letterSpacing: -2 }}>
              {Number(F.paidUsd).toFixed(2)} <span style={{ fontSize: 30, color: MUTED, letterSpacing: 0 }}>aUSD</span>
            </p>
            <p style={{ fontFamily: MONO, fontSize: 17, color: BODY, margin: '10px 0 0' }}>
              task #{F.taskId} <span style={{ color: ACCENT_HI }}>&#8594;</span> {short(F.workerAddress)}
            </p>
            <p style={{ fontFamily: MONO, fontSize: 17, color: MUTED, margin: '8px 0 0', opacity: at(frame, 5.0) }}>
              viaHts <span style={{ color: ACCENT_HI }}>{String(F.viaHts)}</span> · through the HTS system contract
            </p>
          </Card>
          <Card op={at(frame, 7.0, 0.6)} style={{ flex: 1 }}>
            <Eyebrow color={DIM}>JobSettled</Eyebrow>
            <p style={{ fontFamily: MONO, fontSize: 44, color: TEXT, margin: '10px 0 0', fontWeight: 500 }}>{Number(F.marginUsd).toFixed(2)} <span style={{ fontSize: 22, color: MUTED }}>aUSD</span></p>
            <p style={{ fontSize: 22, color: MUTED, margin: '8px 0 0' }}>margin retained by the treasury</p>
            <p style={{ fontFamily: MONO, fontSize: 15, color: DIM, margin: '18px 0 0', opacity: at(frame, 8.2) }}>
              paid {F.paidUsd} · deposit {F.depositUsd} · record emitted
            </p>
          </Card>
        </div>
      </Column>
    </Stage>
  );
};

/** 9. Verify - mirror node frame, keccak256, on-chain hash. They match. */
const Verify: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const F = TRANSCRIPT;
  const { fps } = useVideoConfig();
  const excerpt = F.deliverable.filter((l) => l.trim()).slice(0, 7).map((l) => (l.length > 74 ? `${l.slice(0, 74)}...` : l));
  const match = at(frame, 9.6, 0.5);
  const pop = spring({ frame: frame - T(9.6), fps, config: { damping: 200 }, durationInFrames: 28 });
  const Step: React.FC<{ n: string; t: number; title: string; children: React.ReactNode; lit?: boolean }> = ({ n, t, title, children, lit }) => {
    const r = at(frame, t, 0.6);
    return (
      <Card lit={lit} op={r} style={{ flex: 1, transform: `translateY(${(1 - r) * 16}px)`, minHeight: 330, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <span style={{ fontFamily: MONO, fontSize: 14, color: ACCENT_HI }}>{n}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, letterSpacing: -0.3 }}>{title}</span>
        </div>
        <div style={{ marginTop: 14 }}>{children}</div>
      </Card>
    );
  };
  return (
    <Stage total={total}>
      <Column>
        <Eyebrow op={at(frame, 0.2)}>nothing here asks for trust</Eyebrow>
        <Headline op={at(frame, 0.3)} size={54}>Fetch. Hash. Compare.</Headline>
        <div style={{ display: 'flex', gap: 24, marginTop: 34 }}>
          <Step n="01" t={2.0} title="mirror node frame">
            <p style={{ fontFamily: MONO, fontSize: 12, color: DIM, margin: '0 0 10px', wordBreak: 'break-all' }}>topic {F.topic} · seq {F.chunks.join(', ')} · {F.frameBytes} bytes</p>
            {excerpt.map((l, i) => (
              <p key={i} style={{ fontFamily: MONO, fontSize: 13.5, color: BODY, margin: '0 0 6px', whiteSpace: 'pre', overflow: 'hidden', opacity: at(frame, 2.4 + i * 0.12, 0.3) }}>{l}</p>
            ))}
          </Step>
          <Step n="02" t={4.5} title="keccak256(text)">
            <p style={{ fontSize: 19, color: MUTED, margin: '0 0 14px' }}>hash the words the mirror node returned</p>
            <p style={{ fontFamily: MONO, fontSize: 19, color: ACCENT_HI, margin: 0, wordBreak: 'break-all', lineHeight: 1.5, opacity: at(frame, 5.2, 0.5) }}>{F.textHash}</p>
          </Step>
          <Step n="03" t={6.8} title="on-chain resultHash" lit={match > 0.5}>
            <p style={{ fontSize: 19, color: MUTED, margin: '0 0 14px' }}>stored by completeTask on {short(STATS.agency)}</p>
            <p style={{ fontFamily: MONO, fontSize: 19, color: TEXT, margin: 0, wordBreak: 'break-all', lineHeight: 1.5, opacity: at(frame, 7.4, 0.5) }}>{F.resultHash}</p>
          </Step>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 40, marginTop: 40 }}>
          <p style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 84, letterSpacing: -3, margin: 0, color: ACCENT_HI, opacity: match, transform: `scale(${0.94 + pop * 0.06})`, transformOrigin: 'left center' }}>
            hash match: {String(F.hashMatch)}
          </p>
          <p style={{ fontSize: 28, color: MUTED, margin: 0, opacity: at(frame, 11.4) }}>
            The chain holds the hash. The mirror node holds the words.
          </p>
        </div>
      </Column>
    </Stage>
  );
};

/** 11. Sponsors - six pieces that were hard to fake, in narration order. */
const Sponsors: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const items: Array<[string, string, string, number]> = [
    ['hedera', 'Hedera', 'escrow, HTS tokens and HCS consensus', 3.0],
    ['thegraph', 'The Graph', 'a self-hosted graph-node; Hedera is not on the hosted service', 6.2],
    ['worldid', 'World ID', 'the operator holding the keys is one human', 10.2],
    ['oneinch', '1inch', 'treasury swaps', 13.6],
    ['privy', 'Privy', 'the client wallet', 15.6],
    ['ens', 'ENS', 'names for agents and contracts', 17.6],
  ];
  return (
    <Stage total={total}>
      <Column>
        <Eyebrow op={at(frame, 0.2)}>built on</Eyebrow>
        <Headline op={at(frame, 0.3)} size={58}>Six pieces that were hard to fake.</Headline>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 40 }}>
          {items.map(([file, name, line, t]) => {
            const r = at(frame, t, 0.6);
            return (
              <div key={name} style={{
                display: 'flex', gap: 22, alignItems: 'center', padding: '26px 28px', borderRadius: 18,
                border: `1px solid ${r > 0.5 ? ACCENT + '66' : LINE2}`, background: SURFACE,
                opacity: r, transform: `translateY(${(1 - r) * 18}px)`, minHeight: 150, boxSizing: 'border-box',
              }}>
                <Img src={staticFile(`partners/${file}.png`)} style={{ width: 92, height: 92, borderRadius: 20, border: `1px solid ${LINE2}`, flexShrink: 0 }} />
                <div>
                  <p style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 30, margin: 0, letterSpacing: -0.5 }}>{name}</p>
                  <p style={{ fontSize: 20, color: MUTED, margin: '8px 0 0', lineHeight: 1.35 }}>{line}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Column>
    </Stage>
  );
};

/** 12. Limits - said plainly. */
const Limits: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const rows: Array<[string, string, number]> = [
    ['Testnet, and it says so.', 'Hedera testnet · chain 296', 0.5],
    ['No World ID router on Hedera, so the contract announces bypass mode instead of hiding it.', 'AetherisAgency.worldIdBypass', 2.6],
    ['Every contract is source-verified.', 'read the code on HashScan, not the bytecode', 7.8],
    ['Every claim in this video is a transaction you can open.', `topic ${STATS.topic} · seq ${STATS.hcsLatestSequence}`, 10.4],
  ];
  return (
    <Stage total={total}>
      <Column width={1400}>
        <Eyebrow op={at(frame, 0.2)}>limits, stated</Eyebrow>
        <Headline op={at(frame, 0.3)} size={56}>What this is not.</Headline>
        <div style={{ marginTop: 36 }}>
          {rows.map(([line, mono, t]) => {
            const r = at(frame, t, 0.6);
            return (
              <div key={line} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 40, padding: '26px 0',
                borderTop: `1px solid ${LINE2}`, opacity: r, transform: `translateX(${(1 - r) * -20}px)`,
              }}>
                <span style={{ fontSize: 30, color: TEXT, fontWeight: 500, lineHeight: 1.3, maxWidth: 960 }}>{line}</span>
                <span style={{ fontFamily: MONO, fontSize: 15, color: DIM, textAlign: 'right', flexShrink: 0 }}>{mono}</span>
              </div>
            );
          })}
          <div style={{ borderTop: `1px solid ${LINE2}` }} />
        </div>
      </Column>
    </Stage>
  );
};

/** 13. Close. */
const Close: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const r = at(frame, 0.2, 0.8);
  return (
    <Stage total={total}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', opacity: r, transform: `translateY(${(1 - r) * 12}px)` }}>
          <Img src={staticFile('brand/wordmark-dark@2x.png')} style={{ width: 640, height: 'auto' }} />
          <p style={{ fontSize: 30, color: MUTED, margin: '30px 0 0' }}>
            Agents that can hold money, hire, and prove their work.
          </p>
          <p style={{ fontFamily: MONO, fontSize: 26, color: ACCENT_HI, marginTop: 44, opacity: at(frame, 1.4) }}>useaetheris.vercel.app</p>
          <p style={{ fontFamily: MONO, fontSize: 20, color: BODY, marginTop: 14, opacity: at(frame, 2.0) }}>github.com/mrnetwork0001/Aetheris</p>
          <p style={{ fontFamily: MONO, fontSize: 14, color: DIM, marginTop: 34, letterSpacing: 2.5, opacity: at(frame, 2.6) }}>
            OPEN SOURCE · HEDERA TESTNET · ETHONLINE 2026
          </p>
        </div>
      </AbsoluteFill>
    </Stage>
  );
};

/* ── assembly ───────────────────────────────────────────────────────────── */

type Cut = { from: number; dur: number; el: React.ReactNode; vo?: string };

const s = (n: number) => Math.round(n * FPS);

/**
 * The cut list, built once and used for both the render and the duration, so the length can
 * never disagree with what is rendered. Each scene is at least 1.2s longer than its narration;
 * see check-timing.js for the guard.
 */
const buildCuts = (): Cut[] => {
  let t = 0;
  const cuts: Cut[] = [];
  const add = (dur: number, el: React.ReactNode, vo?: string) => {
    cuts.push({ from: t, dur, vo, el });
    t += dur;
  };

  add(s(5.4), <Title total={s(5.4)} />, 'v00');
  add(s(18.2), <Problem total={s(18.2)} />, 'v01');
  add(s(24), <Architecture total={s(24)} />, 'v02');

  // The landing page renders these counters live, so the real page carries the numbers.
  add(
    s(12),
    <>
      <Footage
        src="clips/landing.mp4" total={s(12)} playbackRate={1.3}
        label="Landing page: scroll it"
        note="useaetheris.vercel.app - scroll from the hero through the live counters. Slow and even; it plays at 1.3x, so about 16s of capture."
      />
      <Caption kicker="read from chain" line="No number here is typed in.">
        <Counters />
      </Caption>
    </>,
    'v03',
  );
  add(
    s(16),
    <Footage
      src="clips/brief.mp4" total={s(16)} playbackRate={1}
      label="Client: write a brief"
      note="useaetheris.vercel.app - write the brief and submit it; the graphic carries the scene if this is skipped."
      fallback={<BriefGraphic total={s(16)} />}
    />,
    'v04',
  );
  add(s(17.8), <Operator total={s(17.8)} />, 'v05');
  add(s(22.2), <Worker total={s(22.2)} />, 'v06');
  add(s(11.6), <Settlement total={s(11.6)} />, 'v07');

  // Optional silent insert: the settlement on HashScan. Only cut in when the clip exists - a
  // placeholder card with no narration under it would read as a mistake, not a slot.
  if (PRESENT_CLIPS.includes('clips/hashscan.mp4')) {
    add(
      s(4),
      <>
        <Footage src="clips/hashscan.mp4" total={s(4)} playbackRate={1.2} label="HashScan: the settleJob transaction" note="" />
        <Caption kicker="hashscan.io/testnet" line={`settleJob ${short(TRANSCRIPT.tx.settleJob)}`} />
      </>,
    );
  }

  add(s(15.4), <Verify total={s(15.4)} />, 'v08');
  add(
    s(17.1),
    <>
      <Footage
        src="clips/dashboard.mp4" total={s(17.1)} playbackRate={1.15}
        label="Mission control: scroll it"
        note="useaetheris.vercel.app/dashboard - jobs and leaderboard, then the audit stream, then the treasury. Plays at 1.15x, so about 20s of capture."
      />
      <Caption kicker="source: The Graph" line="Jobs and the leaderboard, from the subgraph." from={0.6} until={5.6} />
      <Caption kicker="source: mirror node" line="The audit stream, read back from HCS." from={5.8} until={10.8} />
      <Caption kicker="source: chain" line="The treasury, read from the contract." from={11.0} />
    </>,
    'v09',
  );
  add(s(21.6), <Sponsors total={s(21.6)} />, 'v10');
  add(s(15.8), <Limits total={s(15.8)} />, 'v11');

  // Optional silent insert: the docs page, after "a transaction you can open". Same rule as
  // above - only when the clip exists.
  if (PRESENT_CLIPS.includes('clips/docs.mp4')) {
    add(
      s(4),
      <>
        <Footage src="clips/docs.mp4" total={s(4)} playbackRate={1.3} label="Docs" note="" />
        <Caption kicker="useaetheris.vercel.app/docs" line="How to verify every claim yourself." />
      </>,
    );
  }
  add(s(7.6), <Close total={s(7.6)} />, 'v12');

  return cuts;
};

const CUTS = buildCuts();

export const AETHERIS_DURATION = CUTS.reduce((n, c) => n + c.dur, 0);

export const Aetheris: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    {CUTS.map((c, i) => (
      <Sequence key={i} from={c.from} durationInFrames={c.dur}>
        {c.el}
        {c.vo && PRESENT_VO.includes(`vo/${c.vo}.mp3`) ? <Audio src={staticFile(`vo/${c.vo}.mp3`)} /> : null}
      </Sequence>
    ))}
  </AbsoluteFill>
);
