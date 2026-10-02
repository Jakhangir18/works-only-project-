/**
 * Marks split headings, and anything else carrying `data-reveal`, as in
 * view, once each.
 *
 * No loop: an IntersectionObserver adds `.is-in` and lets go of the heading,
 * and the words' CSS transitions do the rest on the compositor. Headings that
 * are already on screen when the script runs get the class in the first
 * callback, so nothing sits hidden waiting for a scroll that never comes.
 *
 * `js-reveal` on the root is what makes the hidden state exist at all. On the
 * anime home the intro cover is opaque for the first second, so the frame
 * between first paint and this class landing is never seen.
 */

let observer: IntersectionObserver | null = null;
let pending = 0;

export function initReveal(): void {
  if (typeof window === "undefined") return;
  const targets = document.querySelectorAll<HTMLElement>("[data-split], [data-reveal]");
  if (!targets.length) return;

  // Only the headings have a hidden state behind this class; a card with
  // `data-reveal` is visible throughout and gets `.is-in` for its own ending.
  document.documentElement.classList.add("js-reveal");
  pending = targets.length;

  observer = new IntersectionObserver(
    (entries, io) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
        pending -= 1;
      }
      // Whatever a component creates, it destroys: once every heading is in,
      // the observer has nothing left to watch.
      if (pending <= 0) destroyReveal();
    },
    { rootMargin: "0px 0px -15% 0px", threshold: 0 },
  );

  targets.forEach((t) => observer?.observe(t));
}

export function destroyReveal(): void {
  observer?.disconnect();
  observer = null;
  pending = 0;
}
