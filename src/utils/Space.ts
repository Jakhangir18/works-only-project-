import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { WIPE_STARTS } from "./RocketFlight";
import { writeIfChanged, forgetLeaf } from "./leafWrite";

/**
 * Two star layers sliding in from the corner the rocket left through.
 *
 * The section begins one viewport early, over the flight, and is two
 * viewports tall; its stage is sticky for the second. So the rocket's own
 * progress is twice this section's over the first half: the wipe starts at
 * rocket .84, which is .42 here, and the rocket is gone at .5. The layers are
 * invisible until the wipe has painted black under them, travel along one
 * line — right to left, ten degrees down, away from the top-right exit — at
 * two speeds, and dim over the last tenth to meet the work section's static
 * tail.
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
/* The layers start moving when the wipe starts, in this section's progress. */
const MOVE_FROM = WIPE_STARTS / 2;
/* Where the layers come in: only once the wipe is well past the middle of the
   screen, so no star sits on white — the far ones first, the near ones last,
   both fully there when the rocket's section is gone. */
const FAR_IN = [0.45, 0.5] as const;
const NEAR_IN = [0.475, 0.5] as const;
/* The hand-off: over the last tenth both layers settle to the brightness of
   the static tail the work section paints at its top. */
const SETTLE_FROM = 0.9;
const SETTLED = 0.4;

let trigger: ScrollTrigger | null = null;
let stage: HTMLElement | null = null;
let far: HTMLElement | null = null;
let near: HTMLElement | null = null;
let width = 0;

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
  if (stage) width = stage.clientWidth;
}

function apply(progress: number): void {
  const moved = ramp(progress, MOVE_FROM, 1);
  const dim = 1 - (1 - SETTLED) * ramp(progress, SETTLE_FROM, 1);
  if (far) place(far, FAR_TRAVEL * moved, ramp(progress, FAR_IN[0], FAR_IN[1]) * dim);
  if (near) place(near, NEAR_TRAVEL * moved, ramp(progress, NEAR_IN[0], NEAR_IN[1]) * dim);
}

export function initSpace(): void {
  if (typeof window === "undefined") return;

  const section = document.querySelector<HTMLElement>(".space");
  stage = document.querySelector<HTMLElement>(".space__stage");
  far = document.querySelector<HTMLElement>(".js-space-far");
  near = document.querySelector<HTMLElement>(".js-space-near");
  if (!section || !stage || !far || !near) return;

  // Stillness, not absence: the stylesheet lays the section out as one plain
  // screen with the field at rest and fully there, and nothing here runs.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  gsap.registerPlugin(ScrollTrigger);
  measure();

  trigger = ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom bottom",
    onUpdate: (self) => apply(self.progress),
    onRefresh: () => {
      measure();
      apply(trigger ? trigger.progress : 0);
    },
  });

  // A reload inside the range lands on the right frame, not on the rest pose.
  apply(trigger.progress);
}

export function destroySpace(): void {
  trigger?.kill();
  trigger = null;
  for (const el of [far, near]) {
    if (!el) continue;
    el.style.transform = "";
    el.style.opacity = "";
    forgetLeaf(el);
  }
  stage = null;
  far = null;
  near = null;
  width = 0;
}
