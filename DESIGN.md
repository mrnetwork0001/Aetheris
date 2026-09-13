# Aetheris - design system

The visual language of the Aetheris frontend. The marketing site alternates
white and black bands with large rounded "scoops"; the app is a black
sidebar shell with mono data tiles. One accent colour, three typefaces.

## 1. Tokens

```
Dark    --fl-bg #000 · --fl-card #0a0a0a · --fl-raised #111
Borders --fl-border #1a1a1a · --fl-border-hi #222
Text    --fl-fg #fff · --fl-fg-2 #999 · --fl-fg-3 #666
Light   bg #fff · heading #111 · body #5b5b5b · card border #0000001a
Accent  --fl-accent #079ab7 · --fl-accent-soft #079ab71f
Semantic --fl-warn #f59e0b · emerald #10b981 · rose #ef4444
```

Type: Montserrat 800 for display (letter-spacing −0.03em), Inter for body,
JetBrains Mono for data and labels (10–11px uppercase, 0.08em tracking).
Radii: cards 14px, sponsor cards 16px, buttons 10px, pills 20px, band
scoops 200px (96px on mobile). Container: 1200px, 24/60px gutters.

## 2. Bands

Sections alternate light and dark. A light band that sits on a dark one takes
one 200px rounded corner (`.scoop-br`, `.scoop-tr`, …) so the dark band
appears to scoop into it; corners alternate down the page.

## 3. Landing page

Nav (links flush right) → hero with a JSX-built tilted product mockup →
dark manifesto band → three problem cards → Ledger section with the spinning
mark → sponsor card marquee with real integration status → ✗/✓ comparison
table → FAQ → CTA with HashScan links → four-column footer.

## 4. App shell

216px collapsible sidebar (`#0a0a0a`, `#1a1a1a` border): logo, Operator |
Client toggle with a live status line, icon nav, wallet card. Main area:
Montserrat page title, four mono stat tiles (one accent), section cards with
flush tables and honest DEMO DATA / LIVE pills.

## 5. Motion

framer-motion and CSS only; everything is disabled under
`prefers-reduced-motion`, and no real content is ever left at `opacity: 0`.

- `Reveal` - measures on mount (above-the-fold never flickers), reveals on
  entry via IntersectionObserver plus a rect-check fail-safe.
- `WipeText` - headings uncover line by line with scroll progress
  (`start 85%` → `end 70%`), mask in the band's own colour.
- `heroFloat` on the mockup, an auto-scrolling sponsor track that pauses on
  hover, a pulsing ring on the primary CTA, a 3D spin on the Ledger mark, a
  marching dashed connector, hover lifts on cards and buttons, pulsing live
  dots.

## 6. Data contract

`components/aetheris-server.ts`, `components/aetheris-data.ts`,
`components/format.ts`, `lib/**` and `app/api/**` are the data layer. UI
components consume `DataEnvelope<T>` and render the source badge and its
reason; nothing is presented as chain data that is not.
