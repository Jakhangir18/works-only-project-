// Adds .is-in to .reveal elements as they enter the viewport. Elements already
// in view get the class synchronously so a view-transition swap never shows an
// empty page. Reduced motion: reveal everything at once.
function init(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal:not(.is-in)"));
  if (els.length === 0) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) {
    for (const el of els) el.classList.add("is-in");
    return;
  }

  const vh = window.innerHeight;
  const pending: HTMLElement[] = [];
  for (const el of els) {
    if (el.getBoundingClientRect().top < vh) el.classList.add("is-in");
    else pending.push(el);
  }
  if (pending.length === 0) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { threshold: 0, rootMargin: "0px 0px -12% 0px" },
  );
  for (const el of pending) io.observe(el);
}

document.addEventListener("astro:page-load", init);
document.addEventListener("astro:after-swap", init);

export {};
