import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { writeIfChanged, forgetLeaf } from "./leafWrite";

/**
 * The timeline's descent and walk.
 *
 * The descent: one ScrollTrigger over the sticky stage's wrapper. The sky
 * fades in and settles from a little low and a little large; three cloud
 * banks rush up past the camera; the meadow rises into place; the title
 * comes in last. Each layer is one transform and one opacity, written
 * through writeIfChanged, so outside its window a layer is not written.
 *
 * The walk: a firefly rides the trail with the reader. The trail was sampled
 * at build time (AnimeParadise.astro hands the points over in data
 * attributes, normalised), so per frame this only looks a point up and
 * writes one transform. The signposts come in by IntersectionObserver, once.
 *
 * The rays' turn and the grass's sway are compositor animations; they run
 * only while the section is within a screen (is-live), and the browser
 * pauses them with the tab.
 */

const SKY_IN = [0.04, 0.38] as const;
const SKY_SETTLE = [0.04, 0.78] as const;
const RAYS_IN = [0.4, 0.75] as const;
const CLOUDS = [0.08, 0.6] as const;
const MEADOW = [0.42, 0.84] as const;
const TITLE = [0.8, 0.93] as const;
const NARROW_BELOW = 768;

let descentTrigger: ScrollTrigger | null = null;
let walkTrigger: ScrollTrigger | null = null;
let liveObserver: IntersectionObserver | null = null;
let stopObserver: IntersectionObserver | null = null;
let section: HTMLElement | null = null;
let sky: HTMLElement | null = null;
let rays: HTMLElement | null = null;
let meadow: HTMLElement | null = null;
let title: HTMLElement | null = null;
let clouds: { el: HTMLElement; x: number; speed: number }[] = [];
let walk: HTMLElement | null = null;
let firefly: HTMLElement | null = null;
let trails: { wide: [number, number][]; narrow: [number, number][] } = { wide: [], narrow: [] };
let walkW = 0;
let trailH = 0;
let narrow = false;

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

function parse(data: string | undefined): [number, number][] {
  if (!data) return [];
  return data.split(" ").map((pair) => {
    const [x, y] = pair.split(",").map(Number);
    return [x, y];
  });
}

function measure(): void {
  narrow = window.innerWidth < NARROW_BELOW;
  if (walk) walkW = walk.clientWidth;
  const trail = walk?.querySelector<SVGSVGElement>(narrow ? ".paradise__trail--narrow" : ".paradise__trail--wide");
  // The firefly is laid out at the trail's top-left, so the trail's own
  // height is the only length it needs.
  if (trail) trailH = trail.getBoundingClientRect().height;
}

function applyDescent(p: number): void {
  if (sky) {
    const settle = easeOut(ramp(p, SKY_SETTLE[0], SKY_SETTLE[1]));
    writeIfChanged(sky, "opacity", ramp(p, SKY_IN[0], SKY_IN[1]).toFixed(3));
    writeIfChanged(sky, "transform", `translate3d(0, ${((1 - settle) * 22).toFixed(2)}%, 0) scale(${(1.18 - 0.18 * settle).toFixed(4)})`);
  }
  if (rays) writeIfChanged(rays, "opacity", ramp(p, RAYS_IN[0], RAYS_IN[1]).toFixed(3));

  const c = ramp(p, CLOUDS[0], CLOUDS[1]);
  for (const cloud of clouds) {
    const t = Math.min(1, c * cloud.speed);
    const live = c > 0 && t < 1;
    // In from below, past the camera and out of the top, growing as it
    // comes close; brightest in the middle of its pass.
    writeIfChanged(cloud.el, "transform", `translate3d(${cloud.x}vw, ${(90 - 210 * t).toFixed(2)}vh, 0) scale(${(0.9 + 0.8 * t).toFixed(3)})`);
    writeIfChanged(cloud.el, "opacity", live ? Math.sin(Math.PI * t).toFixed(3) : "0");
  }

  if (meadow) writeIfChanged(meadow, "transform", `translate3d(0, ${((1 - easeOut(ramp(p, MEADOW[0], MEADOW[1]))) * 105).toFixed(2)}%, 0)`);

  if (title) {
    const t = ramp(p, TITLE[0], TITLE[1]);
    writeIfChanged(title, "opacity", t.toFixed(3));
    writeIfChanged(title, "transform", `translate(-50%, ${((1 - easeOut(t)) * 30).toFixed(1)}px)`);
  }
}

function applyWalk(p: number): void {
  if (!firefly) return;
  const points = narrow ? trails.narrow : trails.wide;
  if (!points.length) return;
  const at = Math.min(points.length - 1, Math.max(0, p * (points.length - 1)));
  const i = Math.floor(at);
  const k = at - i;
  const a = points[i];
  const b = points[Math.min(points.length - 1, i + 1)];
  const x = (a[0] + (b[0] - a[0]) * k) * walkW;
  const y = (a[1] + (b[1] - a[1]) * k) * trailH;
  writeIfChanged(firefly, "transform", `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`);
}

export function initParadise(): void {
  if (typeof window === "undefined") return;
  section = document.querySelector<HTMLElement>(".paradise");
  const descent = document.querySelector<HTMLElement>(".js-par-descent");
  sky = document.querySelector<HTMLElement>(".js-par-sky");
  rays = document.querySelector<HTMLElement>(".js-par-rays");
  meadow = document.querySelector<HTMLElement>(".js-par-meadow");
  title = document.querySelector<HTMLElement>(".js-par-title");
  clouds = [...document.querySelectorAll<HTMLElement>(".js-par-cloud")].map((el) => ({
    el,
    x: Number(el.dataset.x) || 0,
    speed: Number(el.dataset.speed) || 1,
  }));
  walk = document.querySelector<HTMLElement>(".js-par-walk");
  firefly = document.querySelector<HTMLElement>(".js-par-firefly");
  if (!section || !descent || !walk) return;

  // The signposts, once each, whatever the motion setting: under reduced
  // motion the stylesheet shows them without the rise.
  const stops = [...document.querySelectorAll<HTMLElement>(".js-par-stop")];
  stopObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        stopObserver?.unobserve(entry.target);
      }
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
  );
  stops.forEach((stop) => stopObserver?.observe(stop));

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  liveObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) section?.classList.toggle("is-live", entry.isIntersecting);
    },
    { rootMargin: "50% 0px 50% 0px" },
  );
  liveObserver.observe(section);

  trails = { wide: parse(firefly?.dataset.wide), narrow: parse(firefly?.dataset.narrow) };

  gsap.registerPlugin(ScrollTrigger);
  descentTrigger = ScrollTrigger.create({
    trigger: descent,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => applyDescent(self.progress),
    onRefresh: (self) => applyDescent(self.progress),
  });
  walkTrigger = ScrollTrigger.create({
    trigger: walk,
    start: "top center",
    end: "bottom center",
    onUpdate: (self) => applyWalk(self.progress),
    onRefresh: (self) => {
      measure();
      applyWalk(self.progress);
    },
  });
  measure();
  applyDescent(descentTrigger.progress);
  applyWalk(walkTrigger.progress);
}

export function destroyParadise(): void {
  descentTrigger?.kill();
  walkTrigger?.kill();
  descentTrigger = walkTrigger = null;
  liveObserver?.disconnect();
  stopObserver?.disconnect();
  liveObserver = stopObserver = null;
  for (const el of [sky, rays, meadow, title, firefly, ...clouds.map((c) => c.el)]) if (el) forgetLeaf(el);
  section?.classList.remove("is-live");
  section = sky = rays = meadow = title = walk = firefly = null;
  clouds = [];
  trails = { wide: [], narrow: [] };
}
