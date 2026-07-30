# Cross-browser audit — diagnosis only

Date: 2026-07-26. Branch `perf/work-stutter`. **No source was changed for this audit.**
Ranked by expected impact. Every number below was measured on the production build
(`npm run build && npm run preview -- --port 4322`).

---

## Read this first: what I could and could not test

**Playwright's WebKit is not Safari.** It is the same engine lineage built from
upstream WebKit, but it differs from shipping Safari in JIT configuration, media
stack, process model, memory limits, and frequently in bug-for-bug behaviour. Every
"WebKit" number here is from Playwright WebKit 2336. Treat it as a strong hint about
Safari, never as proof.

Real Safari 26.2 **is** installed on this machine and `/usr/bin/safaridriver` exists,
but driving it needs `safaridriver --enable` (admin password) plus Safari →
Develop → "Allow Remote Automation" (a GUI toggle), and Playwright speaks CDP, not
WebDriver. All three are outside what I can do, so real Safari was not tested.

Other hard limits, stated rather than worked around:

| Capability | Chromium | WebKit | Firefox |
|---|---|---|---|
| CPU throttling (4×) | yes (CDP) | **no** | **no** |
| Long Tasks API | yes | **no** (probed `false`) | **no** (probed `false`) |
| `performance.memory` (heap) | yes | **no** | **no** |
| Node / listener counts (CDP) | yes | **no** | **no** |
| `mouse.wheel` with touch emulation | yes | **no** ("not supported in mobile WebKit") | n/a |

Consequences: **the 4× CPU runs you asked for do not exist for WebKit and Firefox** —
the runner refuses rather than print an unthrottled number under a throttled label.
Heap, long-task and listener-leak checks are Chromium-only. Mobile WebKit/Firefox ran
at a 390×844 **viewport only, without touch emulation**.

The tracked `perf/harness.mjs` is Chromium-only (it depends on CDP throughout), so
these runs used an adapted copy at `perf-results/xbrowser.mjs` plus
`perf-results/domaudit.mjs` and `perf-results/pinresize.mjs`. Those live in
gitignored `perf-results/` and are **not** committed, per the instruction to commit
this file alone. If you want cross-engine runs to be repeatable, the follow-up is to
add a `--browser` flag to the real harness with the CDP calls guarded.

---

## Frame timing, side by side

Work section, open/close ×3, then the rocket section. Desktop = 1440×900, mobile =
390×844. Median is ~13.3 ms in every engine (the 75 Hz display floor), so **median is
not the differentiator — frame consistency is.** The columns that matter are frames
over 25 ms and over 50 ms.

### Desktop, no throttling

| Phase | Chromium worst / >25 / >50 | WebKit worst / >25 / >50 | Firefox worst / >25 / >50 |
|---|---|---|---|
| work-open-1 | 53.4 / 2 / 1 | 66 / 6 / 1 | 14.3 / 0 / 0 |
| work-close-1 | 14.4 / 0 / 0 | 36 / 5 / 0 | 14.4 / 0 / 0 |
| work-open-2 | 14.4 / 0 / 0 | 48 / 3 / 0 | 26.6 / 1 / 0 |
| work-close-2 | 14.4 / 0 / 0 | 38 / 4 / 0 | 14.3 / 0 / 0 |
| work-open-3 | 14.4 / 0 / 0 | 49 / 4 / 0 | 14.3 / 0 / 0 |
| work-close-3 | 14.4 / 0 / 0 | 38 / 4 / 0 | 14.3 / 0 / 0 |
| rocket-down | 14.4 / 0 / 0 | 25 / 0 / 0 | 26.7 / 2 / 0 |
| rocket-up | 14.4 / 0 / 0 | 23 / 0 / 0 | 40.1 / 2 / 0 |

### Mobile viewport (390×844)

| Phase | Chromium worst / >25 | WebKit worst / >25 | Firefox worst / >25 |
|---|---|---|---|
| work-open-1 | 40.1 / 1 | 65 / 3 | 26.7 / 1 |
| work-close-1 | 14.4 / 0 | 56 / 4 | 14.4 / 0 |
| work-open-2 | 14.4 / 0 | 56 / 7 | 14.3 / 0 |
| work-close-2 | 14.4 / 0 | 50 / 2 | 14.3 / 0 |
| work-open-3 | 14.4 / 0 | 63 / 3 | 14.3 / 0 |
| work-close-3 | 14.4 / 0 | 52 / 3 | 40.1 / 2 |

**Reading:** Chromium is clean after the first cycle. Firefox is close to Chromium.
**WebKit is the outlier — every Work phase carries 3–7 frames over 25 ms and usually
one over 50 ms, in both viewports.** That is exactly the profile of "not smooth":
no freeze, a steady sprinkle of dropped frames.

One Firefox desktop run produced a single **1006 ms** frame during `work-close-3`. It
**did not reproduce** on a repeat run (worst 40 ms) and is recorded as an unexplained
outlier, not a finding.

---

# Findings, ranked

## 1. `will-change` on 136 elements — 24% of the DOM is composited

**Evidence.** Runtime census, identical in all three engines: 136 elements with a
non-`auto` `will-change` out of 557 total nodes — 77 `transform`, 59
`opacity, transform`. The sources are 54 ghost letters, 54 letter shadows, 20 cards,
plus the mask, scene, canvas, rocket container and text slides. Only 10 CSS
declarations produce them, which is why this is easy to miss by reading source.

**Symptom.** Every one becomes its own composited layer. Safari and iOS are the most
memory-constrained targets; layer explosion shows up as exactly the micro-stutter in
the table above, and on iOS as background-tab reloads.

**Proposed fix.** Drop `will-change` from the ghost letters and their shadows
(`SWork.astro`). They are transformed every frame while the tunnel is open, so a
layer already exists — the hint buys nothing and costs 108 layers. If you want to
keep a hint, apply it only while `--state > 0` and remove it on completion. CLAUDE.md
invariant 4's "removed when the transition ends" principle applies here.

> **TESTED 2026-07-27 — the proposal does not move the WebKit frame spread. Both
> variants reverted.** Sum of frames over 50 ms across the six work phases, WebKit,
> production build, two runs each: baseline (hints always on) **23 / 22**, hints
> state-gated in JS **22 / 19**, hints removed entirely **18 / 19**. Median 17 ms and
> p95 18 ms in every configuration, and the worst single frame is *worse* in every
> variant (165 / 192 ms) than baseline (132–146 ms). The counts overlap inside a
> ±1–3 run-to-run band, so there is no improvement to claim.
>
> Note also that the state-gated variant **cannot** improve these phases by
> construction: during an open/close the tunnel is moving and the layers are wanted.
> Its only real target is idle layer memory — a WebKit/iOS memory question that
> nothing available here can measure (`performance.memory` is Chromium-only). If this
> is picked up again, pick a memory criterion. Details and the partial-teardown bug
> found while trying it are in `PERF-NOTES.md` → "Tried and reverted".

**Confidence: high** that the count is real (measured in three engines). ~~**Medium**
that removing it fixes the WebKit frame spread — it is the strongest single lead, but
I could not profile WebKit's compositor directly.~~ **Measured: it does not.**

---

## 2. Card layout box is 52% larger in WebKit than in Chromium and Firefox

> **CORRECTED 2026-07-27, and FIXED in `632d595`.** The cause stated below was
> wrong, and the mobile explanation was incomplete. The measurements were real but
> compared two different *states*, not two engines. Read the correction first —
> the original text is kept only so the wrong premise is not re-derived.

**Evidence.** `.a__card` untransformed layout box at 1440×900:

| Engine | Desktop | Mobile 390×844 |
|---|---|---|
| Chromium | **288 × 180** | 208 × 130 |
| Firefox | **288 × 180** | 208 × 130 |
| WebKit | **438 × 273** | 208 × 130 |

Measured with `offsetWidth`/`offsetHeight`, not `getBoundingClientRect`, specifically
so the card's own transform does not pollute the number.

**Cause — as originally stated (wrong).** ~~`.a__card` has `width: auto` inside an
absolutely positioned `a-work`, so its width is shrink-to-fit over intrinsic
content — dominated by `.a__card__title` at `clamp(1.25rem, 3.5vw, 2.5rem)`.
`aspect-ratio: 16/10` then derives the height. Engines legitimately differ on
max-content width for that text, and only `min-width`/`min-height` are pinned. On
mobile every engine agrees because `min-height: 130px` binds and removes the
freedom.~~

**Cause — corrected.** No engine is following a different rule here. All three
resolve the box the same way: shrink-to-fit over the title's max-content, height
derived by `aspect-ratio`, floored by the minimum **transferred** from
`min-height: 180px` through the ratio (180 × 16/10 = **288 × 180**).

The 288-vs-438 gap is `content-visibility`, not layout spec. `a-work` carries
`content-visibility: hidden` until `.is-inview`, and `content-visibility: hidden`
**implies size containment** (CSS Contain): the element sizes as if it had no
contents, so `a-work` collapses to its own padding and the card inside it lands on
that transferred minimum. WebKit never saw that state — `html.is-safari a-work`
sets `content-visibility: visible` unconditionally (the Safari card-hiding branch
in `AWork.astro`), so its cards were always laid out from real content. The audit
therefore measured a size-contained Chromium/Firefox card against an uncontained
WebKit one.

Proof, same build, same card ("Engineering Rocket", 1440×900): forcing
`content-visibility: visible` moves **Chromium 288×180 → 477×298** and **Firefox
288×180 → 493×308**, against WebKit's 497×311. The residual three-engine spread is
~4%, i.e. font metrics, not a sizing disagreement.

Two consequences the original diagnosis missed:

- In Chromium and Firefox the card **changed size on reveal** (288×180 → 477×298) —
  a relayout of every card as it scrolls in, on every engine that honours the
  containment.
- Mobile agreeing in all three engines is *not* only `min-height: 130px` binding.
  It is that at 390 px the title's max-content (~160 px at the clamped 20 px font)
  is narrower than the 208 px transferred minimum, so the content never wins —
  which is why mobile also never showed the reveal-time jump.

**Symptom.** Safari users see visibly larger project cards with different overlap
against the letter tunnel — a design deviation, not just a perf issue. Bigger cards
also mean more composited pixels, feeding finding 1.

**Fix, applied in `632d595`.** Explicit `width: clamp(288px, 30vw, 440px)` on
`.a__card` with `aspect-ratio` retained, and the phone box pinned to the 208 px it
already resolved to. The clamp floor is the old transferred minimum, so
`min-width`/`min-height` stay inert and 16/10 stays exact. Result: **432 × 270 in
Chromium, Firefox and WebKit, in both the contained and revealed state**; mobile
unchanged at 208 × 130. The dive's FLIP start rect follows the card box
(`.dive__camera` is sized from `offsetWidth`/`offsetHeight`) and was re-verified in
all three engines.

**Confidence: high** on the measurements. The *cause* was restated after direct
testing — the lesson worth keeping is that `content-visibility` silently changes
what a layout measurement means, so any cross-engine box comparison must first
force it visible.

---

## 3. Work section shifts during fast resize; pin geometry is stale for 400 ms+ (your item 4)

**Your suspicion was right, and the mechanism is measurable.**

**Evidence.** Twelve viewport steps in ~600 ms while parked inside Work:

- `--height` reads `9000px` for **all twelve samples** and only becomes `6580px`
  *after* the drag ends.
- The `.s__title` viewport top drifts smoothly 68 → 170 during the drag, then
  **snaps to 50** once the debounce fires: a **120–121 px jump**, in all three engines.

**Cause.** A two-stage debounce chain: `SiteController.resizeThrottle` waits 200 ms,
then `WorkSection.onResize` waits another 200 ms, and only then runs
`setSize` → `setMask` → `setPoints` → `setLetters` → `setWorks` → `setTimeline` →
`ScrollTrigger.refresh()`. For at least 400 ms the pin, the timeline bounds and the
section height all describe a viewport that no longer exists.

**Engine divergence.** Chromium and Firefox scroll-anchor during the drag
(scrollY 7991 → 6661, −1330 px). **WebKit does not** — scrollY stays at 7991 for
every sample. So the size *and direction* of the final snap differ per browser.

**Proposed fix.** Split cheap from expensive. `ScrollTrigger.refresh()` is
comparatively cheap and can run rAF-throttled during the drag; the expensive rebuild
(`setLetters` recreates 108 elements, `setTimeline` rebuilds the whole timeline)
should stay deferred to drag end. Alternatively hold `--height` constant while a
drag is active so the document height stops moving under the scroll position.

**Confidence: high** on cause and measurement. **Medium** on the fix — refresh cost
during a drag needs its own measurement before adopting.

---

## 4. `100lvh` on the pinned Work container is the wrong unit for iOS Safari

> **APPLIED — and ⚠️ UNVERIFIED ON REAL iOS.** `.s__inner` is now `100vh` →
> `100svh`, and `.s__title/.s__scene`'s `25lvh` moved to `25svh` with it. Desktop
> is proven unchanged (below); **the iOS behaviour this is meant to fix has not
> been observed before or after, on any device.** It is a reasoned unit choice,
> not a confirmed fix. Do not close this finding until someone has scrolled the
> Work section on a real iPhone with the toolbar visible.

**Evidence.** `SWork.astro:161-162`:

```scss
height: 100vh;
height: 100lvh;   /* overrides the line above */
```

`lvh` is the **largest** viewport height — the size with browser chrome *retracted*.
On iOS Safari with the toolbar visible, `100lvh` is therefore **taller than the
visible viewport**, so the pinned container overflows the screen.

`HeroHome.astro:60-61` does the opposite and is correct:

```scss
min-height: 100vh;
min-height: 100svh;   /* small viewport = safe */
```

**Symptom.** On iPhone, the pinned Work container is taller than the visible area;
the ruler/title sit lower than intended and the bottom is clipped until the toolbar
collapses. Consistent with a report of "not smooth" if it also causes a jump when the
toolbar hides.

**Proposed fix.** Use `100svh` for the pinned container to match the hero, or extend
the existing px approach — `WorkSection.setSize()` already computes `--height` in px
from `safeHeight` precisely to avoid this class of bug, with the comment "Use px
instead of vh/lvh to avoid iOS address-bar resize jitter." The container height was
simply not converted along with it.

**Confidence: medium-high on the analysis, unverified in practice.** Desktop has no
dynamic toolbar: my probe returned `vh = svh = lvh = dvh = 900` in all three engines,
so **this cannot be reproduced anywhere I can run.** Needs your real-device check.

**Why `svh` and not `dvh` or a px value.** A pinned container has two requirements:
it must never exceed the visible viewport (or its bottom is clipped), and it must
not change size while scrolling (or the pin resizes mid-scroll and ScrollTrigger's
cached geometry goes stale — the same class of bug as finding 3). `lvh`/`vh` fail
the first on iOS while the toolbar is showing. `dvh`, and equally a px height driven
from `innerHeight`, fail the second because they track the toolbar animation. `svh`
is the only unit that satisfies both; the cost is a strip of unused space once the
toolbar retracts, which is the same trade `HeroHome` already accepts.

**Desktop no-op check, three engines, 1440×900, before vs after — all identical:**
pinned box `1440×900`, `position: fixed` with a `.pin-spacer` present, title
computed font-size `225px`, `--height: 9000px`, document height `15891`, pinned box
fills the viewport exactly. So the change is provably inert where it can be
measured, which is the most that can be claimed for it.

Left alone deliberately: `.s__ruler`'s `10vh`/`80vh` (a `pointer-events: none`
element with no paint whose real geometry the mask recomputes in px from
`safeHeight`), and `.s-work { --height: 100vh }` (a pre-JS fallback that
`setSize()` overwrites in px during init).

Full viewport-unit inventory (layout-affecting only):

| Location | Unit | Correct? |
|---|---|---|
| `HeroHome.astro:60-61` | `100vh` → `100svh` | ✅ correct pattern |
| `SWork.astro:161-162` | `100vh` → `100lvh` | ❌ should be `svh` |
| `SWork.astro:172,176` | `top: 10vh`, `height: 80vh` (ruler) | ⚠️ inherits the same risk |
| `SWork.astro:191-192` | `min(18.75rem, 25vh/25lvh)` font-size | ⚠️ text resize on toolbar change |
| `RocketStorySection.astro:13,19` | `height: 400vh` / `300vh` | ⚠️ see finding 5 |
| `RocketBackground.astro:22-23` | fixed layer `100vw`/`100vh` | ⚠️ overflows visible area on iOS |
| `TextSlidesOverlay.astro:95-96` | fixed overlay `100vw`/`100vh` | ⚠️ same |
| `ContactSection.astro:28,32` | `min-height:100vh`, `grid-template-rows:100vh` | ⚠️ same |
| `WhyWorkWithMe.astro:70`, `ProjectLayout.astro:233` | `min-height: 100vh` | ⚠️ low risk (min-height) |

---

## 5. Rocket spacer is sized in `vh` but its progress is divided by `innerHeight`

**Evidence.** `RocketStorySection.astro:13` sets the spacer to `400vh` (CSS `vh`,
which on iOS is the *stable large* viewport). The progress math at line ~65 uses
`window.innerHeight`, which **does** change as the toolbar collapses:

```js
rawProgress = (windowHeight - (sectionTop - scrollY)) / (sectionHeight + windowHeight);
```

**Symptom.** On iOS, showing or hiding the toolbar changes the denominator but not
the spacer, so rocket-frame progress jumps — the sequence skips or stalls mid-scroll.

**Proposed fix.** Use the cached `window.safeHeight` that `SiteController` already
maintains for exactly this reason, or size the spacer in px from the same value.

**Confidence: medium-high on analysis, unverified** — same reason as finding 4.

---

## 6. No `normalizeScroll`, no `pinType`, no `overscroll-behavior`

**Evidence.** Zero occurrences of `normalizeScroll`, `pinType`, `scroller`,
`scrollerProxy`, `ScrollSmoother` or `overscroll-behavior` anywhere in `src/`. The
pin config is:

```js
ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom",
                       pin: container, pinSpacing: false, anticipatePin: 1 });
```

Runtime probe while pinned (scrolled 2000 px in): the pinned `.js-container` computes
to `position: fixed` with an identity transform, and a `.pin-spacer` exists — i.e.
GSAP chose **pinType "fixed"** in all three engines.

**Why it matters on Safari.** `pinType: "fixed"` plus a collapsing iOS address bar is
the classic source of pin jitter, because the fixed element is positioned against a
viewport that is itself animating. GSAP ships `ScrollTrigger.normalizeScroll(true)`
specifically to take over iOS scrolling and stop this. `anticipatePin: 1` is already
set, which is the right instinct, but it only helps pin *entry*.

**Proposed fix (needs real-device testing before adopting).** Try
`ScrollTrigger.normalizeScroll(true)` on touch devices, and/or force
`pinType: "transform"` there. Both change scrolling globally, so neither should be
merged on desktop-only evidence.

**Confidence: medium.** The configuration facts are verified; the Safari consequence
is a well-known GSAP issue I cannot reproduce without a real device.

> **`pinType: "transform"` APPLIED 2026-07-29 in `32a1a05` — and it turned out
> to be the whole WebKit Work stutter, on the desktop viewport, with nothing to
> do with iOS.** The `normalizeScroll` half of this finding is untouched and
> still needs a real device; only the pinType half is resolved.
>
> How it was found. WebKit has no long-task API, no CDP and no tracing in
> Playwright, so each frame was split into the part JS owns and the part the
> engine owns by timing every rAF callback against that frame's own rAF delta
> (`perf-results/frame-anatomy.mjs`). Across four 7200 px scroll phases, driven
> twice — once by Playwright's synthetic wheel, once by an in-page `scrollBy`
> loop, which rules out the input protocol — **every frame over 40 ms landed at
> one of exactly two scroll offsets: +0.00vh (pin engage) and +6.02vh (pin
> release, `workTop + workH - vh`)**, and each carried 0–2 ms of JS with zero
> style writes, zero canvas calls, zero attribute callbacks and zero class
> toggles. App JS is 1.4 ms/frame throughout. The engine was rebuilding the
> layer tree for the pinned subtree on each flip in and out of `position:
> fixed`; under `.is-safari` that subtree holds the 54-ghost tunnel plus five
> cards that `content-visibility: visible` keeps permanently live.
>
> Result, WebKit, work open/close x3, floor 14–16 ms stable: steady-state worst
> frame **133–186 ms → 56–84 ms**, p95 25–26 → 19–24, frames over 50 ms 3–6 → 1–4
> per phase. Counting all four anatomy phases together, over 50 ms **6 → 1** and
> the survivors no longer sit at the pin boundaries. Chromium did not regress —
> it improved: floor 8.6 ms, Work worst 17.7 ms, dive worst 10.6 ms (the 55.7 ms
> dive miss recorded in PERF-NOTES is gone), 0 long tasks, heap flat,
> listeners 63→63.
>
> Safe here specifically because **nothing `position: fixed` lives inside
> `.js-container`** — already probed in all three engines, see "Checked and
> clean" below. A transform pin would otherwise become their containing block.

---

## 7. Firefox warns that the site uses scroll-linked positioning

**Evidence.** Present in **every** Firefox run, desktop and mobile:

> "This site appears to use a scroll-linked positioning effect. This may not work
> well with asynchronous panning."

**Symptom.** During fast flings, scroll-driven transforms can lag Firefox's
compositor because APZ runs panning off the main thread while the effect is computed
on it. Firefox's measured frames were otherwise good (worst 40 ms, 0 over 50 ms in
the repeat run), so this is a warning about worst-case fling behaviour rather than a
reproduced defect.

**Proposed fix.** None cheap. This is inherent to scrub-driven ScrollTrigger work.
Worth knowing before you chase a Firefox report.

**Confidence: high** that it is emitted; **low** on user-visible severity — I could
not reproduce a bad fling synthetically.

---

## 8. Animated `blur()` every frame in `MorphingText`

> **MEASURED AND FIXED 2026-07-29 in `28e1115`, and the diagnosis below was
> pointing at the wrong half.** The blur is not what makes Safari look wrong —
> the *missing threshold* is. `feColorMatrix` alpha `255 -140` is what restores
> full opacity after the per-frame `blur()` spreads the ink, so
> `filter: none` removed the contrast along with the gooey merge. Captured at a
> matched morph fraction in all three engines (the `Date` constructor stubbed to
> a virtual clock, so the comparison is at identical blur/opacity rather than
> merely the same instant), peak luminance of the title band at fraction 0.5:
> **Chromium 247, Firefox 246, WebKit 162** — the title washed out to a dim grey
> smear for the whole 1.5 s morph and only snapped back at rest. Screenshots in
> `perf-results/p1/`.
>
> Fix: Safari keeps `url(#threshold)` and drops only the second `blur(0.6px)`
> pass. Peak luminance returns to 248. Cost, hero parked 8 s x2 in Playwright
> WebKit via the new `perf/hero-bench.mjs`, frames over 25 ms: **no filter 0/1,
> `url(#threshold)` 1/3, `url(#threshold) blur(0.6px)` 4/4** — median 17 ms,
> p95 19 ms, zero frames over 50 ms and zero long tasks in every variant. One
> filter pass instead of two is strictly cheaper than the chain the original
> "severe GPU lag" note was written about. `MAX_BLUR` stays 8 under Safari: with
> the threshold back it is visually near-irrelevant (both layers are already at
> 8 px at fraction 0.5, and past that the over-blurred layer falls below the
> threshold and disappears either way).
>
> **Confirmed in Playwright WebKit 26.5. NOT verified on real Safari.**

**Evidence.** `MorphingText.astro:75,78` write `style.filter = blur(Npx)` per frame.
Already mitigated for Safari: `MAX_BLUR` is 8 there vs 20 elsewhere, the SVG
`url(#threshold)` filter is disabled under `.is-safari`, and it renders every second
frame. Since the off-screen pause fix it also stops entirely when the hero leaves the
viewport.

**Symptom.** While the hero *is* on screen, Safari still animates a real blur filter
on two text layers — historically one of the most expensive things you can animate in
WebKit.

**Proposed fix.** If the hero proves to be a Safari problem, replace the blur morph
with an opacity/scale cross-fade under `.is-safari`, or pre-render the morph. Do not
touch it before measuring the hero specifically — the current numbers do not
implicate it.

**Confidence: high** that animated blur is expensive in WebKit; **low** that it is
part of *your* complaint, since your report was about the Work interaction.

---

## 9. `backdrop-filter` ships unprefixed, and browserslist targets only the newest Safari

**Evidence.** Two source occurrences (`ProjectLayout.astro:192` `blur(12px)` and
`projects/ams/index.astro:627` `blur(14px)`, both on `position: fixed` navs). Built
output contains **0** `-webkit-backdrop-filter` and 2 unprefixed. Autoprefixer *is*
running — it added `-webkit-appearance` ×4 and `-webkit-user-select` ×1 that appear
nowhere in source. There is **no browserslist config**, so it defaults to a very
narrow modern set: `safari 26.2/26.3`, `ios_saf 18.5-18.7, 26.x`.

**Symptom.** On Safari 17 and older — still common on iPhones and Macs that cannot
update — the prefix is required, so the blur silently does nothing and the fixed nav
renders flat. Separately, `backdrop-filter` on a fixed element is a per-scroll repaint
cost in Safari, on both project pages.

**Proposed fix.** Add an explicit browserslist (e.g. `safari >= 15`,
`ios_saf >= 15`) so autoprefixer emits `-webkit-backdrop-filter`, and decide
deliberately how far back you support.

**Confidence: high** on the facts; **medium** on user impact, since it depends
entirely on how much old-Safari traffic you have.

---

## 10. Font preload warnings in WebKit and Firefox but not Chromium

**Evidence.** WebKit logs 5, Firefox 1–2, Chromium 0:

> "The resource .../PPEditorialNew-Regular.woff2 was preloaded using link preload but
> not used within a few seconds from the window's load event."

All five fonts are `<link rel="preload">`ed in `index.astro:32-36` but referenced from
`@font-face` CSS that resolves later; engines disagree on when a preload counts as
"used".

**Symptom.** Console noise, and possibly wasted network priority at load. Not a
frame-rate issue. Worth fixing only because CLAUDE.md's budget is 0 console
warnings — a budget currently met in Chromium but **not** in WebKit or Firefox.

**Confidence: high.**

---

# Checked and clean — do not re-investigate

Recorded so this ground is not covered twice:

- **No `position: fixed` or `sticky` is trapped inside a transformed ancestor.** Probed
  at runtime in all three engines by walking every ancestor of every fixed/sticky
  element for `transform`, `perspective`, `filter`, `backdrop-filter`,
  `will-change`, `contain`. The three fixed elements (`.nav-overlay`, `.rocket-bg`,
  `.text-overlay`) all report "no trapping ancestor". This matters because the
  ScrollTrigger pin *does* transform `.js-container` — nothing fixed lives inside it.
- **3D contexts do not nest problematically.** Exactly one `perspective` context
  (`.s__scene`, 640px, `transform-style: flat`) and 20 `preserve-3d` cards nested one
  level inside it. **No perspective inside a perspective.** Same in all three engines.
- **Scroll listeners are passive.** Every `scroll`/`resize` listener passes
  `{ passive: true }` (verified with context, not line-grep). There are **no `wheel`
  or `touchmove` listeners at all**, so nothing blocks the compositor.
  *Amended 2026-07-29:* no longer strictly true — `DiveTransition.lockScroll()`
  adds non-passive `wheel` and `touchmove` listeners for the duration of a dive
  and removes them in `unlockScroll()`. Measured harmless in WebKit: adding and
  removing them by hand, and holding a dive open, left the rAF cadence at
  15–16 ms in every stage (`perf-results/dive-after-probe.mjs`).
- **The Safari card-hiding branch works.** `html.is-safari a-work { opacity:0;
  visibility:hidden }` correctly reveals via `.is-inview`: mid-section WebKit shows
  2 in-view / 2 painted / 54 ghosts visible — identical to Chromium — and the
  screenshot matches. The `.is-safari` class *is* active under Playwright WebKit, so
  all four Safari code paths were exercised.
- **Feature support probed, not assumed** — supported in all three engines:
  `content-visibility`, `aspect-ratio`, `clip-path: inset()`, `dvh`/`svh`/`lvh`,
  `transform-style: preserve-3d`, `backdrop-filter` (unprefixed), View Transitions API.
- **Not present anywhere:** `-webkit-overflow-scrolling` (except one instance on the
  AMS gallery), `overscroll-behavior`, `touch-action`. `scroll-behavior: smooth` is
  set on the two project pages only.

---

# Suggested order of work

1. **Finding 1** (`will-change` on 136 elements) — cheapest change with the best
   chance of moving the WebKit numbers. Measure before and after with the harness.
2. **Finding 2** (card width) — small, deterministic, fixes a visible Safari design
   deviation.
3. **Finding 3** (resize refresh) — affects every browser, and you already noticed it.
4. **Findings 4, 5, 6** — the iOS Safari group. All three need a real device; treat
   them as one batch and test them together on hardware.
5. **Findings 9, 10** — hygiene; do them when convenient.

Nothing here has been applied. When you test real Safari, findings 4, 5 and 6 are the
ones where your observation beats anything I can produce.
