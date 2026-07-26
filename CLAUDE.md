# CLAUDE.md

Read this before doing anything in this repository.

## What this project is

A personal portfolio site built with **Astro**. It is animation-heavy: a Three.js
hero background, a scroll-driven 240-frame JPG sequence, and a pinned "Work"
section that expands and rotates to reveal project cards.

Stack: Astro components (`.astro`) + TypeScript controllers, **Three.js**
(`DottedSurface`), **GSAP + ScrollTrigger**. Deployed on Vercel.

The animation systems were built separately and later composed onto the same page.
That composition is where every performance bug in this project has come from, and
it is why the invariants below exist.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on **:4321**. `astro.config.mjs` sets `server.host: true`, so it also binds to the LAN address |
| `npm start` | Identical to `npm run dev` — same server, same port |
| `npm run build` | Production build into `dist/`. Astro reports **7 pages**; `dist/` ends up with 8 `.html` files because `public/nasa-nns.html` is copied verbatim |
| `npm run preview` | Serves the built `dist/` on **:4321** |
| `npm run astro` | Astro CLI passthrough (e.g. `npm run astro -- --version`). With no arguments it prints CLI help |
| `npm run perf:harness` | Frame timing, long tasks, forced reflows, heap/listener deltas. Add `-- --cpu=4`, `-- --mobile`, `-- --trace`, `-- --label=<name>` |
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

Environment note: this is **macOS**. `timeout` does not exist here — use a
background process and poll instead. A `timeout`-based test returns 127
(command not found) and proves nothing.

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
desktop. The development display is **75 Hz**, so a clean frame reads as 13.3 ms,
not 16.7 — do not misreport 13.3 as a missed budget. Budgets stay at 60 fps because
that is what most visitors have.

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
- **Never fix performance by removing the feature.** If a feature genuinely cannot
  meet budget, present the trade-off instead of quietly reducing it.
- Delete only what a tool (`knip`, `ts-prune`, `depcheck`) or a reference trace
  proves unused. Anything ambiguous gets listed for the owner to decide.
- Work on a branch. No `--force`, no direct commits to `main`, unless asked.
- Verify visually before declaring done — automated frame numbers do not catch a
  changed appearance.

---

## Known state / gotchas

- `dist/` is **no longer tracked** (untracked via `git rm -r --cached dist`; the
  `dist` rule in `.gitignore` now actually takes effect). Builds no longer dirty
  `git status`. Do not re-add it.
- `public/1/` holds 240 JPGs (~8.6 MB, 1918×766) eagerly preloaded at page load.
  Profiling showed this is **not** a source of frame jank, but it drives renderer
  RSS to ~243 MB, which risks tab eviction on mid-range phones. Tracked as separate
  work — do not conflate it with frame-rate problems.
- An intermittent browser-level slow scroll at page top during idle has been
  observed with no JS caller. The harness detects and excludes it. Do not chase it
  without new evidence.
- Running notes and rejected hypotheses live in `PERF-NOTES.md`. Read it before
  re-proposing something that was already tried.
