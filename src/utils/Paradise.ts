import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { writeIfChanged, forgetLeaf } from "./leafWrite";
import { initGrass, resizeGrass, placeGrass, destroyGrass } from "./GrassField";

/**
 * The timeline's descent and walk.
 *
 * The descent: one ScrollTrigger over the sticky stage's wrapper. The Earth
 * grows out of the star field WORK dissolved into and gives way to its
 * horizon, which rises as the camera drops; the sky fades in over it and
 * settles from a little low and a little large; three cloud banks rush up
 * past the camera, and while they are thickest the painted land (the same
 * picture as the sky, with the meadow and the path) takes over and settles
 * with the grass at its front; the title comes in last. Each layer is one transform
 * and one opacity, written through writeIfChanged, so outside its window a
 * layer is not written. The planet and the horizon are laid out at their
 * largest and only ever scaled down (invariant 7).
 *
 * The grass at the front of the meadow is GrassField.ts: this controller
 * tells it where the stage and the meadow are.
 *
 * The walk: a firefly rides the trail with the reader. The trail was sampled
 * at build time (AnimeParadise.astro hands the points over in data
 * attributes, normalised), so per frame this only looks a point up and
 * writes one transform. The signposts come in by IntersectionObserver, once.
 *
 * The rays' turn and the tufts' sway are compositor animations: the rays
 * run while the descent is within a screen (is-near) and shows them
 * (is-shown), the tufts while the walk is on screen (is-walking), and the
 * browser pauses both with the tab. The descent's scenery leaves the layer
 * tree outside is-near; is-live (the whole section) only fetches the walk's
 * ground.
 */

const EARTH_GROW = [0.0, 0.26] as const;
const EARTH_OUT = [0.2, 0.25] as const;
/* The planet's scale at the start, against its laid-out size. */
const EARTH_FROM = 0.38;
const HORIZON_IN = [0.19, 0.25] as const;
const HORIZON_DROP = [0.2, 0.5] as const;
const HORIZON_OUT = [0.42, 0.52] as const;
/* The horizon's scale at the start, against its laid-out 140%. */
const HORIZON_FROM = 1 / 1.4;
const SKY_IN = [0.38, 0.52] as const;
const SKY_SETTLE = [0.38, 0.86] as const;
const RAYS_IN = [0.6, 0.85] as const;
const RAYS_MAX = 0.55;
const CLOUDS = [0.34, 0.72] as const;
/* The clouds are thickest around 0.47-0.53: the land comes in behind them. */
const LAND_IN = [0.46, 0.56] as const;
const LAND_SETTLE = [0.46, 0.9] as const;
/* How far below its place the land starts, as a fraction of the stage. */
const LAND_DROP = 0.12;
const TITLE = [0.88, 0.96] as const;
const NARROW_BELOW = 768;

let descentTrigger: ScrollTrigger | null = null;
let walkTrigger: ScrollTrigger | null = null;
let liveObserver: IntersectionObserver | null = null;
let stopObserver: IntersectionObserver | null = null;
let walkObserver: IntersectionObserver | null = null;
let descentObserver: IntersectionObserver | null = null;
let descentEl: HTMLElement | null = null;
let raysShown = false;
let section: HTMLElement | null = null;
let sky: HTMLElement | null = null;
let rays: HTMLElement | null = null;
let meadow: HTMLElement | null = null;
let land: HTMLElement | null = null;
let stage: HTMLElement | null = null;
let stageH = 0;
let earth: HTMLElement | null = null;
let horizon: HTMLElement | null = null;
let grass: HTMLCanvasElement | null = null;
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

/* Where the descent's stage is on screen at a scroll position: held at the
   top inside the trigger, scrolling with the page outside it. Arithmetic on
   the trigger's cached range; the grass maps a pointer through it. */
function stageTopAt(scroll: number): number {
  if (!descentTrigger) return 0;
  if (scroll < descentTrigger.start) return descentTrigger.start - scroll;
  if (scroll > descentTrigger.end) return descentTrigger.end - scroll;
  return 0;
}

function measure(): void {
  narrow = window.innerWidth < NARROW_BELOW;
  if (stage) stageH = stage.clientHeight;
  if (walk) walkW = walk.clientWidth;
  const trail = walk?.querySelector<SVGSVGElement>(narrow ? ".paradise__trail--narrow" : ".paradise__trail--wide");
  // The firefly is laid out at the trail's top-left, so the trail's own
  // height is the only length it needs.
  if (trail) trailH = trail.getBoundingClientRect().height;
}

function applyDescent(p: number): void {
  if (earth) {
    const grow = easeOut(ramp(p, EARTH_GROW[0], EARTH_GROW[1]));
    const scale = EARTH_FROM + (1 - EARTH_FROM) * grow;
    writeIfChanged(earth, "transform", `translate3d(0, ${((1 - grow) * 8).toFixed(2)}vh, 0) scale(${scale.toFixed(4)})`);
    writeIfChanged(earth, "opacity", (ramp(p, 0, 0.04) * (1 - ramp(p, EARTH_OUT[0], EARTH_OUT[1]))).toFixed(3));
  }
  if (horizon) {
    const drop = easeOut(ramp(p, HORIZON_DROP[0], HORIZON_DROP[1]));
    const scale = HORIZON_FROM + (1 - HORIZON_FROM) * drop;
    writeIfChanged(horizon, "transform", `translate3d(0, ${(-drop * 12).toFixed(2)}%, 0) scale(${scale.toFixed(4)})`);
    writeIfChanged(horizon, "opacity", (ramp(p, HORIZON_IN[0], HORIZON_IN[1]) * (1 - ramp(p, HORIZON_OUT[0], HORIZON_OUT[1]))).toFixed(3));
  }
  // The land in place and opaque: the sky under it is not drawn (a
  // full-screen blend fewer while the meadow is on).
  const landSettled = p >= LAND_SETTLE[1] && p >= LAND_IN[1];
  if (sky) {
    const settle = easeOut(ramp(p, SKY_SETTLE[0], SKY_SETTLE[1]));
    writeIfChanged(sky, "opacity", landSettled ? "0" : ramp(p, SKY_IN[0], SKY_IN[1]).toFixed(3));
    writeIfChanged(sky, "transform", `translate3d(0, ${((1 - settle) * 22).toFixed(2)}%, 0) scale(${(1.18 - 0.18 * settle).toFixed(4)})`);
  }
  // The painting has rays of its own: these only stir them.
  if (rays) {
    writeIfChanged(rays, "opacity", (RAYS_MAX * ramp(p, RAYS_IN[0], RAYS_IN[1])).toFixed(3));
    // They turn only while they can be seen.
    const shown = p > RAYS_IN[0];
    if (shown !== raysShown) {
      raysShown = shown;
      rays.classList.toggle("is-shown", shown);
    }
  }

  const c = ramp(p, CLOUDS[0], CLOUDS[1]);
  for (const cloud of clouds) {
    const t = Math.min(1, c * cloud.speed);
    const live = c > 0 && t < 1;
    // In from below, past the camera and out of the top, growing as it
    // comes close; brightest in the middle of its pass.
    writeIfChanged(cloud.el, "transform", `translate3d(${cloud.x}vw, ${(90 - 210 * t).toFixed(2)}vh, 0) scale(${(0.9 + 0.8 * t).toFixed(3)})`);
    writeIfChanged(cloud.el, "opacity", live ? Math.sin(Math.PI * t).toFixed(3) : "0");
  }

  // The land and the grass at its front settle together, the grass in the
  // land's own light: it is there only as much as the land is.
  const drop = (1 - easeOut(ramp(p, LAND_SETTLE[0], LAND_SETTLE[1]))) * LAND_DROP * stageH;
  const landIn = ramp(p, LAND_IN[0], LAND_IN[1]).toFixed(3);
  if (land) {
    writeIfChanged(land, "opacity", landIn);
    writeIfChanged(land, "transform", `translate3d(0, ${drop.toFixed(1)}px, 0)`);
  }
  if (meadow) {
    writeIfChanged(meadow, "opacity", landIn);
    writeIfChanged(meadow, "transform", `translate3d(0, ${drop.toFixed(1)}px, 0)`);
  }
  placeGrass(drop);

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
  land = document.querySelector<HTMLElement>(".js-par-land");
  stage = document.querySelector<HTMLElement>(".paradise__stage");
  earth = document.querySelector<HTMLElement>(".js-par-earth");
  horizon = document.querySelector<HTMLElement>(".js-par-horizon");
  grass = document.querySelector<HTMLCanvasElement>(".js-par-grass");
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

  // Under reduced motion the grass is one still drawing.
  if (grass) initGrass(grass, () => stageTopAt(window.scrollY));

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  liveObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) section?.classList.toggle("is-live", entry.isIntersecting);
    },
    { rootMargin: "50% 0px 50% 0px" },
  );
  liveObserver.observe(section);

  // The descent's scenery is in the layer tree only within a screen of the
  // descent itself (invariant 11); the walk below it is not the descent.
  descentObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) descent.classList.toggle("is-near", entry.isIntersecting);
    },
    { rootMargin: "100% 0px 100% 0px" },
  );
  descentObserver.observe(descent);
  // Only now may the stylesheet take the scenery out: before the observer
  // has spoken, a load that lands inside the descent shows it.
  descent.classList.add("is-watched");
  descentEl = descent;

  // The tufts along the walk sway only while the walk is on screen.
  walkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) walk?.classList.toggle("is-walking", entry.isIntersecting);
  });
  walkObserver.observe(walk);

  trails = { wide: parse(firefly?.dataset.wide), narrow: parse(firefly?.dataset.narrow) };

  gsap.registerPlugin(ScrollTrigger);
  descentTrigger = ScrollTrigger.create({
    trigger: descent,
    start: "top top",
    // Where the 100lvh stage stops sticking: "bottom bottom" would follow
    // innerHeight, which on a phone moves with the toolbar while the stage
    // does not, and stageTopAt (the grass's pointer) would be off by it.
    end: () => `bottom top+=${stage?.clientHeight || window.innerHeight}`,
    onUpdate: (self) => applyDescent(self.progress),
    onRefresh: (self) => {
      // The grass's canvas follows the meadow's box, once per refresh.
      resizeGrass();
      if (stage) stageH = stage.clientHeight;
      applyDescent(self.progress);
    },
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
  walkObserver?.disconnect();
  descentObserver?.disconnect();
  liveObserver = stopObserver = walkObserver = descentObserver = null;
  descentEl?.classList.remove("is-near", "is-watched");
  descentEl = null;
  walk?.classList.remove("is-walking");
  rays?.classList.remove("is-shown");
  raysShown = false;
  destroyGrass();
  for (const el of [earth, horizon, sky, rays, land, meadow, title, firefly, ...clouds.map((c) => c.el)]) if (el) forgetLeaf(el);
  section?.classList.remove("is-live");
  section = sky = rays = land = stage = meadow = title = walk = firefly = earth = horizon = null;
  stageH = 0;
  grass = null;
  clouds = [];
  trails = { wide: [], narrow: [] };
}
