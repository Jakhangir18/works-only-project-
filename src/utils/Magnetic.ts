import { gsap } from "gsap";

/**
 * Buttons that lean toward the pointer and spring back when it leaves.
 *
 * The pull is a fraction of the pointer's offset from the button's centre,
 * capped at a few pixels, written as one transform on the button through
 * GSAP's quickTo — so it rides gsap.ticker, exists only while a pointer is
 * over the button, and is finished within 0.6 s of the pointer leaving. The
 * button's box is read once on pointerenter, never per move, so no geometry
 * read lands between writes.
 *
 * Only where there is a hovering, fine pointer: a touchscreen would get a
 * button that jumps on tap. Reduced motion is read live on every enter, so
 * changing the setting mid-session is honoured on the next hover.
 */

const PULL = 0.3; // fraction of the pointer's offset from the centre
const MAX = 12; // px either way

type Bound = {
  el: HTMLElement;
  enter: () => void;
  move: (event: PointerEvent) => void;
  leave: () => void;
  /* Set while the pointer is over the button: the box, the scroll position
     it was read at, and where the pointer last was. */
  rect: DOMRect | null;
  rectScrollY: number;
  lastX: number;
  lastY: number;
};

const bound: Bound[] = [];
let onScroll: (() => void) | null = null;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));

export function initMagnetic(selector = "[data-magnetic]"): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const xTo = gsap.quickTo(el, "x", { duration: 0.35, ease: "power3.out" });
    const yTo = gsap.quickTo(el, "y", { duration: 0.35, ease: "power3.out" });
    const b: Bound = { el, enter: () => {}, move: () => {}, leave: () => {}, rect: null, rectScrollY: 0, lastX: 0, lastY: 0 };

    const enter = () => {
      if (reduced()) return;
      b.rect = el.getBoundingClientRect();
      b.rectScrollY = window.scrollY;
      // Promoted only while the pointer is over it, so the pull composites
      // instead of repainting the button, and a standing layer is not paid
      // for at rest. On the VPS's software rasteriser this made no measurable
      // difference (explore-pointer median 49.9 ms with and without it); the
      // reason to keep it is the GPU case, not a number from here.
      el.style.willChange = "transform";
    };
    const move = (event: PointerEvent) => {
      if (!b.rect) return;
      b.lastX = event.clientX;
      b.lastY = event.clientY;
      if (window.scrollY !== b.rectScrollY) {
        // The page moved under the pointer since the box was read: one read,
        // before the writes below.
        b.rect = el.getBoundingClientRect();
        b.rectScrollY = window.scrollY;
      }
      const cx = b.rect.left + b.rect.width / 2;
      const cy = b.rect.top + b.rect.height / 2;
      xTo(clamp((event.clientX - cx) * PULL));
      yTo(clamp((event.clientY - cy) * PULL));
    };
    const leave = () => {
      if (!b.rect) return;
      b.rect = null;
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 0.6,
        ease: "elastic.out(1, 0.45)",
        overwrite: "auto",
        onComplete: () => {
          el.style.willChange = "";
        },
      });
    };

    b.enter = enter;
    b.move = move;
    b.leave = leave;
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    bound.push(b);
  }

  // A button can scroll out from under a resting pointer with no
  // pointerleave: at most one is hovered, so this is one read when it is.
  onScroll = () => {
    for (const b of bound) {
      if (!b.rect) continue;
      b.rect = b.el.getBoundingClientRect();
      b.rectScrollY = window.scrollY;
      const inside = b.lastX >= b.rect.left && b.lastX <= b.rect.right && b.lastY >= b.rect.top && b.lastY <= b.rect.bottom;
      if (!inside) b.leave();
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true });
}

export function destroyMagnetic(): void {
  if (onScroll) window.removeEventListener("scroll", onScroll);
  onScroll = null;
  for (const { el, enter, move, leave } of bound) {
    el.removeEventListener("pointerenter", enter);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerleave", leave);
    gsap.killTweensOf(el);
    el.style.transform = "";
    el.style.willChange = "";
  }
  bound.length = 0;
}
