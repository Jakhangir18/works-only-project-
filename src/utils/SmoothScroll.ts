import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Smooth scrolling for the light home page.
 *
 * Lenis intercepts wheel and touch input and drives `window.scrollTo` itself,
 * which is what gives the reference its weight — the page keeps moving for a
 * moment after the wheel stops instead of snapping. It is off under
 * `prefers-reduced-motion`, where that weight is exactly what the setting asks
 * us not to add, and off on touch, where the platform's own momentum is better
 * than anything a library can synthesise and fighting it costs the address bar
 * its collapse.
 *
 * It runs on GSAP's ticker rather than starting its own requestAnimationFrame
 * loop (invariant 6): two independent loops compete for the same frame budget
 * and interleave unpredictably, and ScrollTrigger already reads from this one.
 */

let lenis: Lenis | null = null;
let onTick: ((time: number) => void) | null = null;

export function initSmoothScroll(): void {
  if (lenis) return;
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // Coarse pointer means a touchscreen, where the platform's momentum wins.
  if (window.matchMedia("(pointer: coarse)").matches) return;

  lenis = new Lenis({
    duration: 1.05,
    // A long, flat tail: fast at the start of a flick, slow to settle.
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false,
  });

  // ScrollTrigger has to read position from Lenis rather than from a scroll
  // event, or every pinned or scrubbed section lags a frame behind the page.
  lenis.on("scroll", ScrollTrigger.update);

  onTick = (time: number) => {
    // GSAP's ticker is in seconds, Lenis wants milliseconds.
    lenis?.raf(time * 1000);
  };
  gsap.ticker.add(onTick);
  // Lenis already smooths; GSAP's own lag smoothing on top of it produces a
  // visible hitch when a long task ends.
  gsap.ticker.lagSmoothing(0);
}

export function destroySmoothScroll(): void {
  if (onTick) gsap.ticker.remove(onTick);
  onTick = null;
  lenis?.destroy();
  lenis = null;
  gsap.ticker.lagSmoothing(500, 33);
}

/** The instance, for anything that needs to scroll the page programmatically. */
export function getSmoothScroll(): Lenis | null {
  return lenis;
}
