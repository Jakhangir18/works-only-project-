/**
 * rocketFrameSource.ts
 * Supplies rocket story frames to the RocketBackground canvas.
 *
 * Two interchangeable sources:
 *   video — one all-intra MP4, scrubbed by seeking. Holds a few decoded frames
 *           instead of 240, which is the whole point of this module.
 *   jpg   — the original 240-file eager preload, kept intact as the fallback.
 *
 * Which one runs is decided by probing the real decoder (`probeVideo`), never by
 * sniffing the user agent: a device is judged on whether it actually produced a
 * seeked, non-blank frame in time, not on what it claims to be.
 */

export const TOTAL_FRAMES = 240;

/** Encoded frame rate of rocket.mp4. index -> time uses this. */
const FPS = 30;

/** Frame the probe seeks to. Mid-sequence, verified to carry bright pixels. */
const PROBE_FRAME = 120;

/** A probe that has not produced a frame by now is treated as no video path. */
const PROBE_TIMEOUT_MS = 2500;

export type SourceKind = "video" | "jpg";

export interface RocketFrameSource {
  readonly kind: SourceKind;
  /** Request that frame `index` be drawn. Safe to call every scroll frame. */
  show(index: number): void;
  destroy(): void;
}

/** Letterbox-fit any frame-shaped image into the canvas. */
function makeDrawer(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  return function draw(src: CanvasImageSource, sw: number, sh: number) {
    if (!sw || !sh) return;
    const W = canvas.width,
      H = canvas.height;
    const scale = Math.min(W / sw, H / sh);
    const dw = sw * scale,
      dh = sh * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(src, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
  };
}

/* ------------------------------------------------------------------ *
 * Capability probe
 * ------------------------------------------------------------------ */

export interface ProbeResult {
  video: HTMLVideoElement | null;
  /** Why the probe rejected the video, for the console note. */
  reason: string;
  /** ms spent on the warm-up seek — the cost the first user scrub would pay. */
  warmupMs: number;
  /** ms spent on a second seek, once the decoder is warm. */
  secondSeekMs: number;
}

/**
 * Load the video, force one decode, and check that the decode actually painted.
 *
 * The warm-up seek here is the reason it exists: the first seek on a cold
 * decoder is the expensive one, so it is spent during page idle rather than on
 * the user's first scroll. A pass also proves the decode path works on this
 * device, which is the capability signal the source selection uses.
 */
export function probeVideo(
  url: string,
  mount: HTMLElement,
): Promise<ProbeResult> {
  const fail = (reason: string, v?: HTMLVideoElement): ProbeResult => {
    if (v) releaseVideo(v);
    return { video: null, reason, warmupMs: -1, secondSeekMs: -1 };
  };

  const probe = document.createElement("video");
  if (probe.canPlayType('video/mp4; codecs="avc1.640028"') === "") {
    return Promise.resolve(fail("canPlayType says no h.264"));
  }

  return new Promise<ProbeResult>((resolve) => {
    const v = probe;
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    // iOS only decodes an inline video that is muted and marked playsinline;
    // both attributes have to be present, not just the properties.
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.preload = "auto";
    // iOS will not decode a video that is not in the document, and treats
    // display:none / visibility:hidden as "no need to decode". A 1x1 nearly
    // transparent box in the layout is the one state it reliably decodes in.
    mount.appendChild(v);

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(fail(`no frame within ${PROBE_TIMEOUT_MS}ms`, v));
    }, PROBE_TIMEOUT_MS);

    const done = (r: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };

    v.addEventListener("error", () => done(fail("video error event", v)), {
      once: true,
    });

    v.addEventListener(
      "loadedmetadata",
      () => {
        if (!v.videoWidth || !v.videoHeight) {
          done(fail("metadata carried no dimensions", v));
          return;
        }

        // First seek: cold decoder. This is the cost being moved off the
        // user's first scrub.
        const t0 = performance.now();
        seekTo(v, PROBE_FRAME)
          .then(() => {
            const warmupMs = performance.now() - t0;
            if (!framePainted(v)) {
              done(fail("seeked but painted nothing", v));
              return;
            }
            // Second seek: warm decoder, for the before/after pair.
            const t1 = performance.now();
            return seekTo(v, 0).then(() => {
              const secondSeekMs = performance.now() - t1;
              done({ video: v, reason: "", warmupMs, secondSeekMs });
            });
          })
          .catch(() => done(fail("seek rejected", v)));
      },
      { once: true },
    );

    v.src = url;
    v.load();
  });
}

/** Seek to a frame index and resolve when the decoder has that frame up. */
function seekTo(v: HTMLVideoElement, index: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      v.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      v.removeEventListener("seeked", onSeeked);
      reject(new Error("seek error"));
    };
    v.addEventListener("seeked", onSeeked, { once: true });
    v.addEventListener("error", onError, { once: true });
    // Aim at the middle of the frame's interval so float rounding never lands
    // on a boundary and picks the neighbouring frame.
    v.currentTime = (index + 0.5) / FPS;
  });
}

/**
 * Did the decode actually paint? A seek can fire while the compositor still
 * has nothing, which is the failure mode that makes a UA check useless.
 * Sampled at 8x8 so the readback stays trivial; the probe frame is bright, so
 * an all-black sample means no pixels arrived.
 */
function framePainted(v: HTMLVideoElement): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (!cx) return false;
    cx.drawImage(v, 0, 0, 8, 8);
    const { data } = cx.getImageData(0, 0, 8, 8);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 24 || data[i + 1] > 24 || data[i + 2] > 24) return true;
    }
    return false;
  } catch {
    // A tainted canvas would throw here; same-origin video should not, but a
    // throw means we cannot verify, so we do not claim the video works.
    return false;
  }
}

function releaseVideo(v: HTMLVideoElement) {
  try {
    v.removeAttribute("src");
    v.load(); // drops the decoder's buffers; removal alone does not
    v.remove();
  } catch {
    /* nothing left to release */
  }
}

/* ------------------------------------------------------------------ *
 * Video source
 * ------------------------------------------------------------------ */

export function createVideoSource(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  /**
   * Called if the decoder fails after it was already chosen. iOS can drop a
   * media element under memory pressure long after it loaded cleanly, so
   * passing the probe once is not a permanent guarantee and the caller needs a
   * way back to the JPG sequence.
   */
  onFail: (reason: string) => void,
): RocketFrameSource {
  const draw = makeDrawer(canvas, ctx);
  const paint = () => draw(video, video.videoWidth, video.videoHeight);

  let wanted = -1; // index the scroll last asked for
  let inFlight = -1; // index the decoder is seeking to right now
  let painted = -1; // index currently on the canvas

  /**
   * At most one seek is ever outstanding. Scroll can request a hundred indices
   * while one decode is in flight; only the newest survives, because decoding
   * the skipped ones would burn frames on pictures nobody sees.
   */
  function pump() {
    if (inFlight !== -1 || wanted === -1 || wanted === painted) return;
    inFlight = wanted;
    video.currentTime = (wanted + 0.5) / FPS;
  }

  const onSeeked = () => {
    painted = inFlight;
    inFlight = -1;
    paint();
    pump();
  };

  let failed = false;
  const onError = () => {
    if (failed) return; // one handover only, however many errors arrive
    failed = true;
    onFail(video.error ? `media error ${video.error.code}` : "media error");
  };

  video.addEventListener("seeked", onSeeked);
  video.addEventListener("error", onError);

  // The probe left the decoder holding frame 0; put it on the canvas so the
  // section is never blank before the first scroll.
  painted = 0;
  paint();

  return {
    kind: "video",
    show(index: number) {
      if (index === wanted) return;
      wanted = index;
      pump();
    },
    destroy() {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      releaseVideo(video);
    },
  };
}

/* ------------------------------------------------------------------ *
 * JPG sequence source (fallback)
 * ------------------------------------------------------------------ */

export function createJpgSource(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  path = "/1/ezgif-frame-",
  ext = ".jpg",
): RocketFrameSource {
  const draw = makeDrawer(canvas, ctx);
  const images: HTMLImageElement[] = new Array(TOTAL_FRAMES).fill(null);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const img = new Image();
    img.decoding = "async";
    img.src = `${path}${String(i + 1).padStart(3, "0")}${ext}`;
    images[i] = img;
  }

  let wanted = -1;

  return {
    kind: "jpg",
    show(index: number) {
      wanted = index;
      const img = images[index];
      if (!img) return;
      if (img.complete && img.naturalWidth) {
        draw(img, img.naturalWidth, img.naturalHeight);
        return;
      }
      // Not decoded yet. This matters after a mid-session handover from the
      // video, where nothing is loaded and the canvas would otherwise hold a
      // stale frame until the next scroll happened to change the index.
      img.addEventListener(
        "load",
        () => {
          if (wanted === index && img.naturalWidth)
            draw(img, img.naturalWidth, img.naturalHeight);
        },
        { once: true },
      );
    },
    destroy() {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img) img.src = "";
        images[i] = null as unknown as HTMLImageElement;
      }
    },
  };
}
