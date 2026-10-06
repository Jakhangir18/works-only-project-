# Portfolio v5: design and progress

Branch `feat/portfolio-v5`, from `feat/portfolio-v4` @ eb96b5e. Local only. The preview is
:4400 (production `dist/`); the photo picker will be :4401.

The approved plan, with the owner's answers and the facts gathered on 2026-10-03:
`~/.claude/plans/glittery-whistling-moon.md`. Read it first. This file holds what the
plan does not: the review's required changes, decisions made while building, and
progress. The owner is flying (2026-10-03). Work runs autonomously and ends in a
Russian report.

## Workstreams and order
W0 memory (done) → W1 facts → W5 rocket right → W4 numbering (case pages) → W2 player
and glass → W3 picker → W6 constellation and word rows → W7 earth and grass → W8
verification → Vercel **preview** of this branch (owner's OK, 2026-10-03). Never
production, never main.

## Required changes from the plan review (Opus, 2026-10-03)
Each one replaces the plan's wording where they differ.

### W5, rocket on the right
- Impact at about [0.8, 0.72] on both routes. `CRASH_AT = 0.55` puts the runway's top at
  0.45H at impact, so a higher impact lands under the last bento card. On desktop the
  stage paints under the bento; on a phone it paints over text (z-index 2).
- Size the wipe in `measure()`: d = distance from the impact to the farthest corner;
  width = height = 2d/0.88 px, margin -d/0.88. This replaces the fixed 210vmax, which
  assumed a centred impact.
- Keep debris on screen: clamp reach to the right to 0.9·(W − end.x), or fan it up-left.
  Update the centred-impact comments in RocketFlight.ts and AnimeRocket.astro.
- Export a pure `impactAt(w, h)` plus `CRASH_AT` from RocketFlight, so Space places the
  sparks by arithmetic, not by trigger refresh order.

### W6, constellation and word rows
- Phone: `.space { z-index: 3 }` below 640 px, or the flight stage paints over the sparks.
- Hand-off: AnimeWork gets `margin-top: -100svh` with a transparent first screen (the
  AnimeSpace pattern), so WORK pins on the scroll where Space releases. The Space
  canvas draws the final solid letters itself (`fillText`) and hides on leave. WorkRows
  keeps its DOM stack `visibility: hidden` until its trigger is active. A t-anime check:
  DOM letter centres match the sampled centroids within 3 px.
- One source of the stack geometry: a TS `workStack(w, h)` feeds the sampler; the CSS
  follows it with a comment. The DOM letters are `display: none` when far, so they
  cannot be measured.
- Font for canvas: read the resolved family with `getComputedStyle`, then
  `await document.fonts.load(...)`. Shrink the offscreen canvas to 0×0 after
  `getImageData` (iOS canvas memory cap).
- Convergence window derived from `moveFrom` (e.g. [moveFrom + 0.5·(1−moveFrom), 0.95]).
  Dim the SVG star layers toward 0.15 while converging.
- Canvas drawing: positions are a pure function of progress; one path per alpha bucket;
  squares or one sprite; no shadowBlur; DPR ≤ 2; ticker callback added on toggle and
  removed on leave.
- Keep the `.anime-work` class and `#work` id: the harness anchors on them.
- Rows: letters in fixed-width cells (em); slots get explicit boxes (height = cell, width
  = height × photo aspect from media.json). Cache positions with offsetLeft/offsetTop,
  re-measure in the near-observer callback. `is-far` only drops `will-change` on the
  rows: the tiles are the keyboard path.
- Preview: uniform scale ≤ 1 only. The slot's aspect equals the preview image's, same
  `object-position`. Title and meta are children that fade in at scale ≥ 0.9.
- Decode: near WORK, slot thumbnails go `loading=eager` and `decode()`. Two preview
  elements alternate (current, next); each opens on the decoded 480w thumb and swaps to
  the 1280 srcset after `decode()` resolves, never mid-grow.

### W4 ordering
- The home's "no 0n / 0n" assertion lands with W6, which deletes the counter.
- CaseClip's `n` prop goes before or inside the W2 rewrite.

### W2, player and media
- `record` in import-media.mjs and `VideoEntry` in media.ts gain `playFrom` and `audio`;
  the probe checks for an audio stream. `posterAt` defaults to `playFrom` (seconds of
  the trimmed output). Add `--ids=` to import-media; re-imports need `--force`.
- One owner of playback: a clip the visitor paused or unmuted gets `data-user`; the
  observer and the visibility resume in case.ts still pause it off screen but never
  restart it. Bar state comes only from media events. The scrub fill moves on the GSAP
  ticker as `scaleX`, only while playing and on screen. Space on a focused button:
  `preventDefault`. Scrub bar `touch-action: none`. Starting a clip with sound pauses
  the others.
- iPhone: `requestFullscreen` only when `document.fullscreenEnabled`, else
  `video.webkitEnterFullscreen()` and resync on `webkitendfullscreen`. Keep
  `preload="none"`; start offset by media fragment (`…mp4#t=26`); total time from
  media.json `duration`. Setting currentTime on loadedmetadata flashes frame 0 on iOS.
- Glass: `has-refraction` when `'userAgentData' in navigator` (CSS.supports lies in
  WebKit). Glass on the home's contact buttons needs an idle-top and contact
  measurement before and after.

### W3, picker (adopted simplification)
- No second build. The pick server serves the production `dist/` and injects
  `<script src="/__pick/picker.js">` into each HTML response. The picker finds slots by
  their media URLs (`/projects/<slug>/media/<id>-…`). Production has no picker code by
  construction.
- Server: bind 100.122.188.86 only; HTTP Range (206) for MP4 on iPhone (use `sirv`);
  `/__pool/` paths confined to the pool dir; POST needs `application/json` and an
  `Origin` equal to its own, body ≤ 256 KB, schema-checked, file named from server time.
  `pin-picks` rejects any `src` outside `in/pick-pool`. A photo swap clears `srcset`.

### W7, earth and grass
- No idle sway on the canvas (it would redraw whenever visible): sway the canvas element
  with CSS, or not at all.
- Touch: lean blades with scroll velocity (pointermove stops at pointercancel once a pan
  starts).
- Pointer mapped through the cached document offset, the scroll, and the meadow's known
  translateY. Canvas inside the meadow so the meadow's transform carries it.
- Remove the tufts' `is-live` sway in the same commit; `destroyParadise` destroys the
  grass (invariant 4).
- Earth's layout size ≤ 1.2× the viewport diagonal (raster size at DPR 3).
- The Earth phase changes every descent constant and outgrows the harness's 3.2-screen
  paradise phase: extend it and add a grass pointer phase.

### Measurement per workstream
Phone ×4 and desktop harness before each commit of W5, the home glass, W6a, W6b
(work ×3 and space again) and W7, same `binary`, `headless`, `wheelScale`. W1, W4 and
the player need t-case, screenshots, and `shots.mjs` for any changed first screen.

## Decisions while building
- GDG copy names him on the stage photos (cover, g01); the lectern photo (g03) stays
  unnamed: the owner confirmed the stage photos only.
- GDG figures are the chapter's history, worded as the chapter's, not as his
  achievements: 70 members by May 2024 and +100% in 2024-25 predate his term.

## Progress
- W0 (2026-10-03 00:35): 11 idle sessions exported to `~/work/<project>/docs/sessions/`
  and killed with `csess kill` (resumable). Available memory 3.1 → 6.1 GB.
- W1 1074f0d: President since spring 2026 (first written "Co-President" from the
  club site; the owner corrected it the same day: he is the only President); GDG figures 200+ / 22 meetings / 6 → 70;
  TouchPoint "2nd place overall of 71 teams, 250+ hackers". Discord post updated.
- W5 7e6f922: impact at [0.8, 0.72] / [0.78, 0.72], wipe sized in px, debris clamped.
  Phone x4 rocket-down 13-17 frames over 50 ms against a base of 16 (noisy host).
- W4 0626c76 (Opus agent, checked page by page): no Fig. n, no 0n / 0n, no Log 0n.
- W2 9df6664 (media: playFrom, audio, blur, --ids) and 7749f95 (player + glass).
  The SPOOT walk opens at 0:26 with sound; the launch at 0:10, 17.8-19.2 s blurred.
- W3 b67b3a8: the picker (Opus agent + its own reviewer), live as the user unit
  `portfolio-picker` on :4401; pool of 101 items, 0 deny-list hits.
- W6 00e4e73 and W7 f262b63 (+ cc4cde2 tests, 6f9079a clip fix, d8926e2 shots).
  The first grass leaned with the scroll inside the meadow's layer: phone x4 30-38
  long tasks per descent; traced to the canvas (0 with it hidden); own layer 20;
  no scroll redraw 0. CLAUDE.md invariant 13.
- /code-review high on eb96b5e..6f9079a: 10 findings + 2 weaker, all acted on
  (37a1176, 8f322e2, e129907, 69a74e7, bfbfd03). Plus 410cc58 (AMS notes at 1:1
  contrast after the numbering removal) and the critical path: the WORK preview
  fetched a cover at load, 635 KB → 503 KB.
- Full suite after the fixes: 1172/1173; the one failure (t-work, a tunnel card's
  contrast over its photo, 4.29:1) is on an untouched page and passed twice on rerun.
- W6 and W7 detail:
  - `src/utils/workStack.ts` is the stack's one source; `Constellation.ts` draws the
    sparks and the gathering on one canvas; `WorkRows.ts` drives the rows and
    previews; `WorkCarousel.ts` is deleted.
  - Hand-off: Space.ts calls `showWorkStack(spaceP >= 1)`, because ScrollTrigger
    counts a trigger active only strictly inside its range, so on the boundary
    scroll neither section was active and the word blinked out.
  - Phone: `.space` z-index 3 (over the flight stage) and `.anime-work` z-index 4
    (its first screen lies over space's last one).
  - The descent is 400svh: Earth disc (agy-image, the Americas side) → horizon →
    clouds → sky → meadow; `GrassField.ts` canvas in the meadow, blades off the path.
  - Harness: paradise phase 4.4 screens; new `grass-pointer` phase (desktop only).

## v6 round (2026-10-03 night, owner asleep)
Plan: `~/.claude/plans/glittery-whistling-moon.md` (X1-X8). Owner's choices: WORK as on
Vercel with the constellation as its entrance; a full-screen flash for the explosion;
painted ground with restyled grass; the live Zyp hero; the wall dissolving into stars
before the Earth; picker stopped; a clean branch for the Vercel preview.

### Required changes from the plan review (Opus, 2026-10-03)
- R1 colours: `theme-contrasted` on `.s-work` and on the dive layer; home backgrounds
  `var(--color-space)` (the anime theme's primary is near-black).
- R2 overlap: `.s-work` on the home starts one screen early (`margin-top:-100svh`,
  z-index 4 below 640 px), transparent until the hand-off (`is-on`), no `::before` line.
- R3 iOS: on the home the container is `position:sticky`, no `pinTrigger`; the timeline
  ends at `bottom top+=<container height>`.
- R4 no global refresh: static CSS section height `(100+140+n*80+60)svh` (72 below
  576 px), no `--height` write; refresh only the section's own trigger.
- R5 inputs: pause through `gsap.ticker.add/remove`; rAF instead of `Ticker.nextTick`;
  its own IntersectionObserver; `safeWidth/safeHeight` fallbacks; never `Ticker.init()`
  on the home.
- R6 covers: `prepareCoverWindow` only when near; `prepareCover` forgets a rejected decode.
- R7 ordinals and data: remove the index, `#key`, dive index and eyebrow; accent from
  `data-accent`, blurb from `data-blurb`; the home adapter supplies palette, poster and
  size for all seven; covers capped at 1280 or with a srcset.
- R8 the dive stops and restarts Lenis; t-dive wheels during a dive on `/`.
- R9 `returnScrollY`: the home reads and restores it after `worksReady`.
- R10 hand-off: `showWorkStack` re-exported from the tunnel side; space star layers dim to
  0 at progress 1.
- R11 harness: detect the home by `.rocket-flight`, `.s-work` on both routes, dive phase
  on the home. Before any X3 measurement.
- R12 tests: t-work cover regex and index drop; t-anime WORK checks on the tunnel
  markup; t-dive on `/` waits for `is-works-ready`.
- R13 explosion: one paused timeline, played on a downward crossing only, end state on a
  jump, reset below CRASH_AT − 0.02; flash is an `inset:0` opacity-only layer; burst ring
  and disc wipe deleted; the black layer ≥ 0.9 by progress 0.9; Constellation loses the
  sparks, `impactAt` and the warm band, blank threshold to 0.9; keep `.js-rocket-impact`;
  new check: shards and flash at opacity 0 1.6 s after the crossing.
- R14 invariant 4: no caller of destroy() on the home; resize adding 0 listeners is the
  measured guarantee, or a `pagehide` handler.
- R15 Zyp: the frame count is 97 (frame-count.json), not 120; no n/97 counter.
- R16 X8: exclude `public/resume.pdf` and CLAUDE.md (Tailscale IP, Mac path) from the
  public preview commit.
- Simplifications to take: WorkSection self-contained (own scroll/resize); the stack
  measured from `.s__title .js-letter` rects; the tunnel mask SVG paints nothing (drop it
  on the home in its own commit); the X4 dissolve drawn on the tunnel's own `.s__canvas`
  in a home-only DISSOLVE segment after END_HOLD.

### v6 progress
- X1 0ce0ee8: the owner's picks pinned; the duplicate certificate removed; picker
  stopped (`systemctl --user stop portfolio-picker`).
- X2 e1fe9a3: the explosion is a full-screen flash played in time; nothing scrubbed is
  left mid-air.
- X6 61b428b (Opus agent): the Zyp case page plays the site's 97 hero frames on a
  canvas, scrubbed by the scroll; the recording is gone. Below 768 px and under reduced
  motion it shows frame 1, as zyp.co does.
- X3 (v6-x3): `/` mounts the tunnel (`SWork items={workCards} home`); WorkRows and
  AnimeWork deleted. Home mode in WorkSection: own passive listeners, GSAP ticker, `is-far`
  observer with a one-screen margin, sticky container, static height, own-trigger
  refresh. The constellation lands on the tunnel's opening pose (`workStack.ts` from the
  tunnel's CSS); checked within ~1 px at 1440x900. The dive stops Lenis; the home
  restores `returnScrollY` after the intro. Card covers: the cover window is chosen from
  the scroll's progress, not the trailing timeline (a jump left later cards on their
  posters); covers up to 1440 px.
- X4 (v6-x3): after the hold, a home-only 100svh segment: the last card leaves, the
  letters fade as dust sampled from their glyphs drifts outward (WorkDust.ts, own
  canvas, drawn on progress change only), one speck lands on each star of the descent's
  field (`helpers/_stars.scss`, shared with the descent stage), and that field fades in
  under them. The descent then grows the Earth out of the same field.
- X5 (v6-x3): the descent ends on the painted land (Gemini, the sky's own picture with
  the meadow and the path), faded in while the clouds are thickest and settling with the
  grass; the SVG meadow and its flowers are gone. GrassField takes the painting's
  greens and keeps blades off the painted path (a corridor in the picture's units). The
  walk's ground is a painted seamless tile, fetched once the section is near.
- Review (/code-review high, 8 findings, all acted on): tall cuts by aspect with
  `<picture>`; the wall initialises on fonts, not `load`; covers not decoded while far
  and retried on coming near; the home's own `returnScrollY:/` key, dropped on a bfcache
  restore; the dust sampled during the hold (reads first, scan in idle) into buffers
  allocated once; the invisible grid not stroked; star tiles read from `.s__stars`.
- Perf: the home's grid drawn once and moved by its layer; the dust canvas out of the
  tree outside its segment; the settled meadow drops the sky and its mask. Phone x4
  WORK 9-35 frames over 50 ms per phase (the tunnel 11-28; v5 rows 0-2); numbers in
  CLAUDE.md and the perf commits.

## v7 round (2026-10-06, the owner on a train)
Plan: `~/.claude/plans/vectorized-imagining-gem.md` (approved 2026-10-06). The owner's brief:
a full review with the errors fixed, MHacks as a new project with a proper preview from his
photographs, the remaining lags and every transition checked by eye, and the Zyp page as the
story of the internship. His answers: photos on the Mac Desktop (`1..13.jpg`) plus four more and
three clips in Downloads; no prize, Devpost https://devpost.com/software/usher; his part: the
idea and the research, the hardware, the review and the harness, and he led the team; Zyp:
numbers and process, no internal files, no clients, the coding agents named in one measured line.

### The review (190 screenshots at 1440x900 and 390x844, the suite 1276/1277, the harness)
- Phone, rocket to space: a blank white then a flat grey screen between the bento and the
  stars at rest. Cause: the black started at 0.6 of the runway and took until 0.88; the stars
  came in at 0.9. First fix: a short scrubbed ramp from the impact. The /simplify review's
  altitude pass pointed out that any scrubbed ramp leaves a band to rest on, so the black now
  plays in with the crash, in time (0.45 s; out in 0.35 s on the way back up). /code-review then
  found that the first in-time version, inside the crash's timeline, was cut to 0 by that
  timeline's pause(0), could be left at 0 by an unkilled tween, kept will-change after an
  interrupted crash, and let the rocket reappear on black on the way up: the black has its own
  tweens now (overwrite, will-change only while one runs), is-crashed shares its hysteresis, and
  the star layers come in at CRASH_AT + 0.16 / + 0.22, past PLAY_WITHIN (`RocketFlight.ts`,
  `Space.ts`); t-anime samples the runway's progress from 0.58 and checks the crossing both ways.

### /code-review (high) on 116df8d..HEAD, 2026-10-06: 11 findings
Acted on: the black's tweens, hysteresis and will-change (above); the Usher head's centre read
in client coordinates and after a scroll (the figure is sticky); the Usher captions (one night,
not two); the Zyp label uses the project's date string; the Zyp brief without the audience's
ages and the client-side specifics (the owner's permission covered numbers and process from the
repository); `picture()` gained a srcset cap and the GDG hero uses it; t-anime exercises the
crossing. Skipped: a shared Playwright launcher for the three capture scripts (a refactor of
shots.mjs, outside this round).
- Phone, the rocket crossed the last card's text on its final S: the narrow route's tail now
  hooks in along the right edge.
- The WORK dissolve read as a lattice of dots: the star field was two tiles. Five tiles with
  periods that share no factor (`_stars.scss`, `LOOKS` in `WorkDust.ts`); a t-anime check
  samples eleven positions of the segment for drawn pixels.
- The meadow's blades and tufts read as lime clip art over the painting: the blades keep to
  the painting's greens at 0.88 alpha, the tufts to its dark green at 0.82.
- Zyp said "Software engineering intern, Summer 2026": the offer letter says Frontend
  Engineer Intern, August 2026 (docs/facts-to-confirm.md §7).
- `noindex` on every page while the site is in production: the home and the eight case
  pages index now; `sitemap.xml` and `robots.txt` are built from `projects.ts`.
- Stale `returnScrollY` (PERF-NOTES): `src/utils/returnKey.ts` parks the offset with a
  timestamp and ignores it after 30 minutes.
- The bento's hackathon card counts three now.

### The two pages
- Zyp (`src/pages/work/zyp.astro`): the live hero kept; then the brief (one job, the audience,
  six of the thirteen rules), the four weeks as a rail with the counts (36 stages, 67 PRs, 510
  commits, 28 days to launch), how the hero was made in five steps with six of the shipped
  frames, the whole globe (new capture), the rest of the page (header, trusted-by, dashboard
  band, films; the testimonial ring on the live site shows "Coming soon", so it is not shown),
  the measured table with its caveat, how the work ran (briefs, coding agents as executors, his
  review, the Safari gate, the client log), what he learned. Captures: `scripts/zyp-captures.mjs`
  → `docs/media-manifest-zyp-2.json`.
- Usher (`src/pages/work/usher.astro`, dark like SPOOT): the hero (worn, eyepiece down), the
  trigger phrase with a head from above that answers the pointer (event-driven, one transform
  and two opacities per event, the display's word only when it changes), who it is for, the
  three engines, what the judges saw (the judge app captured in its demo mode, no Pi needed),
  the numbers from the table, five troubles and what held, the frames and two clips, his part
  and the team. Media: `docs/media-manifest-usher.json` from
  `~/work/works-only/in/mwe-2026-10-06/usher/` (HLG clips tone-mapped to `_sdr/`).
- The eighth project: `projects.ts` (first), `workCards.ts` (`LOOK.usher`), `timeline.ts`,
  `tests/t-work.mjs` (8 on the home, 7 in the tunnel), `tests/t-anime.mjs` (16 wheel cards, 8
  shots, 8 case pages), `tests/t-timeline.mjs` (11), `scripts/shots.mjs`, `tests/lib.mjs`
  (ROUTES now carries zyp, gdg and usher too).
- The picker: `scripts/pick-pool.mjs` reads `in/mwe-2026-10-06/<slug>/` as a second root;
  `docs/pick-deny.json` keeps the matcha cup and the photo with two non-teammates out.

### v7 numbers (2026-10-06, this host, chromium headless, software raster; frames over 50 ms per
phase, base = the v6 build measured the same night with the same binary, headless, wheelScale)
- Phone x4: WORK open/close 9-25 (base 18-33); rocket-down 22 (base 17), rocket-up 13 (base 15);
  hero-pointer 4 (base 8); space 0-1 (base 0); paradise 0-2 (base 2-3); dive-home 5 (base 1).
  Heap +1.0 MB over 3 cycles (base +0.8), listeners flat, 18/18 scroll assertions.
- Desktop (idle floor 33 ms): WORK 144-189 (base 246-316); rocket-down 2 / up 3 (base 87 / 41, an
  outlier run); hero-pointer 28 (base 98); paradise 13-17 (base 27-19); grass-pointer 12 (base 22);
  dive-home 71 (base 52). Heap +1.9 MB over 3 cycles (base +1.3), listeners flat.
- Run-to-run spread on this host is wide (CLAUDE.md): nothing above moved outside the band the
  base runs set, and the rocket's shorter black ramp costs nothing the harness can see. The
  owner's Mac and iPhone give the verdict.
- The fix runs' 2-4 console errors were the hero wheel asking for `shots/usher*.webp` before
  `scripts/shots.mjs` had been run; the final runs show 0.
- Final (build 5, the black with its own tweens), phone x4: WORK 17-34 (base 18-33), rocket-down
  10 / up 15 (base 17 / 15), hero-pointer 6 (base 8), space 3-4 (base 0; one 100 ms frame),
  paradise 1-6 (base 2-3), dive-home 5; heap +1.0 MB over 3 cycles, listeners flat, console 0.
  Desktop (idle floor 33 ms): WORK 169-233 (base 246-316), rocket 6 / 5 (base 87 / 41), hero-pointer
  34 (base 98), paradise 31 / 13 (base 27 / 19), grass-pointer 26 (base 22), dive-home 69 (base
  52), explore-pointer 8; heap +1.9 MB over 3 cycles, listeners flat, console 0, 19/19 scroll
  assertions. Files: `perf-results/2026-10-06T03-31-02-774Z-v7-final-mobile-x4.json` and
  `…T03-34-29-614Z-v7-final-desktop.json`.
- The suite on build 4 once reported, in WebKit on the desktop home, two "Failed to load
  resource: WebKit encountered an internal error" messages; not reproduced by a scripted
  WebKit scroll-through, and absent from the build-5 run. Watch for it; the lib ignores only
  the engine's own cancellations, so a recurrence will show.

## v8 round (2026-10-06 night, the owner's notes)
- The owner's Usher picks pinned (hero desktop-8, g01 desktop-5 starred); g03 moved to
  desktop-3 so no photo shows twice; the importer caps at the listed widths, takes a
  quality, prunes on --force.
- Zyp: "software engineer intern", beside the product team (the owner's words).
- Phone: the home's sticky stages in lvh (no band under them when the toolbar hides,
  Safari and Chrome on iPhone; not checkable in Playwright).
- Phone lag (he felt it everywhere): the descent's scenery leaves the layer tree a
  screen from the descent; the rays and the tufts animate only while visible; the
  descent's trigger ends with its lvh stage. A shadow-step change was tried and
  reverted. Numbers in CLAUDE.md, "v8 numbers", and in each perf commit.
- Three /code-review rounds acted on; suite 1589 / 1589.

