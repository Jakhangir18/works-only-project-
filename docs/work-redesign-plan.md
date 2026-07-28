# Work Redesign Plan

Status: built and visually verified through phase 4. Performance measurement has not
started, per the stop point for this phase.

Goal: the Work section should show each project exactly once, number it by its own
position in the project list, give important work a deliberate larger frame, and let
the visitor dive from any rendered card without breaking the existing FLIP transition.

## Fixed Decisions

- The source list grows to roughly 10-15 works.
- Adding a work must be a data edit, not a layout-code edit.
- Each work appears once.
- Numbering is per work, not per rendered slot.
- Card size is selected from an enumerated rule, not from random values.
- The last work settles in the centre before the pin releases.

## Phase 0 - Composition Answers

1. Existing loop: the redesigned scroll sequence stays on the existing
   `WorkSection` GSAP/ScrollTrigger scrub and the shared `Ticker`/`gsap.ticker`
   path. It must not add a new `requestAnimationFrame` loop.
2. Pause: `SiteController` observes `[data-intersect]` and dispatches `intersect`;
   `WorkSection.setPausedState()` removes or restores its `tick()` subscription.
   The dive also pauses `WorkSection` while the overlay is open.
3. Kill: `WorkSection.setTimeline()` must continue killing the previous timeline's
   `scrollTrigger` and the pin trigger before rebuilding on resize. Any future
   cover loader must be one observer/controller, with a real disconnect path if the
   section ever gains a `destroy()`.
4. Unchanged scroll frames: `tick()` already rounds and early-returns for repeated
   scroll progress. The redesign should preserve that pattern and only update card
   loading when the active work index changes.

## Phase 1 - Current Loop Inventory

| File | Driver | Pause / kill | In the Work scroll region? | Design consequence |
|---|---|---|---|---|
| `src/utils/Ticker.js` | `gsap.ticker` emits `tick` | global page clock | yes | Work should keep subscribing here through `Emitter`, not add a clock. |
| `src/utils/WorkSection.ts` | ScrollTrigger scrub plus `tick()` | `setPausedState()`, timeline/pin killed on rebuild | yes | This is the only place that should own Work scroll progress and section length. |
| `src/utils/DiveTransition.ts` | GSAP timelines on click | state machine, timeline kill, shared teardown | yes, on click | Card rect, index, cover and title contracts must remain stable for FLIP. |
| `src/components/RocketStorySection.astro` | scroll listener + rAF scheduling | section-local visibility guards | adjacent page region | Do not add Work scroll listeners that compete with it. |
| `src/components/DottedSurface.astro` | independent rAF | IntersectionObserver and visibility | hero only | Existing precedent for pause discipline. |
| `src/components/MorphingText.astro` | independent rAF | IntersectionObserver and visibility | hero only | Existing precedent for pause discipline. |
| `src/utils/SiteController.ts` | loader rAF, global scroll/resize | one-shot loader, page lifetime | yes | Return-scroll and resize paths must keep working. |

## Current Work Inventory

| File | What exists now | Change needed | Can stay |
|---|---|---|---|
| `src/data/works.ts` | `projects` has `title`, `site`, `blurb`; `buildWorksList()` duplicates each project into four shuffled slots. | Replace slot expansion with a stable `works` list. Add per-project visual metadata: `size`, `cover`, `focalPoint`, `palette`, and poster style for no-cover works. | `title`, `site`, `blurb` stay the source of truth for dive teaser text. |
| `src/components/SWork.astro` | Calls `buildWorksList()`, maps 20 slots, passes slot index and total. | Map the real list once. Pass work index as `01`, `02`, etc., total as real count, and pass visual metadata through to `AWork`. | Section structure, mask, scene, canvas, and `initWorkSection()`/`initDiveTransition()` wiring can stay. |
| `src/components/AWork.astro` | Renders card, index, title, CTA, one internal cover map, one internal palette map, and writes `--progress` on the `a-work` leaf when the `progress` attribute changes. | Move cover/palette out of local maps into `works.ts`. Add enumerated size class/data, focal point, lazy cover state, and first-class poster visual for no-cover works. | The custom element contract can mostly stay: `progress` attribute, leaf-only `--progress`, `is-inview`, and delegated link behavior are still right. |
| `src/utils/WorkSection.ts` | Sets section height from rendered slot count; randomizes `--size` and `--y`; schedules card progress with `stagger: 0.25`. | Derive height from real work count. Replace random setup with deterministic lane and size metadata. Schedule each real work once, with a final centre hold. Add quantized near-cover loading if implemented. | Cached geometry, batched reads, ScrollTrigger ownership, mask/canvas/letter movement, and leaf-only per-frame writes should stay. |

Note: the "1000vh" is not a literal in the current code anymore. It is the result of
20 generated slots multiplied by `50vh`. The premise is still operationally right:
the visible length is driven by duplicated slots instead of real work count.

## 1. Section Length

Recommendation: derive the pinned scroll distance from the number of real works, then
set the section height to one viewport plus that distance because the current pin ends
at `bottom bottom`.

```ts
const INTRO_VH = 140;
const WORK_STEP_VH = 80;
const END_HOLD_VH = 60;

const pinDistance =
  ((INTRO_VH + workCount * WORK_STEP_VH + END_HOLD_VH) * unitHeight) / 100;
const sectionHeight = unitHeight + pinDistance;
```

`80vh` per work is the recommended focus beat: long enough for a card to enter, reach
centre, and be clickable without making a 15-item list feel stalled. `140vh` preserves
the tunnel/mask opening as a real entrance. `60vh` gives the final card a deliberate
settle before release.

At 5 works: pin distance is `600vh`, section height is `700vh`.
At 15 works: pin distance is `1400vh`, section height is `1500vh`.
At 10 works: section height lands at `1100vh`, close to today's perceived scale but
with no repeated work.

The timeline should be expressed in work units rather than GSAP default duration plus
`stagger`. Each work gets one label; the last label resolves to `progress = 0` and
then holds until the pin end. No random slot density should be needed.

## 2. Size Rule

Recommendation: use three editorial tiers in `works.ts`:

| Tier | Meaning | Desktop visual frame |
|---|---|---|
| `hero` | strongest portfolio signal | up to current max, about `440 x 275` |
| `feature` | above-normal importance | about `390 x 244` |
| `standard` | default work | about `340 x 213` |

The size should be a physical card frame, not a transform-only scale. That keeps cover
rasters closer to their final displayed size and keeps `DiveTransition.readCard()`'s
FLIP start honest because `offsetWidth`, `offsetHeight`, and the rendered rect all
describe the same design decision.

Large must stay scarce. Proposed constraint: `hero <= ceil(count / 8)` and
`hero + feature <= ceil(count / 3)`. That means 5 works allow 1 hero and 2 promoted
cards total; 15 works allow 2 heroes and 5 promoted cards total. The constraint should
be validated from data so a future project edit cannot accidentally make every card
large.

The weight belongs in `works.ts`, not derived from cover presence or list position.
Importance is editorial judgement. Layout code should only consume the enum.

## 3. Image Normalization

Recommendation: keep one frame ratio, `16 / 10`, because the existing card and dive
rig are already built around that shape and the landscape AMS cover is close to it.
Every cover uses:

```css
object-fit: cover;
object-position: var(--cover-x, 50%) var(--cover-y, 50%);
```

Each project with a real cover gets a focal point in `works.ts`, for example:

```ts
cover: {
  src: "/projects/ams/images/cover.jpg",
  alt: "AMS tablet interface at an inspection checkpoint",
  focalPoint: "50% 44%",
}
```

Portrait covers will still be cropped by a horizontal frame. The focal point is the
control that prevents face/head crops; it is not a promise that the full portrait will
remain visible. If a portrait must be read full-length, it should be composed into a
poster treatment rather than forced through `object-fit: cover`.

## 4. Works With No Cover

Recommendation: make "no cover" a first-class `visual.kind = "poster"`, not a missing
image fallback. A poster card is a designed project plate: project palette, index,
title, CTA, a stable grid/line motif, and one optional metadata-driven mark such as a
monogram or system diagram. It should be deterministic from project data, never random.

This works as a dive target because the dive already rebuilds a card into layers:
plate, grid, title, index, CTA, frame, glow. For poster works, those layers are the
art. The visitor should arrive at a deliberate graphic composition instead of flat
paint or a broken-image state.

The fallback hierarchy should be:

1. decoded real cover, if present and ready;
2. explicit poster visual, if no cover or cover is not ready;
3. never an empty card.

The current `onerror="this.style.display='none'"` behavior should become a last-resort
state that returns to the poster visual, not a silent disappearance.

## 5. Ending

Recommendation: the last work should not animate off-screen. It should reach centre
at `progress = 0`, remain there for `60vh` of scroll, and then let the pin release.
In timeline terms, the final work has an arrival segment and a hold segment, but no
exit segment inside the pin.

The visual timing target is: during normal wheel/trackpad scrolling, the visitor gets
roughly one short beat after the last card stops moving before the next section starts
pulling the page. Because scroll speed varies, this should be specified as distance
(`60vh`) and verified visually rather than as milliseconds.

Verification after implementation:

- at `1440 x 900 @2x` and `390 x 844 @3x`, scroll to the final hold midpoint;
- assert the final card's rendered centre is within 5% of viewport centre;
- wheel another `300px` and assert the card remains the same project and stays
  centred;
- wheel past the hold and assert the next section begins and the pin is released;
- run the existing regression sweep, then add a Work-specific harness phase if the
  final hold proves easy to miss by hand.

## 6. Loading

Recommendation: do not rely on native lazy loading alone. Pinned, transformed,
content-visibility-managed cards are exactly the kind of scene where browser viewport
heuristics can be late or inconsistent. Use explicit near-card loading driven by
logical work index.

`AWork` should render a stable poster immediately. Real covers start as `data-src`.
`WorkSection` should maintain a quantized active index and ask cards in a window like
`active - 2` through `active + 3` to prepare their covers. That update only happens
when the active index changes, not per frame. Prepared means: set `src`, await or store
`img.decode()`, then add an `is-cover-ready` class so the image can cross-fade in.

Dive interaction rule: the transition may use an image only after that image's decode
promise has resolved. In the normal path, a clickable in-view card should already be
inside the preload window, so `decode()` is warm. In the cold edge case, the dive
should either wait for the decode before reading/animating the image path, or open the
poster version that exactly matches what the visitor clicked. It should not swap a
newly decoded image into frame zero after the card rect has been read.

Loading window at 15 works: at most six real covers are requested near the current
position; far future works remain poster-only until they approach. Already-decoded
covers stay cached for back-scroll and return navigation.

## Per-Frame Write Budget

Allowed per-frame writes for this redesign:

- existing `a-work[progress]` attribute updates from the ScrollTrigger timeline;
- existing `AWork.attributeChangedCallback()` writing `--progress` on the `a-work`
  leaf only;
- existing leaf transform/opacity writes in `WorkSection.moveLetters()`;
- existing mask inner transform and canvas transform in `tick()`.

Not allowed:

- no per-frame CSS custom property on `.s-work`, `.s__inner`, `.s__scene`, or another
  ancestor;
- no random `--size`/`--y` writes on resize;
- no per-card scroll listeners;
- no new rAF loop;
- no layout reads after writes in the same frame.

One-time metadata writes on each `a-work` leaf during setup are acceptable, but static
classes/data attributes are preferred where possible.

## Approved Design Closure

### FLIP Across Three Card Sizes

`standard`, `feature`, and `hero` change the card's physical layout width, never a
hidden scale supplied to the dive. `DiveTransition.readCard()` continues to read the
clicked `.a__card`'s rendered `getBoundingClientRect()`, its `offsetWidth` and
`offsetHeight`, and the computed projection matrix of that card's `a-work` wrapper in
one read batch. The overlay camera is then sized from those actual box dimensions and
the FLIP wrapper starts at the rendered centre, scale, and rotation.

Therefore there is no tier-specific FLIP branch: the same geometry path consumes all
three sizes. Frame zero matches for all tiers because the overlay's camera box is the
clicked card's own physical box, and the static depth compensation still makes every
dive layer coincident at camera `z = 0`. Verification must sample one card of each tier
at desktop and phone widths before the source card is hidden.

### Numbering Contract

Numbering is the one-based index of the work in the exported `works` array:
`String(index + 1).padStart(2, "0")`. The denominator is `works.length`. Posters and
covers are visual treatments of that same work record and never create another index.
There are no generated slots, so each number and each work occur exactly once across
the whole section.

### Exact Per-Frame Write Locations

The redesigned Work scroll may write per frame only to these consumers:

| Writer | Value | Destination | Scope |
|---|---|---|---|
| GSAP scrub | `progress` attribute | each `a-work.js-work` | the card custom-element leaf |
| `AWork.attributeChangedCallback()` | `--progress` | that same `a-work` | the leaf that consumes it in its own transform |
| `WorkSection.moveLetters()` | `transform`, `opacity`, `transform-origin` | individual ghost glyph and shadow spans | leaf glyphs |
| `WorkSection.tick()` | `transform` | mask inner path and canvas | direct rendered leaves |
| `WorkSection.drawPoints()` | canvas pixels | Work canvas | one canvas leaf |

No new per-frame value is written to `.s-work`, `.s__outer`, `.s__inner`,
`.s__scene`, `.a__inner`, or `.a__card`. Size tier, lane, palette, motif and focal
point are static markup/classes or one-time leaf values. Near-cover preparation is
quantized to an active-index change, not tied to every tick.

### Build-Time Scarcity Validation

`works.ts` owns an assertion that runs at module evaluation immediately after the
literal `works` array is declared. It throws if
`hero > ceil(count / 8)` or `hero + feature > ceil(count / 3)`, including the actual
and allowed counts in the error. `SWork.astro` imports this already-validated module
during Astro's production render, so an invalid third hero makes `npm run build` exit
non-zero; there is no browser-only warning path.

### Mobile Scroll Distance

Use `80vh` per work from `576px` upward and `72svh` per work below `576px`. Mobile
needs a slightly faster cadence because the narrower card is read sooner and 15 full
viewport beats feels overlong, but dropping much below `72svh` makes ordinary flicks
skip a centred card. Keep the intro at `140svh` and final hold at `60svh`.

At 15 works the mobile pin distance is `1280svh` (`140 + 15 * 72 + 60`) and total
section height is `1380svh`: 13.8 viewport screens including the pinned viewport,
versus 15 screens on desktop. At 5 works it is `660svh` total. This is the proposed
responsive difference; visual verification decides whether its cadence reads
correctly, while performance measurement remains a later phase.

## Step-0 Probe Status

No new runtime probes were run for this design-only commit because no implementation
exists yet. Existing measured probes from the dive still apply to the unchanged overlay
and FLIP contract:

- overlay stays appended to `document.body`;
- scroll lock remains the existing dive strategy;
- card geometry must be read from the rendered card, not re-derived from CSS;
- `img.decode()` remains required before an image-backed dive starts.

Before the build commit, re-run the applicable probes on production preview at
`1440 x 900 @2x` and `390 x 844 @3x`: current card rect by tier, final-card hold,
decode warm/cold behavior, console clean, and `will-change` count at rest.

## Commit Plan After Approval

1. Data model only: real work list, size tiers, cover/focal/poster metadata, validation.
2. Card rendering only: `AWork` consumes metadata, poster treatment, normalized covers.
3. Work scroll scheduling only: count-derived height, deterministic lanes, final hold.
4. Loading only: near-card cover preparation and decode promise contract.
5. Dive compatibility only if needed: read poster/cover state without breaking FLIP.
6. Verification and docs: visual pass, perf/regression, as-built notes and deviations.

## As Built

- `works.ts` now exports one stable five-work array. It is rendered once, in order,
  as `01` through `05`; cover/poster treatment does not affect numbering.
- Editorial tiers are physical `16:10` frames: desktop `440 / 390 / 340px` and
  mobile `272 / 240 / 208px` for `hero / feature / standard`.
- Module-evaluation scarcity validation blocks an invalid hero/promoted mix during
  Astro's production build.
- Every work has a deterministic poster; AMS additionally has an explicitly loaded,
  decoded cover with focal point `50% 44%`.
- Work stays on the existing GSAP/ScrollTrigger timeline. Desktop uses `80vh` per
  work, mobile uses `72svh`; the last work reaches `progress=0`, holds for `60vh`,
  then the pin releases without an exit tween.
- Cover preparation is quantized to active-work changes and calls `prepareCover()` for
  `active - 2` through `active + 3`. Failed or cold covers remain the same poster the
  visitor clicked.
- Dive reads the real clicked box for all tiers. Visual probes confirmed its camera
  box exactly equals the source layout box for all six tier/viewport combinations:
  `440x275`, `390x244`, `340x213`, `272x170`, `240x150`, `208x130`.
- Dive uses a cover only after its card reports `ready`; otherwise it rebuilds the
  clicked poster motif and mark. No tier-specific FLIP branch was added.

## Phase 4 Visual Verification

The reproducible capture is `scripts/capture-work-redesign.mjs`. It ran against the
production preview at `1440x900 @2x` and `390x844 @3x`, emitted zero browser warnings
or errors, and asserted:

- numbering is exactly `01, 02, 03, 04, 05`;
- hero, feature and standard rendered widths match their tier at both viewports;
- all three dive camera boxes match their source card's physical box at both
  viewports, with cover/poster state preserved;
- the final card centre is within 5% of the viewport centre during the hold;
- the Work container is `fixed` during the hold and `relative` immediately after the
  release, with Contact entering the viewport.

Screenshots and the machine-readable geometry record are in
`docs/work-redesign-visuals/`.

## Deviations

- The approved plan allowed the cover to cross-fade to `0.85` opacity. The build uses
  full opacity after decode so the fallback poster cannot leak through with a
  different stacking order; this keeps the image-backed frame zero exact.
- The first visual pass exposed a scoped-SCSS selector error: tier classes rendered
  but every card retained the standard width. It was corrected before accepting or
  recording the visual artifacts.
- No `IntersectionObserver` was added for covers. The existing logical active index is
  a more reliable driver inside this pinned/transformed scene and needs no new loop or
  teardown.

## Not Yet Verified

Cross-engine runs and real-device iOS verification have not been run.

## Phase 5 Performance Verification

Measured 2026-07-28 against the production build on `:4322` with the existing
`perf/harness.mjs`. Each matrix run drove Work down/up three times and the selected
dive open/closed five times. The accepted comparison set used a stable 8.3 ms display
floor; every file below passed all 20 scroll assertions.

| Configuration | Max median | Max p95 | Work worst | Dive worst | Long tasks | GC'd heap by cycle | Listeners | Console |
|---|---:|---:|---:|---:|---:|---|---|---:|
| Desktop | 8.3 ms | 10.2 ms | 17.3 ms | **55.7 ms** | 0 | 5.0 → 5.0 → 5.0 MB | 63 → 63 | 0 |
| Desktop, CPU x4 | 8.3 ms | 10.2 ms | 26.0 ms | 18.2 ms | 0 | 5.0 → 5.0 → 5.0 MB | 63 → 63 | 0 |
| Mobile 390x844@3x | 8.3 ms | 10.3 ms | 15.9 ms | 10.4 ms | 0 | 4.7 → 4.8 → 4.8 MB | 65 → 65 | 0 |
| Mobile, CPU x4 | 8.3 ms | 10.1 ms | 17.6 ms | 26.3 ms | 0 | 4.7 → 4.8 → 4.8 MB | 65 → 65 | 0 |
| Budget | <=16.7 ms | <=25 ms | <=50 ms | <=50 ms | 0 | flat | no growth | 0 |

Overall result: Work itself clears every budget in all four configurations. The full
suite does not receive an unqualified pass because the first desktop hero-dive in the
stable-floor run contained one 55.7 ms frame. A separate desktop dive-only repeat
ran five more open/close cycles at median 8.3 ms, p95 <=10.3 ms, worst 10.4 ms and
zero long tasks, so the miss did not reproduce; it remains recorded rather than
discarded.

Full regression passed 15/15: seven routes, Work forward/backward, rapid jiggle,
resize/listener stability, keyboard, reduced motion, and hero/feature/standard dives.
The tier hand-offs were exact (`440x275`, `390x244`, `340x213`). The hero used its
decoded cover (`ready`); feature and standard poster targets opened by deliberately
bypassing image decode and reconstructing the matching poster motif.

Raw accepted files:

- `perf-results/2026-07-28T09-46-08-344Z-work-redesign-desktop-r2.json`
- `perf-results/2026-07-28T09-49-52-306Z-work-redesign-desktop-cpu4-r2.json`
- `perf-results/2026-07-28T09-53-23-772Z-work-redesign-mobile-r2.json`
- `perf-results/2026-07-28T09-42-22-329Z-work-redesign-mobile-cpu4.json`
- `perf-results/2026-07-28T09-57-19-605Z-work-redesign-dive-repeat.json`

Deviations:

- The display floor began at 33.3 ms and later switched to 8.3 ms. The initial
  desktop x1 run was assertion-valid but noisy (Work worst 424.9 ms, five long tasks);
  desktop x4 at the same 33.3 ms floor was clean. The mixed-floor mobile run is not
  used for median/p95. Stable-floor reruns are the comparison table above.
- Fresh profiles add 15 desktop / 17 mobile DOM nodes on first use while listener
  counts remain flat and GC'd heap plateaus by cycle two. This is a one-time
  materialization, not a per-cycle rising line.
- Regression first-load was LCP 632 ms, one long task and TBT proxy 21 ms, versus the
  prior recorded 0-11 ms TBT range. One run is insufficient to claim a load
  regression, so it is recorded without that claim.
