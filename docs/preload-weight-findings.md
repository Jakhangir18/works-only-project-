# Preload weight: replacing the 240-JPG rocket sequence

Branch `perf/preload-weight`. **Implemented, measured, not merged.**

The rocket story plays 240 JPGs (1918×766, 8.4 MB) that are all eagerly preloaded at
page load. Profiling had already cleared them of causing frame jank; the open concern
was resident memory — the renderer sits around 270–290 MB, which risks tab eviction on
mid-range phones.

This document records what the replacement actually bought, including the part that
did not work out.

---

## Headline: the memory premise did not survive measurement

The change was approved on the expectation that a scrubbed video would cut renderer
RSS substantially. **On the only platform this repo can measure, it does not.**

Frame timing is unchanged, network bytes drop by 43%, and the load-time long task
disappears — but resident memory is a wash. The numbers are in the tables below.

That does not make the video wrong, because the device the memory concern was about
(a real iPhone) is exactly the device that cannot be measured here. It does mean the
memory argument for it is currently **unsupported by evidence**, and that should be
settled on hardware before this merges.

It also turned up something more useful: **frame count is not the lever, resolution
is.** Halving the frame count saves 9 MB; halving the resolution saves 45 MB. That
makes the 960-px option — smaller, safer, and with no device-specific unknown — the
one I would ship. See *Recommendation* below.

---

## What was built

Two interchangeable frame sources behind one interface
(`src/utils/rocketFrameSource.ts`), selected at runtime:

- **video** — one all-intra H.264 MP4, scrubbed by setting `currentTime`. Holds a few
  decoded frames instead of 240.
- **jpg** — the original 240-file eager preload, unchanged in behaviour. This is the
  fallback and it is a real working path, not a stub.

`RocketBackground.astro` owns the canvas and asks whichever source won for a frame
index. Nothing downstream changed: the rocket container transform, the CSS, the
progress math and `window.updateRocketFrame`'s contract are all as they were.

### Selection is a decoder probe, not a UA string

`probeVideo()` decides by making the device prove it can do the job:

1. `canPlayType('video/mp4; codecs="avc1.640028"')` must not be `""`.
2. `loadedmetadata` must fire and carry real dimensions.
3. A **warm-up seek** to frame 120 must complete.
4. That seek must have actually **painted** — an 8×8 readback must find non-black
   pixels. A seek can report `seeked` while the compositor still has nothing, and
   that is precisely the failure a UA check cannot catch.
5. All of it inside 2.5 s, or the video is rejected.

Any failure falls through to the JPG sequence. The probe frame (120) was checked
against the source: mean luminance ≈ 45/255, so a black 8×8 sample genuinely means
"nothing painted" rather than "this frame is dark".

### Passing the probe once is not a permanent guarantee

iOS can drop a media element under memory pressure long after it loaded cleanly, so
`createVideoSource` also listens for `error` and hands over to the JPG sequence
mid-session, preserving the current frame index so the sequence resumes where it was.
This is the call site for `destroy()` (invariant 4) — it is not decorative.

### Seeks are coalesced

At most one seek is outstanding. A fast scrub can request a hundred indices while one
decode is in flight; only the newest survives, because decoding the skipped ones would
spend frames on pictures nobody sees.

---

## The warm-up seek

The specific worry was a ~2 s first seek in WebKit. **I could not reproduce anything
close to 2 s in Playwright WebKit** — the cold seek there is 65–73 ms. That is a real
cost worth removing, but it is two orders of magnitude off the reported figure, and
Playwright WebKit is not Safari and is certainly not iOS Safari. Treat the 2 s figure
as still open, and see the iPhone checklist.

The warm-up runs during the probe, so the first user-driven scrub is never the first
decode. Measured by `perf/seek-bench.mjs` (240 seeks per pattern):

| Variant | Engine | Cold 1st seek | Warm fwd (med / p95) | Warm back (med) | Random (med) |
|---|---|---|---|---|---|
| 1400×560 all-intra | Chromium | **7.4 ms** | 8.3 / 17.9 ms | 8.4 ms | 8.5 ms |
| 1400×560 all-intra | Chromium ×4 CPU | **5.1 ms** | 22.3 / 26.1 ms | 22.1 ms | 22.3 ms |
| 1400×560 all-intra | WebKit | **65 ms** | 1 / 2 ms | 1 ms | 1 ms |
| 1918×766 all-intra | WebKit | 73 ms | 2 / 6 ms | 2 ms | 2 ms |
| 1918×766 GOP-12 | WebKit | 68 ms | 2 / 3 ms | 4 ms | 3 ms |
| 1918×766 GOP-12 | Chromium | 11.6 ms | 17.1 / 33.2 ms | 24.3 ms | 17.9 ms |

In the running page the probe reported, across five runs:

| Run | Warm-up seek | Second seek | Long tasks during load |
|---|---|---|---|
| video desktop | 67.0 ms | 46.1 ms | 1 (57 ms) |
| video cpu ×4 | 57.5 ms | 10.7 ms | 1 (88 ms) |
| video mobile ×4 | 62.2 ms | 7.6 ms | 2 (168 ms) |
| final desktop (a) | 358.7 ms | 13.6 ms | 4 (463 ms) |
| final desktop (b) | 266.0 ms | 9.2 ms | 3 (384 ms) |

**Did it work?** The mechanism works in every run: the second seek is 6–30× cheaper
than the first, which is exactly what a warm-up is for, and the fidelity check
confirms scrubbing then tracks the requested frame with a median lag of 0 frames.

**But the cost itself is unstable and I could not pin it down.** The last two runs
were taken after an hour of continuous measurement on this machine and show a warm-up
4–6× more expensive, and load-time long tasks (3–4, 384–463 ms) clearly worse than the
JPG path's (0–2, ≤143 ms). Nothing in the code changed between them that plausibly
explains it, so I attribute it to machine state rather than the implementation — but
**that is an attribution, not a measurement.** One suspect worth checking on a quiet
machine is the probe's `getImageData` readback, which forces a GPU→CPU sync.

Either way, the video path's load profile is **not** established as clean, and
`long tasks > 50 ms: 0` is a budget it does not currently meet. Re-measure on an idle
machine before trusting any warm-up number here.

### Why all-intra at 1400×560

The canvas backing store is 1400×1400 and frames are letterboxed into it, so a frame
is never drawn wider than 1400 — encoding above that resolution is decoded detail
thrown away. All-intra was chosen over GOP-12 because backward scrubbing (scrolling
up) is a first-class interaction here, and GOP-12 costs ~3× on backward seeks in
Chromium (24.3 ms vs 8.4 ms) for a file-size saving the JPG baseline did not need.

Encoded with AVFoundation via a small Swift tool — **ffmpeg is not installed on this
machine**, and Xcode's toolchain was already present. `AVAssetExportSession` with
`shouldOptimizeForNetworkUse` puts the moov atom first so playback can start before
the file finishes downloading.

| Encode | Size |
|---|---|
| 240 JPGs (current) | 8.4 MB |
| 1918×766 all-intra @8 Mbps | 7.65 MB |
| 1918×766 GOP-12 @4 Mbps | 3.86 MB |
| **1400×560 all-intra @5 Mbps (shipped)** | **4.78 MB** |

---

## Visual verification

Canvas pixels were pulled from both paths at frames 0, 60, 120, 180, 239 and compared
directly, so the result is not affected by compositing or the `rocket-bg` opacity gate:

| Frame | mean abs diff (0–255) | worst subpixel |
|---|---|---|
| 0 | 0.58 | 96 |
| 60 | 0.71 | 104 |
| 120 | 0.61 | 115 |
| 180 | 0.36 | 68 |
| 239 | 0.45 | 88 |

Mean difference is ~0.2% of range. Rendered side by side at frame 120 the two are
indistinguishable. The worst-subpixel figures are isolated high-contrast edges, which
is the expected signature of one DCT codec versus another.

---

## Frame timing and memory, both paths

Chromium, production preview, 1440×900 and 390×844. Every number below is from
`perf-results/*.json`, not from console scrollback.

**Read the floor first.** The idle median in this session is **33.3 ms — a 30 Hz
display floor**, not the 8.3 ms (120 Hz) or 13.3 ms (75 Hz) recorded previously in
`CLAUDE.md`. Median and p95 therefore cannot be judged against the 16.7/25 ms budgets
in these runs: the machine could not produce a faster frame if the code were perfect.
Worst-frame, long-task, listener and heap budgets are still meaningful, and all pass.
Do not compare these medians against runs taken at a different floor.

| Run | Source | Transfer | Reqs | RSS peak | RSS final | scrub down med/p95/worst | scrub up | >50 ms |
|---|---|---|---|---|---|---|---|---|
| desktop, pre-change | jpg | 8214 KB | 240 | 279.3 | 288.7 | 33.3 / 34.2 / 34.4 | 33.3 / 33.7 / 34.3 | 0 |
| desktop, fallback | jpg | 8214 KB | 240 | 268.7 | 281.1 | 33.3 / 34.0 / 34.4 | 33.3 / 34.1 / 34.3 | 0 |
| desktop, video | video | 4890 KB | 1 | 262.9 | **296.9** | 33.3 / 34.4 / 35.2 | 33.3 / 34.8 / 35.3 | 0 |
| cpu ×4, pre-change | jpg | 8214 KB | 240 | 267.8 | 290.4 | 33.1 / 34.4 / 36.6 | 32.6 / 34.7 / 37.6 | 0 |
| cpu ×4, fallback | jpg | 8214 KB | 240 | 259.8 | 293.0 | 33.3 / 34.2 / 36.5 | 33.3 / 34.1 / 34.3 | 0 |
| cpu ×4, video | video | 4890 KB | 1 | 275.0 | **306.3** | 32.8 / 34.5 / 37.2 | 32.5 / 34.8 / 37.2 | 0 |
| mobile ×4, fallback | jpg | 8214 KB | 240 | 253.8 | 262.5 | 33.3 / 34.1 / 34.3 | 33.3 / 34.1 / 34.4 | 0 |
| mobile ×4, video | video | 4890 KB | 1 | 288.5 | **269.2** | 33.1 / 34.3 / 37.0 | 32.7 / 34.7 / 35.4 | 0 |

Leak and hygiene budgets, all three desktop runs: heap growth 0.4–0.5 MB across 3
cycles (flat), **listeners added per resize 0** (96→96 jpg, 99→99 video — the video
path's +3 are its `seeked`, `error` and probe handlers), 0 console errors, 0 page
errors.

Scrub fidelity (`perf/scrub-fidelity.mjs`, video source): median lag behind the
requested frame **0 frames**, worst 4 of 240, and it settles on the exact requested
frame. Seek coalescing is not silently dropping the animation.

Regression sweep on the shipped build: **all 12 checks pass** — 7 routes 200,
open→close→open, rapid jiggle with listeners stable, resize rebuilds geometry with no
leak, keyboard focus, `prefers-reduced-motion` keeps the rocket static, first-load LCP
636 ms with 0 long tasks in the 8 s window.

**Frame timing is a tie.** Zero frames over 50 ms in any scrub, on either path.
**Memory is not a win.** End-of-run renderer RSS is 7–16 MB *higher* on the video path
in all three configs.

## Where the memory actually goes

`perf/preload-bench.mjs` loads N frames on a bare document on the same origin, forces
a decode of each, and samples process-tree RSS — isolating the sequence from the
Three.js scene and GSAP that otherwise dominate the number.

| What | RSS before → after | Delta |
|---|---|---|
| 30 JPGs @1918 | 191.7 → 255.9 | 64.2 MB |
| 60 JPGs @1918 | 219.5 → 288.7 | 69.2 MB |
| 121 JPGs @1918 | 219.3 → 301.7 | 82.4 MB |
| **240 JPGs @1918 (current)** | 219.1 → 309.8 | **90.7 MB** |
| 120 JPGs @1918, every 2nd | 219.2 → 300.8 | 81.6 MB |
| **240 JPGs @960** | 219.2 → 264.5 | **45.3 MB** |
| Video, full 240-frame scrub | 187.3 → 229.2 | 41.9 MB |

Caveat: launch-to-launch baseline varies (two runs started near 190 MB rather than
219 MB), so treat individual deltas as approximate. The *ordering* is robust and is
what the conclusions rest on.

### The cache-saturation finding — reproduced, and it is the important one

**Halving the frame count saves essentially nothing.** 240 → 121 frames saves 8.3 MB
out of 90.7. Every-2nd-frame across the full range saves 9.1 MB. Even 30 frames —
one eighth of the sequence — still costs 64.2 MB, 71% of what all 240 cost.

The cost is not proportional to frame count because the decoded-image cache has its
own ceiling and eviction policy. Past roughly 120 frames the cache is already
discarding surplus bitmaps, so removing frames removes something the browser had
stopped keeping anyway. **Cutting frames is not a memory lever.**

**Resolution is.** The same 240 frames at 960 px cost 45.3 MB instead of 90.7 MB —
half, because each decoded bitmap is a quarter of the pixels and more of the working
set fits under the same ceiling. This is the one intervention in the table that
reliably moves the number.

### Why the bare-page and real-page results disagree for video

On a bare page the video looks like a clear win (41.9 MB vs 90.7 MB). On the real page
it is 7–16 MB *worse* than the JPG path. Those are consistent if the image cache
yields under pressure while the video decoder does not: on the full page the 240 JPGs
never actually occupy 90 MB, because everything else competing for memory forces the
cache to evict — whereas decoder buffers are pinned and evict for nobody.

**This is a hypothesis consistent with the data, not a proven mechanism.** I did not
instrument Chrome's cache eviction. What is measured is the outcome: on the real page,
in Chromium, swapping to video does not reduce renderer RSS.

## Options

| Option | Bytes | Reqs | Bare-page RSS | Real-page RSS (desktop, final) | Work | Risk |
|---|---|---|---|---|---|---|
| **A. Status quo** — 240 JPGs @1918 | 8.4 MB | 240 | 90.7 MB | 281–289 MB | — | unquantified eviction risk on phones |
| **B. Every 2nd frame** — 120 @1918 | 4.2 MB | 120 | 81.6 MB | not measured | small | halves temporal resolution to save 9 MB — **not worth it** |
| **C. 240 JPGs @960** | 5.4 MB | 240 | 45.3 MB | **274.0 MB** | small | softer at large viewports; no new failure mode |
| **D. Scrubbed video** (built here) | 4.8 MB | 1 | 41.9 MB | 296.9 MB | medium | iOS decode/seek/Low-Power-Mode unverified |

### Option C measured on the real page

Run by swapping 960-px frames into `dist/` and forcing the JPG path, so it exercises
the shipped component with smaller assets:

| Config | Current @1918 | Video | **@960** |
|---|---|---|---|
| desktop, RSS final | 281.1 / 288.7 | 296.9 | **274.0** |
| mobile ×4, RSS final | 262.5 | 269.2 | **255.1** |
| transfer | 8214 KB | 4890 KB | 5565 KB |

Frame timing at 960 px is the same as everything else (scrub 33.3 med, worst 35.4,
0 frames over 50 ms), listeners flat, console clean.

Visual cost, measured the same way as the video: mean absolute difference from the
full-resolution render is **0.85/255 with worst subpixel 167** — slightly further
from the original than the video's 0.61/115, which is expected since a 960-px frame
is upscaled into a 1400-px canvas while the video is encoded at 1400. Side by side at
frame 120 the softening is not obvious, but it is real on fine detail such as the
circuit board.

### Honest reading of the real-page numbers

The real-page spread across all three options is roughly ±15 MB on a ~280 MB base.
For scale, **two runs of identical code differed by 7.6 MB** (pre-change 288.7 vs
fallback 281.1). So the real-page differences are only just outside run-to-run noise,
and each is a single run.

The bare-page bench is the cleaner signal, and there the conclusion is unambiguous:
the sequence's own cost is 90.7 MB today, 45.3 MB at 960 px, 41.9 MB as video. Both
interventions roughly halve it; only one of them shows up as an improvement once the
rest of the page is competing for memory.

---

## Recommendation

**Take option C (960 px), not the video** — on the evidence available here.

- It is the only option that improved real-page RSS in **both** configs measured
  (−7 MB desktop, −7 MB mobile, against a video that was 8–16 MB *worse*).
- It matches the video's isolated memory win (45.3 vs 41.9 MB) without introducing a
  decode path whose behaviour on the target device is unknown.
- It cannot fail. There is no probe, no fallback, no Low Power Mode question, no
  audio session, no mid-session decoder death. The failure modes of the video path
  are all on the one platform that motivated the change.
- It is a fraction of the code: a build step and a path change, versus a frame-source
  abstraction, a five-gate capability probe, seek coalescing and a handover path.

The video path is implemented, measured and left on this branch. If the iPhone session
shows the JPG sequence really does cause eviction on device *and* the video probe
passes reliably including in Low Power Mode, it becomes worth reconsidering — that is
the evidence it needs, and it is exactly the evidence this machine cannot produce.

**What I would not do:** option B. Halving the frame count costs half the animation's
temporal resolution and buys 9 MB.


---

## What needs checking on a real iPhone

Nothing below can be settled on this machine. Playwright WebKit is not Safari — it
differs in media stack, process model and memory limits, which are exactly the
subsystems in question here.

### The video scrub

1. **Which path actually runs.** Safari Web Inspector → Console →
   `window.__rocketFrameSource`. Expect `"video"`. If it says `"jpg"`, read
   `window.__rocketVideoProbe.reason` — that names which of the five probe gates
   rejected it.
2. **The warm-up seek cost.** `window.__rocketVideoProbe` reports `warmupMs` and
   `secondSeekMs`. This is where a 2 s first seek would show up. If `warmupMs` is
   large but `secondSeekMs` is small, the warm-up is doing its job and the design
   holds. If **both** are large, seeking is too expensive on iOS and the video path
   should be abandoned rather than tuned.
3. **Low Power Mode, on and off.** This is the highest-risk unknown. iOS restricts
   media decoding in Low Power Mode; if the probe fails there, the phone falls back
   to the 240-JPG path — i.e. the full memory cost lands on exactly the device the
   change was meant to protect, and in the exact condition where it is already short
   of resources. Check `__rocketFrameSource` with LPM enabled.
4. **Does it paint at all.** Scroll into the rocket section and confirm the rocket is
   visible, not a black rectangle. The probe's pixel check should prevent this, but
   confirm it end to end.
5. **Backward scrub.** Scroll up through the section. Watch for stalling or frames
   arriving out of order.
6. **Mid-session handover.** If `window.__rocketVideoFellBack` is set after a long
   session, the decoder died and the JPG path took over — note what triggered it.
7. **Memory, both paths.** Safari Web Inspector → Timelines, or Instruments attached
   to the WebContent process. This is the number the whole change rests on and it is
   the one thing desktop measurement could not supply. Force the JPG path for
   comparison by running Safari with a device that fails the probe, or temporarily
   serve the page with `rocket.mp4` removed (404 → probe fails → JPG path).
8. **Tab eviction.** Background the tab, use two or three other apps, return. Does the
   page reload? Compare both paths.
9. **The audio session.** The video is muted and never played, but a media element can
   still interact with iOS's audio session. Start music, then load the page, and
   confirm playback is not interrupted or ducked.
10. **Cellular data.** 4.8 MB video vs 8.4 MB of JPGs, on a metered connection.

### Audit findings 3, 4, 5, 6 — same trip

11. **Finding 5 (rocket spacer `vh` vs `innerHeight`)** — now doubly relevant, because
    a progress jump on toolbar collapse becomes a large *seek* jump in the video path.
    Scroll the rocket section so the toolbar collapses mid-sequence and watch for the
    sequence skipping or stalling. Test both paths: if only the video stutters, that is
    a seek-latency problem, not the `vh` bug.
12. **Finding 4 (`100svh` on the pinned Work container)** — fix applied, unverified on
    iOS. Scroll into Work, show and hide the toolbar. The pinned box should neither
    clip at the bottom nor leave a gap. Desktop proved the change inert; only iOS can
    prove it correct.
13. **Finding 3 (stale pin geometry for 400 ms+)** — rotate the device while parked
    inside Work. Expect the ~120 px title jump when the debounce fires. Note the
    direction of the jump: WebKit does not scroll-anchor during resize where Chromium
    and Firefox do, so iOS may move the opposite way.
14. **Finding 6 (no `normalizeScroll`, `pinType: "fixed"`)** — pin jitter during
    toolbar collapse is the classic symptom. Scroll slowly through Work so the toolbar
    animates, and watch the pinned container's top edge. Also check overscroll
    rubber-banding at both ends of the pinned range.
15. While in Work with the rocket section above it, confirm the rocket background is
    hidden and stays hidden — `RocketStorySection` gates on `workIsVisible`, and the
    fixed layer is still `100vw`/`100vh` (audit finding 4's inventory), which overflows
    the visible area on iOS.

### Recording the results

`window.__rocketVideoProbe`, `window.__rocketFrameSource` and
`window.__rocketVideoFellBack` are all readable from the Web Inspector console with
no build changes. Capture them alongside each observation.
