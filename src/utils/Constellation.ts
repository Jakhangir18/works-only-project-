import { gsap } from "gsap";
import { STACK, workStack } from "./workStack";

/**
 * The constellation: the star field gathers into the word WORK, the way the
 * WORK section opens (the owner's choice, 2026-10-03).
 *
 * One canvas over the space stage. Space.ts owns the triggers and hands this
 * module two progress values: the runway's (the rocket's crash lives there)
 * and the space section's. Everything drawn is a pure function of those two
 * and of the geometry measured on refresh, so a frame is drawn only when one
 * of them changed (the dirty flag), from the GSAP ticker, and only while the
 * space or runway trigger is active. Nothing animates on its own.
 *
 *   - The field: the stars fade in as the page finishes turning to space,
 *     at fixed places of a seeded scatter. (v5 also flew sparks out of the
 *     impact here; scrubbed by the scroll, they hung still whenever the
 *     reader stopped, and the owner read them as frozen debris. The crash
 *     plays in time now, in RocketFlight.ts.)
 *   - The gathering: over the second half of the held screen each star, on
 *     its own staggered clock, eases to a point sampled from the stack's
 *     glyphs; then solid letters, drawn with the same font at the same
 *     place, take over from the dots. WORK's own DOM letters replace the
 *     canvas on the frame the space section lets go (Space.ts onLeave).
 *
 * Cost per drawn frame: one clear, one path of squares per brightness band
 * (four bands) and, at the end, four fillText calls. No shadowBlur. The
 * device pixel ratio is capped at 2.
 */

const STARS_WIDE = 420;
const STARS_NARROW = 220;
const NARROW_BELOW = 640;
const BANDS = 4;
/* In the runway's progress: the field comes in as the black completes. */
const FIELD_FROM = 0.9;

type Star = {
  /* Field position. */
  x: number;
  y: number;
  /* Target on the glyphs, and this star's slot in the gathering. */
  tx: number;
  ty: number;
  delay: number;
  size: number;
  base: number;
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let W = 0;
let H = 0;
let dpr = 1;
let family = "sans-serif";
let stars: Star[] = [];
let stack = workStack(1, 1);
let sampled = false;
let runway = 0;
let space = 0;
let gatherFrom = 0.6;
const GATHER_TO = 0.93;
let dirty = false;
let ticking = false;
/* The canvas holds nothing: a frame with nothing to draw skips the clear. */
let blank = true;
let generation = 0;

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* Numerical Recipes' LCG, seeded, so the scatter is the same on every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function letterFont(): string {
  return `700 ${stack.size}px ${family}`;
}

/* The alphabetic baseline that puts a glyph's line box centred on y, the
   way `line-height: 1` centres the content area in the DOM rows. */
function baselineFor(c: CanvasRenderingContext2D, y: number): number {
  const m = c.measureText("W");
  const a = m.fontBoundingBoxAscent ?? stack.size * 0.8;
  const d = m.fontBoundingBoxDescent ?? stack.size * 0.2;
  return y + (a - d) / 2;
}

/* Points on the glyphs, from an offscreen canvas drawn once per refresh. */
async function sampleTargets(gen: number): Promise<void> {
  try {
    await document.fonts.load(letterFont());
  } catch {
    /* The fallback face still gives a word. */
  }
  if (gen !== generation || !W || !H) return;
  const off = document.createElement("canvas");
  off.width = Math.ceil(W);
  off.height = Math.ceil(H);
  const o = off.getContext("2d", { willReadFrequently: true });
  if (!o) return;
  o.font = letterFont();
  o.textAlign = "center";
  o.textBaseline = "alphabetic";
  o.fillStyle = "#fff";
  STACK.forEach((letter, i) => o.fillText(letter, stack.x, baselineFor(o, stack.rows[i])));
  const data = o.getImageData(0, 0, off.width, off.height).data;
  // Every pixel inside a glyph on a grid fine enough to give each star its
  // own point; the grid's step follows the letters' size.
  const step = Math.max(2, Math.round(stack.size / 26));
  const inside: [number, number][] = [];
  for (let y = 0; y < off.height; y += step) {
    for (let x = 0; x < off.width; x += step) {
      if (data[(y * off.width + x) * 4 + 3] > 140) inside.push([x, y]);
    }
  }
  // iOS caps the memory all canvases may hold: give this one's back now.
  off.width = 0;
  off.height = 0;
  if (gen !== generation || !inside.length) return;
  const pick = rng(4242);
  for (let i = inside.length - 1; i > 0; i--) {
    const j = Math.floor(pick() * (i + 1));
    [inside[i], inside[j]] = [inside[j], inside[i]];
  }
  stars.forEach((s, i) => {
    const [tx, ty] = inside[i % inside.length];
    s.tx = tx;
    s.ty = ty;
  });
  sampled = true;
  dirty = true;
}

function build(): void {
  const n = W < NARROW_BELOW ? STARS_NARROW : STARS_WIDE;
  const r = rng(20261003);
  stars = Array.from({ length: n }, () => ({
    x: r() * W,
    y: r() * H,
    tx: W / 2,
    ty: H / 2,
    delay: r(),
    size: 1 + r() * 1.6,
    base: 0.25 + r() * 0.6,
  }));
}

/* The canvas at the stage's size. Assigning width or height resets the
   whole 2D context (invariant 8), so its state is set again right here. */
export function resizeConstellation(w: number, h: number): void {
  if (!canvas) return;
  W = w;
  H = h;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  blank = true;
  ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
  }
  stack = workStack(w, h);
  build();
  sampled = false;
  generation++;
  void sampleTargets(generation);
  dirty = true;
}

function draw(): void {
  if (!ctx || !canvas) return;
  // Across most of the runway nothing is out yet, and at the end the canvas
  // is cleared for WORK: a blank frame after a blank frame touches nothing.
  // (The space section's own progress is already moving over the runway, so
  // only the gathering's start says the field has anything to gather.)
  const nothing = space >= 1 || (runway < FIELD_FROM && space < gatherFrom);
  if (nothing && blank) return;
  ctx.clearRect(0, 0, W, H);
  blank = true;
  if (nothing) return;
  blank = false;

  const fieldIn = ramp(runway, FIELD_FROM, 1);
  const gather = sampled ? ramp(space, gatherFrom, GATHER_TO) : 0;
  const window_ = 0.55;
  const solid = sampled ? ramp(space, GATHER_TO - 0.03, 0.985) : 0;
  const dotsOut = 1 - ramp(space, 0.95, 0.995);

  const bands: number[][] = Array.from({ length: BANDS }, () => []);
  for (const s of stars) {
    if (fieldIn <= 0) continue;
    let x = s.x;
    let y = s.y;
    let a = fieldIn * s.base;
    if (gather > 0) {
      const t = easeInOut(ramp(gather, s.delay * (1 - window_), s.delay * (1 - window_) + window_));
      x += (s.tx - x) * t;
      y += (s.ty - y) * t;
      a += (1 - a) * t;
    }
    a *= dotsOut;
    if (a <= 0.02 || x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
    const size = gather > 0 ? s.size + 0.6 * gather : s.size;
    const list = bands[Math.min(BANDS - 1, Math.floor(a * BANDS))];
    list.push(x - size / 2, y - size / 2, size);
  }

  for (let b = 0; b < BANDS; b++) {
    const list = bands[b];
    if (!list.length) continue;
    ctx.globalAlpha = (b + 1) / BANDS;
    ctx.fillStyle = "#fff2ed";
    ctx.beginPath();
    for (let i = 0; i < list.length; i += 3) ctx.rect(list[i], list[i + 1], list[i + 2], list[i + 2]);
    ctx.fill();
  }

  if (solid > 0) {
    ctx.globalAlpha = solid;
    ctx.fillStyle = "#fff2ed";
    ctx.font = letterFont();
    STACK.forEach((letter, i) => ctx!.fillText(letter, stack.x, baselineFor(ctx!, stack.rows[i])));
  }
  ctx.globalAlpha = 1;
}

function tick(): void {
  if (!dirty) return;
  dirty = false;
  draw();
}

/** The two progress values and where the gathering starts, from Space.ts. */
export function updateConstellation(runwayP: number, spaceP: number, moveFrom: number): void {
  if (runwayP === runway && spaceP === space && gatherFrom === moveFrom + 0.5 * (1 - moveFrom)) return;
  runway = runwayP;
  space = spaceP;
  gatherFrom = moveFrom + 0.5 * (1 - moveFrom);
  dirty = true;
  // An update while not live is the one that left the range (its toggle
  // may come first): draw it here, since no tick will.
  if (!ticking) {
    dirty = false;
    draw();
  }
}

/** Drawing runs only while the runway or the space section is on screen. */
export function setConstellationLive(live: boolean): void {
  if (live === ticking) return;
  ticking = live;
  if (live) {
    dirty = true;
    gsap.ticker.add(tick);
  } else {
    gsap.ticker.remove(tick);
    // The update that took the section out of range arrives with this
    // toggle, after the last tick: draw it now (at the end that is a clear),
    // or the last gathering frame scrolls away on the released stage.
    if (dirty) {
      dirty = false;
      draw();
    }
  }
}

/** Where the gathering starts, in the space section's progress. */
export function gatherStart(): number {
  return gatherFrom;
}

export function initConstellation(el: HTMLCanvasElement): void {
  canvas = el;
  family = getComputedStyle(document.documentElement).getPropertyValue("--font-family-bigger").trim() || family;
}

export function destroyConstellation(): void {
  setConstellationLive(false);
  generation++;
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  canvas = null;
  ctx = null;
  stars = [];
  sampled = false;
  runway = 0;
  space = 0;
  dirty = false;
}
