# Anime home, round three: black space, bigger figure, 21st-style motion, honest copy

Owner's direction, 2026-10-02, after reviewing the hero and the space sequence
(d499067 → ba1ee86) against s0animation.com/design. Decisions taken with him:

| Question | Answer |
|---|---|
| "Work from GitHub" | the dark GitHub look, not repository cards |
| Rocket "flies to here" (the bento footer) | the burst begins directly under that footer |
| 21st.dev animations | split-text reveal; shimmer + magnetic buttons; spotlight + border beam on the cards |
| Fonts | Google Fonts allowed; Geist self-hosted as the text face |
| The character against black space | the intro cover goes black too: black → white hero → black space |
| Lab entry | start 2026-06, `status: "in progress"`, wording: "MuJoCo simulation of a robot arm and hand: RL in MuJoCo Playground, imitation learning with LeRobot and ACT, VR teleoperation on a Quest. In progress." |

The full commit sequence, copy strings and star-drift math are in the approved
plan (`~/.claude/plans/lively-crunching-garden.md`, 2026-10-02); this file keeps
the composition answers the `build-animation` skill asks for, and the as-built
record.

## Phase 0 — composition, per animation

**Figure tilt (C9).** Loop: the hero's existing `gsap.ticker` callback in
`AnimeHero.ts`; the figure is one more leaf transform written there. Pauses:
the same IntersectionObserver and `visibilitychange` that stop the wheel. Kills:
`destroyAnimeHero()` nulls the reference. Unchanged input: the write is skipped
under 0.01° of change.

**Star drift (B6).** Loop: one ScrollTrigger on the space section
(`Space.ts`), `onUpdate` only. Pauses: ScrollTrigger calls `onUpdate` only inside
its range. Kills: `destroySpace()`. Unchanged input: a last-value map per
element and property; nothing is rewritten.

**Split-text reveal (D11).** Loop: none — a CSS transition on the compositor,
fired once by an IntersectionObserver that unobserves each heading. Pauses: by
being one-shot. Kills: `disconnect()` once every heading is in.

**Shimmer (D12).** Loop: none — one compositor keyframe iteration on
hover/focus/`.is-in`. Nothing to pause or kill.

**Magnetic (D12).** Loop: `gsap.quickTo` tweens on `gsap.ticker`, existing only
after pointer input and finished within 0.6 s of it. Pauses: no input, no tween.
Kills: `destroyMagnetic()` removes the listeners and kills the tweens. Gated to
`(hover: hover) and (pointer: fine)`.

**Spotlight + border beam (D13).** Loop: `quickTo` on the spot's own transform
(ticker); the beam is a compositor animation declared only under `:hover` plus
one lap on `.is-in`. Pauses: no hover, no tween, no animation. Kills:
`destroyBentoGlow()` removes the one delegated listener and kills the tweens.
Never a custom property on the card (invariant 2).

## Per-frame write list (whole page, after this work)

- Hero: wheel `transform`; 14 cards `--turn` (leaf); figure `transform` (new).
- Rocket: craft `--x/--y/--a`; wipe `--wipe`; burst `--burst`.
- Space: two layers, `transform` and `opacity` each (replaces `--drift`).
- Pointer-driven only: one magnetic button's `transform`; one spotlight's
  `transform` (and `opacity` while fading).

No ancestor is written. No layout property moves.

## Rest state

The hero at rest is the hero as shipped, with the bigger figure still. The
rocket section at rest is the white page under the bento footer. The space
section at rest (progress 0) is transparent over the rocket section with both
star layers at opacity 0. Work at rest is its black canvas with a static star
tail.

## Reduced motion

Figure: bigger and still. Stars: static field at opacity 1 on a solid ground,
no sticky stage. Headings: opacity .5 → 1 over 300 ms. Buttons: the hover fill,
no sweep, no pull. Cards: a static centred glow and an accent border on hover.
Same destinations, no travel.

## As built / deviations

Numbers below are the VPS's (chromium headless, software raster, no GPU),
two desktop runs where the band mattered; the owner's machine gives the
verdict. Compare only runs with the same `binary`, `headless` and
`wheelScale`.

### Group A — structure and copy (9588cc9, 3e5c318)

- Copy as planned; the middle dot of "Robotics · Software · ML" is in
  Fraktion Mono and fits at 390px. The page's `<meta name="description">`
  and the Open Graph text still lead with the hardware — not in the plan's
  strings, left for the owner to word.
- `tests/lib.mjs` now ignores the engine's own aborts (`NS_BINDING_ABORTED`,
  "cancelled") beside Chromium's `ERR_ABORTED`: firefox/phone twice saw the
  hero figure's `src` fetch aborted once the srcset candidate was chosen.

### Group B — the black sequence (165dd9a, f99e8f6, 353f6da, 6956946, 284156b)

- B4 as planned: the burst is born 36px under the footer at 1440x900, 34px
  at 390x844. The ring is cut flat where it meets the bento's opaque ground,
  so it rises from under the footer rather than over it — inherent, the
  bento paints its own white. Rocket phases: medians 16.7 unchanged; the
  long-frame counts moved inside the run-to-run band (rocket-up read 8 then
  3 in two identical runs).
- B5: the burst ring starts at the accent, not at the ember the plan gave
  it — over the white page the dark ember read as a brown smear inside the
  ring. The wipe's edge keeps the ember between black and accent.
- A regression found on the way: 353711e had deleted `restAtStart()` from
  `RocketFlight.ts`, so under reduced motion the rocket controller threw at
  init and the craft parked in the section's corner. Restored in 353f6da;
  `t-anime` now runs a reduced-motion context per engine (rocket at the
  start of its trail, star field in flow at opacity 1, no errors).
- B6 as planned. Cost on this rasteriser, consistent over two runs: the
  desktop rocket-down p95 moved 33.4 -> 49.9 ms with two to three more long
  frames, because the two promoted star layers now sit over the flight and
  take writes from .42 while the wipe and the burst scale; space phases p95
  16.8 -> 33.4 at the same medians; the phone at cpu x4 unchanged or better.
  Not yet measured: the same with no `will-change` on the layers.
- B7: panels are content-sized with a floor of `min(100svh, 46rem)` rather
  than full screens, the image tilt is gone and the images sit straight with
  a hairline, the tags lost their leading `#` — all three for the GitHub
  reading the owner asked for, none of them in the plan's wording. The star
  tail is the planned `::before` dots under an `::after` fade, both at
  `z-index: -1` inside the section's own stacking context.

### Group C — hero (b9a565f, eb5a3e7)

- C8 as planned (padding 8px, radii 22/14, white bezel, ring + lift + outer
  shadow). Inside the run-to-run band: idle-top median 33.4 (band 33.4/50.0),
  hero-pointer 21 long frames (band 21-45), p95 identical.
- C9: height `min(74svh, 140%)`, not the plan's 80svh — 80 clipped the crown
  of his cap at 1440x900; 74 puts it about 40px under the top, over the arc.
  The ceiling stays 760px (the source is 1535px tall); `sizes` grew to 320px
  so the 760w asset is chosen at 2x. The tilt is as planned (0.045 ease,
  ±4.2°/±2.5°, 0.01° write threshold, fine-pointer only, `will-change` under
  the same query). Desktop hero-pointer read 41 long frames against 21 in
  the C8 run — inside today's band of 21-45 across eight desktop runs, but
  it is one more promoted layer written under the pointer; the phone at
  cpu x4 picked up one long frame in hero-pointer (the harness context has a
  fine pointer there too, which a real phone has not).


### Group D — motion, type, campus (648e3a4, 878102f, D12-D14 below)

- D10 as planned, except the base `t(base)` rule stays Editorial: the
  project pages were not audited for what inherits it. No preload (nothing
  on the first screen uses Geist).
- D11 as planned; the split is written on one line so no indentation
  becomes text (the first build inflated the gaps between words to seven
  spaces). Heading styles moved behind `:global()`: a child component's
  root does not carry the parent's scope.
- D12 as planned, plus `will-change: transform` on the button only while
  the pointer is over it (cleared when the elastic return completes).
- D13: the clipped box for the spot and the beam is a `.bento-card__fx`
  child, not `overflow: hidden` on the card — the corner marks sit 12px
  outside the card and would have been clipped. The spot is promoted only
  while it is the one under the pointer. The touch ending (one lap on
  `.is-in`) is declared under `(hover: none)` and needs the cards observed,
  so Reveal.ts watches `[data-reveal]` beside `[data-split]`.
- D14: the pill reads "Research · in progress" rather than the plan's
  "Lab · in progress" — the kind stays `research` so the board and the
  work tags keep one label map. The lab entry also appears on the Timeline
  board as "Jun 2026 — now" (t-timeline now pins eight live entries). The
  pill column is a fixed 11.5rem so the titles line up.
- **Desktop pointer phases moved one vsync on this host.** hero-pointer and
  explore-pointer medians read 33.4 ms in every run from B4 to C9 (seven
  runs) and 49.9 ms in every D run (three), p95 50.1 unchanged, idle-top
  unchanged, bento-pointer 16.7 unchanged, main-thread counters identical
  (one recalc and ~13.5 style writes per frame, no layout, no long tasks).
  An isolation pass (same figure-eight, rAF deltas, one feature switched
  off per reload, two reloads each) was inconclusive: Explore's shimmer
  CSS off and Explore's listeners off each read 33.4 twice, all three
  features off read 49.9 twice — the median is bimodal between two and
  three vsyncs on this rasteriser and flips with the reload. The magnetic
  promotion made no measurable difference. Nodes 1150 -> 1526 (split
  words, the card leaves, the campus rows), listeners 42 -> 68 (eight
  magnetic buttons by three, the bento grid by two), +0 per resize. The
  verdict needs the Mac: a GPU composites the same layers for nothing.

### Review round (4de0886 … the fixes after `/code-review high f0c131e..HEAD`)

Ten findings; nine acted on, one declined.

- Spot and pull read their element's box once and reused it through a
  scroll under a resting pointer; both now re-read it when `scrollY` has
  moved since the read (before the writes in the same handler) and a
  passive scroll listener releases the card or the button when the pointer
  is no longer inside it. BentoGlow's hand-off between cards read the new
  rect after writing the old spot's style; reordered.
- The campus `<time>` had no `datetime`; it does, one per end of a span.
- Three copies of the kind-label map and two date formatters became one
  of each in `src/data/timeline.ts`; "Competition" on the work tags and
  "Hackathon" on the campus pills for the same project became "Hackathon"
  everywhere (both on record are hackathons). Campus dates now read as the
  board's ("June 2026 — now").
- RocketFlight's copy path (constants, query, write, comments) was dead
  since the copy block went in A3; removed.
- Space.ts no longer encodes "the rocket is half the space section": a
  second trigger on `.rocket-flight` drives the fade-in from the rocket's
  own progress and the travel's start is derived from the two triggers'
  scroll positions on refresh. Frames identical to the last digit.
- The figure's `will-change` is now also gated on
  `prefers-reduced-motion: no-preference`.
- The two skip-unchanged write maps became `src/utils/leafWrite.ts`.
- **Declined:** wiring the `destroy*` functions to `pagehide` or an Astro
  swap event. There is no re-init on this MPA, and a `pagehide` teardown
  would break a page restored from the back-forward cache; the exports
  stay the lifecycle API they were for the three controllers that already
  had them.
- Suite after the fixes: 1130/1130. One desktop harness run on the final
  build (e99bf9f): every median as in the D runs (explore-pointer back on
  33.4 this time — the bimodal reading again), p95 50.1 or less everywhere,
  listeners 68 -> 70 (the two scroll listeners), nodes 1526 -> 1541 (the
  campus `<time>` elements), heap 2.2 MB flat, no console output, all
  fifteen scroll assertions passing.
