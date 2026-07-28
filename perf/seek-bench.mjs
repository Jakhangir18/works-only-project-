/**
 * seek-bench.mjs
 * Measures the cost of scrubbing a video by seeking, which is the operation the
 * rocket sequence performs once per changed frame.
 *
 * Reports the number this whole exercise turns on: the FIRST seek on a cold
 * decoder, versus every seek after it. If the first is expensive and the rest
 * are cheap, a warm-up seek during idle is what makes the feature viable.
 *
 * Usage:
 *   node perf/seek-bench.mjs --src=/1/rocket.mp4 [--browser=chromium|webkit|firefox]
 *                            [--label=name] [--cpu=4]
 *
 * Needs a production preview running (npm run preview -- --port 4322).
 */

import { chromium, firefox, webkit } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const SRC = String(args.src || "/1/rocket.mp4");
const ORIGIN = String(args.url || "http://localhost:4322");
const BROWSER_NAME = String(args.browser || "chromium");
const LABEL = String(args.label || "seek");
const CPU_RATE = Number(args.cpu || 1);
const FPS = Number(args.fps || 30);
const TOTAL = Number(args.frames || 240);

const BROWSER = { chromium, firefox, webkit }[BROWSER_NAME];
if (!BROWSER) {
  console.error(`unknown --browser=${BROWSER_NAME}`);
  process.exit(1);
}

const RESULTS_DIR = path.join(process.cwd(), "perf-results");
mkdirSync(RESULTS_DIR, { recursive: true });

const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1);
};

const browser = await BROWSER.launch();
const context = await browser.newContext();
const page = await context.newPage();

if (BROWSER_NAME === "chromium" && CPU_RATE > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
}

// A bare page on the same origin, so the video request is same-origin and the
// measurement is not entangled with the portfolio's own startup work.
await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });

const out = await page.evaluate(
  async ({ src, fps, total }) => {
    const seek = (v, index) =>
      new Promise((resolve, reject) => {
        const t = performance.now();
        const ok = () => {
          v.removeEventListener("error", bad);
          resolve(performance.now() - t);
        };
        const bad = () => {
          v.removeEventListener("seeked", ok);
          reject(new Error("seek error"));
        };
        v.addEventListener("seeked", ok, { once: true });
        v.addEventListener("error", bad, { once: true });
        v.currentTime = (index + 0.5) / fps;
      });

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.preload = "auto";
    Object.assign(v.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "1px",
      height: "1px",
      opacity: "0.01",
    });
    document.body.appendChild(v);

    const tLoad = performance.now();
    await new Promise((resolve, reject) => {
      v.addEventListener("loadedmetadata", resolve, { once: true });
      v.addEventListener("error", () => reject(new Error("load error")), {
        once: true,
      });
      v.src = src;
      v.load();
    });
    const metadataMs = performance.now() - tLoad;

    // 1. Cold decoder: the seek a user would pay for with no warm-up.
    const coldMs = await seek(v, Math.floor(total / 2));

    // 2. Warm decoder, forward scrub across the whole range — the common case.
    const forward = [];
    for (let i = 0; i < total; i += 2) forward.push(await seek(v, i));

    // 3. Warm decoder, backward scrub — worst case for inter-frame prediction,
    //    because each step may need its keyframe re-decoded.
    const backward = [];
    for (let i = total - 1; i >= 0; i -= 2) backward.push(await seek(v, i));

    // 4. Random access, the pathological pattern.
    const random = [];
    for (let i = 0; i < 60; i++)
      random.push(await seek(v, Math.floor(Math.random() * total)));

    // Confirm frames actually paint, not just that seeked fired.
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const cx = c.getContext("2d", { willReadFrequently: true });
    cx.drawImage(v, 0, 0, 8, 8);
    const px = cx.getImageData(0, 0, 8, 8).data;
    let bright = 0;
    for (let i = 0; i < px.length; i += 4)
      if (px[i] > 24 || px[i + 1] > 24 || px[i + 2] > 24) bright++;

    v.remove();
    return {
      metadataMs: +metadataMs.toFixed(1),
      coldMs: +coldMs.toFixed(1),
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      forward,
      backward,
      random,
      paintedPixels: bright,
    };
  },
  { src: SRC, fps: FPS, total: TOTAL },
);

await browser.close();

const summarise = (arr) => ({
  n: arr.length,
  med: q(arr, 0.5),
  p95: q(arr, 0.95),
  worst: +Math.max(...arr).toFixed(1),
});

const result = {
  label: LABEL,
  browser: BROWSER_NAME,
  cpu: CPU_RATE,
  src: SRC,
  when: new Date().toISOString(),
  metadataMs: out.metadataMs,
  coldSeekMs: out.coldMs,
  duration: out.duration,
  dimensions: `${out.videoWidth}x${out.videoHeight}`,
  paintedPixels: out.paintedPixels,
  forward: summarise(out.forward),
  backward: summarise(out.backward),
  random: summarise(out.random),
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(RESULTS_DIR, `${stamp}-${LABEL}.json`);
writeFileSync(file, JSON.stringify({ ...result, raw: out }, null, 2));

console.log(`\n=== ${LABEL} [${BROWSER_NAME}] cpu x${CPU_RATE} ${SRC} ===`);
console.log(
  `${result.dimensions}, ${out.duration?.toFixed(2)}s, metadata @${result.metadataMs}ms, painted ${out.paintedPixels}/64 px`,
);
console.log(`COLD first seek : ${result.coldSeekMs} ms   <-- what a warm-up removes`);
for (const k of ["forward", "backward", "random"]) {
  const s = result[k];
  console.log(
    `${k.padEnd(16)}: med ${String(s.med).padStart(6)}  p95 ${String(s.p95).padStart(6)}  worst ${String(s.worst).padStart(6)}  (n=${s.n})`,
  );
}
console.log(`saved: ${path.relative(process.cwd(), file)}`);
