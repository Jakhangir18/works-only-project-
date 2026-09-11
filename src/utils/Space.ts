import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Two star layers drifting at different speeds as the section passes.
 *
 * One transform per layer, written on the layer itself. The values come from
 * ScrollTrigger's own progress, so there is no scroll listener of our own and
 * no geometry read per frame.
 */

const FAR_DRIFT = 40; // px across the whole section
const NEAR_DRIFT = 120;

let trigger: ScrollTrigger | null = null;
let far: HTMLElement | null = null;
let near: HTMLElement | null = null;

function apply(progress: number): void {
  // Centred on the middle of the section, so the field is level when the
  // heading is on screen rather than at one end of its travel.
  const t = progress - 0.5;
  if (far) far.style.setProperty("--drift", `${(t * -FAR_DRIFT).toFixed(1)}px`);
  if (near) near.style.setProperty("--drift", `${(t * -NEAR_DRIFT).toFixed(1)}px`);
}

export function initSpace(): void {
  if (typeof window === "undefined") return;

  const section = document.querySelector<HTMLElement>(".space");
  far = document.querySelector<HTMLElement>(".js-space-far");
  near = document.querySelector<HTMLElement>(".js-space-near");
  if (!section || !far || !near) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  gsap.registerPlugin(ScrollTrigger);

  trigger = ScrollTrigger.create({
    trigger: section,
    start: "top bottom",
    end: "bottom top",
    onUpdate: (self) => apply(self.progress),
  });

  apply(0.5);
}

export function destroySpace(): void {
  trigger?.kill();
  trigger = null;
  far = null;
  near = null;
}
