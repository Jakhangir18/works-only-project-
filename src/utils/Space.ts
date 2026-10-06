import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CRASH_AT } from "./RocketFlight";
import { writeIfChanged, forgetLeaf } from "./leafWrite";
import { showWorkStack } from "./WorkSection";
import {
  initConstellation,
  resizeConstellation,
  updateConstellation,
  setConstellationLive,
  gatherStart,
  destroyConstellation,
} from "./Constellation";

/**
 * Two star layers sliding in from the corner the rocket left through, and
 * the constellation (Constellation.ts) that gathers the sparks and the field
 * into the word WORK.
 *
 * The section begins one viewport early, over the flight, and is three
 * viewports tall; its stage is sticky for the last two. The layers are
 * invisible until the wipe has painted black under them, travel along one
 * line — right to left, ten degrees down — at two speeds, and dim while the
 * constellation gathers, so the word is what the eye follows.
 *
 * Two triggers, so no number here encodes the two sections' heights: the
 * reveal reads the rocket's own progress (the black comes in with the
 * crash at CRASH_AT of it, in time), the travel and the settle read this
 * section's, and the point on this section where the travel begins is
 * derived from the two triggers' scroll positions on every refresh.
 *
 * One transform and one opacity per layer, written as concrete values on the
 * layer itself from ScrollTrigger's progress: no scroll listener of our own,
 * no geometry read per frame (the stage width is read on refresh), and no
 * write that repeats the value already there.
 */

/* Right to left, ten degrees below horizontal: a unit vector. */
const DIR = { x: -0.985, y: 0.174 };
/* Travel over the whole run, as a fraction of the stage width. The near field
   moves three times as far as the far one, the same ratio the vertical drift
   had. The layers are laid out wider than the stage by exactly these amounts
   (see AnimeSpace.astro), so the field is full at both ends. */
const NEAR_TRAVEL = 0.45;
const FAR_TRAVEL = 0.15;
/* Where the layers come in, in the rocket's progress, from the impact. The
   black plays in over about half a second (RocketFlight), so a flick that
   lands within its PLAY_WITHIN of the impact would show stars on white if
   the layers came in at once: they start just past that window (a landing
   further than it sets the black at once). The far ones first, the near
   ones after, both fully there well before the runway ends. */
const FAR_IN = [CRASH_AT + 0.16, CRASH_AT + 0.3] as const;
const NEAR_IN = [CRASH_AT + 0.22, CRASH_AT + 0.36] as const;
/* While the constellation gathers, both layers settle to a faint field, and
   they are gone by the hand-off: WORK's black, scrolling up behind its
   letters, has no stars in it, so none may be left to end at its edge. */
const SETTLED = 0.15;

let trigger: ScrollTrigger | null = null;
let rocketTrigger: ScrollTrigger | null = null;
let stage: HTMLElement | null = null;
let far: HTMLElement | null = null;
let near: HTMLElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let width = 0;
let height = 0;
/* The two progresses, each written by its own trigger. */
let spaceP = 0;
let rocketP = 0;
/* This section's progress at which the wipe starts, derived on refresh. */
let moveFrom = 0;

/* A linear 0..1 ramp between two progress values, clamped at both ends. */
function ramp(progress: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (progress - from) / (to - from)));
}

/* Through writeIfChanged, so a frame that lands on the same value writes
   nothing. */
function place(el: HTMLElement, travel: number, opacity: number): void {
  const x = (DIR.x * travel * width).toFixed(1);
  const y = (DIR.y * travel * width).toFixed(1);
  writeIfChanged(el, "transform", `translate3d(${x}px, ${y}px, 0)`);
  writeIfChanged(el, "opacity", opacity.toFixed(3));
}

function measure(): void {
  if (stage) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // The stage is 100lvh, so a phone's address bar does not change it; any
    // change is a real one, and the canvas and its targets follow it.
    if (w !== width || h !== height) {
      width = w;
      height = h;
      resizeConstellation(w, h);
    }
  }
  // The scroll position where the rocket reaches CRASH_AT, read back as
  // this section's progress. Both triggers have their start and end by now.
  if (trigger && rocketTrigger) {
    const wipeAt = rocketTrigger.start + CRASH_AT * (rocketTrigger.end - rocketTrigger.start);
    moveFrom = Math.min(1, Math.max(0, (wipeAt - trigger.start) / (trigger.end - trigger.start)));
  }
}

function apply(): void {
  updateConstellation(rocketP, spaceP, moveFrom);
  // At its end the constellation clears and WORK's own letters, on the same
  // pixels, take over in the same frame.
  showWorkStack(spaceP >= 1);
  const moved = ramp(spaceP, moveFrom, 1);
  const dim = (1 - (1 - SETTLED) * ramp(spaceP, gatherStart(), 0.93)) * (1 - ramp(spaceP, 0.93, 1));
  if (far) place(far, FAR_TRAVEL * moved, ramp(rocketP, FAR_IN[0], FAR_IN[1]) * dim);
  if (near) place(near, NEAR_TRAVEL * moved, ramp(rocketP, NEAR_IN[0], NEAR_IN[1]) * dim);
}

export function initSpace(): void {
  if (typeof window === "undefined") return;

  const section = document.querySelector<HTMLElement>(".space");
  const rocket = document.querySelector<HTMLElement>(".rocket-flight");
  stage = document.querySelector<HTMLElement>(".space__stage");
  far = document.querySelector<HTMLElement>(".js-space-far");
  near = document.querySelector<HTMLElement>(".js-space-near");
  canvas = document.querySelector<HTMLCanvasElement>(".js-space-constellation");
  if (!section || !rocket || !stage || !far || !near) return;

  // Stillness, not absence: the stylesheet lays the section out as one plain
  // screen with the field at rest and fully there, and nothing here runs.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  gsap.registerPlugin(ScrollTrigger);
  if (canvas) initConstellation(canvas);
  // The constellation draws only while the runway or this section is on
  // screen: both triggers report in.
  const live = () => setConstellationLive(!!(rocketTrigger?.isActive || trigger?.isActive));

  // The same window the rocket's own driver uses, read here for the reveal.
  rocketTrigger = ScrollTrigger.create({
    trigger: rocket,
    start: "top bottom",
    end: "bottom bottom",
    onUpdate: (self) => {
      rocketP = self.progress;
      apply();
    },
    onToggle: live,
  });

  trigger = ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    // Ends where WORK pins (its top at the top of the screen, a stage's
    // height above this section's bottom). "bottom bottom" would follow
    // innerHeight, which on a phone moves with the address bar while the
    // 100lvh stage does not, and the hand-off would jump by the difference.
    end: () => `bottom top+=${stage?.clientHeight || window.innerHeight}`,
    onUpdate: (self) => {
      spaceP = self.progress;
      apply();
    },
    onToggle: live,
    // One refresh handler for both: ScrollTrigger refreshes every trigger
    // together, and this one is created last.
    onRefresh: () => {
      measure();
      rocketP = rocketTrigger ? rocketTrigger.progress : 0;
      spaceP = trigger ? trigger.progress : 0;
      apply();
    },
  });

  // A reload inside the range lands on the right frame, not on the rest pose.
  measure();
  rocketP = rocketTrigger.progress;
  spaceP = trigger.progress;
  apply();
  live();
}

export function destroySpace(): void {
  trigger?.kill();
  trigger = null;
  rocketTrigger?.kill();
  rocketTrigger = null;
  spaceP = 0;
  rocketP = 0;
  moveFrom = 0;
  for (const el of [far, near]) {
    if (!el) continue;
    el.style.transform = "";
    el.style.opacity = "";
    forgetLeaf(el);
  }
  destroyConstellation();
  stage = null;
  far = null;
  near = null;
  canvas = null;
  width = 0;
  height = 0;
}
