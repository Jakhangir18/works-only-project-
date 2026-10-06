/**
 * The vertical W / O / R / K stack: where the star field's constellation
 * lands (Constellation.ts) and where WORK's letter tunnel opens (SWork.astro,
 * WorkSection.ts). One source for the canvas, because the hand-off swaps one
 * for the other in a single frame and they must sit on the same pixels.
 *
 * The tunnel's stylesheet holds these numbers; keep them in step:
 *   - the letters: `font-size: min(18.75rem, 25lvh)` on the home (FONT_REM,
 *     FONT_VH), `line-height: 0.85` (LINE), in a column centred in the
 *     100lvh stage; `h` is that stage's height, read from the page;
 *   - the scene: WorkSection's timeline starts it at `scale: 0.75`
 *     (SCENE_START) about the stage's centre.
 * The stack cannot be measured from the page instead: while WORK is far
 * away its scene is out of the layer tree, and the constellation needs the
 * points before WORK is anywhere near.
 */

export const STACK = ["W", "O", "R", "K"] as const;

const FONT_REM = 18.75;
const REM = 16;
const FONT_VH = 0.25;
const LINE = 0.85;
const SCENE_START = 0.75;

/** The stack in a w x h stage: the letters' size and each row's centre. */
export function workStack(w: number, h: number): { size: number; x: number; rows: number[] } {
  const size = Math.min(FONT_REM * REM, FONT_VH * h) * SCENE_START;
  const row = LINE * size;
  return {
    size,
    x: w / 2,
    rows: STACK.map((_, i) => h / 2 + (i - (STACK.length - 1) / 2) * row),
  };
}
