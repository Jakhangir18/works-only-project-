# The space sequence: why work with me → rocket → burst → violet work

Owner's direction, 2026-10-02, after s0animation.com/design: keep the opening
style; after the hero, the "Why work with me?" section from the tunnel home;
then the rocket climbs while the visitor scrolls; when that scroll is spent the
rocket bursts and the page turns violet with stars; the work lives in that
violet light.

## Phase 0 — composition

1. **Which loop.** No new loop. The burst rides the rocket's existing
   ScrollTrigger (`RocketFlight.ts`, one `onUpdate` writing leaf values) — it is
   two more leaf writes on the same callback. The star drift stays on
   `Space.ts`'s ScrollTrigger. "Why work with me?" is static markup, no loop.
2. **What pauses it.** Both ScrollTriggers only fire while their section is in
   the scroll range; outside it `onUpdate` is not called. Under reduced motion
   both controllers return after writing a resting pose, so nothing runs.
3. **What kills it.** `destroyRocketFlight()` kills the trigger and the resize
   listener; `destroySpace()` kills its trigger. Nothing on this MPA page calls
   them today and nothing new will; the resize path re-measures, it does not
   re-register.
4. **Unchanged input.** `apply(progress)` is called only from `onUpdate`, which
   ScrollTrigger fires only when progress changes.

## Per-frame write list

- `.rocket-flight__craft`: `--x`, `--y`, `--a` (unchanged).
- `.rocket-flight__wipe`: `--wipe` (unchanged, scale only).
- `.rocket-flight__burst`: `--burst` — one new leaf write; the element consumes it
  as `transform: scale()` and `opacity`. Composited only.
- `.rocket-flight__copy`: `--copy` (unchanged).
- `.space__layer--far/near`: `--drift` (unchanged).

Nothing is written on an ancestor. No layout property moves.

## Rest state

At progress 0 the rocket sits at the start of its trail, the wipe is scale 0,
the burst is scale 0 and opacity 0: the section is the white page it was.

## The burst

From `WIPE_STARTS` (0.84) the wipe already grows from the exit corner. The burst
is a ring with a soft core, born at the same corner in the flame's colours,
that scales ahead of the wipe and fades as the wipe overtakes it, so the hand-
off reads as an explosion rather than a curtain. The wipe's inner colour and
the space ground become one violet, `color(space)`, declared once in the anime
palette and used by the wipe, `AnimeSpace` and `AnimeWork`, so the three paint
the same pixel and the seam cannot drift.

## Reduced motion

The wipe never runs (already so); the burst stays at scale 0 and opacity 0; the
space section simply follows. Same destination, no travel.

## Work in the violet

`AnimeWork` keeps its layout (it is already the reference's panel scheme) and
changes ground and ink: `color(space)` behind, near-white type, the rule lines
at low alpha, the red accent kept for the way-in link. A radial violet glow per
panel is a static background, painted once.

## Not in this change

The reference's "DEEP DIVE" 3D blow-out into a case page is a route-level
transition; this project has no client router and that is a separate design.
The reference's sticky hero with cases scrolling over it is noted, not built.

## As built

Commits 9d2cf7b (palette), bd14427 (why work with me), 63492fc (burst),
589074a (work in the violet), plus one fix: the bento retheme had to be scoped
to `.theme-anime`, because the component is shared with `/tunnel/` and the
colour helper gave that page near-white cards under white type.

Visual pass, 1440x900 and 390x844, four burst frames each (0.82, 0.86, 0.90,
0.94): the ring is born as the rocket leaves, sweeps the copy while the copy
fades, and is gone when the wipe owns the screen. Frame zero is the white page.

## Measured (chromium headless, software raster, no GPU; all scroll assertions passing)

| | idle-top med / p95 / worst (>50) | rocket down p95 / worst (>50) | rocket up p95 / worst (>50) |
|---|---|---|---|
| 1440x900 cpu x1, before | 50.0 / 66.6 / 83.3 (5) | 50.0 / 50.1 (2) | 50.0 / 83.4 (3) |
| 1440x900 cpu x1, after | 33.4 / 50.1 / 83.3 (9) | 33.4 / 66.7 (5) | 49.9 / 83.4 (6) |
| 390x844 cpu x4, before | 16.7 / 16.8 / 33.4 (0) | 33.4 / 33.4 (0) | 33.4 / 33.4 (0) |
| 390x844 cpu x4, after | 16.7 / 16.8 / 33.3 (0) | 33.4 / 50.0 (0) | 33.4 / 66.7 (1) |

Nodes 970 -> 1137 (the bento section). Heap and listeners flat on both.

## Deviations

- The copy fade moved from 0.90–1.00 to 0.80–0.90. The plan assumed the copy
  could stay through the wipe; in the frames it sat as ink on violet and could
  not be read, so it now leaves as the burst is born.
- The burst's opacity is squared rather than linear: a linear fade had the
  ring at 50% while the wipe was still at 12%, and it read as a smear rather
  than a front.
- The desktop rocket phases carry two to three more long frames than before
  the burst. The burst and the wipe are each one promoted layer with a
  gradient background, laid out at 220vmax and 300vmax and rastered once at
  that size; on a software rasteriser that first raster is the long frame.
  Not fixed here. The experiment to run next, as its own measured commit: lay
  the burst out at 160vmax, which still reaches past the fold before its fade
  completes and halves the raster area.
