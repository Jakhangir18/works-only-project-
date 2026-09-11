import { gsap } from "gsap";

/**
 * The hero wheel: a slow constant turn, plus a tilt that follows the pointer.
 *
 * Both values are written on the wheel element itself and nowhere higher. A
 * custom property inherits, so setting one per frame on a container
 * invalidates the style of every node beneath it — measured at 44-89 ms of
 * style recalculation in this repository, its single most expensive bug.
 *
 * The loop is GSAP's ticker rather than a private requestAnimationFrame, and
 * it stops whenever the hero is off screen or the tab is hidden.
 */

const SPIN_PER_SECOND = 4.2; // degrees
const MAX_TILT = 7; // degrees either side of level
/* Matches the resting value the stylesheet gives the wheel, so the first
   written frame does not jump. */
const BASE_TILT = -9;

let wheel: HTMLElement | null = null;
/* The cards, with the angle each one sits at, read once. Reading `--angle`
   per frame would mean a getComputedStyle call per card per frame. */
let cards: { el: HTMLElement; angle: number }[] = [];
let observer: IntersectionObserver | null = null;
let onTick: (() => void) | null = null;

let spin = 0;
let running = false;
let visible = false;

/* Where the pointer is, as -1..1 on each axis, and where the wheel has eased
   to. Easing here rather than in CSS keeps the whole transform on one clock. */
let pointerX = 0;
let pointerY = 0;
let tiltX = 0;
let tiltY = 0;

function write(): void {
  if (!wheel) return;
  // Written as a transform, not as a custom property: a property here would
  // inherit into all seven cards and invalidate their style every frame.
  wheel.style.transform = `rotateX(${(BASE_TILT + tiltX).toFixed(2)}deg)`;
  // The turn goes on each card, which is the element that reads it. Seven
  // leaf writes cost less than one inherited property on their parent.
  for (const card of cards) {
    card.el.style.setProperty("--turn", `${(card.angle + spin).toFixed(2)}deg`);
  }
}

function tick(): void {
  if (!wheel) return;

  spin = (spin + SPIN_PER_SECOND * gsap.ticker.deltaRatio() * (1 / 60)) % 360;

  // A sixth of the remaining distance per frame: fast enough to feel attached
  // to the pointer, slow enough that a flick does not snap.
  tiltX += (pointerY * -MAX_TILT - tiltX) * 0.06;
  tiltY += (pointerX * MAX_TILT - tiltY) * 0.06;

  write();
}

function start(): void {
  if (running || !onTick) return;
  running = true;
  gsap.ticker.add(onTick);
}

function stop(): void {
  if (!running || !onTick) return;
  running = false;
  gsap.ticker.remove(onTick);
}

function onPointerMove(event: PointerEvent): void {
  pointerX = (event.clientX / window.innerWidth) * 2 - 1;
  pointerY = (event.clientY / window.innerHeight) * 2 - 1;
}

function onVisibilityChange(): void {
  if (document.hidden) stop();
  else if (visible) start();
}

export function initAnimeHero(): void {
  if (typeof window === "undefined") return;

  wheel = document.querySelector<HTMLElement>(".js-anime-wheel");
  if (!wheel) return;

  // The setting asks for stillness, not for an empty frame: the wheel keeps
  // the angles it was rendered with and nothing moves.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  onTick = tick;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visible = entry.isIntersecting;
        if (visible && !document.hidden) start();
        else stop();
      }
    },
    { threshold: 0 },
  );
  cards = [...wheel.querySelectorAll<HTMLElement>(".anime-hero__screen")].map(
    (el) => ({ el, angle: Number(getComputedStyle(el).getPropertyValue("--angle")) || 0 }),
  );

  observer.observe(wheel);

  document.addEventListener("visibilitychange", onVisibilityChange);
  // Only where there is a pointer to follow. On a touchscreen this listener
  // would fire on every tap and tilt the wheel at the moment of a press.
  if (window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  }
}

export function destroyAnimeHero(): void {
  stop();
  observer?.disconnect();
  observer = null;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pointermove", onPointerMove);
  onTick = null;
  wheel = null;
  cards = [];
}
