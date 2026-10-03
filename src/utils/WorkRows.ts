import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { writeIfChanged, forgetLeaf } from "./leafWrite";
import { getSmoothScroll } from "./SmoothScroll";

/**
 * The WORK section's word rows (AnimeWork.astro), from one ScrollTrigger over
 * the section while its stage is held:
 *   1. the rows open: each row's two sides slide out from behind its centre
 *      letter, the stack the star field drew;
 *   2. the rows drift sideways, each so that its projects' photographs cross
 *      the middle of the screen at their stops;
 *   3. at each stop one preview grows out of the project's photograph into a
 *      large card and goes back into the row.
 *
 * Scroll is the only source of truth. Focusing a project's photograph with
 * the keyboard scrolls to its stop, through Lenis when it runs.
 *
 * Geometry is read once per refresh and again when the section comes near
 * (the near observer): the stage's size, each track's centre-letter offset
 * and each photograph's offset in its track, all with offsetLeft/offsetTop,
 * which ignore the transforms written here. Letters sit in fixed em cells
 * and photographs in fixed em boxes, so font loading cannot move them after
 * a measure. Per frame nothing is read: a photograph's place on screen is
 * its cached offset plus its row's drift, which is arithmetic on progress.
 * Writes go through writeIfChanged: one transform per track, the sides'
 * transform and opacity while the rows open, one preview's transform, and a
 * few opacities.
 *
 * The preview is laid out at its full size and only ever scaled down onto a
 * photograph (invariant 7), uniformly, because the photograph's box has the
 * preview's 3:4 shape. Two previews take the stops in turn; each opens on
 * the photograph's already decoded thumbnail and swaps to the large file
 * only once that has decoded, never in the middle of a grow.
 */

/* In the section's progress. */
const OPEN = [0.0, 0.12] as const; // the rows open, row by row inside this
const FIRST_STOP = 0.19;
const LAST_STOP = 0.9;
/* Around each stop: the card grows over GROW, holds over HOLD either side. */
const GROW = 0.042;
const HOLD = 0.018;
/* The rows dim to this while a card is up. */
const ROWS_DIM = 0.28;
/* How far each side slides out from behind the centre letter, in letters. */
const OPEN_SLIDE = 0.9;
/* A row with one photograph drifts this far over the section, in screens. */
const LONE_DRIFT = 0.7;

type Card = {
  href: string;
  title: string;
  kind: string;
  line: string;
  when: string;
  thumb: string;
  src: string;
  srcset: string;
  alt: string;
  focal: string;
};

type Row = {
  track: HTMLElement;
  sides: HTMLElement[];
  /* Offset of the centre letter's middle from the track's left edge. */
  centre: number;
  /* Stage-relative y of the row's middle. */
  y: number;
  /* Drift keyframes: [progress, x], x relative to the stack pose. */
  keys: [number, number][];
};

type Slot = { el: HTMLAnchorElement; img: HTMLImageElement | null; row: number; stop: number; offset: number; w: number; h: number };

type Preview = {
  el: HTMLAnchorElement;
  img: HTMLImageElement;
  info: HTMLElement;
  kind: HTMLElement;
  title: HTMLElement;
  line: HTMLElement;
  when: HTMLElement;
  stop: number;
  big: boolean;
};

let trigger: ScrollTrigger | null = null;
let section: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let grid: HTMLElement | null = null;
let rowsEl: HTMLElement | null = null;
let rows: Row[] = [];
let slots: Slot[] = [];
let previews: Preview[] = [];
let cards: Card[] = [];
let nearObserver: IntersectionObserver | null = null;
let onFocusIn: ((e: FocusEvent) => void) | null = null;
let onFocusOut: (() => void) | null = null;
let focusedStop = -1;
let hiddenStop = -1;
/* The stack's centre letters show while the star field has handed over
   (Space.ts, at its progress 1) or while this section is past its start.
   Two sources because ScrollTrigger counts a trigger active only strictly
   inside its range: on the exact scroll where one section ends and the
   other begins, neither is active, and the word would blink out. */
let shownBySpace = false;
let shownByRows = false;

function syncShown(): void {
  section?.classList.toggle("is-on", shownBySpace || shownByRows);
}

/** From Space.ts: the constellation has handed the word over. */
export function showWorkStack(on: boolean): void {
  if (on === shownBySpace) return;
  shownBySpace = on;
  syncShown();
}

let W = 0;
let shotW = 0;
let shotH = 0;
let shotX = 0;
let shotY = 0;
let letter = 0;

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

function stopAt(i: number): number {
  return FIRST_STOP + ((LAST_STOP - FIRST_STOP) * i) / Math.max(1, cards.length - 1);
}

/* A row's drift at progress p: still while the rows open, then through its
   keyframes, carrying on at the last segment's speed after the last one. */
function rowX(row: Row, p: number): number {
  const k = row.keys;
  if (p <= k[0][0]) return 0;
  for (let i = 1; i < k.length; i++) {
    if (p <= k[i][0]) {
      const t = (p - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * t;
    }
  }
  const a = k[k.length - 2];
  const b = k[k.length - 1];
  return b[1] + ((b[1] - a[1]) / (b[0] - a[0])) * (p - b[0]);
}

function measure(): void {
  if (!stage) return;
  W = stage.clientWidth;
  const first = previews[0]?.el;
  if (first) {
    // The preview's box at its full size, where the stylesheet put it.
    shotW = first.offsetWidth;
    shotH = first.offsetHeight;
    shotX = first.offsetLeft + shotW / 2;
    shotY = first.offsetTop + shotH / 2;
  }
  for (const row of rows) {
    const centre = row.track.querySelector<HTMLElement>(".js-work-centre");
    if (centre) row.centre = centre.offsetLeft + centre.offsetWidth / 2;
    letter = centre?.offsetHeight || letter;
    const parent = row.track.offsetParent as HTMLElement | null;
    row.y = (parent?.offsetTop ?? 0) + (rowsEl?.offsetTop ?? 0) + row.track.offsetTop + row.track.offsetHeight / 2;
  }
  for (const s of slots) {
    // The photograph's middle, from its track's left edge. Its offsetParent
    // is the track (the side is not positioned); should an engine count the
    // side's transform as positioning, add the side's own offset.
    const sideEl = s.el.parentElement as HTMLElement;
    const base = s.el.offsetParent === sideEl ? sideEl.offsetLeft : 0;
    s.offset = base + s.el.offsetLeft + s.el.offsetWidth / 2;
    s.w = s.el.offsetWidth;
    s.h = s.el.offsetHeight;
  }
  // Each row's keyframes: the stack pose until the rows have opened, then
  // each of its photographs in the middle of the screen at its stop.
  rows.forEach((row, r) => {
    const own = slots.filter((s) => s.row === r).sort((a, b) => a.stop - b.stop);
    const keys: [number, number][] = [[OPEN[1], 0]];
    for (const s of own) keys.push([stopAt(s.stop), row.centre - s.offset]);
    if (keys.length === 2) {
      // One photograph: carry on past it at an even pace, in the direction
      // it was already going.
      const dir = Math.sign(keys[1][1]) || 1;
      keys.push([1, keys[1][1] + dir * LONE_DRIFT * W * (1 - keys[1][0])]);
    }
    row.keys = keys;
  });
}

function scrollTo(y: number): void {
  const lenis = getSmoothScroll();
  if (lenis) lenis.scrollTo(y, { immediate: false });
  else window.scrollTo({ top: y, behavior: "smooth" });
}

function fill(pv: Preview, stop: number): void {
  const c = cards[stop];
  if (!c) return;
  pv.stop = stop;
  pv.big = false;
  pv.el.href = c.href;
  pv.kind.textContent = c.kind;
  pv.title.textContent = c.title;
  pv.line.textContent = c.line;
  pv.when.textContent = c.when;
  pv.img.removeAttribute("srcset");
  pv.img.sizes = "";
  pv.img.style.objectPosition = c.focal;
  // The row's thumbnail is already decoded: the card opens on it.
  pv.img.src = c.thumb;
  const big = new Image();
  big.sizes = `${Math.round(shotW)}px`;
  big.srcset = c.srcset;
  big.src = c.src;
  big
    .decode()
    .then(() => {
      if (pv.stop !== stop) return;
      pv.big = true;
      pv.img.srcset = c.srcset;
      pv.img.sizes = big.sizes;
      pv.img.src = c.src;
    })
    .catch(() => {});
}

function apply(p: number): void {
  // 1. The rows open, row by row.
  rows.forEach((row, r) => {
    const span = (OPEN[1] - OPEN[0]) * 0.6;
    const from = OPEN[0] + (r * (OPEN[1] - OPEN[0] - span)) / Math.max(1, rows.length - 1);
    const t = easeOut(ramp(p, from, from + span));
    row.sides.forEach((side) => {
      const dir = Number(side.dataset.dir) || 1;
      writeIfChanged(side, "transform", `translate3d(${(-dir * (1 - t) * OPEN_SLIDE * letter).toFixed(1)}px, 0, 0)`);
      writeIfChanged(side, "opacity", t.toFixed(3));
    });
    // 2. The drift; the track's base puts the centre letter on the stage's
    // centre line (the track's left edge is already there).
    writeIfChanged(row.track, "transform", `translate3d(${(rowX(row, p) - row.centre).toFixed(1)}px, 0, 0)`);
  });
  if (grid) writeIfChanged(grid, "opacity", ramp(p, OPEN[0], OPEN[1]).toFixed(3));

  // 3. The stops: the nearest one's card, grown by how close we are.
  let near = 0;
  let best = Infinity;
  for (let i = 0; i < cards.length; i++) {
    const d = Math.abs(p - stopAt(i));
    if (d < best) {
      best = d;
      near = i;
    }
  }
  const up = easeInOut(1 - ramp(best, HOLD, HOLD + GROW));
  const pv = previews[near % previews.length];
  const other = previews[(near + 1) % previews.length];
  if (pv && pv.stop !== near) fill(pv, near);
  // The next stop's card fills ahead, so its photograph is decoding before
  // it is needed.
  const next = Math.min(cards.length - 1, near + (p > stopAt(near) ? 1 : -1));
  if (other && next !== near && other.stop !== next) fill(other, next);

  const slot = slots.find((s) => s.stop === near);
  const row = slot ? rows[slot.row] : null;
  if (pv && slot && row && shotH) {
    const sx = W / 2 + rowX(row, p) - row.centre + slot.offset;
    const sy = row.y;
    const s0 = slot.h / shotH;
    const scale = s0 + (1 - s0) * up;
    const x = (sx - shotX) * (1 - up);
    const y = (sy - shotY) * (1 - up);
    writeIfChanged(pv.el, "transform", `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`);
    writeIfChanged(pv.el, "opacity", up > 0.001 ? "1" : "0");
    writeIfChanged(pv.info, "opacity", ramp(up, 0.88, 1).toFixed(3));
    pv.el.classList.toggle("is-up", up > 0.6);
    pv.el.classList.toggle("is-focus", focusedStop === near && up > 0.6);
  }
  if (other) {
    writeIfChanged(other.el, "opacity", "0");
    other.el.classList.remove("is-up", "is-focus");
  }
  // The row's own photograph steps aside while its card is out; opacity,
  // not visibility, so a photograph with keyboard focus keeps it.
  const hide = up > 0.001 ? near : -1;
  if (hide !== hiddenStop) {
    for (const s of slots) writeIfChanged(s.el, "opacity", s.stop === hide ? "0" : "1");
    hiddenStop = hide;
  }
  if (rowsEl) writeIfChanged(rowsEl, "opacity", (1 - (1 - ROWS_DIM) * up).toFixed(3));
}

function bindFocus(): void {
  if (!section) return;
  onFocusIn = (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(".js-work-slot");
    if (!a || !trigger) return;
    const stop = Number(a.dataset.stop);
    if (!Number.isFinite(stop)) return;
    focusedStop = stop;
    scrollTo(trigger.start + stopAt(stop) * (trigger.end - trigger.start));
  };
  onFocusOut = () => {
    focusedStop = -1;
  };
  section.addEventListener("focusin", onFocusIn);
  section.addEventListener("focusout", onFocusOut);
}

export function initWorkRows(): void {
  if (typeof window === "undefined") return;
  section = document.querySelector<HTMLElement>(".anime-work");
  stage = document.querySelector<HTMLElement>(".js-work-stage");
  grid = document.querySelector<HTMLElement>(".js-work-grid");
  rowsEl = document.querySelector<HTMLElement>(".js-work-rows");
  if (!section || !stage || !rowsEl) return;
  try {
    cards = JSON.parse(stage.dataset.cards || "[]") as Card[];
  } catch {
    cards = [];
  }
  rows = [...document.querySelectorAll<HTMLElement>(".js-work-track")].map((track) => ({
    track,
    sides: [...track.querySelectorAll<HTMLElement>(".js-work-side")],
    centre: 0,
    y: 0,
    keys: [[OPEN[1], 0]],
  }));
  slots = [...document.querySelectorAll<HTMLAnchorElement>(".js-work-slot")].map((el) => ({
    el,
    img: el.querySelector("img"),
    row: Number(el.closest<HTMLElement>(".js-work-track")?.dataset.row) || 0,
    stop: Number(el.dataset.stop) || 0,
    offset: 0,
    w: 0,
    h: 0,
  }));
  previews = [...document.querySelectorAll<HTMLAnchorElement>(".js-work-preview")].map((el) => ({
    el,
    img: el.querySelector<HTMLImageElement>(".js-work-preview-img")!,
    info: el.querySelector<HTMLElement>(".js-work-preview-info")!,
    kind: el.querySelector<HTMLElement>(".js-work-preview-kind")!,
    title: el.querySelector<HTMLElement>(".js-work-preview-title")!,
    line: el.querySelector<HTMLElement>(".js-work-preview-line")!,
    when: el.querySelector<HTMLElement>(".js-work-preview-when")!,
    stop: -1,
    big: false,
  }));
  if (!rows.length || !cards.length) return;

  // Stillness, not absence: the stylesheet sets the open wall and the list.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Near the screen the thumbnails load and decode, so a card never opens
  // on an empty photograph; far away the tracks drop their layers.
  section.classList.add("is-far");
  nearObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        section?.classList.toggle("is-far", !entry.isIntersecting);
        if (!entry.isIntersecting) continue;
        for (const s of slots) {
          if (!s.img) continue;
          s.img.loading = "eager";
          s.img.decode?.().catch(() => {});
        }
        if (trigger) {
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
    // The section starts a screen early, over the star field, so its top
    // reaches the top of the screen exactly where the field lets go.
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      apply(self.progress);
      shownByRows = self.progress > 0;
      syncShown();
    },
    onRefresh: (self) => {
      measure();
      apply(self.progress);
      shownByRows = self.progress > 0;
      syncShown();
    },
  });
  apply(trigger.progress);
  shownByRows = trigger.progress > 0;
  syncShown();
  bindFocus();
}

export function destroyWorkRows(): void {
  trigger?.kill();
  trigger = null;
  nearObserver?.disconnect();
  nearObserver = null;
  if (section) {
    if (onFocusIn) section.removeEventListener("focusin", onFocusIn);
    if (onFocusOut) section.removeEventListener("focusout", onFocusOut);
    section.classList.remove("is-far", "is-on");
  }
  onFocusIn = null;
  onFocusOut = null;
  for (const el of [grid, rowsEl, ...rows.flatMap((r) => [r.track, ...r.sides]), ...slots.map((s) => s.el), ...previews.flatMap((p) => [p.el, p.info])]) {
    if (el) forgetLeaf(el);
  }
  section = stage = grid = rowsEl = null;
  rows = [];
  slots = [];
  previews = [];
  cards = [];
  focusedStop = -1;
  hiddenStop = -1;
  shownByRows = false;
}
