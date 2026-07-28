# Preload weight: replacing the 240-JPG rocket sequence

Branch `perf/preload-weight`. **960-px frame set is ready to merge.**
The scrubbed-video experiment was rejected and its branch deleted: it added a decoder
probe, fallback logic and unstable load cost for a memory problem the attribution did
not support. The historical measurements remain below so the same premise is not
re-inherited.

The rocket story plays 240 JPGs (1918×766, 8.4 MB) that are all eagerly preloaded at
page load. Profiling had already cleared them of causing frame jank; the open concern
was resident memory. The old harness reported a 270–290 MB **sum across every Chrome
renderer process in the fresh profile**, which was treated as if it belonged to the
page. The attribution run below separates that sum from the heaviest renderer (the
real page proxy) and from Chrome's large process baseline.

This document records what was tried, including the two things that did not survive
measurement.

---

## Headline: neither memory premise survived measurement

Two candidate fixes were tried. **Neither produced a measurable full-page memory win
on the only platform this repo can measure.**

- **Scrubbed video** (frame timing unchanged, bytes −43%, but real-page RSS 7–16 MB
  *worse* across three configs, and an unstable load-time cost — 3–4 long tasks,
  266–359 ms, on later runs).
- **960-px JPGs** (frame timing unchanged, bytes −34%, but a 3-run-per-config real-page
  comparison shows the difference from the current 1918-px set does not clear
  run-to-run noise: within-variant spread 11–15 MB, between-variant difference
  0.3–3.0 MB, and on desktop the *wrong* direction).

Both did halve the sequence's cost in isolation, on a bare page with everything else
held constant (90.7 MB → 45.3 / 41.9 MB). That isolated result is real. It does not
show up as a full-page win, most plausibly because the rest of the page's own memory
pressure already forces the browser's image cache to evict before the sequence's true
resident cost is ever paid — the same mechanism in both cases.

Removing the sequence completely settles the larger premise: on desktop its real-page
share is not measurable; on the 390×844, CPU×4 profile it is about **22.6 MB in the
heaviest renderer plus 9.3 MB in the shared GPU process**. The sequence is therefore a
minority cost, not the explanation for the previously quoted ~243 MB. Chrome's own
fresh-profile baseline is the dominant part of the process-tree number.

**960 is still what's shipped here**, not because the memory case holds up, but
because it is strictly simpler and safer than the alternative it's compared against:
smaller transfer, no decoder probe, no iOS-specific failure mode, a one-line revert.
See *Recommendation*.

---

## What was built

**This is a historical description of the rejected video path; it is no longer in the
source tree or available as a supported branch.** It remains here only because its
measurements explain the 960-px recommendation.

The experiment implemented two interchangeable frame sources behind one runtime
interface (historical; no longer in the source tree):

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
browser baseline and the rest of the application.

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

| Option | Bytes | Reqs | Bare-page RSS | Legacy renderer-tree sum, desktop (mean of 3, or single run where noted) | Work | Risk |
|---|---|---|---|---|---|---|
| **A. Status quo** — 240 JPGs @1918 | 8.4 MB | 240 | 90.7 MB | 326.8 | — | unquantified eviction risk on phones |
| **B. Every 2nd frame** — 120 @1918 | 4.2 MB | 120 | 81.6 MB | not measured | small | halves temporal resolution to save 9 MB — **not worth it** |
| **C. 240 JPGs @960 (shipped)** | 5.4 MB | 240 | 45.3 MB | 329.8 — **does not clear noise, see below** | small | softer at large viewports; no new failure mode |
| **D. Scrubbed video** (rejected; implementation deleted) | 4.8 MB | 1 | 41.9 MB | 296.9 (single run) | medium | iOS decode/seek/Low-Power-Mode unverified |

### Option C measured on the real page — 3 runs per config, not 1

The single-run numbers first reported here (274.0 / 255.1 MB) looked like a clean win.
They were not repeatable. Three runs per config, alternating which variant ran first,
same machine, same idle state:

| Config | @1918, 3 runs | mean | @960, 3 runs | mean | Δ mean |
|---|---|---|---|---|---|
| desktop, RSS final | 333.5 / 324.5 / 322.3 | 326.8 | 327.2 / 331.8 / 330.5 | 329.8 | **+3.0 MB (960 worse)** |
| mobile ×4, RSS final | 281.8 / 285.5 / 297.2 | 288.2 | 287.5 / 294.0 / 282.2 | 287.9 | −0.3 MB (noise) |

**This does not clear noise.** Within-variant spread is 11.2–15.4 MB; the between-variant
difference is 0.3–3.0 MB. On desktop the mean is nominally in the wrong direction. The
real-page memory case for 960 is **not supported by this measurement** — it is exactly
as absent as the video's was.

Frame timing at 960 px is unchanged from everything else (scrub 33.3 med, worst 35.4,
0 frames over 50 ms), listeners flat, console clean, 12/12 regression checks pass.
Visually verified at 2× desktop device scale, same scroll offset, before/after: the two
are not distinguishable by eye.

Visual cost, measured pixel-for-pixel against the source: mean absolute difference
0.85/255, worst subpixel 167 — slightly further from the original than the video's
0.61/115 was, since a 960-px frame is upscaled into the 1400-px canvas while the video
was encoded at 1400. Not visible at normal viewing distance; present on fine detail
(the circuit board) under a diff.

### Does the sequence drive real-page RSS? Full removal says no

`perf/real-page-memory.mjs` runs the production page from a fresh Chrome profile and,
before application code executes, either remaps the shipped path to the original 1918
set or suppresses every frame request and replaces `updateRocketFrame` with a no-op.
It then scrubs the complete rocket range, one rAF per requested frame. Each row below
is three runs with reversed order on run 2; the full variant recorded 240 requests and
the stub recorded zero.

The old tables used `rendererSumMb`. A persistent Chrome profile has a second renderer
process, so that value is not page-only and can move in the opposite direction.
`rendererMaxMb` is the heaviest renderer and the best available proxy for this page;
the GPU process is shared and is reported separately.

| Final RSS | 1918, 3 runs (mean) | No frames, 3 runs (mean) | Change when removed | Finding |
|---|---|---|---|---|
| Desktop page renderer (max) | 205.1 / 208.6 / 209.2 (**207.6**) | 209.3 / 211.6 / 209.5 (**210.1**) | +2.5 MB, wrong direction | no measurable share |
| Desktop GPU process | 143.4 / 144.5 / 144.5 (**144.1**) | 151.5 / 153.3 / 152.8 (**152.5**) | +8.4 MB, wrong direction | no memory win |
| Mobile 390×844 + CPU×4 page renderer | 191.5 / 195.9 / 197.1 (**194.8**) | 171.7 / 171.5 / 173.4 (**172.2**) | **−22.6 MB** | real, minority share |
| Mobile 390×844 + CPU×4 GPU process | 130.5 / 133.0 / 133.8 (**132.4**) | 123.7 / 122.0 / 123.7 (**123.1**) | **−9.3 MB** | real, shared-process signal |

So the original premise was overstated: the sequence is not the source of the whole
~243 MB. It is invisible at desktop steady state and accounts for roughly 23 MB in
the page renderer on this mobile proxy. The result does **not** prove Chrome's precise
cache-eviction mechanism, but it does prove that most of the real-page RSS remains
when the sequence is gone.

### Attribution of what remains

Three desktop runs per ablation, all with the sequence removed:

| Variant | Page renderer (max), mean | GPU, mean | Process tree, mean | JS heap |
|---|---:|---:|---:|---:|
| Empty same-origin page (Chrome baseline) | **116.7 MB** | **104.5 MB** | **637.6 MB** | 0.6 MB |
| Full page, no frames | 175.6 MB | 123.3 MB | 694.1 MB | 4.2 MB |
| No frames + no Three.js scene mount | 165.1 MB | 116.9 MB | 681.9 MB | 3.3 MB |
| No frames + web fonts blocked | 168.4 MB | 117.8 MB | 681.3 MB | 4.2 MB |

The dominant term is **Chrome itself**: the empty-page baseline is 66% of the page
renderer proxy, 85% of GPU RSS and 92% of the complete process tree. The entire app
above that baseline is about 59 MB in the heaviest renderer. The Three.js scene moves
that proxy by about 10.5 MB and JS heap by 0.9 MB; it is material but not dominant.
The font ablation is inside its own 18.3 MB run spread, so no font-memory claim clears
noise. All application JS together adds only 3.6 MB of measured JS heap above bare;
GSAP is inside that bucket and cannot explain a hundreds-of-megabytes result. These
ablations are not additive — Chromium caches and shared processes overlap.

Raw results:
`perf-results/2026-07-28T05-14-46-855Z-attribution-desktop.json`,
`perf-results/2026-07-28T05-16-14-993Z-attribution-mobile-cpu4x.json`, and
`perf-results/2026-07-28T05-17-56-195Z-attribution-components-desktop.json`.

### Why adopt it anyway

The isolated-sequence bench remains real and unambiguous: 90.7 MB → 45.3 MB with
everything else held constant (`perf/preload-bench.mjs`, bare document, same origin,
forced decode). That cost exists and 960 does cut it in half. It just does not show up
as a full-page win here, most plausibly because the rest of the page's memory pressure
already forces the image cache to evict before the sequence's true cost is realized —
the same cache-eviction hypothesis that explained the video's real-page result.

**Adopted for the reasons that hold up, not the one that didn't:** smaller transfer
(5.4 vs 8.4 MB), a real halving of the sequence's isolated memory cost, zero new
failure modes, and a one-line revert if it's ever wrong. Not adopted because of a
real-page memory win — there isn't a measurable one here. If real-device testing later
shows resolution doesn't matter either, the revert costs one line
(`src/components/RocketBackground.astro`'s `PATH` constant back to `/1/ezgif-frame-`).

---

## Recommendation

**Ship 960 px (option C), not the video** — as a transfer/low-risk optimization, not
as a demonstrated real-page memory optimization, because neither candidate produced a
full-page win that clears noise.

- Both candidates match on the number that *is* real: isolated sequence cost roughly
  halves either way (90.7 → 45.3 MB JPG, → 41.9 MB video).
- 960 gets there with a path constant. The video needs a frame-source abstraction, a
  five-gate capability probe, seek coalescing and a mid-session handover — for a
  real-page result that was 7–16 MB *worse*, not better, and a load-time cost (3–4 long
  tasks, up to 463 ms) that was unstable across runs.
- 960 has no new failure mode. No probe, no Low Power Mode question, no audio session,
  no decoder death mid-scroll. Whatever risk 960 carries, it is the same risk the JPG
  sequence already carries today, with 34% fewer transferred bytes.
- The revert is one line if 960 turns out to matter less than expected:
  `RocketBackground.astro`'s `PATH` constant back to `/1/ezgif-frame-`. The original
  1918-px set stays in `public/1/` for exactly this.

**What I would not do:** option B (every-2nd-frame). Halving the frame count costs half
the animation's temporal resolution and buys 9 MB in the one measurement (bare-page)
that showed any effect at all.

## Why the video was deleted

The video path worked mechanically (12/12 regression, median scrub lag 0 frames), but
it had no independent product value. Its proposed benefit was an unverified memory
risk; full-page attribution removed that premise. Its observed costs remained real:
an extra frame-source abstraction, five-gate decoder probe, JPG fallback handover, and
an unstable load profile with 3–4 long tasks up to 463 ms. The local
`perf/rocket-video-scrub` branch is therefore deleted. Do not revive this path unless
a new, device-specific measurement identifies a problem that 960-px JPGs cannot solve.


---

## What needs checking on a real iPhone

Nothing below can be settled on this machine. Playwright WebKit is not Safari — it
differs in media stack, process model and memory limits, which are exactly the
subsystems in question here.

### Audit findings 3, 4, 5, 6 — same trip

1. **Finding 5 (rocket spacer `vh` vs `innerHeight`)** — scroll the rocket section so
   the toolbar collapses mid-sequence and watch for a progress jump or visual skip.
2. **Finding 4 (`100svh` on the pinned Work container)** — fix applied, unverified on
    iOS. Scroll into Work, show and hide the toolbar. The pinned box should neither
    clip at the bottom nor leave a gap. Desktop proved the change inert; only iOS can
    prove it correct.
3. **Finding 3 (stale pin geometry for 400 ms+)** — rotate the device while parked
    inside Work. Expect the ~120 px title jump when the debounce fires. Note the
    direction of the jump: WebKit does not scroll-anchor during resize where Chromium
    and Firefox do, so iOS may move the opposite way.
4. **Finding 6 (no `normalizeScroll`, `pinType: "fixed"`)** — pin jitter during
    toolbar collapse is the classic symptom. Scroll slowly through Work so the toolbar
    animates, and watch the pinned container's top edge. Also check overscroll
    rubber-banding at both ends of the pinned range.
5. While in Work with the rocket section above it, confirm the rocket background is
    hidden and stays hidden — `RocketStorySection` gates on `workIsVisible`, and the
    fixed layer is still `100vw`/`100vh` (audit finding 4's inventory), which overflows
    the visible area on iOS.

### Recording the results

Record the device, iOS/Safari version, viewport state and the observed layout result.
The removed video diagnostics are not available and are not a test target.
