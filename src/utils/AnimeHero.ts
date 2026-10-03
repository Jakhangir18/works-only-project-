import { gsap } from "gsap";

/**
 * The hero wheel: a slow constant turn, plus a tilt that follows the pointer —
 * and the figure, which leans a little after the same pointer, more slowly.
 *
 * Every value is written on the element that consumes it and nowhere higher.
 * A custom property inherits, so setting one per frame on a container
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
/* The figure's lean: a fraction of the wheel's tilt targets, so at the edge
   of the screen he turns 4.2 degrees and leans 2.5, and eased more heavily
   than the wheel — he is heavier than it. */
const FIGURE_TURN = 0.6;
const FIGURE_LEAN = 0.35;
const FIGURE_EASE = 0.045;
/* Below this change in degrees the frame is not worth a write. */
const FIGURE_EPSILON = 0.01;

let wheel: HTMLElement | null = null;
let figure: HTMLElement | null = null;
/* The cards, with the angle each one sits at, read once. Reading `--angle`
   per frame would mean a getComputedStyle call per card per frame. */
let cards: { el: HTMLElement; angle: number }[] = [];
let observer: IntersectionObserver | null = null;
/* Takes the wheel's 3D layers out of the tree while the hero is more than a
   screen away (is-far on the stage), so the layer tree the rest of the page
   updates every frame does not carry them. */
let farObserver: IntersectionObserver | null = null;
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
/* Where the figure has eased to, and what was last written for it. */
let figX = 0;
let figY = 0;
let wroteX = 0;
let wroteY = 0;

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
  // The figure: one transform on its own leaf, and only when it has moved
  // enough to see — at rest, with the pointer still, nothing is written.
  if (figure && (Math.abs(figX - wroteX) > FIGURE_EPSILON || Math.abs(figY - wroteY) > FIGURE_EPSILON)) {
    wroteX = figX;
    wroteY = figY;
    figure.style.transform = `translateX(-50%) perspective(1400px) rotateY(${(figY * FIGURE_TURN).toFixed(2)}deg) rotateX(${(figX * FIGURE_LEAN).toFixed(2)}deg)`;
  }
}

function tick(): void {
  if (!wheel) return;

  spin = (spin + SPIN_PER_SECOND * gsap.ticker.deltaRatio() * (1 / 60)) % 360;

  // A sixth of the remaining distance per frame: fast enough to feel attached
  // to the pointer, slow enough that a flick does not snap.
  tiltX += (pointerY * -MAX_TILT - tiltX) * 0.06;
  tiltY += (pointerX * MAX_TILT - tiltY) * 0.06;
  figX += (pointerY * -MAX_TILT - figX) * FIGURE_EASE;
  figY += (pointerX * MAX_TILT - figY) * FIGURE_EASE;

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
  // Only where there is a pointer to follow: on touch the figure keeps the
  // stylesheet's transform and is never written to.
  figure = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ? document.querySelector<HTMLElement>(".anime-hero__figure")
    : null;

  const stage = wheel.closest<HTMLElement>(".js-anime-hero");
  if (stage) {
    farObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) stage.classList.toggle("is-far", !entry.isIntersecting);
      },
      { rootMargin: "100% 0px 100% 0px" },
    );
    farObserver.observe(stage);
  }

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
  farObserver?.disconnect();
  farObserver = null;
  document.querySelector(".js-anime-hero")?.classList.remove("is-far");
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pointermove", onPointerMove);
  onTick = null;
  if (figure) figure.style.transform = "";
  figure = null;
  figX = figY = wroteX = wroteY = 0;
  wheel = null;
  cards = [];
}
