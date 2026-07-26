# Dive-into-image transition — Phase 0 inventory and plan

Status: **planned, not started.** No transition code has been written. Recorded here
so it survives a context reset.

Goal: clicking a project card on the Work section opens a "dive into the image"
transition — the image opens toward the viewer with parallax depth, foreground and
background layers moving at different rates so it feels like flying *through* the
image rather than zooming it, with destination content revealed on the other side.
Built as a **same-page overlay** for now; may be promoted to a real route later.

---

## Phase 0 — Inventory

### 1. Which route/component is the experience page, and where are the cards defined?

There is no route named "experience." Two candidates existed:

*Candidate A — the home page `/` Work section.* **This is the confirmed target.**
Defined in `src/pages/index.astro` → `src/components/SWork.astro` → 20 `<a-work>`
cards from `src/components/AWork.astro`, with the list built by `src/data/works.ts`
(5 projects × 4 slots, shuffled at build time). This is the scroll-driven piece the
loader calls "Loading Experience," and these are project cards.

*Candidate B — the AMS project page `/projects/ams/`.* Has a `gallery-scroll` of 5
deployment slides with images at `src/pages/projects/ams/index.astro:348`. **Not the
target.**

### 2. What happens today when a card is clicked?

A plain full-page navigation. `AWork.onClick` only calls `preventDefault()` when the
href contains `#`; otherwise the anchor navigates normally. Separately,
`SiteController.bindEvents()` attaches a click listener to `a[href^="/work/"]` that
saves `window.scrollY` into `sessionStorage.returnScrollY`, and `intro()` reads it on
the way back to skip the loader and restore position.

Worth flagging: that selector matched only `/work/*`, so the AMS card — the one card
that actually has an image — did not save scroll position. (Fixed separately; see
the scroll-restore commit on `perf/work-stutter`.)

### 3. Is ClientRouter / View Transitions used anywhere?

No. Zero hits for `ClientRouter`, `ViewTransitions`, `transition:name`,
`transition:animate`, `transition:persist`, `astro:transitions`, or the native
`startViewTransition`. Navigation is full page loads, which is exactly why the
sessionStorage scroll-restore hack exists. If the dive is later promoted to a real
route, `ClientRouter` is the natural mechanism.

### 4. Do the card images have a higher-resolution source?

For the Work cards there is only one image in the entire set, and yes, it is
high-res:

| Image | Intrinsic | Size |
|---|---|---|
| `cover.jpg` (the only card cover) | **1950×1160** | 3.7 MB |
| `hero-tablet.jpg` | 932×932 | 1.2 MB |
| `patent.jpg` / `certification.jpg` | ~880×1250 | 1.0–1.8 MB |
| `deploy-*.jpg` (×5, the AMS gallery) | **448–512 × 620–642** | ~0.4 MB each |

Two consequences. First, `cover.jpg` at 1950 px wide is already the card's source and
gives roughly 7× headroom over its displayed size, which is comfortable for a dive.
Second — the bigger issue — **4 of the 5 projects have no image at all**; their cards
are colored panels with a title, index, and dot-grid. "Dive into the image" has no
image for 80% of the cards.

Had the target been candidate B, the AMS gallery images at ~500 px wide **would go to
mush** under a dive; that path would need re-exported assets first.

### 5. Are the cards inside a ScrollTrigger pin?

Yes, and this constrains the architecture more than anything else. The nesting is
`.s-work` → `.s__outer` → **`.s__inner` / `.js-container` (the pinned element)** →
`.s__scene` (which carries `perspective: 40rem`) → `a-work.js-work`.

From `src/utils/WorkSection.ts`: `pinTrigger` pins the container (`start: "top top"`,
`end: "bottom bottom"`, `pinSpacing: false`, `anticipatePin: 1`), a separate
`scrub: 1` timeline drives the card `progress` attributes, and `tick()` runs on the
GSAP ticker gated by an IntersectionObserver.

What that forces:

- **The overlay must be appended to `document.body`, outside the pin.** ScrollTrigger
  applies a `transform` to the pinned container, and a transformed ancestor becomes
  the containing block for `position: fixed` descendants — an overlay nested inside
  would be positioned against the pin instead of the viewport.
- The overlay needs its own perspective context; it must not inherit `.s__scene`'s
  `perspective: 40rem`.
- `tick()` should be suspended for the duration via the existing
  `setPausedState(true)`, since it keeps running on the ticker regardless of scroll
  being locked.
- **Scroll locking is the sharp edge.** Reusing the existing `is-scroll-blocked` class
  removes the scrollbar, which can reflow the page. That would invalidate the
  geometry cache added in H3 (`elAbsTop` / `elHeight` from `setSize()`) and shift
  every ScrollTrigger position. So exit must re-measure and `ScrollTrigger.refresh()`,
  or the lock must compensate with `padding-right` equal to the scrollbar width.

---

## Proposed plan

**Step 0 — three verifications before any code** (read-only): measure the real
rendered card rect and device pixel ratio in the browser; read the
`is-scroll-blocked` rule to decide lock strategy; confirm whether `cover.jpg` is
already decoded when a card is clicked (it is rendered as the card's `<img>`, so the
dive likely needs no new fetch for AMS).

**Step 1 — layer model.** With one flat JPEG there are no authored depth layers, so
build a camera-dolly rig: a `.dive__camera` with `transform-style: preserve-3d` and
`perspective: 1200px` on its parent, containing four layers at staggered starting
`translateZ` — a blurred scaled backdrop, the full image, a center-cropped midground,
and a foreground frame/vignette. Animating **one** transform on the camera makes the
layers separate at different apparent rates through perspective math alone; that is
true parallax, not a faked multi-rate tween, and it costs one animated transform plus
opacity per frame. For the four image-less projects, the same rig uses the card's own
composition (color panel, dot grid, title) as layers. Authored per-project cutouts
remain a drop-in upgrade later.

**Step 2 — entry.** Hijack only plain left-clicks (letting cmd/middle-click still open
the real link, and keeping Enter on the anchor working), read the card rect once,
`preventDefault()`, preload and `await img.decode()` the destination image, then FLIP
the overlay's first frame onto the card's rect using transform only, and run the dive
as a single `gsap.timeline()` — which rides the existing `gsap.ticker` and adds no
rAF loop. Destination content is revealed on the far side as a **teaser only**: title,
one-line description, and a "View full project →" link to the existing route. The
full project page stays the source of truth; page content is never duplicated into
the panel.

**Step 3 — teardown discipline.** One delegated click listener on the scene rather
than per-card; stable handler identities for Escape and backdrop-close (this is
precisely where the `bind(this)` duplicate-listener bug bit us); `will-change` applied
on dive start and removed in `onComplete` *and* on interrupt; `setPausedState`
restored; geometry re-measured and `ScrollTrigger.refresh()` called on exit.

**Step 4 — reduced motion.** `prefers-reduced-motion: reduce` skips the Z animation
entirely and cross-fades the overlay and destination with opacity only.

**Step 5 — measurement**, extending `perf/harness.mjs` with a dive phase: open the
Work section, dive in and out 5× consecutively, reporting median/p95/worst frame,
long tasks, and GC'd listener/node/heap deltas against the same budgets as the rest
of the site (p95 ≤ 25 ms, worst ≤ 50 ms, 0 long tasks, flat listeners after 5 dives).
Report before/after numbers; if a budget misses, say so at the top.

---

## Open items — must be resolved in Step 0

1. **Rendered card rect — not yet measured.** Derived roughly 280 px from the CSS
   (`min-width: 280px`, `aspect-ratio: 16/10`, scaled by a random `--size` of
   0.5–1.0), but never measured in a browser. The scale factor from card to
   full-screen dive depends on it. Measure; do not assume.
2. **`is-scroll-blocked` behaviour — not yet read.** Unknown whether it sets
   `overflow: hidden`, `position: fixed`, or something else, and therefore whether it
   causes a scrollbar-width reflow. This decides the lock strategy and whether the
   H3 geometry cache must be rebuilt on exit.
3. **Decode state of `cover.jpg` — not yet confirmed.** It is rendered as the card's
   `<img>`, so it is *probably* already decoded and the dive needs no new fetch, but
   this was not verified. Confirm before relying on an instant start.

---

## Decisions from the owner

1. **Target is candidate A**, the home page Work section.
2. **Ship the composition-based dive now** for the four image-less projects. Authored
   covers will be added separately and are the drop-in upgrade.
3. **Click hijack accepted**, with one rule: the full project page stays the source of
   truth, and the destination panel is only a teaser plus the link. Do not duplicate
   page content into the panel.
4. Build it as a same-page overlay, not a route change.

## Constraints (from CLAUDE.md, restated because they are binding here)

- `transform` and `opacity` only — no `width`/`height`/`top`/`left` animation.
- One-shot transition on the GSAP ticker; do **not** start a new rAF loop.
- No second WebGL context. CSS 3D (`perspective` + `translateZ`) on 3–4 layers.
- Preload and decode the destination image before the dive begins.
- `will-change` on the animating layers only, removed when the transition ends.
- Kill/refresh affected ScrollTriggers; verify zero listener growth after 5 dives.
- A `prefers-reduced-motion` path that cross-fades instead of diving.
- Measure with the existing `perf/` harness; the transition meets the same budgets.
