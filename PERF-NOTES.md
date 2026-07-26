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

## Open questions for the user

1. Working tree is dirty on `main` (your uncommitted changes). Plan: create branch `perf/work-stutter` from the current state and make a first commit of the *existing* working state as the baseline snapshot, so every perf change after it is one clean commit. OK?
2. The "WebP sequence" is actually 240 JPGs — confirming this is the section you meant (rocket frames under `public/1/`).
