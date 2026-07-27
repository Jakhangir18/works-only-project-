# Step-0 probes — measure the running page before you commit to a design

Every probe below changed the dive's architecture. None of them could have been
answered by reading source. Run the ones that apply, **before** writing animation code,
against the production build:

```bash
npm run build && npm run preview -- --port 4322
# then drive it with playwright-core (already a devDependency) at
# 1440x900 @2x and 390x844 @3x
```

Write the answers into `docs/<name>-plan.md`. They are the record of which decisions
were measured; without it the next context window re-derives them wrong.

---

## 1. Containing-block probe — where can this overlay live?

**Run when:** the animation uses `position: fixed` anywhere.

Append a `position: fixed; inset: 0` element under each candidate parent and read its
rect. `transform`, `perspective`, `filter`, `backdrop-filter`, `will-change` and
`contain` each make an ancestor the containing block for fixed descendants.

Measured here at `scrollY 0`, viewport 1440×900:

| parent | resulting rect |
|---|---|
| `document.body` | 0, 0, 1440 × 900 ✅ the viewport |
| `.js-container` (the ScrollTrigger pin) | 0, **5991.1**, 1440 × 900 |
| `.s__scene` (`perspective` + `will-change`) | 180, 6103.6, **1080 × 675** |
| `a-work` (`preserve-3d` + `will-change`) | 1452.8, 6441.3, **16.1 × 5.5** |

Identical at 390×844. **Conclusion: the overlay goes on `document.body`.** It also has
to, to own its own perspective context rather than inheriting `.s__scene`'s 640 px.

## 2. Scroll-lock strategy — which lock holds position?

**Run when:** the animation locks scrolling.

Measured at `scrollY = 7791` with the Work container pinned:

| strategy | scroll held | wheel blocked | restored | doc height | pin held | layout / style |
|---|---|---|---|---|---|---|
| the existing `.is-scroll-blocked` | ✗ → 0 | ✓ | ✗ stays 0 | collapses 15891 → 900 | ✓ | 1 / 2 |
| `overflow:hidden` on `<html>` only | ✓ 7791 | ✓ | ✓ 7791 | unchanged | ✓ | 1 / 1 |
| `position:fixed` body + `top:-y` | ✗ → 0 | ✓ | ✓ 7791 | collapses | ✓ | 1 / 1 |
| `preventDefault` on wheel/touchmove | ✓ 7791 | ✓ | ✓ 7791 | unchanged | ✓ | 0 / 0 |

**Decision: `overflow: hidden` on `<html>` only, plus non-passive
`wheel`/`touchmove` `preventDefault()`** for iOS Safari, which historically ignores
`overflow: hidden` on `html` for touch — *unverified, no real iOS device here.* Do not
reuse `is-scroll-blocked`. Do not use the fixed-body lock: geometry read while it is
active is wrong by the scroll offset (`elAbsTop` read back as −1799.9).

Scrollbar width is **0** before and during (`scrollbar-width: none` plus macOS overlay
scrollbars), so no `padding-right` compensation is needed — check this rather than
adding it reflexively.

## 3. Geometry of the element you animate from

**Run when:** the animation starts from an existing on-screen element.

The design assumed a constant 280 px card. It was shrink-to-fit around its own title:

| | desktop 1440×900 (DPR 2) | mobile 390×844 (DPR 3) |
|---|---|---|
| layout box, AMS card | 288 × 180 | 208 × 130 |
| layout box, longest title | 420 × 262 | 208 × 130 |
| visual ÷ layout | 0.714 … 0.956 | 1.000 |

Three traps in that one table:

- **An off-screen card reports the wrong box.** `content-visibility: hidden` implies
  size containment, so it sizes as if empty. Measure `.is-inview` elements only, or
  force `content-visibility: visible` first (CLAUDE.md 9).
- **Visual ≠ layout**, and the ratio is breakpoint-dependent: the phone and tablet
  variants of `.s__scene__work` drop `scale(var(--size))` entirely. Read the element's
  own computed matrix; do not re-derive from CSS.
- Only 1–2 of the 20 cards are rendered at any scroll position (`stagger: 0.25`) —
  which is why the harness's dive phase has to *search* for a target.

Since `632d595` the card box is an explicit `clamp(288px, 30vw, 440px)` and reads
**432 × 270 in all three engines, in both the contained and revealed state**. Re-measure
anyway; that fix was made for this reason and could be undone by a later style change.

## 4. Resolution headroom **at the animation's end state**

**Run when:** the animation scales an image.

Headroom against the *source element* is the wrong number. Compute source pixels per
device pixel at the size the image occupies when the animation **ends**:

| | desktop DPR 2 | mobile DPR 3 |
|---|---|---|
| `cover.jpg` 1950×1160, full bleed, `object-fit: cover` | 0.64 src px/device px (**1.55× upscale**) | 0.46 (**2.2× upscale**) |

That single number is why the photo became the rig's slowest layer and why portrait
fits to width instead of cover-filling. FLIP scale card → full bleed is 5.5–7.4×
desktop, 6.8× mobile, which sounds like plenty of headroom until you notice it is
measured against the *card*, not the destination.

## 5. Decode state at trigger time

**Run when:** the animation reveals an image that is not already painted.

| state | desktop | mobile |
|---|---|---|
| cold — never scrolled into view, `content-visibility: hidden` | 20.5 ms | 30.3 ms |
| cold, 4× CPU throttle | 18.8 ms | 17.5 ms |
| **warm — painted on screen (the only state a visitor can click from)** | **0.1 ms** | **0.2 ms** |

Cold decode produced **zero long tasks** at 4× — it is decoder-thread latency, not a
main-thread block. **Decision: keep `await img.decode()`.** Free in the normal case,
bounds the cold case (keyboard or deep-link entry) at ~31 ms.

Caveat worth carrying forward: `decode()` resolving fast proves the decoded frame is
cached, **not** that the compositor avoids a re-raster when the layer is scaled 6–7×.
That cost lands in paint and is a phase-5 measurement — and it is exactly the cost
CLAUDE.md 7 addresses.

## 6. Does the lock or the overlay invalidate cached geometry?

**Run when:** the animation locks scroll, hides an element, or resizes anything while a
ScrollTrigger pin is active.

The plan predicted the H3 geometry cache (`elAbsTop`, `elHeight` from `setSize()`)
would be invalidated by the lock. **It was not**: both are byte-identical before, during
and after, because `.s-work`'s height is a px value and `elAbsTop` is scroll-invariant.
The real hazard was somewhere else entirely (scroll destruction, probe 2).

The lesson is the procedure, not the answer: **probe the thing you are worried about,
because the worry is often aimed at the wrong mechanism.** Re-run this one when the
animation can be open across a resize — that path *does* need one
`ScrollTrigger.refresh()`, after the overlay and any hidden source element are gone.

## 7. What does one per-frame write actually invalidate?

**Run when:** the animation writes anything per frame that is not `transform` or
`opacity` — text, an attribute, a canvas, an SVG geometry attribute — or writes to an
element with descendants.

Trace the interaction with invalidation tracking on and read the attribution:

```bash
npm run perf:harness -- --trace --label=<name>
npm run perf:analyze -- perf-results/<trace>.json 50
```

The number to look at is which elements the invalidation records name, not how many
writes you made. Two measured precedents from this repo, three orders of magnitude
apart:

| write | fires | cost |
|---|---|---|
| `attr(progress)` on `a-work` → `attributeChangedCallback` → style write + class toggle | ~1.1/frame (max 3–5) | fine, never appeared in a long task |
| `--progress` on ~36 ghost letters carrying `calc(var(…))` chains and a `::before` re-resolving them | 108 of 114 invalidations inside long tasks | **44–89 ms style recalc**, the single most expensive bug in the project |

Frequency was comparable; **scope was not**. Traces are ~300 MB — delete them when
done.

---

## Probes that are cheap enough to run every time

- Console clean (0 errors, 0 warnings) in all three engines, before you start — so a
  warning you find later is yours.
- `getComputedStyle(el).transform === "none"` on the element you FLIP from, before its
  custom properties are first written. It is not a parseable matrix and it is the
  default state at page load.
- Count elements with a non-`auto` `will-change` at rest, before and after your change.
  This page sat at 136 of 557 nodes; measured in three engines. Removing them did **not**
  improve frame timing (`PERF-NOTES.md`, "Tried and reverted") — the count is a
  *memory* question, so do not propose it as a frame fix.
