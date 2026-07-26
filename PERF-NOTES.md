# PERF-NOTES — Work-section stutter investigation

Phase 0 inventory. Read-only pass, no code changed. Date: 2026-07-25.

## Stack

- **Framework:** Astro 5.7 (static output), no React/Vue islands — all interactivity is vanilla `<script>` tags in components.
- **Animation deps:** GSAP 3.13 (+ ScrollTrigger, SlowMo ease), Three.js 0.183.
- **Build:** `astro build` → `dist/` (note: `dist/` is committed to git).
- **Deploy:** Vercel. Dev server on 4321. `playwright-core` is already a devDependency.
- Current branch: `main`, **dirty working tree** (modified components + untracked new files, uncommitted).

## Page composition (index.astro)

```
<body>
  site-loader (progress bar, ~4 s)
  HeroHome
    ├─ Navigation           (CSS transitions only)
    ├─ DottedSurface        (Three.js full-viewport WebGL points field)
    └─ MorphingText         (rAF loop, animated blur + SVG threshold filter)
  TransitionVideo           (wrapper, no visuals itself)
    ├─ RocketBackground     (fixed 1400×1400 canvas, 240-frame JPG sequence)
    ├─ TextSlidesOverlay    (fixed overlay, 4 slides, JS-driven opacity/transform)
    └─ RocketStorySection   (400vh scroll spacer + scroll→rAF driver)
  WhyWorkWithMe             (static bento grid, CSS hover only)
  SWork  ← "Work" element   (pinned, scrubbed GSAP timeline; letter tunnel + 20 cards + 2D canvas points + SVG mask)
  ContactSection            (static; imports SplineScene but never renders it)
</body>
SiteController (global): GSAP Ticker init, scroll/resize listeners, IntersectionObserver, loader intro
```

## Animation systems found (7)

| # | System | Files | Driver |
|---|--------|-------|--------|
| 1 | Rocket frame sequence ("WebP section" — frames are actually **JPG**) | `RocketBackground.astro`, `RocketStorySection.astro`, `src/utils/rocketFrameAnimator.ts`, `TransitionVideo.astro` | scroll event → rAF-throttled handler → canvas `drawImage` + transform + text-slide updates |
| 2 | Work section (the stuttering interaction) | `SWork.astro`, `src/utils/WorkSection.ts`, `AWork.astro`, `src/data/works.ts` | ScrollTrigger pin + scrub(1) timeline **plus** a per-frame `tick()` on the shared GSAP ticker |
| 3 | Dotted 3D surface (hero background) | `DottedSurface.astro` | own self-scheduling rAF loop, Three.js render every frame, **never pauses when off-screen** |
| 4 | Morphing hero title | `MorphingText.astro` | own self-scheduling rAF loop, animated `blur()` filters + SVG `feColorMatrix` threshold filter, **never stops** |
| 5 | Site loader / intro fades | `SiteController.ts` | one-shot rAF loop (~4 s) + 2 GSAP tweens |
| 6 | Text slides overlay | `TextSlidesOverlay.astro` | no own loop — called by #1's handler (`window.updateTextSlides`) |
| 7 | CSS-only bits | `Navigation.astro`, `HeroHome.astro` (mouse bob), `BentoCard` hover, `AWork` hover | compositor / CSS keyframes |

Infrastructure shared by several systems: `src/utils/Ticker.js` (bridges the GSAP ticker to an `Emitter` "tick" event), `src/utils/Emitter.js` (pub/sub), `SiteController.ts` (global scroll/resize/IntersectionObserver plumbing).

## requestAnimationFrame census — the direct answer

**7 rAF call sites in `src/`, of which 3 are continuous render loops that never stop, plus 1 scroll-driven per-frame loop.** At runtime while the user scrolls (which is how the Work element opens), **4 independent rAF-driven workloads compete for every 16.7 ms frame**:

| Loop | Where | Lifetime | Work per frame |
|------|-------|----------|----------------|
| A. GSAP ticker (rAF inside gsap-core) | started by `Ticker.init()` in `SiteController.ts:59`; also drives all ScrollTrigger scrubs | continuous, forever | ScrollTrigger update, scrub timeline (20 card attr tweens), `WorkSection.tick()` when section visible: 2× `positionInViewport` (gBCR reads), CSS-var writes on ~36 ghost letters, ~5,000-point 2D canvas redraw |
| B. `MorphingText.astro:113` | hero title | continuous, forever (destroy exists, never called) | text blur filter animation; SVG threshold filter repaint |
| C. `DottedSurface.astro:110` | hero background | continuous, forever, even off-screen | mutate 2,400 vertex positions + full-viewport WebGL render |
| D. `RocketStorySection.astro:114/122` | rocket scroll driver | per scroll event (rAF-throttled) — effectively every frame while scrolling | `querySelector(".s-work")` + 2× gBCR **every frame**; when Work is visible it still runs and re-writes rocket transform + 4 slide styles with constant values |
| E. `SiteController.ts:83` | loader progress bar | first ~4 s only | style width write |
| F. `TransitionVideo.astro:25` | init deferral | one-shot | — |
| G. `WorkSection.ts:113` | Safari font-settle deferral | one-shot | — |

(An 8th rAF exists in `public/nasa-nns.html`, a standalone orphan page not linked from anywhere.)

## Assets the animations depend on

| Asset | Count / size | Notes |
|-------|--------------|-------|
| `public/1/ezgif-frame-*.jpg` | **240 frames, 1918×766, 8.6 MB total** | ALL eagerly preloaded at page load (`RocketBackground.astro:112-117`); decoded size ≈ 5.9 MB/frame → ~1.4 GB if fully decoded; drawn into a 1400×1400 canvas |
| `public/projects/` | 11 MB | project-page images (ams cover used on Work cards) |
| Fonts | 5 × woff2, 356 KB | preloaded in head |
| Spline iframe | external | imported by ContactSection but **not rendered** |

## The Work interaction, precisely

`SWork.astro` + `WorkSection.ts`: a `--height: works×50vh` section (20 cards → 1000vh) with a pinned container. A scrub(1) timeline scales an SVG mask, expands the letter tunnel ("WORK" splits left/right and rotates via per-element CSS custom properties), and drives 20 `<a-work>` custom elements through an `attr(progress)` tween (each attribute change fires `attributeChangedCallback` → style write + class toggle). In parallel `tick()` runs on every GSAP ticker frame while the section is on screen (paused via IntersectionObserver when off-screen — this part is done right).

## Initial hypotheses (to be ranked properly in Phase 3, after baseline)

1. Off-screen loops B (MorphingText: animated blur is paint-expensive) and C (DottedSurface: full-viewport WebGL) keep running while the user is in the Work section — pure waste competing with the Work animation.
2. Loop D does layout reads (`querySelector` + 2 × gBCR) and redundant style writes on every scroll frame, page-wide, forever — including during the Work interaction.
3. `WorkSection.tick()` per-frame cost: gBCR reads (ScrollTrigger.positionInViewport) interleaved with ~36 CSS-var writes on transformed elements with pseudo-element shadows + a 5,000-rect canvas path each frame.
4. 240-JPG eager preload competes with first load; frames may be re-decoded on demand during the rocket scroll (no `decode()`/ImageBitmap caching).
5. 20 cards × attr-tween → custom-element callback overhead per scrub frame.
6. `will-change` sprinkled on many elements (mask, scene, every letter, every card) → layer explosion.

None of these is assumed true — each gets measured in Phase 4.

## Dead-code candidates (Phase 6 — decide later, delete nothing now)

- `WorksSection.astro` — imported by nothing.
- `SplineScene.astro` — imported by ContactSection but not rendered; its CSS is set to `display:none`.
- `public/nasa-nns.html` — not referenced from any page.
- `Emitter.off` leaves holes via `delete`; harmless but sloppy (not dead code, noted for honesty).
- `dist/` committed to git (build artifact, not code).

## Phase 2 — Baseline (2026-07-25, production build via `astro preview`, system Chrome headed)

Harness: `perf/harness.mjs`. Raw JSON: `perf-results/*.json` (gitignored, kept on disk).
**Display calibration:** idle median frame = 13.3 ms → this machine drives a ~75 Hz panel. "Clean" = 13.3–14.3 ms. Budgets below are still judged against the skill's 60 fps table.
Scroll driver: synthetic wheel, 40 px per ~12 ms step (~2.6 k px/s), pointer parked off-content. INP: n/a (scroll/wheel is not INP-eligible).

### Desktop 1440×900@2x, no throttle

| Phase | med | p95 | worst | >50 ms frames | long tasks (total ms) |
|---|---|---|---|---|---|
| idle-top | 13.3 | 14.2 | 14.4 | 0 | 0 |
| work-open-1 | 13.3 | 14.3 | 67 | 2 | 1 (57) |
| work-close-1 | 13.4 | 14.3 | 40 | 0 | 0 |
| work-open-2 | 13.4 | **26.8** | **174** | 9 | 8 (769) |
| work-close-2 | 13.4 | **27.4** | **227** | 5 | 5 (654) |
| work-open-3 | 13.4 | **26.7** | **187** | 8 | 6 (512) |
| work-close-3 | 13.4 | **27.2** | **134** | 8 | 5 (367) |
| idle-work-mid (parked) | 13.3 | 14.0 | 14.3 | 0 | 0 |
| rocket-down | 13.4 | 14.3 | 67 | 1 | 0 |
| rocket-up | 13.4 | 14.3 | 40 | 0 | 0 |

Heap: 4.8 → 5.4 MB after 3 open/close cycles (Δ+0.6 MB, per-cycle 5.1 / 5.3 / 5.4 — small steady climb, ~0.2 MB/cycle). Nodes 1586→1584, listeners 185→185 (flat). Console: 0 errors/warnings.

### Diagnostic: MorphingText + DottedSurface disabled (runtime injection, no code change)

| Phase | med | p95 | worst | >50 ms | long tasks |
|---|---|---|---|---|---|
| work-open/close 1–3 (range) | 13.3–13.4 | **14.2–14.3** | 53–95 | 1–2 | 0–2 (≤134 ms) |
| rocket both directions | 13.4 | 14.2–14.3 | 40 | 0 | 0 |

**Effect: p95 27 ms → 14.3 ms; long tasks 5–8/phase → 0–2; steady scroll jank essentially gone.** The two ever-running hero loops are the dominant steady cost. Residual single 50–95 ms spikes remain → separate cause.

### Desktop, CPU ×4

| Phase | med | p95 | worst | >50 ms | long tasks |
|---|---|---|---|---|---|
| work-open-1 | **25.8** | **39.6** | 200 | 9 | 4 (452) |
| work-close-1 | **26.5** | **40.5** | **334** | **18** | 5 (572) |
| work-open/close 2–3 | 14–26.4 | 27.6–41.1 | 226–333 | 6–19 | 3–8 (≤771) |
| idle-work-mid (parked) | 13.4 | 15.2 | 39 | 0 | 0 |
| rocket-down / up | 13.4 | 25.9 / 15.2 | 53 / 41 | 1 / 0 | 0 |

This is the user-reported experience reproduced: sustained half-rate scrolling with 200–334 ms hangs. Note idle-parked is still clean even at ×4 — the damage is all in the scroll-driven path.

### Mobile 390×844@3x (host-speed CPU — viewport test only)

Work phases: med 13.3–13.4, p95 15.1–26.3 worst 28–68, ≤2 long tasks. Rocket clean.

### Mobile 390×844@3x + CPU ×4 (mid-range-phone proxy, extra run)

Work phases: p95 up to 26.6, worst 106–265 ms, 1–3 frames >50 ms per phase, long tasks ≤2 (≤334 ms). Rocket clean.

### The four requested extra measurements

1. **Preload of `public/1/` (240 JPGs, 8.2 MB):** completes ~370–580 ms after navigation (local server). Long tasks during preload: 1 (86 ms) unthrottled, 4 (342 ms) at CPU ×4. **Renderer-process RSS peaks at 243 MB** during preload, settling to ~222 MB; JS heap only ~4.5 MB (decoded frames live off-heap in the image cache).
2. **Forced reflows while scrolling Work:** instrumented reads-after-write ≈ **1.0 per frame on average (max 5)** — one forced layout virtually every frame, steadily. CDP cross-check: LayoutCount ≈ 0.8–0.9/frame, RecalcStyleCount ≈ 2–3/frame, total layout-API reads ≈ 2.3/frame.
3. **`attributeChangedCallback` on `a-work` cards:** average ≈ **1.1 fires/frame, max 3–5/frame** during open/close (staggering spreads the 20 cards out; this is not a callback storm).
4. **Hero-loops-off diagnostic:** see table above — the dominant factor at desktop. Reverted by design (runtime injection only; repo code untouched).

### Budget scorecard (60 fps budgets from the skill)

| Budget | Desktop | Desktop no-hero-loops | CPU ×4 | Mobile | Mobile ×4 |
|---|---|---|---|---|---|
| median ≤ 16.7 ms | ✅ 13.4 | ✅ 13.4 | ❌ 26.5 | ✅ 13.4 | ✅ 13.4 |
| p95 ≤ 25 ms | ❌ 27.4 | ✅ 14.3 | ❌ 41.1 | ✅ 15.3 | ❌ 26.6 |
| worst ≤ 50 ms | ❌ 227 | ❌ 95 | ❌ 334 | ❌ 68 | ❌ 265 |
| long tasks = 0 | ❌ 8/phase | ⚠️ ≤2 | ❌ 8 | ⚠️ ≤2 | ⚠️ ≤2 |
| heap flat after 3 cycles | ⚠️ +0.6 MB | ⚠️ +0.6 MB | ⚠️ +0.6 MB | ⚠️ +0.6 MB | ⚠️ +0.6 MB |
| console clean | ✅ | ✅ | ✅ | ✅ | ✅ |

Unexplained-but-noted: cycle 1 on desktop baseline was much cleaner than cycles 2–3 (p95 14.3 vs 26.8) — reproducible pattern, cause TBD in hypothesis phase.

## H0 — Frame classification diagnostic (no code changed)

Method: Chrome trace (devtools.timeline + v8.gc + invalidationTracking) over 3 open/close cycles, merged-interval attribution per >50 ms main-thread task (`perf/analyze-trace.mjs`); plus a sampling heap profiler across the cycles. Runs assertion-valid. Note: the harness's own scroll-region assertion caught a real invalid run first — a late viewport settle re-triggered the app's debounced rebuild and moved scroll mid-"idle"; a layout-stability gate now guards every run.

### Classification of long tasks (two traced runs)

| Occupant | Tasks | Evidence |
|---|---|---|
| **Style recalc (UpdateLayoutTree 44–89 ms)** | 5–6 per 3 cycles | Invalidation tracking: **108 of 114 invalidations inside long tasks are "Inline CSS style declaration was mutated" on `SPAN.s__scene__letter.js-letter`** — the per-frame `--progress` writes in `WorkSection.moveLetters()` on ~36 ghost letters, each carrying chained `calc(var(...))` transforms plus a `::before` pseudo that re-resolves the same chains. |
| **GC** | 3–6 per 3 cycles | In-frame chunks are `V8.GC_MC_INCREMENTAL_EMBEDDER_TRACING` (60–105 ms) — incremental mark-compact tracing the **DOM-wrapper graph**, not JS allocation volume. One natural 90 ms MajorGC observed mid-cycle. **Caveat honestly:** the 349–551 ms MajorGC monsters sat between phases and were the harness's own forced `window.gc()` — measurement artifact, excluded. |
| Layout (50 ms) | 1, first open only | `Layout:50ms` — one-time reveal cost (content-visibility / is-inview flip). |
| Paint / image decode / script-self | **0 dominated tasks** | Decode: 0 events, 0 ms on main thread in both traces. |

### Allocation profile (user's "what allocates per frame" question)

Total sampled JS allocation across all 3 cycles is **small** — top sites: `MorphingText.animate` 41 KB (per-frame `new Date()` + strings; dies with H1), GSAP core ~48 KB, `ScrollTrigger.update` 16 KB, **`updateRocketFrame` 16 KB — confirming the rocket handler allocates during *Work* scrolling** (runs page-wide on every scroll event; H4 target). The ~5,000-point canvas redraw allocates **nothing visible** to the JS heap profiler (native path memory) — that suspect is cleared as an allocator, GC-wise.

**Verdict on the user's GC theory:** partially confirmed, with a twist. Real GC pauses do land inside scroll frames, but the driver is embedder (DOM-wrapper) tracing cost, not raw JS churn — and the biggest "GC" spikes in the first trace were harness-forced. The three oddities resolve as: (1) heap climb ≈ half harness artifact (0.1 MB/cycle, now harvested out; clean per-cycle heap is flat [5.0, 5.1, 5.1] — **no app leak**), (2) residual 50–95 ms spikes = ghost-letter style storms + incremental-GC chunks, (3) cycle-1-cleaner = GC debt and style invalidation pressure build after the first pass; consistent with both.

### Consequence for the hypothesis list

- H2 concretized: **eliminate the ghost-letter style-invalidation storm** (skip unchanged writes / quantize progress; if insufficient, replace per-ghost CSS-var + calc chains with a directly computed transform).
- H1 unchanged and doubly supported (MorphingText is also the top JS allocator).
- H3/H4 unchanged (forced reflow ≈ 1/frame; rocket handler active during Work scroll, confirmed by its allocations).
- Dropped per user + data: rocket JPG decode (0 decode events), card-callback storm (~1.1 fires/frame).

## Deferred follow-ups (separate branch, not part of this work)

- **243 MB renderer RSS after the 240-frame preload** — no stutter link shown by the data, but risks tab eviction on real mid-range phones. Candidate fixes: halve frame count, cap decode dimensions, lazy-decode around current scroll position, or replace with scrubbed video.
- Preload cost itself (8.2 MB network + 1–4 long tasks during load at 4× CPU).

## Open questions for the user

1. Working tree is dirty on `main` (your uncommitted changes). Plan: create branch `perf/work-stutter` from the current state and make a first commit of the *existing* working state as the baseline snapshot, so every perf change after it is one clean commit. OK?
2. The "WebP sequence" is actually 240 JPGs — confirming this is the section you meant (rocket frames under `public/1/`).
