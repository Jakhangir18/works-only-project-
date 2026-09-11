import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Drives the rocket along its path from the section's own scroll progress.
 *
 * Three values, all of them written on the leaf that reads them and all of
 * them cheap for the browser: `offset-distance` on the rocket, which is
 * composited; `stroke-dashoffset` on the trail, which is paint-only; and a
 * scale on the wipe, which is a single layer. Nothing here causes layout.
 *
 * The trail is measured once, on init and on resize, and never inside the
 * scroll callback — reading geometry while the page is being written to is the
 * forced reflow this repository has paid for twice.
 */

/* The flame only takes the screen at the very end, so the section's own copy
   has been readable for the whole climb. */
const WIPE_STARTS = 0.84;
const COPY_FADES = 0.9;
/* How many points to sample off the path. Two hundred is finer than a pixel at
   any viewport this page runs at, and it is sampled once per resize. */
const SAMPLES = 200;

let trigger: ScrollTrigger | null = null;
let section: HTMLElement | null = null;
let craft: HTMLElement | null = null;
let copy: HTMLElement | null = null;
let trail: SVGPathElement | null = null;
let wipe: HTMLElement | null = null;
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

function apply(progress: number): void {
  if (craft && points.length) {
    const at = Math.min(points.length - 1, Math.max(0, Math.round(progress * (points.length - 1))));
    const p = points[at];
    craft.style.setProperty("--x", `${p.x.toFixed(1)}px`);
    craft.style.setProperty("--y", `${p.y.toFixed(1)}px`);
    craft.style.setProperty("--a", `${p.a.toFixed(1)}deg`);
  }
  if (wipe) {
    const w = progress <= WIPE_STARTS ? 0 : (progress - WIPE_STARTS) / (1 - WIPE_STARTS);
    wipe.style.setProperty("--wipe", w.toFixed(3));
  }
  if (copy) {
    const fade = progress <= COPY_FADES ? 1 : 1 - (progress - COPY_FADES) / (1 - COPY_FADES);
    copy.style.setProperty("--copy", Math.max(0, fade).toFixed(3));
  }
}

export function initRocketFlight(): void {
  if (typeof window === "undefined") return;

  section = document.querySelector<HTMLElement>(".rocket-flight");
  craft = document.querySelector<HTMLElement>(".js-rocket-craft");
  copy = document.querySelector<HTMLElement>(".rocket-flight__copy");
  trail = document.querySelector<SVGPathElement>(".js-rocket-trail");
  wipe = document.querySelector<HTMLElement>(".js-rocket-wipe");
  if (!section || !craft) return;

  // The stylesheet already parks everything at its resting value, and under
  // reduced motion that is where it stays.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
  section = null;
  craft = null;
  copy = null;
  trail = null;
  wipe = null;
  points = [];
}
