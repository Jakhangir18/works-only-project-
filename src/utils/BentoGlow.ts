import { gsap } from "gsap";

/**
 * The spotlight on the bento cards: a soft disc that follows the pointer
 * inside whichever card it is over.
 *
 * One delegated pointermove on the grid, never one listener per card. The
 * disc is its own leaf element inside the card, positioned by a transform
 * through quickTo — never a custom property on the card, which is an
 * ancestor of its text and would re-style it on every move (invariant 2).
 * The card's box is read once when the active card changes, not per move.
 *
 * The border beam needs no script: it is a CSS animation declared only under
 * `:hover`, so off-hover it does not exist rather than idle.
 *
 * Hover-and-fine-pointer only, and reduced motion is read live on each card
 * change: under reduce the disc parks centred at a lower opacity and nothing
 * follows the pointer.
 */

const SPOT = 360; // px, matches the CSS size of .bento-card__spot

let grid: HTMLElement | null = null;
let active: HTMLElement | null = null;
let spot: HTMLElement | null = null;
let rect: DOMRect | null = null;
let xTo: ((v: number) => void) | null = null;
let yTo: ((v: number) => void) | null = null;
let onMove: ((event: PointerEvent) => void) | null = null;
let onLeave: (() => void) | null = null;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function setActive(card: HTMLElement | null): void {
  if (spot) {
    gsap.to(spot, { opacity: 0, duration: 0.25, overwrite: "auto" });
    // Promoted only while it is the one under the pointer: five standing
    // 360px layers would be memory the rest of the page pays for.
    spot.style.willChange = "";
  }
  active = card;
  spot = card?.querySelector<HTMLElement>(".bento-card__spot") ?? null;
  rect = card ? card.getBoundingClientRect() : null;
  xTo = spot ? gsap.quickTo(spot, "x", { duration: 0.3, ease: "power3.out" }) : null;
  yTo = spot ? gsap.quickTo(spot, "y", { duration: 0.3, ease: "power3.out" }) : null;
  if (spot && rect) {
    if (reduced()) {
      // Parked in the centre, dimmer, still.
      gsap.set(spot, { x: rect.width / 2 - SPOT / 2, y: rect.height / 2 - SPOT / 2 });
      gsap.to(spot, { opacity: 0.6, duration: 0.25, overwrite: "auto" });
    } else {
      spot.style.willChange = "transform, opacity";
      gsap.to(spot, { opacity: 1, duration: 0.25, overwrite: "auto" });
    }
  }
}

export function initBentoGlow(): void {
  if (typeof window === "undefined") return;
  grid = document.querySelector<HTMLElement>(".bento-grid");
  if (!grid) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  onMove = (event: PointerEvent) => {
    const card = (event.target as Element | null)?.closest?.(".bento-card") as HTMLElement | null;
    if (card !== active) setActive(card);
    if (!active || !spot || !rect || !xTo || !yTo || reduced()) return;
    xTo(event.clientX - rect.left - SPOT / 2);
    yTo(event.clientY - rect.top - SPOT / 2);
  };
  onLeave = () => setActive(null);

  grid.addEventListener("pointermove", onMove, { passive: true });
  grid.addEventListener("pointerleave", onLeave);
}

export function destroyBentoGlow(): void {
  if (grid && onMove) grid.removeEventListener("pointermove", onMove);
  if (grid && onLeave) grid.removeEventListener("pointerleave", onLeave);
  if (spot) gsap.killTweensOf(spot);
  grid = null;
  active = null;
  spot = null;
  rect = null;
  xTo = null;
  yTo = null;
  onMove = null;
  onLeave = null;
}
