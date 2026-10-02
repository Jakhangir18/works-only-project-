/**
 * The few behaviours a case page has, all event-driven: nothing here runs a
 * frame loop.
 *   - Reveals: [data-reveal] elements fade up once, by IntersectionObserver.
 *   - Loops: muted footage plays while on screen and pauses off it.
 *   - Decks: the counter follows the track's scroll; the buttons page it.
 */
export function initCase(): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.classList.add("js-case");

  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        reveal.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => reveal.observe(el));

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const loops = [...document.querySelectorAll<HTMLVideoElement>(".js-case-loop")];
  if (loops.length) {
    const playback = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const v = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && !reduce && !document.hidden) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.35 },
    );
    loops.forEach((v) => playback.observe(v));
    // Under reduced motion the loops are still there to watch, by hand.
    if (reduce) loops.forEach((v) => (v.controls = true));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) loops.forEach((v) => v.pause());
    });
  }

  document.querySelectorAll<HTMLElement>(".js-case-deck").forEach((deck) => {
    const track = deck.querySelector<HTMLElement>(".js-case-deck-track");
    const at = deck.querySelector<HTMLElement>(".js-case-deck-at");
    const pages = track ? [...track.children] as HTMLElement[] : [];
    if (!track || !pages.length) return;
    // One page's width plus the gap, read once and again only after a
    // resize, never inside the scroll handler's frame.
    let width = 0;
    window.addEventListener("resize", () => (width = 0), { passive: true });
    const step = () => (width ||= pages[0].getBoundingClientRect().width + 16);
    let shown = 1;
    track.addEventListener(
      "scroll",
      () => {
        const n = Math.min(pages.length, Math.round(track.scrollLeft / step()) + 1);
        if (n !== shown && at) {
          shown = n;
          at.textContent = String(n);
        }
      },
      { passive: true },
    );
    const go = (dir: number) => track.scrollBy({ left: dir * step(), behavior: reduce ? "auto" : "smooth" });
    deck.querySelector(".js-case-deck-prev")?.addEventListener("click", () => go(-1));
    deck.querySelector(".js-case-deck-next")?.addEventListener("click", () => go(1));
  });
}
