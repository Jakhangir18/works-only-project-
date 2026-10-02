import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { writeIfChanged, forgetLeaf } from "./leafWrite";
import { getSmoothScroll } from "./SmoothScroll";

/**
 * The WORK section's three acts, from one ScrollTrigger over the section
 * while its stage is held (top at the top of the screen to bottom at the
 * bottom):
 *   1. the four front letters rise in, one after another;
 *   2. their copies fade in round each ring and the rings turn, alternate
 *      rows in opposite directions — the old tunnel's rows;
 *   3. a veil dims the tunnel, the card ring fades in and turns one card per
 *      seventh of the rest of the scroll.
 *
 * Scroll is the only source of truth. Dragging the carousel with a mouse
 * scrolls the page; focusing a card with the keyboard scrolls to the place
 * where that card is at the front. Both go through Lenis when it runs.
 *
 * Measured once per refresh: the two ring radii, which are also handed to
 * the stylesheet (one custom property per ring container, per resize — not
 * per frame), and the scroll positions. Per frame: one transform per ring,
 * one for the card ring, the veil's and the carousel's opacity, and the
 * letters' opacities only inside the windows where they change; everything
 * through writeIfChanged.
 */

const ACT1 = [0.02, 0.15] as const; // front letters, staggered inside this
const COPIES = [0.16, 0.27] as const;
const TURN_FROM = 0.15;
const TURN_DEGREES = 160; // each ring's turn over the rest of the section
const VEIL = [0.27, 0.35] as const;
const VEIL_MAX = 0.74;
const CARDS_IN = [0.3, 0.38] as const;
const CARDS_TURN = [0.38, 0.95] as const;
/* A card ring's radius: half a card over tan(pi / n), times this gap; wider
   on a phone, where the cards are most of the screen's width. */
const CARD_GAP = 1.2;
const CARD_GAP_NARROW = 1.3;
/* A letter rises this far as it comes in, in px. */
const RISE = 46;

let trigger: ScrollTrigger | null = null;
let section: HTMLElement | null = null;
let tunnel: HTMLElement | null = null;
let rings: HTMLElement[] = [];
let fronts: HTMLElement[] = [];
let copies: { el: HTMLElement; row: number }[] = [];
let veil: HTMLElement | null = null;
let carousel: HTMLElement | null = null;
let cardRing: HTMLElement | null = null;
let cards: HTMLAnchorElement[] = [];
let count: HTMLElement | null = null;
let hint: HTMLElement | null = null;

let letterRadius = 420;
let cardRadius = 520;
let lastIndex = -1;
let shown = false;
let nearObserver: IntersectionObserver | null = null;

/* Drag state. */
let dragging = false;
let dragStartX = 0;
let dragStartScroll = 0;
let dragMoved = 0;
let onDown: ((e: PointerEvent) => void) | null = null;
let onMove: ((e: PointerEvent) => void) | null = null;
let onUp: ((e: PointerEvent) => void) | null = null;
let onClickCapture: ((e: MouseEvent) => void) | null = null;
let onFocusIn: ((e: FocusEvent) => void) | null = null;

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

function measure(): void {
  const vw = window.innerWidth;
  // Under half the perspective (1100px), so the whole ring stays in front of
  // the camera; at this radius its sides cross the screen's edges.
  letterRadius = Math.round(Math.min(520, Math.max(220, vw * 0.34)));
  tunnel?.style.setProperty("--radius", `${letterRadius}px`);
  // While the section is far its carousel is out of the tree and has no
  // width; the observer measures again as it comes near.
  if (cardRing && cards.length && cardRing.clientWidth > 0) {
    const width = cardRing.clientWidth;
    const gap = vw < 640 ? CARD_GAP_NARROW : CARD_GAP;
    cardRadius = Math.round((width / 2 / Math.tan(Math.PI / cards.length)) * gap);
    cardRing.style.setProperty("--ring-radius", `${cardRadius}px`);
  }
}

function scrollTo(y: number, immediate: boolean): void {
  const lenis = getSmoothScroll();
  if (lenis) lenis.scrollTo(y, { immediate });
  else window.scrollTo({ top: y, behavior: immediate ? "instant" : "smooth" } as ScrollToOptions);
}

/* The scroll position at which card `i` is at the front. */
function scrollForCard(i: number): number {
  if (!trigger) return window.scrollY;
  const at = CARDS_TURN[0] + (CARDS_TURN[1] - CARDS_TURN[0]) * (i / Math.max(1, cards.length - 1));
  return trigger.start + at * (trigger.end - trigger.start);
}

function apply(p: number): void {
  // Act 1: the front letters, W first.
  fronts.forEach((el, row) => {
    const span = (ACT1[1] - ACT1[0]) / 2;
    const from = ACT1[0] + (row * (ACT1[1] - ACT1[0] - span)) / Math.max(1, fronts.length - 1);
    const t = ramp(p, from, from + span);
    const eased = 1 - (1 - t) * (1 - t);
    writeIfChanged(el, "opacity", t.toFixed(3));
    writeIfChanged(el, "transform", `rotateY(0deg) translateZ(${-letterRadius}px) translateY(${((1 - eased) * RISE).toFixed(1)}px)`);
  });

  // Act 2: the copies, row by row, and the turn.
  for (const c of copies) {
    const span = (COPIES[1] - COPIES[0]) * 0.55;
    const from = COPIES[0] + (c.row * (COPIES[1] - COPIES[0] - span)) / 3;
    writeIfChanged(c.el, "opacity", ramp(p, from, from + span).toFixed(3));
  }
  const turn = Math.max(0, p - TURN_FROM) / (1 - TURN_FROM);
  rings.forEach((el, row) => {
    const dir = row % 2 ? -1 : 1;
    writeIfChanged(el, "transform", `translateZ(${letterRadius}px) rotateY(${(dir * turn * TURN_DEGREES).toFixed(2)}deg)`);
  });

  // Act 3: the veil, the cards.
  if (veil) writeIfChanged(veil, "opacity", (ramp(p, VEIL[0], VEIL[1]) * VEIL_MAX).toFixed(3));
  const cardsIn = ramp(p, CARDS_IN[0], CARDS_IN[1]);
  const show = cardsIn > 0;
  if (carousel) {
    writeIfChanged(carousel, "opacity", cardsIn.toFixed(3));
    if (show !== shown) {
      shown = show;
      carousel.style.visibility = show ? "visible" : "hidden";
      hint?.classList.toggle("is-on", show);
    }
  }
  if (cardRing && cards.length) {
    const position = ramp(p, CARDS_TURN[0], CARDS_TURN[1]) * (cards.length - 1);
    writeIfChanged(cardRing, "transform", `translateZ(${-cardRadius}px) rotateY(${((-position * 360) / cards.length).toFixed(2)}deg)`);
    const index = Math.round(position);
    if (index !== lastIndex) {
      lastIndex = index;
      if (count) count.textContent = String(index + 1).padStart(2, "0");
      cards.forEach((card, i) => card.classList.toggle("is-front", i === index));
    }
  }
}

function bindInput(): void {
  if (!carousel) return;
  onDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    dragging = true;
    dragMoved = 0;
    dragStartX = e.clientX;
    dragStartScroll = window.scrollY;
  };
  onMove = (e) => {
    if (!dragging || !trigger || !cardRing) return;
    const dx = e.clientX - dragStartX;
    dragMoved = Math.max(dragMoved, Math.abs(dx));
    // One card's width of drag turns the ring by one card.
    const step = (CARDS_TURN[1] - CARDS_TURN[0]) * (trigger.end - trigger.start) / Math.max(1, cards.length - 1);
    const perPx = step / Math.max(1, cardRing.clientWidth);
    scrollTo(dragStartScroll - dx * perPx, true);
  };
  onUp = () => {
    dragging = false;
  };
  // A drag that ends on a card is not a click on it.
  onClickCapture = (e) => {
    if (dragMoved > 6) {
      e.preventDefault();
      e.stopPropagation();
      dragMoved = 0;
    }
  };
  // The keyboard reaches every card in order; bring the focused one round.
  onFocusIn = (e) => {
    const card = (e.target as HTMLElement).closest<HTMLAnchorElement>(".js-work-card");
    if (!card) return;
    const i = Number(card.dataset.index);
    if (Number.isFinite(i) && i !== lastIndex) scrollTo(scrollForCard(i), false);
  };
  carousel.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  carousel.addEventListener("click", onClickCapture, true);
  carousel.addEventListener("focusin", onFocusIn);
}

export function initWorkCarousel(): void {
  if (typeof window === "undefined") return;
  section = document.querySelector<HTMLElement>(".anime-work");
  tunnel = document.querySelector<HTMLElement>(".anime-work__tunnel");
  rings = [...document.querySelectorAll<HTMLElement>(".js-work-ring")];
  fronts = rings.map((ring) => ring.querySelector<HTMLElement>(".js-work-letter.is-front")).filter((el): el is HTMLElement => !!el);
  copies = rings.flatMap((ring, row) =>
    [...ring.querySelectorAll<HTMLElement>(".js-work-letter:not(.is-front)")].map((el) => ({ el, row })),
  );
  veil = document.querySelector<HTMLElement>(".js-work-veil");
  carousel = document.querySelector<HTMLElement>(".js-work-carousel");
  cardRing = document.querySelector<HTMLElement>(".js-work-cards");
  cards = [...document.querySelectorAll<HTMLAnchorElement>(".js-work-card")];
  count = document.querySelector<HTMLElement>(".js-work-count");
  hint = document.querySelector<HTMLElement>(".anime-work__hint");
  if (!section || !cardRing || !cards.length) return;

  // Stillness, not absence: the stylesheet sets the word and a row of cards.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Far from the screen the stage's layers leave the tree (see is-far in
  // AnimeWork.astro); a screen's margin brings them back before they show.
  section.classList.add("is-far");
  nearObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        section?.classList.toggle("is-far", !entry.isIntersecting);
        if (entry.isIntersecting && trigger) {
          measure();
          apply(trigger.progress);
        }
      }
    },
    { rootMargin: "100% 0px 100% 0px" },
  );
  nearObserver.observe(section);

  gsap.registerPlugin(ScrollTrigger);
  measure();
  trigger = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => apply(self.progress),
    onRefresh: (self) => {
      measure();
      apply(self.progress);
    },
  });
  apply(trigger.progress);
  bindInput();
}

export function destroyWorkCarousel(): void {
  trigger?.kill();
  trigger = null;
  nearObserver?.disconnect();
  nearObserver = null;
  section?.classList.remove("is-far");
  if (carousel) {
    if (onDown) carousel.removeEventListener("pointerdown", onDown);
    if (onClickCapture) carousel.removeEventListener("click", onClickCapture, true);
    if (onFocusIn) carousel.removeEventListener("focusin", onFocusIn);
  }
  if (onMove) window.removeEventListener("pointermove", onMove);
  if (onUp) window.removeEventListener("pointerup", onUp);
  onDown = onMove = onUp = null;
  onClickCapture = null;
  onFocusIn = null;
  for (const el of [veil, carousel, cardRing, ...rings, ...fronts, ...copies.map((c) => c.el)]) if (el) forgetLeaf(el);
  section = tunnel = veil = carousel = cardRing = count = hint = null;
  rings = [];
  fronts = [];
  copies = [];
  cards = [];
  lastIndex = -1;
  shown = false;
  dragging = false;
}
