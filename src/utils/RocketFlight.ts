import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Drives the rocket along its path from the section's own scroll progress.
 *
 * Three values, all of them written on the leaf that reads them and all of
 * them cheap for the browser: `--x`, `--y` and `--a` on the rocket, which feed
 * one transform and are composited; `stroke-dashoffset` on the trail, which is
 * paint-only; and a scale on the wipe, which is a single layer. Nothing here
 * causes layout.
 *
 * The trail is measured once, on init and on resize, and never inside the
 * scroll callback — reading geometry while the page is being written to is the
 * forced reflow this repository has paid for twice.
 */

/* The flame only takes the screen at the very end, so the section's own copy
   has been readable for the whole climb. */
const WIPE_STARTS = 0.84;
/* The copy lets go as the burst is born, not after: it is ink, and once the
   violet is under it there is nothing left to read. */
const COPY_FADES = 0.8;
const COPY_GONE = 0.9;
/* The burst leads the wipe: it is born a little before it and has run its
   course by the time the wipe is half way, so the flame front is what the eye
   follows and the violet is what it leaves behind. */
const BURST_STARTS = 0.8;
const BURST_ENDS = 0.92;
/* How many points to sample off the path. Two hundred is finer than a pixel at
   any viewport this page runs at, and it is sampled once per resize. */
const SAMPLES = 200;
/* How long a resize has to be quiet before the resting pose is re-measured.
   Same value as `SiteController.resizeThrottle`. */
const RESIZE_SETTLE = 200;

let trigger: ScrollTrigger | null = null;
let section: HTMLElement | null = null;
let craft: HTMLElement | null = null;
let copy: HTMLElement | null = null;
let trail: SVGPathElement | null = null;
let wipe: HTMLElement | null = null;
let burst: HTMLElement | null = null;
/* Only set on the reduced-motion path, where there is no ScrollTrigger to
   refresh the geometry after a resize. */
let onResize: (() => void) | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
/* The section box the resting pose was measured against, rounded to whole
   pixels. */
let restBox = { w: 0, h: 0 };
let trailLength = 0;
/* The path, resampled into screen pixels: x, y and the tangent angle at each
   step. Built once per resize so the scroll callback never touches geometry —
   a read after a write is the forced reflow this repository has paid for
   twice. */
let points: { x: number; y: number; a: number }[] = [];

function measure(): void {
  if (!trail || !section) return;
  trailLength = trail.getTotalLength();

  // The SVG is stretched to the section, so its user units map to pixels by
  // the ratio of the two boxes. One read of each, here and nowhere else.
  const box = section.getBoundingClientRect();
  const viewBox = trail.ownerSVGElement?.viewBox.baseVal;
  const sx = viewBox && viewBox.width ? box.width / viewBox.width : 1;
  const sy = viewBox && viewBox.height ? box.height / viewBox.height : 1;

  points = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const at = (trailLength * i) / SAMPLES;
    const p = trail.getPointAtLength(at);
    // The tangent, from the neighbouring sample rather than a derivative: the
    // path is smooth and the step is small, so the two agree to well under a
    // degree.
    const q = trail.getPointAtLength(Math.min(trailLength, at + trailLength / SAMPLES));
    points.push({
      x: p.x * sx,
      y: p.y * sy,
      // +90 because the rocket is drawn nose-up and the tangent is measured
      // from the x axis.
      a: (Math.atan2((q.y - p.y) * sy, (q.x - p.x) * sx) * 180) / Math.PI + 90,
    });
  }
}

/* A linear 0..1 ramp between two progress values, clamped at both ends. One
   definition for the wipe, the burst and the copy, so their windows read in
   one place and no leaf grows its own clamp convention. */
function ramp(progress: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}

/* The last string written to each leaf. ScrollTrigger calls apply() on every
   scroll frame across the whole section, and for most of it the wipe, the
   burst and the copy hold a constant; writing the same value again is the
   rewrite this repository already paid for once on this very driver. */
const last = new Map<HTMLElement, string>();
function write(el: HTMLElement, prop: string, value: string): void {
  if (last.get(el) === value) return;
  last.set(el, value);
  el.style.setProperty(prop, value);
}

function apply(progress: number): void {
  if (craft && points.length) {
    const at = Math.min(points.length - 1, Math.max(0, Math.round(progress * (points.length - 1))));
    const p = points[at];
    craft.style.setProperty("--x", `${p.x.toFixed(1)}px`);
    craft.style.setProperty("--y", `${p.y.toFixed(1)}px`);
    craft.style.setProperty("--a", `${p.a.toFixed(1)}deg`);
  }
  if (wipe) write(wipe, "--wipe", ramp(progress, WIPE_STARTS, 1).toFixed(3));
  if (burst) {
    const b = ramp(progress, BURST_STARTS, BURST_ENDS);
    write(burst, "--burst", b.toFixed(3));
    // Promoted only while it is actually moving. A standing will-change on a
    // 180vmax box is a layer the whole page carries; here it exists for the
    // twelve percent of the section where the ring is on screen.
    const active = b > 0 && b < 1 ? "transform, opacity" : "";
    if (burst.style.willChange !== active) burst.style.willChange = active;
  }
  if (copy) write(copy, "--copy", (1 - ramp(progress, COPY_FADES, COPY_GONE)).toFixed(3));
}

export function initRocketFlight(): void {
  if (typeof window === "undefined") return;

  section = document.querySelector<HTMLElement>(".rocket-flight");
  craft = document.querySelector<HTMLElement>(".js-rocket-craft");
  copy = document.querySelector<HTMLElement>(".rocket-flight__copy");
  trail = document.querySelector<SVGPathElement>(".js-rocket-trail");
  wipe = document.querySelector<HTMLElement>(".js-rocket-wipe");
  burst = document.querySelector<HTMLElement>(".js-rocket-burst");
  if (!section || !craft) return;

  // Under reduced motion the rocket does not fly, but it still has to sit on
  // its trail. The stylesheet cannot put it there: the craft is placed by the
  // transform this controller writes, so with no write at all it parks at the
  // section's top-left corner — measured at (0, -12) inside the section while
  // the trail starts at (86, 1234), 1,236 px away.
  //
  // Without the trail there is nothing to sample, `apply` writes nothing, and
  // the craft would sit in that corner anyway — so leave rather than install a
  // listener that can never place it.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if (!trail) return;
    restAtStart();
    // A second init without a destroy would otherwise leave the first listener
    // subscribed, and every stale copy would resample the path on resize.
    if (onResize) window.removeEventListener("resize", onResize);
    onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(restAtStart, RESIZE_SETTLE);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  measure();

  trigger = ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom bottom",
    // No scrub timeline: one callback writing three properties is less work
    // than a timeline interpolating them, and it keeps the mapping readable.
    onUpdate: (self) => apply(self.progress),
    onRefresh: () => {
      measure();
      apply(trigger ? trigger.progress : 0);
    },
  });

  apply(0);
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
  restBox = { w: 0, h: 0 };
  section = null;
  craft = null;
  copy = null;
  trail = null;
  wipe = null;
  burst = null;
  points = [];
  last.clear();
}
