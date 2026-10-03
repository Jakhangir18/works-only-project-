/**
 * The vertical W / O / R / K stack: where the star field's constellation
 * lands (Constellation.ts) and where the WORK section's rows begin
 * (AnimeWork.astro, WorkRows.ts). One source for both, because the hand-off
 * swaps one for the other in a single frame and they must sit on the same
 * pixels.
 *
 * The stylesheet repeats these numbers; keep them in step:
 *   - the rows: `padding: 6svh 0` and four equal rows (PAD below);
 *   - the letters: `font-size: clamp(56px, min(19svh, 30vw), 190px)` and
 *     `line-height: 1` (letterSize below).
 * The stack cannot be measured from the page instead: while WORK is far
 * away its stage is out of the layer tree, and the constellation needs the
 * points before WORK is anywhere near.
 */

export const STACK = ["W", "O", "R", "K"] as const;

/* Space above the first row and below the last, as a fraction of the height. */
const PAD = 0.06;

export function letterSize(w: number, h: number): number {
  return Math.min(190, Math.max(56, Math.min(0.19 * h, 0.3 * w)));
}

/** The stack in a w x h stage: the letters' size and each row's centre. */
export function workStack(w: number, h: number): { size: number; x: number; rows: number[] } {
  const rowH = (h * (1 - 2 * PAD)) / STACK.length;
  return {
    size: letterSize(w, h),
    x: w / 2,
    rows: STACK.map((_, i) => h * PAD + (i + 0.5) * rowH),
  };
}
