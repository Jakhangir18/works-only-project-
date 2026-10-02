/**
 * Lays a line of text on the inside of a vertical cylinder and projects it the
 * way the hero's CSS 3D wheel is projected, so a word can wrap like the
 * carousel without being a 3D layer.
 *
 * This runs at build time, in the component's frontmatter. The output is one
 * static SVG <text> per glyph with a translate and a scale: no layer per
 * letter, no transform written per frame, nothing for the compositor to
 * re-blend while the wheel turns. The cost of the curve is paid once, by the
 * build.
 *
 * Geometry, in CSS conventions (x right, y down, z toward the viewer), with
 * the origin at the perspective origin — the centre of the stage:
 *   - The cylinder is concave and its far side faces the viewer: a glyph at
 *     angle θ sits at x = R·sin θ and z = −depth + R·(1 − cos θ), so the
 *     middle of a run is the deepest point and its ends come forward and grow,
 *     like the wheel's cards.
 *   - The scene is tilted by rotateX(tilt), the wheel's resting tilt.
 *   - A point projects by P / (P − z).
 * A glyph's horizontal scale is the projected width of its own slice of arc
 * over its natural advance, and its vertical scale the projected height of
 * its cap over the cap height; both are measured, not approximated by cos θ.
 * Its skew is the slope the curve has across it, so a run reads as one line
 * bending with the ring rather than as a staircase of level glyphs.
 */

export type CylinderFont = {
  /** Advance width per glyph, in thousandths of the font size. */
  advances: Record<string, number>;
  /** Used for any glyph not in `advances` (and for every glyph of a mono face). */
  defaultAdvance: number;
  /** Cap height in thousandths of the font size. */
  capHeight: number;
};

export type Cylinder = {
  /** CSS-px perspective distance. */
  perspective: number;
  /** Degrees, the same sign convention as CSS rotateX. */
  tilt: number;
  radius: number;
  /** How far behind the projection plane the deepest point of the run sits. */
  depth: number;
  fontSize: number;
  /** A static horizontal squeeze applied to every glyph, 1 = the face's own width. */
  condense?: number;
  /** Extra space between glyphs, in ems. */
  tracking?: number;
  font: CylinderFont;
};

export type Glyph = {
  char: string;
  /** Baseline centre, projected. */
  x: number;
  y: number;
  /** Scale to apply to a glyph drawn at `fontSize` with text-anchor middle. */
  sx: number;
  sy: number;
  /** Degrees of skewY that lays the glyph along the projected curve: the mean
   * slope of its baseline and its cap line across its own width. A skew, not a
   * rotation, so its verticals stay vertical, as they do on the wheel's cards. */
  skew: number;
  /** 0 at the deepest point of the run, 1 at its nearest. For atmospheric tone. */
  near: number;
};

/** Where the run is anchored: it begins at the angle, ends at it, or is centred on it. */
export type Align = "start" | "end" | "center";

const round = (n: number, places = 2) => Number(n.toFixed(places));

export function layoutRun(
  text: string,
  /** Radians, positive to the right of centre. */
  anchor: number,
  align: Align,
  /** Baseline height in scene units, negative above the perspective origin. */
  baseline: number,
  c: Cylinder,
): Glyph[] {
  const { perspective: P, radius: R, depth, fontSize: F, font } = c;
  const condense = c.condense ?? 1;
  const tracking = (c.tracking ?? 0) * F;
  const a = (c.tilt * Math.PI) / 180;
  const cap = (font.capHeight / 1000) * F;

  const project = (x: number, y: number, z: number) => {
    const ty = y * Math.cos(a) - z * Math.sin(a);
    const tz = y * Math.sin(a) + z * Math.cos(a);
    const s = P / (P - tz);
    return { x: x * s, y: ty * s, z: tz };
  };
  const at = (theta: number, y: number) =>
    project(R * Math.sin(theta), y, -depth + R * (1 - Math.cos(theta)));

  const chars = [...text];
  const widths = chars.map((ch) => ((font.advances[ch] ?? font.defaultAdvance) / 1000) * F);
  const arc = widths.reduce((sum, w) => sum + w * condense, 0) + tracking * (chars.length - 1);
  const span = arc / R;
  let cursor = align === "start" ? anchor : align === "end" ? anchor - span : anchor - span / 2;

  const deepest = -depth;
  const nearest = -depth + R * (1 - Math.cos(Math.max(Math.abs(cursor), Math.abs(cursor + span))));

  const glyphs: Glyph[] = [];
  chars.forEach((char, i) => {
    const slice = (widths[i] * condense) / R;
    const mid = cursor + slice / 2;
    if (char.trim()) {
      const left = at(cursor, baseline);
      const right = at(cursor + slice, baseline);
      const base = at(mid, baseline);
      const top = at(mid, baseline - cap);
      const topLeft = at(cursor, baseline - cap);
      const topRight = at(cursor + slice, baseline - cap);
      const slope = ((right.y - left.y) / (right.x - left.x) + (topRight.y - topLeft.y) / (topRight.x - topLeft.x)) / 2;
      const zMid = -depth + R * (1 - Math.cos(mid));
      glyphs.push({
        char,
        x: round(base.x),
        y: round(base.y),
        sx: round((right.x - left.x) / widths[i], 4),
        sy: round((base.y - top.y) / cap, 4),
        skew: round((Math.atan(slope) * 180) / Math.PI, 3),
        near: nearest === deepest ? 1 : round((zMid - deepest) / (nearest - deepest), 3),
      });
    }
    cursor += slice + tracking / R;
  });
  return glyphs;
}

/** Bigger Display, measured in Chromium at 1000px (getComputedTextLength). */
export const BIGGER_DISPLAY: CylinderFont = {
  advances: { J: 368, A: 368, K: 400, H: 368, N: 400, G: 368, I: 160, R: 368, T: 368, Y: 400, S: 368, M: 525, O: 368, V: 368 },
  defaultAdvance: 368,
  capHeight: 797,
};

/** Fraktion Mono: every glyph, the space included, advances 600. */
export const FRAKTION_MONO: CylinderFont = {
  advances: {},
  defaultAdvance: 600,
  capHeight: 688,
};
