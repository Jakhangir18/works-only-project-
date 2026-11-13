/**
 * The walking lane of the Zombie Walk Home case page, as numbers.
 *
 * One description, two readers. The page's frontmatter projects it into the
 * static SVG posters at build time (lanePoster below); the browser hands the
 * same constants to three.js (StrideScene.ts). Both draw the same camera, the
 * same tiles and the same flowers, so the canvas can fade in over a picture
 * that is already the scene's first frame, and a poster is the whole hero
 * where the scene does not run.
 *
 * Nothing here imports three or touches the DOM: the projection is the
 * ordinary perspective one (look-at basis, vertical field of view), written
 * out, so a build never depends on a WebGL library to draw a picture.
 *
 * Units are metres on the floor, more or less. The floor is y = 0, the lane
 * runs away from the walker along -z, and the hit line is z = 0. The walk is
 * a pure function of `d`, the distance walked: a flower meant for distance
 * `at` sits at z = -(at - d), reaches the line when d = at, and from then on
 * lies pressed into the lawn and slides back under the walker. Scrolling
 * back stands it up again. Only the moment of the step is played in time
 * rather than by distance (StrideScene.ts), so a parked scroll never leaves
 * something hanging half way.
 *
 * The picture is the project's own: a lawn of two lanes thrown onto the
 * floor of a dark room by a projector, seen from where the walker stands.
 * So there is no sky and no light in it, only flat colour on black, and a
 * porch light at the far end.
 */

export type Vec3 = readonly [number, number, number];
export type CameraSpec = { position: Vec3; target: Vec3; fov: number; near: number; far: number };

/* The page's dark ground (CaseLayout's --case-ground). The scene clears to
   it and fogs to it, so the stage has no edge against the page. */
export const NIGHT = "#08080a";

/* The project's own palette (its docs/ART_DIRECTION.md): a lawn in two
   greens, marigold, rose, bell violet, a warm gold, and white tape. */
export const COLORS = {
  lawnA: "#58b83c",
  lawnB: "#3e962f",
  tape: "#f3f1e6",
  marigold: "#ffb21e",
  rose: "#ff3d8b",
  bell: "#a46bff",
  gold: "#ffd76a",
  heart: "#2a1a08",
  print: "#2de2ff",
  printRest: "#1d5360",
  houseWall: "#3a2d5c",
  houseRoof: "#7a56d6",
  porch: "#ffd76a",
  dawnGlow: "#ff9a5c",
} as const;

export const LANE_X = [-0.56, 0.56] as const;
export const LANE_WIDTH = 1.04;
export const TILE = 1.2;
/** Tile rows drawn ahead of the hit line, and behind it (under the walker).
 *  Two behind puts the lawn's near end below the bottom of the frame at any
 *  box shape, so the lane runs out of the picture rather than stopping in
 *  it; the page fades that edge into the ground. */
export const ROWS_AHEAD = 20;
export const ROWS_BEHIND = 2;
export const LAWN_NEAR = ROWS_BEHIND * TILE;
export const LAWN_FAR = -ROWS_AHEAD * TILE;
export const FOG_NEAR = 8.5;
export const FOG_FAR = 25;

export const FLOWER_RADIUS = 0.34;
export const GOLD_SCALE = 1.28;
export const PETALS = 8;
/** A flower that has been stepped on lies flat: wider, and most of the way
 *  to the lawn's own green. */
export const PRESSED_SCALE = 1.22;
export const PRESSED_FADE = 0.62;
/** Metres a footprint stays lit after its step. */
export const STEP_GLOW = 1.5;

/* One framing for every stage: the lane's box is never wider than it is
   tall (the stylesheet caps it), so a phone's slot and a desktop's column
   are the same picture, cropped at the sides. The camera stands where the
   walker's head is and looks down the lane, low enough that the porch light
   at the far end is inside the frame from the first step. */
export const CAMERA: CameraSpec = { position: [0, 4.3, 5.2], target: [0, 0, -3.4], fov: 50, near: 0.1, far: 90 };
/** The posters' box: square, the widest the lane's box can be, so
 *  `preserveAspectRatio="xMidYMid slice"` fits the height and crops the
 *  sides, exactly what a fixed vertical field of view does on a canvas. */
export const POSTER = { width: 1000, height: 1000 };

export type FlowerKind = "marigold" | "rose" | "bell" | "gold";
export type Flower = { lane: 0 | 1; at: number; kind: FlowerKind; round: 1 | 2 | 3 };

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/* Three rounds of four, each a little faster (the gaps tighten), a rest
   between them, flowers alternating feet, the fourth of every four golden:
   the rules as the project's README and its Devpost draft state them.
   Twelve steps, not more: at the runway's length each one gets room to land
   before the next arrives (the motion review, 2026-11-12). */
const FIRST = 6.9;
const GAPS = [3.6, 2.8, 2.15] as const;
const REST = 5;
export const PER_ROUND = 4;
const HOME_STRETCH = 4.2;
const KINDS: readonly FlowerKind[] = ["marigold", "bell", "rose"];

function schedule(): { flowers: Flower[]; rounds: { from: number; to: number }[]; total: number } {
  const flowers: Flower[] = [];
  const rounds: { from: number; to: number }[] = [];
  let at = FIRST;
  let n = 0;
  GAPS.forEach((gap, r) => {
    const from = at - gap * 0.5;
    for (let i = 0; i < PER_ROUND; i++) {
      n++;
      flowers.push({ lane: (n % 2) as 0 | 1, at, kind: n % 4 === 0 ? "gold" : KINDS[n % KINDS.length], round: (r + 1) as 1 | 2 | 3 });
      if (i < PER_ROUND - 1) at += gap;
    }
    rounds.push({ from, to: at + gap * 0.5 });
    at += REST;
  });
  return { flowers, rounds, total: at - REST + HOME_STRETCH };
}

const PLAN = schedule();
export const FLOWERS: readonly Flower[] = PLAN.flowers;
export const ROUNDS: readonly { from: number; to: number }[] = PLAN.rounds;
/** Metres from the first frame to the door. */
export const TOTAL = PLAN.total;
/** The walk ends at this share of the runway's scroll; the rest is a still
 *  hold, so the stage lets go of the screen with nothing moving in it. */
export const WALK_END = 0.92;
/** The title gives way to the walk over this share of the runway. */
export const TITLE_END = 0.12;
/** Where the house's doorstep is, in metres of walk: it comes out of the
 *  dark over the last stretch and stops just past the hit line. */
export const HOUSE_AT = TOTAL + 2.6;
/** The porch light: the one thing that shows through the dark from the
 *  first frame, so the walk has somewhere to go. Height above the floor. */
export const PORCH_Y = 1.3;
export const PORCH_RADIUS = 0.24;
/** The lawn starts to warm here: sunrise is near. */
export const DAWN_FROM = ROUNDS[2].from;

/** Scroll progress along the runway, 0 to 1, to metres walked. */
export const distanceAt = (progress: number) => TOTAL * clamp01(progress / WALK_END);

/** Steps landed by distance `d`: the flowers already at or past the line. */
export function stepsLanded(d: number): number {
  let n = 0;
  for (const f of FLOWERS) if (f.at <= d) n++;
  return n;
}

/** How far the dawn has come at distance `d`, 0 to 1. */
export const dawnAt = (d: number) => smooth((d - DAWN_FROM) / (TOTAL - DAWN_FROM));

/** How lit a lane's print is at distance `d`: 1 on the step, fading over
 *  STEP_GLOW metres. */
export function printGlow(lane: number, d: number): number {
  let last = -Infinity;
  for (const f of FLOWERS) if (f.lane === lane && f.at <= d) last = f.at;
  return 1 - clamp01((d - last) / STEP_GLOW);
}

/** Where the checkerboard has slid to at distance `d`: the pattern repeats
 *  every two rows, so the lawn only ever moves by less than that. */
export const lawnShift = (d: number) => d % (2 * TILE);

/** The five things the walk says, in order. The page prints them as a list;
 *  the running scene shows the one for where the walker is. */
export const PHASES = [
  { key: "warm-up", label: "Warm-up", caption: "Walk at a steady pace. The game learns your normal step." },
  { key: "round-1", label: "Round 1 of 3", caption: "Flowers come down two lanes, one per foot, on a beat." },
  { key: "round-2", label: "Round 2 of 3", caption: "The fourth flower is golden. Each round is a little faster." },
  { key: "round-3", label: "Round 3 of 3", caption: "The last round. Home is at the end of the lane." },
  { key: "home", label: "Home", caption: "Home before sunrise." },
] as const;

/** Which of PHASES distance `d` is in. */
export function phaseAt(d: number): number {
  if (d >= ROUNDS[2].to) return 4;
  for (let r = 2; r >= 0; r--) if (d >= ROUNDS[r].from) return r + 1;
  return 0;
}

/* ---------- colour ---------- */

type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const parse = (hex: string): RGB => [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as RGB;
const format = (rgb: RGB) =>
  "#" +
  rgb
    .map((c) =>
      Math.round(clamp01(toSrgb(c)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** Mixes two hex colours in linear light, the way the renderer mixes fog. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [parse(a), parse(b)];
  return format(x.map((c, i) => c + (y[i] - c) * clamp01(t)) as RGB);
}

/** How much each channel of the lawn gains, in linear light, by full dawn:
 *  the two greens go to a low sun's yellow-green. One multiplier for the
 *  whole lawn, so the scene warms it with a single material colour. */
export const DAWN_GAIN = [5.2, 1.4, 2.6] as const;

/** A lawn colour at `dawn` (0 to 1): the colour times the gain so far. */
export function warm(hex: string, dawn: number): string {
  return format(parse(hex).map((c, i) => c * (1 + (DAWN_GAIN[i] - 1) * clamp01(dawn))) as RGB);
}

/** three's linear Fog: a smoothstep of the view depth between near and far. */
export const fogAt = (depth: number) => smooth((depth - FOG_NEAR) / (FOG_FAR - FOG_NEAR));

/* ---------- projection ---------- */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export type Projected = { x: number; y: number; depth: number };

/** A point in the scene to a point in a `width` x `height` picture, with its
 *  view depth (metres in front of the camera) for the fog and the draw order. */
export function projector(cam: CameraSpec, width: number, height: number): (p: Vec3) => Projected {
  const forward = unit(sub(cam.target, cam.position));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const aspect = width / height;
  return (p) => {
    const v = sub(p, cam.position);
    const depth = Math.max(cam.near, dot(v, forward));
    const nx = dot(v, right) / (depth * tan * aspect);
    const ny = dot(v, up) / (depth * tan);
    return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height, depth };
  };
}

/* ---------- shapes both readers share ---------- */

/** A flower's petals as circles round its heart, in the flower's own floor
 *  plane: [x, z, radius] for a flower of radius 1. */
export const PETAL_RING: readonly (readonly [number, number, number])[] = Array.from({ length: PETALS }, (_, k) => {
  const a = (k / PETALS) * Math.PI * 2;
  return [Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.4] as const;
});
export const HEART_RADIUS = 0.36;

/** A shoe print in two parts, toe toward -z, for a print one unit long:
 *  the sole and the heel, each an ellipse [x, z, rx, rz]. */
export const PRINT_PARTS = [
  [0, -0.16, 0.24, 0.34],
  [0, 0.36, 0.17, 0.14],
] as const;
export const PRINT_LENGTH = 0.66;
/** The prints wait this far on the walker's side of the hit line. */
export const PRINT_Z = 0.68;
/** Half the white tape's length across both lanes, and half its width. */
export const TAPE_HALF = LANE_X[1] + LANE_WIDTH / 2 + 0.06;
export const TAPE_DEPTH = 0.07;

/** An ellipse on the floor as a closed ring of points. */
export function floorEllipse(cx: number, cz: number, rx: number, rz: number, n = 16): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, 0, cz + Math.sin(a) * rz] as const;
  });
}

/* ---------- the posters ---------- */

export type PosterShape = { points: string; fill: string };

/** The scene at distance `d` as flat SVG polygons, back to front, drawn with
 *  the scene's own camera. At 0 it is the frame the canvas opens on; further
 *  along it is the still the page shows where nothing may move. */
export function lanePoster(d = 0, cam: CameraSpec = CAMERA, box: { width: number; height: number } = POSTER): PosterShape[] {
  const project = projector(cam, box.width, box.height);
  const shapes: (PosterShape & { depth: number; layer: number })[] = [];
  const push = (points: Vec3[], colour: string, layer: number, fog = true) => {
    const pr = points.map(project);
    const depth = pr.reduce((sum, p) => sum + p.depth, 0) / pr.length;
    shapes.push({
      points: pr.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      fill: fog ? mix(colour, NIGHT, fogAt(depth)) : colour,
      depth,
      layer,
    });
  };
  const dawn = dawnAt(d);

  // The porch light, upright at the end of the lane, through the dark.
  const hz = -(HOUSE_AT - d);
  push(
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2;
      return [Math.cos(a) * PORCH_RADIUS, PORCH_Y + Math.sin(a) * PORCH_RADIUS, hz] as const;
    }),
    COLORS.porch,
    0,
    false,
  );

  // The lawn: a checkerboard of two greens down both lanes, slid toward the
  // walker by the distance and cut at the lane's two ends.
  const shift = lawnShift(d);
  for (let row = -ROWS_BEHIND - 2; row < ROWS_AHEAD; row++) {
    const z0 = Math.min(LAWN_NEAR, -row * TILE + shift);
    const z1 = Math.max(LAWN_FAR, -row * TILE - TILE + shift);
    if (z0 - z1 < 0.01) continue;
    for (let lane = 0; lane < 2; lane++) {
      const x0 = LANE_X[lane] - LANE_WIDTH / 2;
      const x1 = LANE_X[lane] + LANE_WIDTH / 2;
      const odd = (((row + lane) % 2) + 2) % 2 === 1;
      push(
        [
          [x0, 0, z0],
          [x1, 0, z0],
          [x1, 0, z1],
          [x0, 0, z1],
        ],
        warm(odd ? COLORS.lawnB : COLORS.lawnA, dawn),
        1,
      );
    }
  }
  // The flowers in sight: whole ahead of the line, pressed flat behind it.
  for (const f of FLOWERS) {
    const z = -(f.at - d);
    if (z < LAWN_FAR || z > LAWN_NEAR - 0.2) continue;
    const pressed = d >= f.at;
    const r = FLOWER_RADIUS * (f.kind === "gold" ? GOLD_SCALE : 1) * (pressed ? PRESSED_SCALE : 1);
    const x = LANE_X[f.lane];
    const colour = pressed ? mix(COLORS[f.kind], COLORS.lawnB, PRESSED_FADE) : COLORS[f.kind];
    for (const [px, pz, pr] of PETAL_RING) push(floorEllipse(x + px * r, z + pz * r, pr * r, pr * r, 12), colour, 2);
    if (!pressed) push(floorEllipse(x, z, HEART_RADIUS * r, HEART_RADIUS * r, 12), COLORS.heart, 2.5);
  }
  // The hit line and the two prints, lit by the last step in their lane.
  push(
    [
      [-TAPE_HALF, 0, TAPE_DEPTH],
      [TAPE_HALF, 0, TAPE_DEPTH],
      [TAPE_HALF, 0, -TAPE_DEPTH],
      [-TAPE_HALF, 0, -TAPE_DEPTH],
    ],
    COLORS.tape,
    3,
  );
  for (let lane = 0; lane < 2; lane++) {
    const colour = mix(COLORS.printRest, COLORS.print, printGlow(lane, d));
    for (const [x, z, rx, rz] of PRINT_PARTS) {
      push(floorEllipse(LANE_X[lane] + x * PRINT_LENGTH, PRINT_Z + z * PRINT_LENGTH, rx * PRINT_LENGTH, rz * PRINT_LENGTH), colour, 4);
    }
  }
  // Farthest first inside a layer, layers in order: a painter's sort.
  shapes.sort((a, b) => a.layer - b.layer || b.depth - a.depth);
  return shapes.map(({ points, fill }) => ({ points, fill }));
}

/** The still for where nothing may move: round two, a step just landed. */
export const STILL_AT = FLOWERS[5].at + 0.35;
