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
- W1 1074f0d: Co-President since spring 2026; GDG figures 200+ / 22 meetings / 6 → 70;
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
