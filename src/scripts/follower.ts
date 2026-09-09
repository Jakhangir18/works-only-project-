// Hover preview for the work list: one fixed image that follows the pointer
// with a small lerp. Fine pointers only; off under reduced motion. The rAF
// loop runs only while a row is hovered. Writes transform on the follower
// element alone (never a custom property on an ancestor).

const LERP = 0.12;
const W = 320;
const H = 200;

function init(): void {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || reduce) return;

  const links = document.querySelectorAll<HTMLAnchorElement>(".work__link[data-thumb]");
  if (links.length === 0) return;

  let el = document.querySelector<HTMLDivElement>(".follower");
  if (!el) {
    el = document.createElement("div");
    el.className = "follower";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `<img alt="" width="${W}" height="${H}" decoding="async">`;
    document.body.appendChild(el);
  }
  const box = el;
  const img = box.querySelector("img") as HTMLImageElement;

  let raf = 0;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let visible = false;
  let current: HTMLAnchorElement | null = null;

  const tick = (): void => {
    x += (tx - x) * LERP;
    y += (ty - y) * LERP;
    box.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (visible || Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  };

  const start = (): void => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const place = (e: PointerEvent): void => {
    tx = e.clientX + 24;
    if (tx + W > window.innerWidth - 8) tx = e.clientX - W - 24;
    tx = Math.max(8, Math.min(tx, window.innerWidth - W - 8));
    ty = Math.max(8, Math.min(e.clientY - H / 2, window.innerHeight - H - 8));
  };

  const hide = (): void => {
    visible = false;
    current = null;
    box.classList.remove("is-on");
  };

  // Called on pointermove only, so rows scrolling under a resting cursor do
  // not flash the preview.
  const show = (link: HTMLAnchorElement, e: PointerEvent): void => {
    place(e);
    if (current === link) {
      start();
      return;
    }
    current = link;
    const src = link.dataset.thumb!;
    if (!visible) {
      x = tx;
      y = ty;
    }
    visible = true;
    if (img.getAttribute("src") === src) {
      box.classList.add("is-on");
      start();
      return;
    }
    box.classList.remove("is-on");
    img.src = src;
    img
      .decode()
      .then(() => {
        if (current === link && visible) box.classList.add("is-on");
      })
      .catch(() => {
        // A superseded decode (src changed for another row) rejects too; only
        // a failure of the current row hides the preview.
        if (current === link) hide();
      });
    start();
  };

  for (const link of links) {
    link.addEventListener("pointermove", (e) => show(link, e));
    link.addEventListener("pointerleave", hide);
  }
  window.addEventListener("scroll", hide, { passive: true });

  // Whatever this init created, the swap destroys.
  document.addEventListener(
    "astro:before-swap",
    () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      hide();
      window.removeEventListener("scroll", hide);
      box.remove();
    },
    { once: true },
  );

  // Warm the thumbs once the page is idle so the first hover has no blank frame.
  const warm = (): void => {
    for (const link of links) {
      const i = new Image();
      i.src = link.dataset.thumb!;
    }
  };
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(warm);
  } else {
    setTimeout(warm, 800);
  }
}

init();
document.addEventListener("astro:after-swap", init);

export {};
