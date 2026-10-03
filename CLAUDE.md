# CLAUDE.md

Read this before doing anything in this repository.

## What this project is

A personal portfolio site built with **Astro**, animation-heavy. Two homes ship:

- `/` is the **anime home** (v5, branch `feat/portfolio-v5`, from v4). The sections:
  - `AnimeIntro`: the opening cover.
  - `AnimeHero`: the name and the two lines on a cylinder, projected at build
    time by `src/utils/cylinderText.ts`, behind a CSS 3D wheel of the seven
    case-page shots, each with a pre-blurred twin.
  - `AnimeRocket` wraps `WhyWorkWithMe`. A sticky stage flies the rocket beside
    the bento, then crashes it on the right into the wipe.
  - `AnimeSpace`: the star field, then the constellation (`Constellation.ts`,
    one canvas): the sparks and stars gather into a vertical W/O/R/K stack.
  - `AnimeWork`: the word rows (`WorkRows.ts`). The stack opens into four rows
    of letters with the seven projects of `src/data/projects.ts` as photographs
    in them; at each stop one preview grows out into a card. The stack's
    geometry has one source, `src/utils/workStack.ts`, shared with the canvas.
  - `AnimeParadise`: the timeline. A descent from space past the Earth and its
    horizon onto a meadow with a painted sky and grass the pointer presses down
    (`GrassField.ts`), then a walk along a trail.
  - `AnimeContact`: no resume link, by the owner's choice.
  - Lenis smooth scroll runs on the home only, off on touch and under reduced
    motion.
  - The seven case pages use `src/layouts/CaseLayout.astro` and
    `src/components/case/`. Each page has its own composition.
  - Case-page clips play in `CaseClip.astro` + `src/utils/player.ts` (seek,
    sound, full screen, a `playFrom` start point); controls and the case bar are
    liquid glass (`src/styles/helpers/_glass.scss`, refraction on Chromium only).
  - Design, decisions and progress: `docs/portfolio-v5-design.md` (v4's:
    `docs/portfolio-v4-design.md`).
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
| `npm run build` | Production build into `dist/`. Astro reports **11 pages** (`/`, `/tunnel/`, `/projects/ams/`, eight `/work/*` including the unlisted `private-clinic` and `portfolio-rocket`); `dist/` ends up with 12 `.html` files because the empty `public/nasa-nns.html` is copied verbatim |
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

### 10. Sample a path in arithmetic, never with `getPointAtLength` in a loop

`SVGPathElement.getPointAtLength` walks the path from its start on every call. On
a long multi-segment route it costs ~4 ms a call under `--cpu=4`. Build the curve
in JS (Catmull-Rom → cubic Béziers), walk a dense polyline once, and resample by
arc length. Write the `d` attribute only so the route can be inspected.

*Was broken by:* the v4 rocket route. ~2,700 calls per refresh made two 22 s long
tasks and a 34 s DOMContentLoaded on the phone profile; the arithmetic version
loads in under 1 s.

### 11. A 3D layer stack that is a screen away leaves the layer tree

Every promoted 3D layer stays in the page's layer tree while off screen, and the
tree is re-assigned on every frame anything else on the page writes. Take big
stacks out with `display: none` from an IntersectionObserver with a one-screen
margin (`is-far`). Keep keyboard-reachable content in the tree: hide the scenery,
not the links.

*Was broken by:* the hero wheel (28 layers) and the WORK letter rings (40). With
both in the tree, phone `--cpu=4` rocket-down showed 13-18 frames over 50 ms and
205-332 ms of long tasks. With both out: 1 frame and 0 ms.

### 12. No blurred `box-shadow` on a layer that turns in 3D

A drop shadow is part of the layer's raster. On seven turning carousel cards, a
60px blur was most of the WORK section's compositing cost on this host. Use a
hairline border or an inset highlight instead.

*Was broken by:* the first WORK carousel: 133-163 frames over 50 ms per work phase
on the desktop, 4-11 with a hairline.

### 13. A canvas redraws only on interaction, and on its own layer

A 2D canvas is rasterised when its frame commits, so a redraw costs commit time
on the main thread; inside another element's layer it also makes that whole
layer raster again. Give an animated canvas its own layer (`will-change:
transform`), and redraw it only while something it shows moves: a pointer, a
progress value. Never redraw it per scrolled frame for decoration.

*Was broken by:* the v5 grass (GrassField.ts), leaned by scroll speed and drawn
inside the meadow's layer: a phone at 4x CPU took 30-38 long tasks per descent
(0 with the canvas hidden). Own layer: 20. No scroll redraw: 0.

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
- **v5 numbers** (2026-10-03, chromium headless, software raster, `wheelScale` 2 / 1;
  base = v4 measured the same morning; frames over 50 ms, phone x4 two runs):
  - Phone x4: medians 16.7 everywhere but rocket (33.3), as in v4. Work phases
    0-3 (base 0-1); rocket-down 17-18 (base 16); rocket-up 10-14 (base 7);
    space-down 1-5 (base 0); paradise 1-4 (base 0; the descent is a screen longer).
  - Desktop: work phases 1-7 (base 5-14); hero-pointer 7 (base 17); paradise 7-8
    (base 2-7); grass-pointer 8 (new, median 33.4 like the other pointer phases).
  - Heap flat across cycles (2.5 MB phone, 2.8 MB desktop); 0 console errors.
  - Run-to-run spread on this host is wide: the same build's phone rocket-down
    read 5 at v4's close and 16 this morning. Compare ranges, never one run.
- **v4 numbers** (2026-10-02, chromium headless, software raster, no GPU,
  `wheelScale` 2 / 1; commit messages carry each block's before/after):
  - Desktop: idle-top 33.3 / 50 (was 50.0 / 66.7 before the backdrop-filter
    lenses went); rocket and space phases at medians of 16.7 with 0-2 frames over
    50 ms; work phases 16.7-33.2 / 50 with 4-11 frames over 50 ms; paradise
    16.7 / 33-50.
  - Phone cpu x4: every scroll phase at a median of 16.7, except rocket-down at
    33.3 with 1-4 frames over 50 ms.
  - Heap, listeners and nodes stay flat across cycles.
  - The idle-top and pointer medians alternate between two and three vsyncs on
    this rasteriser. The owner's Mac and iPhone give the verdict (F10, F11).
  - Earlier rounds' tables are in `docs/anime-direction-plan.md` and
    `docs/space-sequence-plan.md`. Those sections have since been replaced.
- **On this host the harness needs**
  `PERF_CHROMIUM=/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
  (there is no `chrome` channel) and `--url=http://100.122.188.86:4400/`. It
  measures `paradise-down` and `paradise-up` since v4. Its jump to that section
  retries, because a long jump while Lenis is still easing lands back where Lenis
  was going.
- **Several harness assumptions were Mac-only.** Fixed: it launched
  `channel: "chrome"` (still the default, so Mac baselines reproduce; pass
  `--chromium=`/`PERF_CHROMIUM` elsewhere) and forced headful (now headful on
  macOS, headless where there is no `DISPLAY`, `--headful`/`--headless` to
  override); it settled a wheel burst with a fixed 600 ms while Lenis eases for
  1.05 s, so phases ended mid-flight; it waited for the tunnel's 240-frame
  preload on a page that has no sequence, spending 120 s and recording a
  timeout that read like a page failure; and it assumed a wheel step moves the
  page by its own pixel count. **Still Mac-only and unfixed:** `perf/rss.mjs`
  matches macOS process names, so renderer RSS is not measured here at all (the
  result says so in its notes), and `perf/regression.mjs` still hard-codes the
  Chrome channel, headful, `.s-work` and `is-works-ready` — `npm run
  perf:regression` neither runs on this host nor sees the anime home.
- **A wheel step does not always move the page by its own pixel count**, so each
  run calibrates: wheel a known distance, scale the rest by what the page did,
  record `config.wheelScale`. Measured here: **2 at 1440x900, 1 at 390x844.**
  An earlier note in this file blamed `deviceScaleFactor`; the phone runs refute
  it, since they scale 1 at `deviceScaleFactor: 3`. What the factor tracks is
  Lenis, which runs on a fine pointer and is switched off by `pointer: coarse`
  (`src/utils/SmoothScroll.ts`). The mechanism is not established beyond that
  correlation, and the calibration makes it moot. `config.wheelScale`,
  `config.binary` and `config.headless` all have to match before two runs are
  compared.
- The hero wheel shows `public/shots/<slug>.webp`, a picture of the first screen
  of each page in `src/data/projects.ts`, plus `<slug>-blur.webp`, an opaque
  twin with the hero's CSS treatment baked in.
  - After changing a case page's first screen, re-run `scripts/shots.mjs`
    (`SITE=…` on a served build). Otherwise the wheel shows the old page.
  - `--blur-only` re-derives just the twins.
- **Project media pipeline.** The owner's source folder is
  `~/Desktop/my_work_experienceh` on his Mac. It was copied read-only to
  `~/work/works-only/in/mwe-2026-10-02/` (edited copies in `prepared/`).
  - The picks, with captions, privacy fixes and the facts the photos
    contradict, are in `docs/media-picks.md`.
  - `scripts/import-media.mjs <manifest>` writes `public/projects/<slug>/media/`
    and a `media.json` (manifests: `docs/media-manifest*.json`).
  - Pages read the files through `src/data/media.ts` (`picture`, `video`,
    `slides`), never by hard-coded paths: a small source has fewer widths.
  - iPhone clips are HDR (HLG). Convert them to SDR before the import.
  - A video entry may carry `keepAudio`, `playFrom` (where playback starts in
    the imported file; the poster is taken there) and `blur: [[from, to]]` (a
    privacy cut). Re-import single entries with `--only=<slug> --ids=<id>
    --force`.
- **The photo picker** (owner only, never in the build): `node
  scripts/pick-server.mjs` serves `dist/` on http://100.122.188.86:4401/ (open it
  by IP: Host and Origin are checked) and injects `scripts/pick/picker.js`. The
  candidate pool is `~/work/works-only/in/pick-pool/` (`scripts/pick-pool.mjs`,
  privacy deny list `docs/pick-deny.json`). His choices arrive as
  `docs/picks/<time>.json`; `scripts/pin-picks.mjs <file> --dry-run` shows the
  manifest changes, then run the import commands it prints and rebuild. HDR
  masters it tone-mapped sit in `pick-pool/_sdr/`: move a pinned one into
  `prepared/` before relying on it.
- **ScrollTrigger counts a trigger active only strictly inside its range**
  (progress > 0 and < 1). Two sections that hand over on one scroll position
  are both inactive there; let the leaving one hand over explicitly (Space.ts
  calls `showWorkStack(spaceP >= 1)`).
- **Held back for the owner.** Each item is built and switched off:
  - the GDG impact report (`SHOW_REPORT` in `src/pages/work/gdg.astro`);
  - AMS deck page 7 (the filter in `src/pages/projects/ams/index.astro`);
  - `touchpoint-19` and `IMG_9344`, which show a "Track: Google — TouchPoint"
    slide. The owner (2026-10-03) chose not to claim the Google track: the
    official winners page lists "Find It" for it.
  His open questions are in the v4 report and in `docs/facts-to-confirm.md`.
- **Prizes are settled against the official pages** (2026-09-29): TouchPoint
  placed 2nd overall of 71 teams at QuackHacks 3 and did not win the Google
  track; SPOOT placed 3rd in Google's Best Use of Gemini at BeaverHacks 2026
  (May 2-3, 2026). 2026.quackhacks.org reads "250+ PARTICIPANTS" (checked
  2026-10-02). The site links no resume (owner, 2026-10-02);
  `public/resume.pdf`, the combined variant built 2026-09-29 (33efd95), stays on
  disk unlinked. All four resume variants and the LinkedIn drafts in
  `~/work/school/out/career` use the same official wording (checked with
  pdftotext on 2026-09-29).
- Found on the way: 353711e had deleted `restAtStart()` from
  `RocketFlight.ts`; under reduced motion the rocket threw at init until
  353f6da. `t-anime` runs a reduced-motion context per engine since. The
  suite is 1130+ checks; `tests/lib.mjs` ignores the engines' own aborts
  (`ERR_ABORTED`, `NS_BINDING_ABORTED`, "cancelled").
- **GDG facts** (2026-10-03): he is one of two Co-Presidents
  (gdgc-osu.com/officers), elected in spring 2026. 200+ registered is his
  figure; 22 meetings in 2025-26 and 6 → 70 members in the first year come
  from the chapter's shared Drive (sources in `src/pages/work/gdg.astro`).
- Branch history:
  - `feat/portfolio-v5` (2026-10-03, local, not pushed) is v5, from
    `feat/portfolio-v4` @ eb96b5e. The GitHub repo is public and Vercel builds a
    preview for every pushed branch, so a push would also publish
    `docs/media-picks.md` and the other private curation notes; the owner
    decides how the preview goes out (a Vercel login on this host, or a push
    with those docs moved out).
  - `feat/portfolio-v4` (2026-10-02, local, not pushed) is v4. It branches
    from `night/restore-2026-09-30` at 401a391.
  - `night/restore-2026-09-30` is `feat/anime` (425f3e0,
  recovered from the Mac archive, never pushed) plus content commits. The
  restore report, the fixes report and the open owner questions are in
  `~/work/works-only/docs/night-2026-09-30/`; the owner's questionnaire is
  `docs/facts-to-confirm.md`.
