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
  const img = el.querySelector("img") as HTMLImageElement;

  let raf = 0;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let visible = false;

  const tick = (): void => {
    x += (tx - x) * LERP;
    y += (ty - y) * LERP;
    el!.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
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
    ty = e.clientY - H / 2;
    if (tx + W > window.innerWidth - 8) tx = e.clientX - W - 24;
    if (ty < 8) ty = 8;
    if (ty + H > window.innerHeight - 8) ty = window.innerHeight - H - 8;
  };

  const show = (link: HTMLAnchorElement, e: PointerEvent): void => {
    const src = link.dataset.thumb!;
    if (img.getAttribute("src") !== src) {
      el!.classList.remove("is-on");
      img.src = src;
    }
    place(e);
    if (!visible) {
      x = tx;
      y = ty;
    }
    visible = true;
    el!.classList.add("is-on");
    start();
  };

  const hide = (): void => {
    visible = false;
    el!.classList.remove("is-on");
  };

  img.addEventListener("error", hide);

  for (const link of links) {
    link.addEventListener("pointerenter", (e) => show(link, e));
    link.addEventListener("pointermove", (e) => {
      place(e);
      start();
    });
    link.addEventListener("pointerleave", hide);
  }
}

document.addEventListener("astro:page-load", init);

export {};
