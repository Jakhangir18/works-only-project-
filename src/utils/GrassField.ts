import { gsap } from "gsap";

/**
 * Grass that the pointer presses down (the owner, 2026-10-03: "трава под
 * нашей мышкой приминалась"). One canvas along the bottom of the painted
 * land, inside the ground's box, so the land's settle carries it. Its
 * greens are the painting's own, sampled from its foreground, and no blade
 * stands on the painted path.
 *
 * Each blade is a tapered quadratic curve on a damped spring. A pointer
 * within reach pushes the blades near it away from itself and down; let go,
 * they spring back. Touch has no pointer to press with, so on a phone the
 * grass is a still drawing: an earlier version leaned it with the scroll
 * speed, and redrawing the canvas on every scrolled frame cost a phone at
 * 4x CPU 20-30 long tasks per descent (traced 2026-10-03). Technique after
 * lukeocodes/touch-grass (MIT): blades batched into one path per colour and
 * nothing drawn while hidden; no stroke and no shadowBlur, since on a
 * software rasteriser the outline cost more than the fill.
 *
 * It draws only while the canvas is on screen, and then only while
 * something moves: the pointer moved in the last moment, or a blade is
 * still springing back. A still meadow is one drawn frame, not a loop
 * (invariant 1). The frames come from the GSAP ticker (invariant 6). The
 * canvas's place is read on resize only; a pointer is mapped through it,
 * through the stage's top (from the descent's trigger range and scrollY)
 * and through the meadow's rise, so no layout is read per event.
 * Assigning the canvas's size resets its context (invariant 8): the
 * transform is set again in the same function.
 */

type Blade = { x: number; y: number; h: number; w: number; band: number; bend: number; v: number; rest: number };

/* Darkest at the front, as in the painting: its foreground greens (the
   quintiles, sampled). Not a step lighter than the paint: lighter flat
   fills read as clip art over it (seen 2026-10-06 at 390x844), so the
   blades stay inside the painting's own range and a little translucent. */
const COLOURS = ["#2f4a27", "#3f5f31", "#53773c", "#6a8f47", "#86a655"];
const BLADE_ALPHA = 0.88;
const SPRING = 0.075;
const DAMPING = 0.82;
/* How far a blade can be pressed over, in radians from upright. */
const PRESS = 1.15;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let blades: Blade[] = [];
let W = 0;
let H = 0;
/* The stage's size and which picture it shows (the tall one under 3:4),
   to find the painted path under a blade. */
let stageW = 0;
let stageH = 0;
let tall = false;
let dpr = 1;
/* The canvas's top-left inside the stage, read on resize. */
let left = 0;
let top = 0;
/* Handed over by Paradise.ts: the meadow's current lift in px, and how to
   find the stage's top on screen (arithmetic on its trigger and scrollY,
   which is known without a layout). */
let lift = 0;
let stageTop: () => number = () => 0;
let reach = 90;
let pointer: { x: number; y: number } | null = null;
let movedAt = 0;
let visible = false;
let ticking = false;
let observer: IntersectionObserver | null = null;
let still = false;
const abort = { ctl: null as AbortController | null };

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* The painted path as a corridor in each picture's own units (0..1 across
   and down), from its bottom edge up to where the far meadow takes it: wide
   at the bottom, narrow at `from`. Measured on the two pictures
   (public/paradise/land-*.webp) and generous, since the path winds. The
   pictures are laid out with object-fit: cover at these object-positions
   (AnimeParadise.astro, .paradise__land). */
const PATH = {
  wide: { w: 1376, h: 768, posY: 0.56, from: 0.76, top: [0.45, 0.55], bottom: [0.36, 0.63] },
  tall: { w: 768, h: 1376, posY: 0.5, from: 0.76, top: [0.42, 0.58], bottom: [0.25, 0.7] },
} as const;

/* True where a blade's foot would stand on the path. The canvas's place in
   the stage is the land's at rest. */
function onPath(x: number, y: number): boolean {
  if (!stageW || !stageH) return false;
  const pic = tall ? PATH.tall : PATH.wide;
  const s = Math.max(stageW / pic.w, stageH / pic.h);
  const u = (left + x - (stageW - pic.w * s) / 2) / (pic.w * s);
  const v = (top + y - (stageH - pic.h * s) * pic.posY) / (pic.h * s);
  if (v < pic.from) return false;
  const t = Math.min(1, (v - pic.from) / (1 - pic.from));
  return u > pic.top[0] + (pic.bottom[0] - pic.top[0]) * t && u < pic.top[1] + (pic.bottom[1] - pic.top[1]) * t;
}

function build(): void {
  const count = W < 640 ? 110 : Math.min(400, Math.round(W / 3.6));
  const r = rng(519);
  blades = Array.from({ length: count }, () => {
    // Depth: 0 is the back of the strip, 1 the front edge.
    const depth = Math.pow(r(), 0.7);
    const y = H * (0.45 + 0.55 * depth) + 2;
    let x = r() * W;
    // Off the path: try again a few times, then give the blade to the verge.
    for (let tries = 0; tries < 6 && onPath(x, y); tries++) x = r() * W;
    return {
      x,
      y,
      h: (0.32 + 0.6 * depth) * H * (0.75 + 0.5 * r()),
      w: 2.2 + 4.2 * depth,
      band: Math.min(COLOURS.length - 1, Math.floor((1 - depth) * COLOURS.length * 0.999)),
      bend: 0,
      v: 0,
      rest: (r() - 0.5) * 0.24,
    };
  });
  // A blade still on the path after its tries is dropped.
  blades = blades.filter((b) => !onPath(b.x, b.y));
  // Back to front, so the nearer blades paint over the further ones.
  blades.sort((a, b) => a.y - b.y);
}

function draw(): void {
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.globalAlpha = BLADE_ALPHA;
  for (let band = 0; band < COLOURS.length; band++) {
    ctx.fillStyle = COLOURS[band];
    ctx.beginPath();
    for (const b of blades) {
      if (b.band !== band) continue;
      const a = b.rest + b.bend;
      // A pressed blade also gets shorter as it lies over.
      const h = b.h * (1 - 0.35 * Math.min(1, Math.abs(b.bend) / PRESS));
      const tx = b.x + Math.sin(a) * h;
      const ty = b.y - Math.cos(a) * h;
      const cx = b.x + Math.sin(a * 0.5) * h * 0.55;
      const cy = b.y - Math.cos(a * 0.5) * h * 0.55;
      ctx.moveTo(b.x - b.w / 2, b.y);
      ctx.quadraticCurveTo(cx - b.w * 0.25, cy, tx, ty);
      ctx.quadraticCurveTo(cx + b.w * 0.25, cy, b.x + b.w / 2, b.y);
    }
    ctx.fill();
  }
}

/* One step of the springs. True while anything still moves. */
function step(): boolean {
  const now = performance.now();
  const pressing = pointer !== null && now - movedAt < 1500;
  let moving = false;
  for (const b of blades) {
    let target = 0;
    if (pressing && pointer) {
      const dx = b.x - pointer.x;
      // Measured from the middle of the blade, so the pointer can press it
      // anywhere along its length.
      const dy = b.y - b.h * 0.5 - pointer.y;
      const d = Math.hypot(dx, dy * 0.8);
      if (d < reach) target = Math.sign(dx || 1) * PRESS * (1 - d / reach);
    }
    b.v = (b.v + (target - b.bend) * SPRING) * DAMPING;
    b.bend += b.v;
    if (Math.abs(b.v) > 0.0008 || Math.abs(target - b.bend) > 0.002) moving = true;
  }
  return moving || pressing;
}

function tick(): void {
  const moving = step();
  draw();
  if (!moving) stop();
}

function start(): void {
  if (ticking || !visible || still) return;
  ticking = true;
  gsap.ticker.add(tick);
}

function stop(): void {
  if (!ticking) return;
  ticking = false;
  gsap.ticker.remove(tick);
}

/** The canvas at its box's size; blades are rebuilt for it. */
export function resizeGrass(): void {
  if (!canvas) return;
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  const stage = canvas.closest<HTMLElement>(".paradise__stage");
  stageW = stage?.clientWidth ?? W;
  stageH = stage?.clientHeight ?? H;
  tall = window.matchMedia("(max-aspect-ratio: 3/4)").matches;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  // offsetLeft/offsetTop ignore the meadow's transform; the lift is added
  // per event from what Paradise.ts last wrote.
  let el: HTMLElement | null = canvas;
  left = 0;
  top = 0;
  while (el && !el.classList.contains("paradise__stage")) {
    left += el.offsetLeft;
    top += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  reach = W < 640 ? 70 : 96;
  build();
  draw();
}

/** From Paradise.ts on every descent update: how far the meadow is still lowered. */
export function placeGrass(liftPx: number): void {
  lift = liftPx;
}

export function initGrass(el: HTMLCanvasElement, stageTopNow: () => number): void {
  canvas = el;
  stageTop = stageTopNow;
  still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  resizeGrass();
  if (still) return;
  abort.ctl = new AbortController();
  const { signal } = abort.ctl;
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!visible || e.pointerType === "touch") return;
      const x = e.clientX - left;
      const y = e.clientY - stageTop() - top - lift;
      // Only a pointer over the grass, or near it, presses anything; one
      // elsewhere on the screen leaves the field alone (and asleep).
      if (y < -reach || y > H + reach || x < -reach || x > W + reach) {
        pointer = null;
        return;
      }
      pointer = { x, y };
      movedAt = performance.now();
      start();
    },
    { passive: true, signal },
  );
  document.addEventListener("pointerleave", () => (pointer = null), { signal });
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      visible = entry.isIntersecting;
      if (!visible) stop();
    }
  });
  observer.observe(el);
}

export function destroyGrass(): void {
  stop();
  observer?.disconnect();
  observer = null;
  abort.ctl?.abort();
  abort.ctl = null;
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  canvas = null;
  ctx = null;
  blades = [];
  pointer = null;
  visible = false;
}
