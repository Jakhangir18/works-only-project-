# Zombie Walk Home: the lane scene

Plan and as-built notes for the scroll-driven three.js hero of
`/work/zombie-walk-home/` (`.claude/skills/build-animation`, phases 0-2).

## Phase 0

1. **Loop:** `gsap.ticker`, one callback, added when a scroll sets a target
   and removed when the walk has arrived and no step is still landing
   (`player.ts` does the same). No standing loop.
2. **Pause:** the scroll listener exists only while the runway intersects the
   viewport (IntersectionObserver); a hidden tab drops the callback.
3. **Kill:** `stop()` from `start()` in `StrideScene.ts`, called when the
   motion query turns to reduce and on a `pagehide` that is not a freeze.
4. **Unchanged input:** the callback is not on the ticker.

## Per-frame writes

- three: the lawn's `position.z`, the flower group's, the house group's; two
  print material colours and scales; the camera's position during a step.
- three, on a step only: one flower's instance matrix and colour.
- three, per hundredth of dawn: one material colour, four vertex colours.
- DOM, through `writeIfChanged`: the title block's opacity, transform and
  visibility; the HUD's opacity; the rail's `scaleX`.
- DOM, on change only: the step count (12 a walk), the phase class (5 a walk).

## Rest state

Progress 0 is the start poster: an inline SVG projected at build time by
`lanePoster(0)` with the scene's camera constants (`strideLane.ts`). The
canvas is opaque and fades in over it.

## Reduced motion

No runway. The hero is a still of round two, a step just landed
(`lanePoster(STILL_AT)`), and the five lines of the walk as a list.

## Decisions from the two reviews (2026-11-12)

| Decision | From |
|---|---|
| Twelve steps in three rounds of four, not twenty-four | motion review: two bursts per wheel notch otherwise |
| A step is played in time (420 ms), not scrubbed; a pressed flower is state | motion review: a parked scroll left petals in mid-air |
| Stage sticks under the case bar, not at 0 | motion review: the canvas stays clear of the bar's glass |
| Runway in CSS from first paint; folded only when the scene cannot run | system review: a script-added runway breaks reload in range |
| A timed pre-reveal draw (30 ms) instead of a frame-rate watchdog | system review: ticker deltas measure vsync; Low Power Mode fails every phone |
| Own projection in `strideLane.ts`, no three import | system review: a shared module must not drag three into the eager graph |
| Size, camera and draw in one ResizeObserver callback | system review, CLAUDE.md 8 |
| No ScrollTrigger: progress from `scrollY` against cached geometry | start and end do not depend on the viewport height a phone's toolbar changes |

## Deviations from the first plan

- The lane's box is a column beside the text on a desktop, not full-bleed:
  half the pixels, and no text over the canvas there.
- No sky: the camera looks at the floor, as the projector does.

## Second pass (2026-11-13): readable, and the game's own characters

The owner on the first version: it must be clear what is happening, and
easy to read.

- Flowers, footprints and the cottage are the game's own SVGs (copies in
  `public/projects/zombie-walk-home/art`), as textures in the scene and as
  inlined symbols in the posters. A flower stands on the lawn facing the
  walker; a step puts it over on its back.
- A flower comes out of the dark by opacity (`flowerShown`), in the scene
  and in the poster alike, so the two still agree.
- Per-frame writes added: twelve material opacities (the flowers), two more
  (the prints). Removed: the instance matrix and colour writes.
- New section "What you are looking at": a drawing of the rig (Higgsfield,
  `gpt_image_2_6`, 0.5 credits for two variants, the owner picked the
  first) with five numbered pins placed by eye.
- Hero: "Scroll to walk", two tags on the picture (desktop), an icon beside
  each of the walk's five lines, larger small type on the whole page.

## Not verified

- Real Safari on an iPhone (the PR lists the checks).
- Frame timing: the harness has no phase for this route yet.
