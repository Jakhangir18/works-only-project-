import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { writeIfChanged, forgetLeaf } from "./leafWrite";

/**
 * The rocket that flies beside "Why work with me?" and crashes into space.
 *
 * One ScrollTrigger over the flight zone (the bento section plus the runway
 * after it) drives everything from the scroll position:
 *   - the flight: from the zone entering at the bottom of the screen to the
 *     moment of impact, the rocket rides a route laid out in the sticky
 *     stage's own pixels — loops in the margins, sweeps behind the cards, a
 *     last arc over the runway and a dive;
 *   - the crash, in the runway's own progress: a flash, ten pieces of debris,
 *     the burst ring, and the wipe that takes the screen to space black.
 *
 * Measured once per refresh (resize, font load): the stage's size, the route
 * built for it and sampled into SAMPLES points, and the scroll positions of
 * the zone and the runway. The scroll callback only looks points up and
 * writes transforms and opacities on the leaves that show them, through
 * writeIfChanged, so a frame that lands on the same values writes nothing.
 * No geometry is read per frame.
 */

/* In the runway's progress (its top entering at the bottom of the screen = 0,
   its bottom reaching the bottom of the screen = 1): where the rocket hits,
   where the wipe starts. Exported: the star field reveals on the wipe. */
export const CRASH_AT = 0.55;
export const WIPE_STARTS = 0.6;
const FLASH = [CRASH_AT, 0.64] as const;
const DEBRIS = [CRASH_AT, 0.8] as const;
const BURST = [0.56, 0.74] as const;
/* The last stretch of the route, as a fraction of its length, over which the
   rocket tumbles: one and a half turns on top of its heading. */
const TUMBLE_FROM = 0.93;
const TUMBLE_TURNS = 1.5;
/* Finer than a pixel at the speeds this page scrolls, sampled once per resize. */
const SAMPLES = 1200;
/* Each puff of smoke sits this fraction of the route behind the one before. */
const PUFF_LAG = 0.0075;

type Waypoint = [number, number] | { loop: [number, number]; r: number; from: number; turn: 1 | -1 };

/* The routes, in fractions of the stage's width and height; loops are true
   circles with a radius in fractions of the stage's shorter side, entered at
   angle `from` (degrees, screen axes) and run once round in `turn` direction
   (-1 anticlockwise on screen). On a desktop the lanes are the page margins
   outside the bento's 1400px column, so the rocket is seen there and its
   loops swing half behind the cards. Both routes end on the impact point,
   on the right and 72% of the way down (the owner, 2026-10-03: "explode on
   the right"). Not higher: at the moment of impact the runway's top edge is
   at 1 - CRASH_AT = 45% of the screen, so a higher point would land under
   the last card on a desktop and over text on a phone. The last arc comes in
   from the left. Keep NARROW_BELOW in step with the stage's z-index rule in
   AnimeRocket.astro, and IMPACT with each route's last point. */
const IMPACT = { wide: [0.8, 0.72], narrow: [0.78, 0.72] } as const;
const ROUTE_WIDE: Waypoint[] = [
  [0.95, 0.97],
  [0.972, 0.8],
  { loop: [0.955, 0.56], r: 0.085, from: 0, turn: -1 },
  [0.975, 0.36],
  [0.93, 0.2],
  [0.7, 0.11],
  [0.4, 0.12],
  [0.12, 0.2],
  [0.028, 0.38],
  { loop: [0.045, 0.6], r: 0.08, from: 180, turn: -1 },
  [0.026, 0.84],
  [0.2, 0.93],
  [0.5, 0.9],
  [0.8, 0.84],
  [0.972, 0.66],
  { loop: [0.955, 0.42], r: 0.07, from: 0, turn: -1 },
  [0.9, 0.17],
  [0.66, 0.12],
  [0.46, 0.2],
  [0.36, 0.38],
  [0.44, 0.58],
  [0.62, 0.69],
  [...IMPACT.wide],
];
/* On a phone the stage rides above the content (the cards fill the width, so
   behind them the rocket would only ever peek out), and the route keeps to
   the two edge lanes outside the cards' text: it crosses the screen only at
   the top and the bottom of each lap, fast. */
const ROUTE_NARROW: Waypoint[] = [
  [0.93, 0.97],
  [0.955, 0.78],
  { loop: [0.97, 0.58], r: 0.065, from: 180, turn: 1 },
  [0.955, 0.36],
  [0.9, 0.14],
  [0.5, 0.06],
  [0.1, 0.14],
  [0.045, 0.36],
  { loop: [0.03, 0.56], r: 0.065, from: 0, turn: 1 },
  [0.045, 0.8],
  [0.12, 0.93],
  [0.5, 0.96],
  [0.88, 0.9],
  [0.955, 0.66],
  [0.9, 0.36],
  [0.6, 0.26],
  [0.36, 0.42],
  [0.46, 0.6],
  [0.64, 0.7],
  [...IMPACT.narrow],
];
const NARROW_BELOW = 640;

/* Where the rocket hits, in a stage of w x h pixels: the route's last point,
   in plain arithmetic, so the star field can place the sparks from it
   without waiting for this module's refresh. */
export function impactAt(w: number, h: number): { x: number; y: number } {
  const [fx, fy] = w < NARROW_BELOW ? IMPACT.narrow : IMPACT.wide;
  return { x: fx * w, y: fy * h };
}

let trigger: ScrollTrigger | null = null;
let zone: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let craft: HTMLElement | null = null;
let trail: SVGPathElement | null = null;
let impact: HTMLElement | null = null;
let flash: HTMLElement | null = null;
let wipe: HTMLElement | null = null;
let burst: HTMLElement | null = null;
let puffs: HTMLElement[] = [];
let shards: { el: HTMLElement; dx: number; dy: number; spin: number }[] = [];
let onResize: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

let W = 0;
let H = 0;
let points: { x: number; y: number; a: number }[] = [];
/* Scroll positions, read from the trigger on refresh. */
let zoneStart = 0;
let crashScroll = 1;
let runwayStart = 0;
let crashed = false;
/* The box the resting pose was measured against, for reduced motion. */
let restBox = { w: 0, h: 0 };
/* The impact's x, for keeping the debris on screen. */
let endX = 0;

/* A linear 0..1 ramp between two progress values, clamped at both ends. */
function ramp(progress: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}

/* Waypoints to pixel points, loops expanded into eight points round their
   circle. */
function toPoints(route: Waypoint[], w: number, h: number): [number, number][] {
  const short = Math.min(w, h);
  const out: [number, number][] = [];
  for (const wp of route) {
    if (Array.isArray(wp)) {
      out.push([wp[0] * w, wp[1] * h]);
      continue;
    }
    const cx = wp.loop[0] * w;
    const cy = wp.loop[1] * h;
    const r = wp.r * short;
    for (let i = 0; i < 8; i++) {
      const rad = ((wp.from + wp.turn * 45 * i) * Math.PI) / 180;
      out.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
    }
  }
  return out;
}

type Segment = [number, number][]; // p1, c1, c2, p2

/* A smooth curve through the points: uniform Catmull-Rom, as cubic Béziers. */
function routeSegments(pts: [number, number][]): Segment[] {
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const segments: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    segments.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return segments;
}

function pathData(segments: Segment[]): string {
  const f = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M ${f(segments[0][0])}` + segments.map((s) => ` C ${f(s[1])} ${f(s[2])} ${f(s[3])}`).join("");
}

function bezier(s: Segment, t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
}

/* The route resampled to SAMPLES + 1 points evenly spaced along its length,
   in plain arithmetic. Not SVGPathElement.getPointAtLength: on this route it
   costs about 4 ms a call under a 4x CPU throttle, and a few thousand calls
   per refresh made 22-second long tasks on a phone profile. Here a dense
   polyline is walked once and the whole job takes well under a millisecond. */
function sample(segments: Segment[]): { x: number; y: number; a: number }[] {
  const STEPS = 48;
  const dense: [number, number][] = [segments[0][0]];
  for (const seg of segments) for (let i = 1; i <= STEPS; i++) dense.push(bezier(seg, i / STEPS));
  const cumulative = [0];
  for (let i = 1; i < dense.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  }
  const total = cumulative[cumulative.length - 1];
  const even: [number, number][] = [];
  let j = 1;
  for (let i = 0; i <= SAMPLES; i++) {
    const target = (total * i) / SAMPLES;
    while (j < cumulative.length - 1 && cumulative[j] < target) j++;
    const span = cumulative[j] - cumulative[j - 1] || 1;
    const k = Math.min(1, Math.max(0, (target - cumulative[j - 1]) / span));
    even.push([dense[j - 1][0] + (dense[j][0] - dense[j - 1][0]) * k, dense[j - 1][1] + (dense[j][1] - dense[j - 1][1]) * k]);
  }
  return even.map((p, i) => {
    const q = even[Math.min(even.length - 1, i + 1)];
    const back = even[Math.max(0, i - 1)];
    // The tangent from the neighbouring samples; +90 because the rocket is
    // drawn nose-up and the angle is measured from the x axis.
    return { x: p[0], y: p[1], a: (Math.atan2(q[1] - back[1], q[0] - back[0]) * 180) / Math.PI + 90 };
  });
}

function measure(): void {
  if (!stage || !trail) return;
  W = stage.clientWidth;
  H = stage.clientHeight;
  const segments = routeSegments(toPoints(W < NARROW_BELOW ? ROUTE_NARROW : ROUTE_WIDE, W, H));
  // The route is also written into the document, in the stage's own pixels
  // (viewBox and box agree), so it can be inspected and checked; nothing
  // here reads it back.
  trail.ownerSVGElement?.setAttribute("viewBox", `0 0 ${W} ${H}`);
  trail.setAttribute("d", pathData(segments));
  points = sample(segments);

  // The impact point is the route's last point: everything born there sits
  // in one box placed once.
  const end = points[points.length - 1];
  endX = end.x;
  if (impact) impact.style.transform = `translate3d(${end.x.toFixed(1)}px, ${end.y.toFixed(1)}px, 0)`;
  // The wipe is centred on the impact and its flat core (88% of the radius)
  // has to reach the farthest corner of the stage from there. Sized here, in
  // pixels, because the impact is off-centre: a fixed vmax size that covers
  // the worst case is a quarter more pixels than a phone needs.
  if (wipe) {
    const d = Math.max(Math.hypot(end.x, end.y), Math.hypot(W - end.x, end.y), Math.hypot(end.x, H - end.y), Math.hypot(W - end.x, H - end.y));
    const size = Math.ceil((2 * d) / 0.88);
    writeIfChanged(wipe, "width", `${size}px`);
    writeIfChanged(wipe, "height", `${size}px`);
    writeIfChanged(wipe, "margin", `${-size / 2}px 0 0 ${-size / 2}px`);
  }

  if (trigger) {
    zoneStart = trigger.start;
    // The runway is the zone's last screen: its own trigger would start one
    // screen before the zone's end ("top bottom") and end with it.
    runwayStart = trigger.end - H;
    crashScroll = runwayStart + CRASH_AT * H;
  }
}

/* The point at a fraction of the route, between samples. */
function pointAt(f: number): { x: number; y: number; a: number } {
  const t = Math.min(1, Math.max(0, f)) * (points.length - 1);
  const i = Math.floor(t);
  const p = points[i];
  const q = points[Math.min(points.length - 1, i + 1)];
  const k = t - i;
  // Angles across the ±180 seam take the short way round.
  let da = q.a - p.a;
  if (da > 180) da -= 360;
  if (da < -180) da += 360;
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, a: p.a + da * k };
}

function apply(scroll: number): void {
  if (!points.length) return;
  const f = ramp(scroll, zoneStart, crashScroll);
  const r = H ? (scroll - runwayStart) / H : 0;

  if (craft) {
    const p = pointAt(f);
    const tumble = f > TUMBLE_FROM ? ((f - TUMBLE_FROM) / (1 - TUMBLE_FROM)) * 360 * TUMBLE_TURNS : 0;
    writeIfChanged(craft, "--x", `${p.x.toFixed(1)}px`);
    writeIfChanged(craft, "--y", `${p.y.toFixed(1)}px`);
    writeIfChanged(craft, "--a", `${(p.a + tumble).toFixed(1)}deg`);
  }

  puffs.forEach((el, k) => {
    const p = pointAt(f - (k + 1) * PUFF_LAG);
    const s = 1 - k * 0.07;
    writeIfChanged(el, "transform", `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) scale(${s.toFixed(2)})`);
  });

  const nowCrashed = r >= CRASH_AT;
  if (stage && nowCrashed !== crashed) {
    crashed = nowCrashed;
    stage.classList.toggle("is-crashed", crashed);
  }

  if (flash) {
    const t = ramp(r, FLASH[0], FLASH[1]);
    const live = t > 0 && t < 1;
    writeIfChanged(flash, "transform", `scale(${live ? (0.25 + 1.5 * (1 - (1 - t) * (1 - t))).toFixed(3) : 0})`);
    writeIfChanged(flash, "opacity", live ? (1 - t * t).toFixed(3) : "0");
    // Its own layer only while it moves, so the gradient is rastered once
    // and scaled, not repainted every frame of the crash.
    writeIfChanged(flash, "will-change", live ? "transform, opacity" : "auto");
  }

  if (shards.length) {
    const t = ramp(r, DEBRIS[0], DEBRIS[1]);
    const live = t > 0 && t < 1;
    const reach = 0.3 * Math.min(W, H);
    // The impact is near the right edge: pieces flying right travel no
    // further than 90% of the room there, so the stage never clips them.
    const right = Math.min(reach, 0.9 * (W - endX));
    const left = Math.min(reach, 0.9 * endX);
    const fall = 0.35 * H;
    const out = 1 - (1 - t) * (1 - t);
    for (const s of shards) {
      const across = s.dx * (s.dx > 0 ? right : left) * out;
      writeIfChanged(
        s.el,
        "transform",
        live
          ? `translate3d(${across.toFixed(1)}px, ${(s.dy * reach * out + fall * t * t).toFixed(1)}px, 0) rotate(${(s.spin * t).toFixed(0)}deg)`
          : "scale(0)",
      );
      writeIfChanged(s.el, "opacity", live ? (1 - t).toFixed(3) : "0");
      writeIfChanged(s.el, "will-change", live ? "transform, opacity" : "auto");
    }
  }

  if (burst) {
    const b = ramp(r, BURST[0], BURST[1]);
    writeIfChanged(burst, "--burst", b.toFixed(3));
    // Promoted only while it is moving: a standing layer of this size is
    // memory the rest of the page would pay for.
    const active = b > 0 && b < 1 ? "transform, opacity" : "";
    if (burst.style.willChange !== active) burst.style.willChange = active;
  }

  if (wipe) {
    const w = ramp(r, WIPE_STARTS, 1);
    writeIfChanged(wipe, "--wipe", w.toFixed(3));
    const active = w > 0 && w < 1 ? "transform" : "";
    if (wipe.style.willChange !== active) wipe.style.willChange = active;
  }
}

/* The resting pose under reduced motion: the rocket at the start of its route,
   no smoke, no crash. Re-measured only when the stage's box changes by a whole
   pixel, so a phone's address bar coming and going does not resample. */
function restAtStart(): void {
  if (!stage) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (w === restBox.w && h === restBox.h) return;
  restBox = { w, h };
  measure();
  if (craft && points.length) {
    const p = points[0];
    writeIfChanged(craft, "--x", `${p.x.toFixed(1)}px`);
    writeIfChanged(craft, "--y", `${p.y.toFixed(1)}px`);
    writeIfChanged(craft, "--a", `${p.a.toFixed(1)}deg`);
  }
}

export function initRocketFlight(): void {
  if (typeof window === "undefined") return;

  zone = document.querySelector<HTMLElement>(".flight-zone");
  stage = document.querySelector<HTMLElement>(".js-flight-stage");
  craft = document.querySelector<HTMLElement>(".js-rocket-craft");
  trail = document.querySelector<SVGPathElement>(".js-rocket-trail");
  impact = document.querySelector<HTMLElement>(".js-rocket-impact");
  flash = document.querySelector<HTMLElement>(".js-rocket-flash");
  wipe = document.querySelector<HTMLElement>(".js-rocket-wipe");
  burst = document.querySelector<HTMLElement>(".js-rocket-burst");
  puffs = [...document.querySelectorAll<HTMLElement>(".js-rocket-puff")];
  shards = [...document.querySelectorAll<HTMLElement>(".js-rocket-shard")].map((el) => ({
    el,
    dx: Number(el.dataset.dx) || 0,
    dy: Number(el.dataset.dy) || 0,
    spin: Number(el.dataset.spin) || 0,
  }));
  if (!zone || !stage || !craft || !trail) return;

  // Under reduced motion nothing flies, but the rocket still has to sit on its
  // route — with no write at all it would park in the stage's corner.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    restAtStart();
    if (onResize) window.removeEventListener("resize", onResize);
    onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(restAtStart, 200);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  trigger = ScrollTrigger.create({
    trigger: zone,
    start: "top bottom",
    end: "bottom bottom",
    // No scrub timeline: one callback looking points up is less work than a
    // timeline interpolating them, and it keeps the mapping readable.
    onUpdate: (self) => apply(self.scroll()),
    onToggle: (self) => stage?.classList.toggle("is-flying", self.isActive),
    onRefresh: (self) => {
      measure();
      apply(self.scroll());
    },
  });

  measure();
  apply(trigger.scroll());
  stage.classList.toggle("is-flying", trigger.isActive);
}

export function destroyRocketFlight(): void {
  trigger?.kill();
  trigger = null;
  if (onResize) {
    window.removeEventListener("resize", onResize);
    onResize = null;
  }
  if (resizeTimer) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  for (const el of [craft, flash, wipe, burst, ...puffs, ...shards.map((s) => s.el)]) if (el) forgetLeaf(el);
  stage?.classList.remove("is-flying", "is-crashed");
  restBox = { w: 0, h: 0 };
  crashed = false;
  zone = null;
  stage = null;
  craft = null;
  trail = null;
  impact = null;
  flash = null;
  wipe = null;
  burst = null;
  puffs = [];
  shards = [];
  points = [];
}
