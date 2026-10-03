import { gsap } from "gsap";
import { writeIfChanged, forgetLeaf } from "./leafWrite";

/**
 * The case pages' video player: CaseClip's markup, driven from here.
 *
 * The video element stays the one source of truth. Every control reads its
 * state from media events (play, pause, volumechange, progress, durationchange,
 * fullscreen changes) and never keeps a copy of its own, so a key, a tap on
 * the picture and the native fullscreen player on an iPhone all leave the bar
 * telling the truth.
 *
 * Where playback starts: a clip with a start point carries it as a media
 * fragment (`…mp4#t=26`), so the first frame the visitor sees is already the
 * right one and the whole clip stays seekable. Setting currentTime on
 * loadedmetadata instead flashes frame 0 on iOS, which loads nothing before
 * a tap. If an engine ignores the fragment, the first play moves to the start
 * point once.
 *
 * Per frame, only while a clip plays and is on screen: one scaleX on the fill
 * and, when the second changes, the time text, both written on their own
 * leaves through writeIfChanged, from the GSAP ticker (invariants 1, 2, 6).
 * The total time comes from the build (media.json), so nothing waits for
 * metadata to draw the bar.
 *
 * Loops (silent footage) keep their autoplay from case.ts. Once the visitor
 * pauses, seeks or unmutes one, it carries data-user and case.ts stops
 * starting it again on its own.
 */

type Player = {
  root: HTMLElement;
  video: HTMLVideoElement;
  fill: HTMLElement | null;
  buffered: HTMLElement | null;
  scrub: HTMLElement | null;
  time: HTMLElement | null;
  toggle: HTMLButtonElement | null;
  mute: HTMLButtonElement | null;
  duration: number;
  from: number;
  started: boolean;
  visible: boolean;
  ticking: boolean;
  shownSecond: number;
  abort: AbortController;
};

const players: Player[] = [];
let observer: IntersectionObserver | null = null;

/* A clip's time as people read it: m:ss, rounded down while it plays. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function totalOf(p: Player): number {
  const d = p.video.duration;
  return Number.isFinite(d) && d > 0 ? d : p.duration;
}

function drawTime(p: Player): void {
  const t = shownTime(p);
  const total = totalOf(p);
  if (p.fill) writeIfChanged(p.fill, "transform", `scaleX(${total ? Math.min(1, t / total).toFixed(4) : 0})`);
  const second = Math.floor(t);
  if (second !== p.shownSecond) {
    p.shownSecond = second;
    if (p.time) p.time.textContent = `${clock(t)} / ${clock(total)}`;
    p.scrub?.setAttribute("aria-valuenow", String(second));
    p.scrub?.setAttribute("aria-valuetext", `${clock(t)} of ${clock(total)}`);
  }
}

function tick(): void {
  for (const p of players) if (p.ticking) drawTime(p);
}

/* The ticker callback exists only while some clip plays on screen. */
let onTicker = false;
function syncTicker(): void {
  const any = players.some((p) => p.ticking);
  if (any && !onTicker) gsap.ticker.add(tick);
  if (!any && onTicker) gsap.ticker.remove(tick);
  onTicker = any;
}

function setTicking(p: Player): void {
  p.ticking = p.visible && !p.video.paused;
  syncTicker();
}

function drawState(p: Player): void {
  const playing = !p.video.paused;
  p.root.classList.toggle("is-playing", playing);
  p.root.classList.toggle("is-started", p.started || playing);
  p.toggle?.setAttribute("aria-label", playing ? "Pause" : "Play");
  if (p.mute) {
    const muted = p.video.muted;
    p.root.classList.toggle("is-muted", muted);
    p.mute.setAttribute("aria-label", muted ? "Turn sound on" : "Turn sound off");
    p.mute.setAttribute("aria-pressed", String(!muted));
  }
  setTicking(p);
  drawTime(p);
}

function drawBuffered(p: Player): void {
  if (!p.buffered) return;
  const b = p.video.buffered;
  const total = totalOf(p);
  const end = b.length ? b.end(b.length - 1) : 0;
  writeIfChanged(p.buffered, "transform", `scaleX(${total ? Math.min(1, end / total).toFixed(3) : 0})`);
}

/* One clip with sound at a time: starting one pauses the others that are
   playing out loud. Muted loops keep going. */
function pauseOthers(p: Player): void {
  if (p.video.muted) return;
  for (const o of players) if (o !== p && !o.video.paused && !o.video.muted) o.video.pause();
}

function play(p: Player): void {
  // The first play of a clip with a start point, in an engine that ignored
  // the fragment: move there once.
  if (!p.started && p.from > 0 && p.video.currentTime < 0.5) p.video.currentTime = p.from;
  p.started = true;
  const ready = p.video.play();
  // Blocked (an engine that wants a gesture): the play button stays up.
  ready?.catch(() => drawState(p));
}

/* The time the bar shows: before the first play nothing has loaded and
   currentTime reads 0, so the clip's start point stands in. */
function shownTime(p: Player): number {
  return !p.started && p.video.currentTime < 0.5 ? p.from : p.video.currentTime;
}

function seekTo(p: Player, seconds: number): void {
  const total = totalOf(p);
  p.started = true;
  p.root.dataset.user = "1";
  p.video.currentTime = Math.min(Math.max(0, seconds), Math.max(0, total - 0.05));
  drawTime(p);
}

function fullscreen(p: Player): void {
  const v = p.video as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else if (document.fullscreenEnabled) {
    void p.root.requestFullscreen();
  } else {
    // iPhone: only the video can go full screen, in the system player, which
    // brings its own controls; the bar resyncs from media events after.
    v.webkitEnterFullscreen?.();
  }
}

function bindScrub(p: Player): void {
  const scrub = p.scrub;
  if (!scrub) return;
  const { signal } = p.abort;
  // The bar's box is read once per gesture, at its start: nothing moves the
  // bar while a finger is on it.
  let box: DOMRect | null = null;
  const at = (e: PointerEvent) => (box ? Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) : 0);
  scrub.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      box = scrub.getBoundingClientRect();
      scrub.setPointerCapture(e.pointerId);
      p.root.classList.add("is-scrubbing");
      seekTo(p, at(e) * totalOf(p));
    },
    { signal },
  );
  scrub.addEventListener(
    "pointermove",
    (e) => {
      if (box && scrub.hasPointerCapture(e.pointerId)) seekTo(p, at(e) * totalOf(p));
    },
    { signal },
  );
  const end = (e: PointerEvent) => {
    if (scrub.hasPointerCapture(e.pointerId)) scrub.releasePointerCapture(e.pointerId);
    box = null;
    p.root.classList.remove("is-scrubbing");
  };
  scrub.addEventListener("pointerup", end, { signal });
  scrub.addEventListener("pointercancel", end, { signal });
  scrub.addEventListener(
    "keydown",
    (e) => {
      const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[e.key];
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (step !== undefined) seekTo(p, shownTime(p) + step);
      else if (e.key === "Home") seekTo(p, 0);
      else if (e.key === "End") seekTo(p, totalOf(p));
      else return;
      e.preventDefault();
    },
    { signal },
  );
}

function bind(root: HTMLElement): Player | null {
  const video = root.querySelector<HTMLVideoElement>("video");
  if (!video) return null;
  const p: Player = {
    root,
    video,
    fill: root.querySelector(".js-player-fill"),
    buffered: root.querySelector(".js-player-buffered"),
    scrub: root.querySelector(".js-player-scrub"),
    time: root.querySelector(".js-player-time"),
    toggle: root.querySelector(".js-player-toggle"),
    mute: root.querySelector(".js-player-mute"),
    duration: Number(root.dataset.duration) || 0,
    from: Number(root.dataset.from) || 0,
    started: false,
    visible: false,
    ticking: false,
    shownSecond: -1,
    abort: new AbortController(),
  };
  const { signal } = p.abort;
  const on = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: () => void) => video.addEventListener(type, fn, { signal });

  on("play", () => {
    pauseOthers(p);
    drawState(p);
  });
  on("pause", () => drawState(p));
  on("ended", () => drawState(p));
  on("volumechange", () => drawState(p));
  on("seeked", () => drawTime(p));
  on("durationchange", () => drawTime(p));
  on("progress", () => drawBuffered(p));
  on("webkitendfullscreen" as keyof HTMLMediaElementEventMap, () => drawState(p));

  const toggle = () => {
    if (video.paused) play(p);
    else {
      root.dataset.user = "1";
      video.pause();
    }
  };
  root.querySelector(".js-player-big")?.addEventListener("click", () => play(p), { signal });
  p.toggle?.addEventListener("click", toggle, { signal });
  // A tap on the picture itself toggles too, once the clip has started.
  video.addEventListener("click", () => (p.started || !video.paused ? toggle() : play(p)), { signal });
  p.mute?.addEventListener(
    "click",
    () => {
      root.dataset.user = "1";
      video.muted = !video.muted;
      if (!video.muted && video.paused) play(p);
    },
    { signal },
  );
  root.querySelector(".js-player-fs")?.addEventListener("click", () => fullscreen(p), { signal });
  root.addEventListener(
    "keydown",
    (e) => {
      if (e.target instanceof HTMLElement && e.target.closest(".js-player-scrub")) return;
      // The browser's and the system's own shortcuts pass through.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // Space on a focused button presses that button (mute, full screen).
      if (key === " " && e.target instanceof HTMLButtonElement) return;
      if (key === " " || key === "k") toggle();
      else if (key === "m" && p.mute) p.mute.click();
      else if (key === "f") fullscreen(p);
      else return;
      e.preventDefault();
    },
    { signal },
  );
  bindScrub(p);
  drawState(p);
  return p;
}

export function initPlayers(): void {
  if (typeof window === "undefined") return;
  document.querySelectorAll<HTMLElement>(".js-player").forEach((root) => {
    const p = bind(root);
    if (p) players.push(p);
  });
  if (!players.length) return;
  document.addEventListener(
    "fullscreenchange",
    () => {
      for (const p of players) p.root.classList.toggle("is-fullscreen", document.fullscreenElement === p.root);
    },
    { signal: players[0].abort.signal },
  );
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const p = players.find((x) => x.root === e.target);
      if (!p) continue;
      p.visible = e.isIntersecting;
      // Nothing plays where it cannot be seen (invariant 1). Loops are
      // case.ts's to pause; a clip with sound stops here, and the bar shows
      // it paused when the visitor scrolls back.
      if (!e.isIntersecting && !p.video.paused && !p.root.classList.contains("is-loop")) p.video.pause();
      setTicking(p);
    }
  });
  for (const p of players) observer.observe(p.root);
}

export function destroyPlayers(): void {
  observer?.disconnect();
  observer = null;
  for (const p of players) {
    p.abort.abort();
    for (const el of [p.fill, p.buffered]) if (el) forgetLeaf(el);
  }
  players.length = 0;
  if (onTicker) gsap.ticker.remove(tick);
  onTicker = false;
}
