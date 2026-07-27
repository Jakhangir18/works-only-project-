# Dive-into-image transition — Phase 0 inventory and plan

Status: **Step 0 verified, no transition code written yet.** Measurements are in
"Open items — resolved in Step 0" at the end of this file. Recorded here
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

## Steps 1–2 as built

`src/utils/DiveTransition.ts` + `src/styles/site/_dive.scss`, wired from
`SWork.astro`. Steps 3–5 (teardown discipline, reduced motion, measurement) are
not implemented.

### The rig

```
.dive              fixed, overflow:hidden, perspective:640px  (matches .s__scene)
  .dive__backdrop  opacity 0 -> 1
  .dive__flip      2D FLIP: card rect -> viewport          [animated transform]
    .dive__stage   perspective: 900px, origin 50% 50%
      .dive__camera  sized to the card's layout box, preserve-3d
                                                            [animated transform]
        .dive__layer--far   image plane: photo, or colour panel + accent glow
        .dive__layer--mid   dot grid
        .dive__layer--near  title
        .dive__layer--fore  index, cta, card frame
  .dive__vignette  opacity 0 -> 1
  .dive__teaser    title, one line, "View full project"
```

Layers are authored by **how much each should grow over the dive**, and depth
plus a static compensation scale are solved from that:

```
growth      g = (P + d) / (P + d - Z)          P = 900, Z = 560
depth       d = g*Z/(g - 1) - P
compensation k = (P + d) / P
```

| layer | growth | depth | compensation |
|---|---|---|---|
| far — image plane | 1.15× | 3393 | 4.77 |
| mid — dot grid | 1.6× | 593 | 1.66 |
| near — title | 2.2× | 127 | 1.14 |
| fore — index / cta / frame | 4.0× | −153 | 0.83 |

`k` makes every layer exactly coincident at `z = 0`, so frame one of the dive is
the card and nothing else. Nothing but the camera's Z and the FLIP wrapper is
animated — the layers never move on their own, so the separation is real
perspective parallax rather than four tweens imitating one.

**The photo is deliberately the slowest layer.** Step 0 measured `cover.jpg` as
already upscaled 1.55× at full bleed on DPR 2 and 2.2× on DPR 3, so
magnification cannot carry the travel. Separation does, and the layers that rush
(type, grid, frame) are the resolution-independent ones.

### Entry

One delegated `click` on `.js-scene`. Modified, non-primary and already
defaulted-prevented clicks fall through to the real link. Geometry is read in a
single batch before any write; the card's screen scale and rotation come from
its own computed matrix (`m22`, and `atan2(-m13, m11)`) rather than from CSS,
because the phone and tablet variants of `.s__scene__work` drop
`scale(var(--size))` entirely. Scroll locks with `overflow: hidden` on `<html>`
plus non-passive `wheel`/`touchmove` cancels; `is-scroll-blocked` is not reused.
`sessionStorage.returnScrollY`, which SiteController sets on the same click, is
cleared because nothing is navigating.

### Deviations from the plan

1. **Portrait viewports fit the composition to width instead of cover-filling
   it.** Cover-filling 390×844 with a 16:10 composition scales the card 6.5×,
   and at 0.46 source pixels per device pixel the photo goes to mush. Fitting
   width lands it at 208 → 390 CSS px, which needs no upscale at all. The band
   sits above the teaser and reads as a deliberate layout.
2. **The far plane gained an accent glow and a viewport vignette.** The plan's
   four layers all *leave* during the dive, which for the four image-less
   projects meant arriving at a flat colour field — verified visually, it looked
   like a fade to paint. The glow (accent colour, cards without a photo only)
   and the vignette both fade up from zero, so frame one still matches the card,
   and the dot grid now rests at 0.18 instead of 0 so texture is still drifting
   at the far plane.
3. **A close path is included** (Escape and a close button, reverse timeline).
   The transition is unusable and unverifiable without one; the *lifecycle*
   hardening it implies — interrupt paths, `ScrollTrigger.refresh()`, the
   zero-listener-growth audit — is still Step 3.

### Verified visually, not yet measured

At 1440×900 @2× and 390×844 @3×: frame one matches the card, layers separate,
scroll holds under a wheel and is restored on exit, the source card is hidden
and restored, `will-change` is cleared on completion, modified clicks still
navigate, and there are zero console errors. **No performance measurement has
been taken** — that is Step 5.

---

## Open items — resolved in Step 0

All three measured on the production build (`npm run preview -- --port 4322`) with
system Chrome via `playwright-core`, at 1440×900 @2× and 390×844 @3×.

### 1. Rendered card rect and device pixel ratio — measured

The card box is **shrink-to-fit around its own title**, not a constant 280 px:

| | desktop 1440×900 (DPR 2) | mobile 390×844 (DPR 3) |
|---|---|---|
| layout box, AMS card | 288 × 180 | 208 × 130 |
| layout box, longest title | 420 × 262 | 208 × 130 |
| on-screen (visual) box, AMS | 205.7×128.6 … 275.4×172.1 | 208 × 130 |
| visual ÷ layout | 0.714 … 0.956 | 1.000 |

- An off-screen card reports 288×180 whatever its title, because
  `content-visibility: hidden` skips content layout. Only `.is-inview` cards report
  their true box — measure those, or the number is an artifact.
- On desktop the visual scale tracks `--size` almost exactly; the `perspective: 40rem`
  (computed **640px**) contribution is negligible near `progress ≈ 0`, where
  `translateZ` collapses to ~0.
- On phone/tablet the `.s__scene__work` transform **omits `scale(var(--size))`**, so
  visual == layout there.
- Only 1–2 of the 20 cards are rendered at any scroll position (`stagger: 0.25`).

**FLIP scale, card → full-bleed:** desktop **5.5×–7.4×**, mobile **6.8×** linear.

**Resolution, corrected.** The Phase 0 note that `cover.jpg` (1950×1160) gives "≈7×
headroom" is true against the *card*, not against the dive's end state. At full bleed
with `object-fit: cover` the source supplies **0.64 source px per device px on desktop
(1.55× upscale)** and **0.46 on mobile (2.2× upscale)** — and that is before the dive
pushes past the full-bleed plane. Consequence for Step 1: sell the travel with **layer
separation**, and do not park the camera at extreme magnification on the AMS photo.

### 2. `is-scroll-blocked` — read and measured

```scss
html.is-scroll-blocked, html.is-nav-open { &, body { height: 100vh; overflow: hidden } }
```

Measured at `scrollY = 7791` with the Work container pinned:

- Adding the class collapses `documentElement.scrollHeight` **15891 → 900** and
  **resets `scrollY` to 0 in the same frame**. Removing it does **not** restore the
  offset — scroll stays at 0 and the pin releases (container top 0.1 → 5991.1).
  **The class is unusable for a mid-page overlay.**
- The class itself is cheap: +1 layout, +2 style recalcs.
- **Scrollbar width is 0 before and during** (`scrollbar-width: none` on `html`, plus
  overlay scrollbars on macOS) — the `padding-right` compensation the plan proposed is
  not needed.
- **The H3 geometry cache is not invalidated.** `elAbsTop` (5991.1) and `elHeight`
  (9000) are byte-identical before, during and after: `.s-work`'s height is a px value
  written by `setSize()`, and `elAbsTop` is scroll-invariant. The plan's stated worry
  was the wrong one; the real hazard is scroll destruction.

Alternatives, same offset, same pin state:

| strategy | scroll held | wheel blocked | restored | doc height | pin held | layout/style |
|---|---|---|---|---|---|---|
| existing `.is-scroll-blocked` | ✗ → 0 | ✓ | ✗ stays 0 | collapses | ✓ | 1 / 2 |
| `overflow:hidden` on `<html>` only | ✓ 7791 | ✓ | ✓ 7791 | unchanged | ✓ | 1 / 1 |
| `position:fixed` body + `top:-y` | ✗ → 0 | ✓ | ✓ 7791 | collapses | ✓ | 1 / 1 |
| `preventDefault` on wheel/touchmove | ✓ 7791 | ✓ | ✓ 7791 | unchanged | ✓ | 0 / 0 |

**Decision:** lock with `overflow: hidden` on `<html>` only, paired with non-passive
`wheel`/`touchmove` `preventDefault` for iOS Safari, which historically ignores
`overflow: hidden` on `html` for touch scrolling — *not verified here, no real iOS
device in this harness.* Do not reuse `is-scroll-blocked`. Do not use the fixed-body
lock: geometry read while it is active is wrong by the scroll offset (`elAbsTop` read
back as −1799.9).

### 3. Decode state of `cover.jpg` — confirmed decoded at click time

One network request at page load (`responseEnd` 64–122 ms, 3.66 MB). A fresh
`new Image()` with the same `src` issues **no second request**.

| state | desktop | mobile |
|---|---|---|
| cold — Work never scrolled into view, card `content-visibility: hidden` | 20.5 ms | 30.3 ms |
| cold, 4× CPU throttle | 18.8 ms | 17.5 ms |
| **warm — card painted on screen (the only state a user can click from)** | **0.1 ms** | **0.2 ms** |
| warm, detached fresh `Image()` | 0.1 ms | 0.1 ms |
| warm, attached and laid out full-bleed | 0.1 ms | 0.2 ms |

Cold decode produced **zero long tasks** at 4× throttle — it is decoder-thread latency,
not a main-thread block.

**Decision:** keep `await img.decode()` in the entry path. It is free (0.1–0.2 ms) in
the normal case and bounds the cold case (keyboard or deep-link entry) at ~31 ms
without a long task. Caveat: `decode()` resolving fast proves the decoded frame is
cached, **not** that the compositor avoids a re-raster when the layer is scaled 6–7×.
That cost lands in paint and is a Step 5 measurement.

### Bonus: the overlay really must live on `document.body`

Probed with a `position: fixed; inset: 0` element at `scrollY 0` (desktop, viewport
1440×900):

| parent | resulting rect |
|---|---|
| `document.body` | 0, 0, 1440 × 900 ✅ viewport |
| `.js-container` (pinned) | 0, **5991.1**, 1440 × 900 |
| `.s__scene` | 180, 6103.6, **1080 × 675** (scaled 0.75) |
| `a-work` | 1452.8, 6441.3, **16.1 × 5.5** (projected through the perspective) |

`.s__scene` carries `will-change: transform` + `perspective`, and `a-work` carries
`will-change: transform` + `transform-style: preserve-3d`; each forms a containing
block for `position: fixed` descendants. Confirmed identically at 390×844.

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
