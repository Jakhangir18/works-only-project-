---
name: build-animation
description: Ordered procedure for adding a new animation, transition, or scroll-driven effect to this portfolio — a card/page transition, an overlay, a parallax or 3D rig, a scrubbed sequence, a reveal, a counter, anything that moves over time. Use it BEFORE writing the first line of animation code, and use it when reviewing or extending an animation someone else added. It is the build-time counterpart to perf-loop: perf-loop rescues an animation that is already janky; this one is how you avoid needing the rescue. Trigger on "add a transition", "animate X", "make X move on scroll", "new hero/overlay/reveal effect", "port this animation in".
---

# Build an animation

CLAUDE.md holds the **prohibitions** (invariants 1–9) and the **budgets**. Read them;
they are not restated here. This file is the **ordered method** that produced the
dive transition without a perf-loop rescue afterwards, derived from what actually
happened on this repo between `8aaef45` and `e0d993e`.

The phases are ordered because each one throws away work the next one would waste.
Skipping ahead is how the earlier systems on this page ended up needing
`perf/work-stutter`.

```
0 composition question → 1 loop inventory → 2 design + Step-0 probes
  → 3 build → 4 verify visually → 5 measure → 6 harden lifecycle
  → 7 cross-engine → 8 commit + record
```

**Scale the procedure to the animation.** Phases 0, 1, 4, 5, 6 and 8 are
unconditional — they apply to a 200-line CSS reveal as much as to the dive.
Phase 2's probe list, phase 3's rig and FLIP patterns, and phase 7 apply
*conditionally*, and each says when. A small animation runs this whole list in an
hour; that is the point.

---

## Phase 0 — the composition question, asked first

Before design, before probes, before a single line. Write three sentences in the
plan file or the PR description:

1. **Which existing loop does this subscribe to?**
   Valid answers on this page: `gsap.ticker` (a `gsap.timeline()` or a ScrollTrigger
   scrub rides it for free — this is the default and the right answer nearly always);
   an existing `tick()` that already runs for this section; a CSS transition or
   keyframe with no JS at all. **"A new `requestAnimationFrame` loop" is not a valid
   answer** (CLAUDE.md 6). At the start of this project four independent rAF loops
   competed for every frame; the fix cost a whole perf phase.
2. **What pauses it?** Name the `IntersectionObserver` or the `visibilitychange`
   handler — or name the reason it structurally cannot run when unseen: a one-shot
   tween that finishes and is gone, or a timeline that only exists while an overlay is
   open, both pause by not existing. "It's cheap" is not an answer. CLAUDE.md 1.
3. **What kills it?** Name the function, and name what calls that function. A
   `destroy()` nothing calls is the `MorphingText` bug verbatim. CLAUDE.md 4.

   This is an Astro MPA with no client router, so **nothing here ever unmounts** —
   which is why "what kills it" is easy to answer with a shrug and easy to get wrong.
   The lifecycle events that actually re-run code on this page are: the **debounced
   resize rebuild** (`SiteController.resizeThrottle` 200 ms → `WorkSection.onResize`
   200 ms → full rebuild, which recreates 108 elements), **overlay close**, and
   **ScrollTrigger pin re-parenting**. If your animation registers anything during a
   rebuild, the rebuild is what must unregister it — that path, not unmount, is where
   this project leaked +160 listeners per resize.

A fourth question if the animation is driven by scroll rather than by a click:
**what does it do on the frames where its input has not changed?** The answer must be
"returns immediately". CLAUDE.md 5.

If any of the three cannot be answered in one sentence, the design is not ready and
phase 2 will not save it.

## Phase 1 — inventory the loops that already exist

Re-derive it; do not trust `PERF-NOTES.md`'s census, which is a snapshot of 2026-07-25.

```bash
grep -rn "requestAnimationFrame" src/ public/
grep -rn "ScrollTrigger.create\|gsap.timeline\|gsap.ticker\|IntersectionObserver" src/
```

For each hit record: what drives it, what pauses it, and **whether it is running in
the scroll region your new animation will occupy**. That last column is the one that
matters — your animation does not get a whole 16.7 ms (or 8.3 ms) frame, it gets
what is left after the neighbours. The dive lives inside the pinned Work section, so
its neighbours are `WorkSection.tick()` (canvas redraw + ghost-letter transforms) and
the scrub timeline; it was designed to add **two animated transforms and a few
opacities** on top of that, and nothing else.

If the inventory shows something already over budget in that region, fix that first
with `perf-loop`, or you will be measuring your animation against a broken floor.

## Phase 2 — design against budgets, and probe before committing to the design

Write `docs/<name>-plan.md` first. Its job is to survive a context reset and to record
which decisions were *measured* rather than reasoned.

**Every architectural constraint in the dive came from a probe, not from reading
source.** The probe catalogue, with the answers this repo already has, is in
[references/step-zero-probes.md](references/step-zero-probes.md). Run the ones that
apply, on the **production build** (`npm run build && npm run preview -- --port 4322`)
at both 1440×900 @2× and 390×844 @3×. Probes that changed the dive's architecture:

| Probe | What it changed |
|---|---|
| Containing-block probe on the intended parent | Overlay moved to `document.body` — a `fixed` child of the pin renders at y 5991, and inside `.s__scene` at 1080×675 |
| Scroll-lock strategy comparison | `is-scroll-blocked` rejected: it resets `scrollY` to 0 and never restores it |
| Source-resolution headroom at the animation's **end** state | The photo became the *slowest* layer; separation carries the travel, not magnification |
| Rendered geometry of the element you animate from | The card box was shrink-to-fit, not the constant 280 px the design assumed |
| Decode state at trigger time | `await img.decode()` kept: 0.1 ms warm, bounds the cold case at ~31 ms with no long task |

**Design output, written down before building:**

- The **per-frame write list**: exactly which properties change every frame, and on
  which elements. `transform` and `opacity` only. Each write lands on the leaf that
  consumes it (CLAUDE.md 2). If the list is longer than a couple of animated
  transforms plus a handful of opacities, redesign now — the dive animates *two*
  transforms (`.dive__flip`, `.dive__camera`) and four opacities, and everything else
  is static compensation solved at open time.
- **If a per-frame write is not `transform`/`opacity`** — `textContent`, a canvas
  redraw, an attribute that drives a custom element, an SVG geometry attribute — it is
  not automatically disqualified, but it must be bounded, and the plan says how:
  1. **Quantize to the displayed value.** Write only when what the visitor sees
     actually changes. A counter tweening 0 → 240 over a second has ~240 distinct
     states, not 60 per second forever; compare against the last written value and
     return early otherwise. This is CLAUDE.md 5's "never rewrite a style with the same
     constant value" applied to content.
  2. **Bound what the write can invalidate.** Give the element a fixed size (and
     `font-variant-numeric: tabular-nums` for digits) so a changed string cannot
     relayout its siblings. The measured precedent: `a-work`'s `attr(progress)` tween
     fires `attributeChangedCallback` ~1.1×/frame and is *fine*, while ghost-letter
     custom-property writes on an ancestor invalidated ~1,600 nodes/frame and cost
     44–89 ms. The difference is scope, not frequency.
  3. **State the expected invalidation count** so phase 5 has something to check.
- The **rest state**: what the animation looks like at progress 0, and why that is
  pixel-identical to whatever was on screen before it started.
- The **reduced-motion ending**: not "the feature off", but a designed alternate
  route to the same destination (see phase 3d).

## Phase 3 — build

Build in this order: **rest state → travel → interrupt paths**. A rig whose frame zero
does not match the source element cannot be fixed by tuning the travel.

### 3a. The layer rig — author by growth, solve depth

Only for 3D / parallax / dolly effects. Full derivation, worked numbers and the
raster-sizing rule: [references/layer-rig.md](references/layer-rig.md).

The non-obvious, reusable part: **do not author `translateZ` values.** Author how much
each layer should *grow* over the travel, and solve depth and a static compensation
scale from that:

```
growth        g = (P + d) / (P + d - Z)      P = perspective, Z = camera travel
depth         d = g·Z / (g − 1) − P
compensation  k = (P + d) / P
```

`k` cancels each layer's depth foreshortening, so with the camera at `z = 0` every
layer is **exactly coincident** — frame zero is the source element and nothing else,
by construction rather than by tuning. Then **only the camera moves**. Four layers
separating under one animated transform is real perspective parallax; four tweens
imitating it is four times the per-frame work and drifts out of register.

Two rules that come with the rig:

- **The layer with the least resolution headroom gets the smallest growth.** The photo
  grows 1.12×; type and vector grids, which are resolution-independent, grow 2.6–8×.
- **Any `<img>` inside the rig is laid out at its END size and statically scaled
  down** (CLAUDE.md 7). This is not optional and it is invisible in code review.

### 3b. FLIP entry from an on-screen element

If the animation starts from something already on screen (a card, a thumbnail, a
button), the first frame must *be* that thing:

1. **Read all geometry in one batch, before any write** (CLAUDE.md 3) — rect, computed
   matrix, box size.
2. Take the source element's screen scale and rotation from **its own computed
   matrix** (`m22`, `atan2(-m13, m11)`), not by re-deriving from CSS. Re-deriving means
   duplicating every breakpoint — the phone and tablet variants of `.s__scene__work`
   drop `scale(var(--size))` entirely, and a CSS-derived guess silently misses that.
   Guard `transform: none`, which is not a parseable matrix and is exactly what an
   element computes to before its custom properties are first written.
3. `preventDefault()` **only** on a plain primary click. Modified clicks
   (cmd/ctrl/shift/middle), non-primary buttons and already-defaulted-prevented events
   fall through to the real link, and Enter on the anchor keeps working.
4. `await img.decode()` on the destination image before the timeline starts.
5. Animate the overlay's wrapper **by transform only** from the source rect to its
   resting position.

**The overlay is appended to `document.body`.** Not to the section, not next to the
element it came from. `transform`, `perspective`, `filter`, `backdrop-filter`,
`will-change` and `contain` each make an ancestor the containing block for
`position: fixed` descendants, and this page's pinned container, `.s__scene` and every
card carry at least one of those. Measured, not assumed: the same `fixed; inset: 0`
element reads 0,0,1440×900 on `body`, 0,**5991**,1440×900 inside the pin, and
1452,6441,**16×5.5** inside a card. `document.body` is also outside every
`content-visibility` and `perspective` context, which is what lets the overlay own its
own 3D scene.

One delegated listener on the container, never one per element — per-element listeners
re-attached on pin re-parenting is how this project leaked +160 listeners per resize.

### 3c. A state machine, never a boolean

`isOpen: boolean` cannot express "opening" — and every interrupt bug lives there. Use
an explicit enum and be deliberate about which transitions are **rejected**:

| From | `open()` | `close()` |
|---|---|---|
| `closed` | accept | **reject** — nothing to close |
| `opening` | **reject** — rapid repeat clicks must not start a second dive or interleave geometry reads on two elements | **accept** — closing mid-entry is a real interrupt, not a dead click |
| `open` | **reject** | accept |
| `closing` | **reject** | **reject** — a second Escape must not restart the exit timeline mid-flight |

Set the state *before* any `await`. The dive's entry awaits `decode()`; a second click
landing inside that await is exactly the case the guard exists for.

Both exits must route through **one shared teardown closure**, so the guarantees
(`will-change` cleared, source element restored, scroll unlocked, section resumed,
state back to `closed`) cannot drift apart between the full and reduced paths. Reset
every animated property there unconditionally, even ones a given path never touched —
`closed` should be a single canonical rest state regardless of which exit ran.

A one-shot, non-interruptible, non-re-entrant animation (a reveal that fires once and
has no close) does not need the enum — but say so explicitly in the plan file rather
than defaulting to a boolean by omission.

### 3d. Reduced motion is an alternate ending, not an off switch

`prefers-reduced-motion: reduce` gets its own path to the **same destination** — the
end state is reached, never skipped. A dive still opens; a counter still shows its
final number; nothing is hidden and no interaction becomes a dead click. What is
removed is the *travel*: the dive pins the camera at `z = 0`, sets the wrapper instantly to its resting position,
and cross-fades opacity only — and it runs **shorter** than the full path (0.4 s in /
0.3 s out vs 1.15 / 0.7), because a cross-fade dragged out to the motion path's timing
reads as slow rather than as reduced.

Read the media query **live, on every entry and every exit** — never cached at build
time. That is what lets the setting change mid-animation be honoured by the next
phase.

## Phase 4 — verify visually, before you measure

**Automated frame numbers do not catch a changed appearance.** Three real defects in
this session passed the harness with clean numbers and were caught only by looking:

1. **Arriving at a flat colour field.** All four layers *left* during the dive, so the
   four projects with no photo flew into blank paint. The harness saw a perfectly
   smooth animation. Fix was compositional (an accent glow, a vignette, the grid
   resting at 0.18 instead of 0) — and both additions fade up **from zero**, so frame
   zero still matched the card.
2. **GPU-scaled raster blur.** The photo was mush for the whole flight and snapped
   sharp the instant `will-change` came off. Frame times were fine — it is a raster
   issue, not a timing one. Diagnostic that identifies it: *does it snap sharp when
   the timeline ends?* If yes it is CLAUDE.md 7, not source resolution.
3. **Black-on-black canvas.** The point grid drew in default black after
   `canvas.width` reset the 2D context, and because the draw loop early-exits on
   unchanged progress, the bad frame was never repainted. Zero errors, zero dropped
   frames, invisible content.

So the visual pass, at **1440×900 @2× and 390×844 @3×**, checks:

- Frame zero is pixel-identical to what was on screen before (screenshot both).
- Mid-flight, at a paused offset: is every layer as sharp as it was at rest?
- The **destination** — is arriving there interesting, or is it a flat field?
- Anything canvas-backed still has its stroke/fill after a resize **and** after
  entering the section at a resting scroll position (the case where nothing repaints).
- Interrupts by hand: click twice fast, Escape mid-entry, Escape twice, resize while
  open, change the OS reduced-motion setting mid-flight.
- **For anything scroll-driven, four entries the click-driven list misses:** enter the
  region fast (does it skip states or fire twice?); enter it *backwards*, scrolling up
  from below; stop halfway and leave it parked; and **reload with the page already
  resting inside the animation's range**. That last one is not hypothetical — it is
  how the black-on-black canvas was found, because a resting position is the one state
  where an early-exiting draw loop never repaints the bad frame.
- Modified clicks still navigate; keyboard reaches everything; `Escape` closes.
- Console: 0 errors, 0 warnings.

## Phase 5 — measure

Only now, and only on the production build. Extend `perf/harness.mjs` with a phase —
do not write a new tool (`bda60ae` is the worked example of adding one).

A new phase needs three things, and the harness already has the helpers for all three
(`perf/harness.mjs` ~line 570 onward):

- **A way to find its target.** `jumpTo(y)` parks the page; the dive phase additionally
  has to *search* for a rendered card, because only 1–2 of 20 are ever on screen and
  which one changes as the carousel scrubs. A fixed y is enough for anything at a known
  offset.
- **A repeatable drive.** `wheelBy(distance)` is the synthetic scroll — 40 px per
  ~12 ms step, ~2.6 k px/s, pointer parked off-content. Use it, so your numbers are
  comparable to every other phase in the file. Repeat the interaction **5×** (3× for
  scroll phases, matching the Work phases).
- **A scroll assertion.** `runPhase(label, fn, { from, to })`. For a click-driven
  animation that locks scroll, assert `from === to`; for a scroll-driven one, assert the
  real range. A failed scroll-phase assertion **invalidates the run** — that is the
  mechanism that caught a late viewport settle silently moving the page mid-measurement.

**The floor, for any animation:** one desktop run and one `--cpu=4` run of the region,
before and after. **The full matrix** — desktop, `--cpu=4`, `--mobile`,
`--mobile --cpu=4` — for anything continuous, scroll-driven, or that composites more
than a couple of layers. Budgets are CLAUDE.md's table. **Read the idle median first as
the machine's refresh floor** — runs here have read 13.3 ms (75 Hz) and 8.3 ms
(120 Hz) — and never compare two runs taken at different floors.

Honest note on ordering: the frame columns are meaningful now, but the **heap, node and
listener columns are not** until phase 6 is done — an unhardened animation fails them
by construction. Re-run after phase 6 and report *those* numbers. In this repo the
hardening commit (`a071c91`) deliberately landed before the first harness run
(`bda60ae`) for that reason; the phase order here puts measurement first only because a
design that cannot hit the frame budget should be found before you invest in its
teardown.

If a budget misses, say so at the top of the report, and do not fix it by removing the
feature.

## Phase 6 — harden the lifecycle

Whatever it creates, it destroys (CLAUDE.md 4). Audit, do not eyeball:

- **Listener count across 5+ cycles must be flat**, and flat across resize pairs too.
  The harness reports `listeners: before → after`.
- `will-change` is applied when the animation starts and removed in `onComplete`
  **and on every interrupt path**. Count them at rest: 0 left set.
- Timelines: `kill()` the previous one before starting a new one; kill the
  ScrollTrigger a timeline created, not just the timeline.
- Scroll lock released on every exit; the section's paused state **restored to what it
  was**, not hard-set to `false`.
- If a resize happened while the animation was open, call `ScrollTrigger.refresh()`
  **once, after** the overlay and any hidden source element are gone — so the refresh
  measures the page the visitor actually sees.
- Anything the animation nulls out (`sourceCard = null`) and any node count: 1 overlay
  node after 8 cycles, not 8.
- If the animation creates a link, it does not inherit listeners that
  `SiteController` attached in a one-shot `querySelectorAll` at load. The dive's teaser
  link had to write `returnScrollY` itself (`23521d1`).

## Phase 7 — cross-engine

Run when the animation uses any of: 3D transforms, `content-visibility`, viewport
units on a pinned or fixed box, `backdrop-filter`, `will-change` at scale, or animated
filters. Skip it for a pure opacity fade.

```bash
node perf/harness.mjs --dive-only --browser=webkit --label=<name>-webkit
node perf/harness.mjs --dive-only --browser=firefox --label=<name>-firefox
```

Frame timing only — no CDP, so no heap/listener/long-task numbers, no throttling. Those
engines idle at ~17 ms; compare WebKit to WebKit. **Playwright WebKit is not Safari** —
say which one you measured.

Two traps, both of which cost real time here:

- **Force `content-visibility: visible` before comparing any box across engines**
  (CLAUDE.md 9). A contained box measured against an uncontained one reads as a 52%
  engine disagreement when the real spread is 4%.
- **Viewport units on a pinned container**: `svh` is the only unit that is both never
  taller than the visible viewport and stable while scrolling. Anything iOS-specific is
  **unverified** until someone runs it on a real iPhone — label it that way in the
  commit message, as `a0cb719` does.

## Phase 8 — commit and record

- One change per commit; a perf-relevant commit carries before/after numbers in its
  message. Never mix behaviour with formatting. "One change" for a new animation means
  the split the dive used, and it is worth copying:

  | commit | contents |
  |---|---|
  | `feat` — rig and entry | the animation itself, explicitly stating which later steps are *not* in it |
  | `feat` — lifecycle hardening | state machine, interrupt paths, resize-while-open |
  | `feat` — reduced motion | the alternate ending |
  | `perf(harness)` | the new measurement phase |
  | `fix` — one per defect | each with its own before/after evidence |

  Anything the animation needs from elsewhere (exposing a section instance, adding
  project metadata) is its own commit **before** the feature, as `1c4a632` was.
- The plan file gets an "as built" section and a **deviations** section — what the
  design said, what the build did instead, and the measurement that forced it. Both of
  the dive's deviations (portrait fits to width; the far plane gained a glow) are
  recorded that way, which is why they read as decisions rather than as drift.
- Anything learned that generalises goes to `PERF-NOTES.md`; anything that becomes a
  hard rule gets promoted to a CLAUDE.md invariant with the bug that produced it.
- State plainly what was **not** verified.

---

## What this skill does not cover

- **Whether the animation is a good idea, or how it should look.** Growth factors,
  durations and easings are taste. The skill makes frame zero exact and the cost
  bounded; it has nothing to say about whether 8× is the right rush.
- **Any engine other than the three Playwright drives.** Real Safari, real iOS, and
  every real phone are outside it. Findings 4, 5 and 6 of the cross-browser audit are
  still open for exactly this reason.
- **Memory.** `performance.memory` is Chromium-only; layer memory on iOS — the one
  remaining open question about `will-change` on this page — cannot be measured by
  anything here. Do not accept a frame-time measurement as an answer to a memory
  question.
- **Route-level transitions.** Everything here assumes a same-page overlay. `ClientRouter`
  / View Transitions are unused in this project; introducing them is a separate design.
- **Asset production.** Choosing, exporting and sizing source images is upstream of
  this procedure — but its output binds phase 2's headroom probe.
- **Deciding that a budget miss is acceptable.** That is the owner's call, always.

## Where judgment is still required

- **How much probing is enough.** Five probes were right for the dive; a fade needs
  none. The test is whether a design decision rests on an assumption about the *running
  page* — if it does, measure it.
- **When a visual regression is a bug or a taste change.** "Arriving at a flat colour
  field" was only a defect because someone looked and disliked it.
- **Whether an unmeasurable fix is worth shipping.** `svh` for iOS was shipped
  unverified with a loud label; `will-change` removal was measured, did nothing, and was
  reverted. Both were judgment calls, made explicit rather than hidden.
- **When to stop tuning.** The frame budget converges; the look does not.
