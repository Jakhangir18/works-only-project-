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

## As built / deviations

Filled in after phases 4–5.
