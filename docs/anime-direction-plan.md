# Anime home, round three: black space, bigger figure, 21st-style motion, honest copy

Owner's direction, 2026-10-02, after reviewing the hero and the space sequence
(d499067 → ba1ee86) against s0animation.com/design. Decisions taken with him:

| Question | Answer |
|---|---|
| "Work from GitHub" | the dark GitHub look, not repository cards |
| Rocket "flies to here" (the bento footer) | the burst begins directly under that footer |
| 21st.dev animations | split-text reveal; shimmer + magnetic buttons; spotlight + border beam on the cards |
| Fonts | Google Fonts allowed; Geist self-hosted as the text face |
| The character against black space | the intro cover goes black too: black → white hero → black space |
| Lab entry | start 2026-06, `status: "in progress"`, wording: "MuJoCo simulation of a robot arm and hand: RL in MuJoCo Playground, imitation learning with LeRobot and ACT, VR teleoperation on a Quest. In progress." |

The full commit sequence, copy strings and star-drift math are in the approved
plan (`~/.claude/plans/lively-crunching-garden.md`, 2026-10-02); this file keeps
the composition answers the `build-animation` skill asks for, and the as-built
record.

## Phase 0 — composition, per animation

**Figure tilt (C9).** Loop: the hero's existing `gsap.ticker` callback in
`AnimeHero.ts`; the figure is one more leaf transform written there. Pauses:
the same IntersectionObserver and `visibilitychange` that stop the wheel. Kills:
`destroyAnimeHero()` nulls the reference. Unchanged input: the write is skipped
under 0.01° of change.

**Star drift (B6).** Loop: one ScrollTrigger on the space section
(`Space.ts`), `onUpdate` only. Pauses: ScrollTrigger calls `onUpdate` only inside
its range. Kills: `destroySpace()`. Unchanged input: a last-value map per
element and property; nothing is rewritten.

**Split-text reveal (D11).** Loop: none — a CSS transition on the compositor,
fired once by an IntersectionObserver that unobserves each heading. Pauses: by
being one-shot. Kills: `disconnect()` once every heading is in.

**Shimmer (D12).** Loop: none — one compositor keyframe iteration on
hover/focus/`.is-in`. Nothing to pause or kill.

**Magnetic (D12).** Loop: `gsap.quickTo` tweens on `gsap.ticker`, existing only
after pointer input and finished within 0.6 s of it. Pauses: no input, no tween.
Kills: `destroyMagnetic()` removes the listeners and kills the tweens. Gated to
`(hover: hover) and (pointer: fine)`.

**Spotlight + border beam (D13).** Loop: `quickTo` on the spot's own transform
(ticker); the beam is a compositor animation declared only under `:hover` plus
one lap on `.is-in`. Pauses: no hover, no tween, no animation. Kills:
`destroyBentoGlow()` removes the one delegated listener and kills the tweens.
Never a custom property on the card (invariant 2).

## Per-frame write list (whole page, after this work)

- Hero: wheel `transform`; 14 cards `--turn` (leaf); figure `transform` (new).
- Rocket: craft `--x/--y/--a`; wipe `--wipe`; burst `--burst`.
- Space: two layers, `transform` and `opacity` each (replaces `--drift`).
- Pointer-driven only: one magnetic button's `transform`; one spotlight's
  `transform` (and `opacity` while fading).

No ancestor is written. No layout property moves.

## Rest state

The hero at rest is the hero as shipped, with the bigger figure still. The
rocket section at rest is the white page under the bento footer. The space
section at rest (progress 0) is transparent over the rocket section with both
star layers at opacity 0. Work at rest is its black canvas with a static star
tail.

## Reduced motion

Figure: bigger and still. Stars: static field at opacity 1 on a solid ground,
no sticky stage. Headings: opacity .5 → 1 over 300 ms. Buttons: the hover fill,
no sweep, no pull. Cards: a static centred glow and an accent border on hover.
Same destinations, no travel.

## As built / deviations

Filled in per group as the work lands.
