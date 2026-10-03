/**
 * A scroll-scrubbed image sequence on a canvas: the zyp.co hero on the Zyp
 * case page, played the way the live site plays it
 * (landing-page/src/features/hero-sequence/renderer.js), simplified.
 *
 * Markup: a `.js-frame-seq` box with `data-frames` (the URL pattern, `%04d`
 * for the 1-based index) and `data-count`, holding an <img> of frame 1, and
 * inside a `.js-frame-seq-runway` whose scroll range is the playhead.
 *
 * - The poster: the <img> is the only frame on the critical path. It is the
 *   whole picture at phone width and under reduced motion, where this file
 *   loads nothing more. Elsewhere it is decoded into a bitmap first, drawn
 *   first, and never released, so a frame that is not ready yet always has
 *   something to fall back to.
 * - Everything else waits for the window's `load`: ScrollTrigger (GSAP's
 *   core is already on the page, for the case player), then every frame's
 *   bytes, six requests at a time, from the playhead forward.
 * - Bytes are kept, decoded frames are not: about 3.7 MB each at 1280x720.
 *   A window around the playhead, leaning the way the reader scrolls (12
 *   ahead, 4 behind), is decoded into ImageBitmaps; a frame that leaves it is
 *   closed. The frame on screen stays until another replaces it.
 * - A frame not decoded yet draws the nearest one that is, so the canvas is
 *   never blank and a reverse scrub never jumps back to the poster.
 * - One draw, on the GSAP ticker (invariant 6), and only when the frame to
 *   show changes: there is no loop. ScrollTrigger reports progress only
 *   while the runway is in range, so off screen nothing runs (invariant 1).
 * - The canvas is opaque, on its own layer (the page gives it will-change,
 *   invariant 13). Its backing store is the frames' own size, set once
 *   before the first draw, so a draw is a 1:1 copy and CSS scales the layer.
 *   zyp.co sizes its store to the box, at up to 1.5 device pixels per CSS
 *   pixel; on a 1x screen that store is smaller than the frames, and the
 *   scaled copy is what costs: 1280 px frames drawn into a 1150 px store
 *   with smoothing "high" made 44 long tasks (4.1 s) per scrub at 4x CPU,
 *   the 1:1 copy none (2026-10-03, headless Chromium, software raster on
 *   this host). The size never changes, so nothing resets the context after
 *   the first draw (invariant 8).
 * - If the width or the motion setting crosses the query below, the
 *   sequence is taken down whole (trigger, requests, bitmaps, canvas) and
 *   started again when it crosses back (invariant 4).
 */

/** The page's CSS draws the runway under the same query. */
const LIVE = "(min-width: 768px) and (prefers-reduced-motion: no-preference)";
const AHEAD = 12;
const BEHIND = 4;
const LOAD_CONCURRENCY = 6;
const DECODE_CONCURRENCY = 4;

export function initFrameSequences(): void {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return;
  document.querySelectorAll<HTMLElement>(".js-frame-seq").forEach((view) => {
    const poster = view.querySelector("img");
    const runway = view.closest<HTMLElement>(".js-frame-seq-runway");
    const pattern = view.dataset.frames;
    const count = Number(view.dataset.count);
    if (!poster || !runway || !pattern || !(count > 1)) return;

    const live = window.matchMedia(LIVE);
    let stop: (() => void) | null = null;
    const sync = () => {
      if (live.matches && !stop) stop = play(view, poster, runway, pattern, count);
      else if (!live.matches && stop) {
        stop();
        stop = null;
      }
    };
    const begin = () => {
      live.addEventListener("change", sync);
      sync();
    };
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });
  });
}

/** Starts one sequence and returns what takes it down. */
function play(view: HTMLElement, poster: HTMLImageElement, runway: HTMLElement, pattern: string, count: number): () => void {
  let dead = false;
  const abort = new AbortController();
  const url = (i: number) => pattern.replace("%04d", String(i).padStart(4, "0"));

  const payloads: (Blob | undefined)[] = [];
  const cache: (ImageBitmap | undefined)[] = [];
  const decoding = new Set<number>();
  const failed = new Set<number>();
  const attempted = new Set<number>([1]);

  let wanted = 1;
  let drawn = 0;
  let direction = 1;
  let pending = false;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let trigger: { kill(): void } | null = null;
  let ticker: { add(fn: () => void, once?: boolean): unknown } | null = null;

  const inWindow = (i: number) => {
    const ahead = direction > 0 ? AHEAD : BEHIND;
    const behind = direction > 0 ? BEHIND : AHEAD;
    return i >= wanted - behind && i <= wanted + ahead;
  };
  const keep = (i: number) => i === 1 || i === drawn || inWindow(i);

  function release(i: number) {
    cache[i]?.close();
    cache[i] = undefined;
  }

  /** The decoded frame nearest to `i`, either way; 0 if there is none. */
  function nearest(i: number): number {
    if (cache[i]) return i;
    for (let k = 1; k < count; k++) {
      if (i - k >= 1 && cache[i - k]) return i - k;
      if (i + k <= count && cache[i + k]) return i + k;
    }
    return 0;
  }

  function paint() {
    pending = false;
    if (dead || !canvas || !ctx) return;
    const i = nearest(wanted);
    if (!i || i === drawn) return;
    ctx.drawImage(cache[i]!, 0, 0, canvas.width, canvas.height);
    const was = drawn;
    drawn = i;
    if (was && cache[was] && !keep(was)) release(was);
  }

  function request() {
    if (pending || dead || !ticker) return;
    pending = true;
    ticker.add(paint, true);
  }

  function nextToDecode(): number | null {
    const wants = (i: number) => i >= 1 && i <= count && !!payloads[i] && !cache[i] && !decoding.has(i) && !failed.has(i);
    if (wants(wanted)) return wanted;
    for (let k = 1; k <= Math.max(AHEAD, BEHIND); k++) {
      const ahead = wanted + direction * k;
      const behind = wanted - direction * k;
      if (inWindow(ahead) && wants(ahead)) return ahead;
      if (inWindow(behind) && wants(behind)) return behind;
    }
    return null;
  }

  function pump() {
    while (!dead && decoding.size < DECODE_CONCURRENCY) {
      const i = nextToDecode();
      if (i === null) return;
      decoding.add(i);
      createImageBitmap(payloads[i]!)
        .then(
          (bitmap) => {
            // The window may have moved on while this decoded.
            if (dead || !keep(i)) bitmap.close();
            else {
              cache[i] = bitmap;
              request();
            }
          },
          () => failed.add(i),
        )
        .finally(() => {
          decoding.delete(i);
          pump();
        });
    }
  }

  /** Drops what the window no longer covers, then decodes what it lacks. */
  function reconcile() {
    for (let i = 2; i <= count; i++) if (cache[i] && !keep(i)) release(i);
    pump();
  }

  function seek(progress: number) {
    const i = 1 + Math.round(progress * (count - 1));
    if (i === wanted) return;
    direction = i > wanted ? 1 : -1;
    wanted = i;
    reconcile();
    request();
  }

  /** From the playhead forward, then whatever is left behind it. */
  function nextToLoad(): number | null {
    for (let i = wanted; i <= count; i++) if (!attempted.has(i)) return i;
    for (let i = 1; i < wanted; i++) if (!attempted.has(i)) return i;
    return null;
  }

  async function loader() {
    for (let i = nextToLoad(); i !== null && !dead; i = nextToLoad()) {
      attempted.add(i);
      try {
        const res = await fetch(url(i), { signal: abort.signal });
        if (!res.ok) continue;
        payloads[i] = await res.blob();
        pump();
      } catch {
        // Aborted, or a network error: the nearest decoded frame stands in.
      }
    }
  }

  (async () => {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
    await poster.decode();
    const first = await createImageBitmap(poster);
    if (dead) {
      first.close();
      return;
    }
    cache[1] = first;
    ticker = gsap.ticker;

    // Sized once, to the frames, before the context exists; painted before
    // it goes in, so it never shows empty.
    canvas = document.createElement("canvas");
    canvas.width = first.width;
    canvas.height = first.height;
    canvas.setAttribute("aria-hidden", "true");
    ctx = canvas.getContext("2d", { alpha: false });
    paint();
    view.append(canvas);

    gsap.registerPlugin(ScrollTrigger);
    // From the first scroll (or from where the runway comes into view, if it
    // starts below the fold) to where the frame lets go of the screen.
    const st = ScrollTrigger.create({
      trigger: runway,
      start: "clamp(top bottom)",
      end: "bottom bottom",
      onUpdate: (self) => seek(self.progress),
    });
    trigger = st;
    seek(st.progress);

    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, loader));
  })().catch(() => {
    // No sequence: the poster <img> stays, which is the still page.
  });

  return () => {
    dead = true;
    abort.abort();
    trigger?.kill();
    canvas?.remove();
    cache.forEach((bitmap) => bitmap?.close());
    cache.length = 0;
    payloads.length = 0;
  };
}
