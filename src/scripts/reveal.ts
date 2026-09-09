// Adds .is-in to .reveal elements once they are 15% visible. Runs on every
// Astro page load (view transitions included). Reduced motion: reveal now.
function init(): void {
  const els = document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)");
  if (els.length === 0) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.15 },
  );
  els.forEach((el) => io.observe(el));
}

document.addEventListener("astro:page-load", init);

export {};
