# CLAUDE.md

Read this before doing anything in this repository.

## What this project is

A personal portfolio site built with **Astro**, animation-heavy. Two homes ship:

- `/` is the **anime home** (white ground, near-black ink, one red accent):
  `AnimeIntro` (~1 s opening cover), `AnimeHero` (the name on an SVG arc over a
  CSS 3D wheel of project-page shots, turned by GSAP's ticker), `AnimeRocket`
  (an SVG rocket riding a dashed path on ScrollTrigger, whose flame wipes into)
  `AnimeSpace` (star field), `AnimeWork` (one panel per project),
  `AnimeTimeline` (pinned-note board), `ContactSection`. Lenis smooth scroll,
  off on touch and under reduced motion.
- `/tunnel/` is the previous home, kept until the owner decides its fate: a
  Three.js hero background, a scroll-driven 240-frame JPG sequence, and a
  pinned "Work" letter tunnel that expands and rotates to reveal project cards.
  Most invariants below were found on this page.

Stack: Astro components (`.astro`) + TypeScript controllers, **Three.js**
(`DottedSurface`, `/tunnel/` only), **GSAP + ScrollTrigger**, **Lenis**.
Deployed on Vercel from `main`, which does not have the anime home yet.

The animation systems were built separately and later composed onto the same page.
That composition is where every performance bug in this project has come from, and
it is why the invariants below exist.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on **:4321**. `astro.config.mjs` sets `server.host: true`, so it also binds to the LAN address |
| `npm start` | Identical to `npm run dev` — same server, same port |
| `npm run build` | Production build into `dist/`. Astro reports **9 pages** (`/`, `/tunnel/`, `/projects/ams/`, six `/work/*`); `dist/` ends up with 10 `.html` files because the empty `public/nasa-nns.html` is copied verbatim |
| `npm run preview` | Serves the built `dist/` on **:4321** |
| `npm test` | Nine Playwright suites (`tests/run.mjs`, see `tests/README.md`) against a served production build at `SITE` (default `http://127.0.0.1:4347`). Needs `PLAYWRIGHT_HOME` pointing at a `node_modules` with chromium, webkit and firefox; on this host that is `/home/ubuntu/work/landing-page/repo/node_modules` (the built-in default path does not exist here) |
| `npm run astro` | Astro CLI passthrough (e.g. `npm run astro -- --version`). With no arguments it prints CLI help |
| `npm run perf:harness` | Frame timing, long tasks, forced reflows, heap/listener deltas. Add `-- --cpu=4`, `-- --mobile`, `-- --trace`, `-- --label=<name>`, `-- --dive-only`, `-- --browser=chromium\|firefox\|webkit` |
| `npm run perf:regression` | Functional sweep: routes, open/close/reopen, resize teardown, keyboard focus, reduced motion, first-load LCP/TBT |
| `npm run perf:analyze` | Classifies a captured trace into gc/layout/style/paint/decode/script. Usage: `-- <trace.json> [thresholdMs]` |

The three `perf:*` scripts measure a **running production preview on :4322**, so start
one first: `npm run build && npm run preview -- --port 4322`. Traces are ~300 MB —
delete them when done. Results land in `perf-results/` (gitignored).

Verified behaviours — do not re-test these, they are confirmed:

- **`preview` requires a build first.** Without `dist/` it exits 1 with
  `The output directory ... does not exist. Did you run 'astro build'?`
- **`--` is mandatory** for passthrough args and port overrides:
  `npm run dev -- --port 4399`, `npm run preview -- --port 4399`.
- `dev`, `start`, and `preview` all default to **:4321** and will collide. Use an
  explicit port when running two at once.

Environment note: the repository now lives on the Linux VPS (`vps-worker`,
4 cores, 7.6 GB, no GPU), not on the Mac. Run every build, test suite and
headless browser through `heavy` (`heavy npm run build`, `heavy npm test`):
it serialises heavy jobs, and two at once make the host swap.

---

## Performance invariants

Every rule below is here because it was a real bug in this repository, found by
profiling, not by theory. Breaking one of them will not fail a build or a test —
it will silently cost frames. Treat them as hard constraints.

### 1. Nothing animates while it cannot be seen

Every `requestAnimationFrame` loop must pause when its element is off-screen
(`IntersectionObserver`) and when the tab is hidden (`visibilitychange`).

*Was broken by:* `MorphingText` (animated `blur()`) and `DottedSurface` (full-viewport
Three.js render, 2,400 vertices) ran forever, including while the user was scrolled
far past the hero. Pausing them alone took p95 from 27 ms to 14.3 ms.

### 2. Never write per-frame CSS custom properties on an ancestor

Custom properties **inherit**, so setting one on a container invalidates the style
of the entire subtree beneath it — the browser cannot know which descendants read
it. Write per-frame values on the **leaf element that actually consumes them**, or
compute them in JS and write a concrete value.

*Was broken by:* `--scroll-progress` and `--state` mutated each frame on Work's
ancestor containers, invalidating ~1,600 nodes per frame and producing 44–89 ms
style-recalc tasks. This was the single most expensive bug in the project, and it
looked completely reasonable in the source.

### 3. Read geometry first, write styles after — never interleave

Batch all `getBoundingClientRect()` / `offsetTop` / `offsetWidth` reads at the start
of the frame, then do all writes. A read after a write forces a synchronous layout.
Cache geometry that does not change between resizes.

*Was broken by:* rect reads landing after GSAP's writes in both `WorkSection.tick()`
and the rocket scroll driver — one forced reflow on every frame, every frame.

### 4. Whatever a component creates, it destroys

On unmount, route change, and re-init: `removeEventListener`,
`cancelAnimationFrame`, `ScrollTrigger.kill()`, `timeline.kill()`,
`observer.disconnect()`, and Three.js `geometry/material/texture/renderer.dispose()`.
If a class exposes `destroy()`, something must call it.

*Was broken by:* `MorphingText.destroy()` was never called; an un-killed timeline
ScrollTrigger and duplicate card click listeners from pin re-parenting leaked
**+160 listeners per resize** (189 at load, now 89 with +0 per resize).

### 5. Scroll handlers do the minimum, and nothing when off-screen

Passive listeners. Cache `querySelector` results — never query page-wide per frame.
Early-exit when the section is not visible. Never rewrite a style with the same
constant value it already has.

*Was broken by:* the rocket driver ran `querySelector(".s-work")` plus two
`getBoundingClientRect()` calls on every scroll frame, and kept rewriting rocket and
slide transforms with unchanged values even while Work was on screen.

### 6. Prefer one master rAF loop

GSAP's ticker is the master clock here. New animation work should subscribe to it
rather than starting an independent loop. Independent loops compete for the same
frame budget and interleave unpredictably.

### 7. A promoted layer is rastered once, at layout size, then GPU-scaled

Anything inside a `will-change` / animating-transform layer is rastered at its
**layout** size and the transform is applied to that bitmap. Scaling such a layer
**up** enlarges pixels — an image scaled up 5× is visibly mush for the whole
animation and snaps sharp the moment `will-change` comes off. Lay the element out at
the size it occupies at the **end** of the animation and statically scale it *down*
to the start, so accumulated scale approaches 1.0 from below and only ever
downsamples. Layout × static-scale is unchanged, so the composition does not move.

*Was broken by:* the dive's image plane, laid out card-sized and scaled up 5–7×.

### 8. Assigning `canvas.width` or `.height` resets the whole 2D context

Not only the bitmap — `strokeStyle`, `fillStyle`, transform, clip, all back to
defaults. Re-apply cached context state **synchronously, in the same function that
resized the canvas**; a deferred re-apply leaves a window where draws land with
default state. This is unforgiving when the draw loop early-exits on unchanged
progress, because the bad frame is then never repainted.

*Was broken by:* `WorkSection.setSize()` resizing the canvas while `setCtxStyle()`
restored the stroke colour a tick later — the point grid rendered black-on-black and
stayed that way at a resting scroll position.

### 9. `content-visibility: hidden` implies size containment — it distorts measurement

A size-contained element sizes as if it had no contents, which changes the used size
of its descendants. Any layout measurement (especially cross-engine box comparisons)
must **force `content-visibility: visible` first**, or it compares a contained box in
one engine against an uncontained one in another and reads the difference as an
engine bug. For the same reason, do not let a component's layout depend on
shrink-to-fit content when it is under a `content-visibility` toggle: give it an
explicit size.

*Was broken by:* the audit's finding 2 — a 288×180 vs 438×273 card box read as an
engine spec disagreement, when both engines agreed and only the containment state
differed. The real engine spread was ~4%, from font metrics.

---

## Performance budgets

Measure the **production build** (`npm run build && npm run preview`), never the dev
server — HMR and un-minified code make dev numbers meaningless.

| Metric | Budget |
|---|---|
| median frame time | ≤ 16.7 ms |
| p95 frame time | ≤ 25 ms |
| worst single frame | ≤ 50 ms |
| long tasks (> 50 ms) | 0 |
| heap after 3 interaction cycles | flat |
| listeners added per resize | 0 |
| console errors / warnings | 0 |

Always measure with **4× CPU throttling** and at a **390 × 844** viewport as well as
desktop. **Read the idle median as the machine's refresh floor before judging any
number against a budget:** runs here have read 13.3 ms (75 Hz) and, since
2026-07-27, 8.3 ms (120 Hz) in Chromium. A clean frame is whatever that floor is —
do not misreport it as a missed budget, and do not compare runs taken at different
floors. Budgets stay at 60 fps because that is what most visitors have.
Those floors were read on the Mac. The Linux host rasterises in software, so
read its floor fresh and never compare its numbers with a Mac run.

Cross-engine runs (`--browser=webkit|firefox`) report **frame timing only** — no CDP,
so no heap, listener, node or long-task numbers, no CPU throttling, no `--mobile`.
They also idle at ~17 ms, not 13.3: those engines run headless at 60 Hz, so compare
WebKit against WebKit, never against a Chromium column. **Playwright WebKit is not
Safari** — same lineage, different JIT, media stack and process model. Treat it as a
strong hint, never as proof, and say which one was measured.

The measurement harness lives in `perf/` (`harness.mjs`, `regression.mjs`,
`analyze-trace.mjs`). Reuse it instead of writing a new one.

---

## Working rules

- **One change per commit**, and a perf commit's message carries its before/after
  numbers.
- **Never mix** a behaviour change with formatting, renaming, or dead-code removal.
- **Formatting means formatting** — whitespace and layout only. No logic edits, no
  renamed variables, ever, even when the rename looks obviously better.
- **No perf claim without a measurement.** "This should be smoother" is not a
  result. If something could not be measured, say so plainly.
- **Reproduce inherited measurements before acting on them.** A number copied from a
  prior report is a hypothesis, not evidence, until its method, scope and result are
  re-derived. Precedent: the reported ~243 MB rocket RSS was a sum across Chrome
  renderer processes, not the page's memory, and it drove an unnecessary video branch.
- **Never fix performance by removing the feature.** If a feature genuinely cannot
  meet budget, present the trade-off instead of quietly reducing it.
- Delete only what a tool (`knip`, `ts-prune`, `depcheck`) or a reference trace
  proves unused. Anything ambiguous gets listed for the owner to decide.
- Work on a branch. No `--force`, no direct commits to `main`, unless asked.
- Verify visually before declaring done — automated frame numbers do not catch a
  changed appearance.

---

## Known state / gotchas

- `dist/` and `.astro/` are **no longer tracked** (untracked via
  `git rm -r --cached`; their `.gitignore` rules never applied while the files were
  already in the index). Builds no longer dirty `git status`. Do not re-add them —
  if `git status` shows build output again, something re-added it.
- `public/1/` retains the original 240 JPGs (1918×766); `/public/1/960/` is the active
  960-px set. The ~243 MB rocket-RSS concern was a measurement artifact: it summed
  Chrome renderer processes. Full removal measured no desktop steady-state share and
  ~22.6 MB page-renderer / ~9.3 MB shared-GPU share on the mobile ×4 proxy. The 960
  switch is kept for 34% less transfer, **not** for a demonstrated real-page RSS win;
  see `docs/preload-weight-findings.md`.
- An intermittent browser-level slow scroll at page top during idle has been
  observed with no JS caller. The harness detects and excludes it. Do not chase it
  without new evidence.
- **`will-change` reduction on the letter tunnel is measured and rejected.** Both
  variants (state-gated hints, and no hints at all) leave the WebKit frame spread
  where it was — median/p95 identical, >50 ms counts inside the run-to-run band, and
  the worst frame slightly worse. Do not re-propose it as a frame-rate fix. It is
  still open as an idle *layer-memory* question, which needs a memory criterion and a
  tool that can measure WebKit memory — nothing here can.
- Cross-browser findings, and which ones are still unverified on real hardware, live
  in `docs/cross-browser-audit.md`. Findings 4, 5 and 6 need a real iPhone; finding 4
  has a fix applied but **unverified on iOS**.
- Running notes and rejected hypotheses live in `PERF-NOTES.md`. Read it before
  re-proposing something that was already tried.
- **The anime home has never been measured against the budgets above.**
  `perf/harness.mjs` waits for the tunnel's `is-works-ready` class and `.s-work`
  section, so it measures `/tunnel/` only; adapt it before judging `/`.
- The hero wheel shows `public/shots/*.webp`, pictures of each project page's
  first screen. Re-run `scripts/shots.mjs` after changing a project page's
  first screen, or the wheel shows the old page.
- **Prizes are settled against the official pages** (2026-09-29): TouchPoint
  placed 2nd overall of 71 teams at QuackHacks 3 and did not win the Google
  track; SPOOT placed 3rd in Google's Best Use of Gemini at BeaverHacks 2026
  (May 2-3, 2026). `/resume.pdf` links the combined resume variant (built
  2026-09-29, commit 33efd95, awaiting owner approval), which uses these
  official placements. All four resume variants and the LinkedIn drafts in
  `~/work/school/out/career` use the same official wording (checked with
  pdftotext on 2026-09-29).
- Branch history: `night/restore-2026-09-30` is `feat/anime` (425f3e0,
  recovered from the Mac archive, never pushed) plus content commits. The
  restore report, the fixes report and the open owner questions are in
  `~/work/works-only/docs/night-2026-09-30/`; the owner's questionnaire is
  `docs/facts-to-confirm.md`.
