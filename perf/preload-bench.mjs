/**
 * preload-bench.mjs
 * How much resident memory does preloading N frames of the rocket sequence
 * actually cost?
 *
 * The intuitive answer — "half the frames, half the memory" — is worth testing
 * rather than assuming, because the browser's image cache has its own ceiling
 * and an eviction policy. Above that ceiling, loading fewer frames changes
 * nothing: the cache was already discarding the surplus.
 *
 * Runs each N in a fresh browser so no previous run's cache is inherited.
 *
 * Usage:
 *   node perf/preload-bench.mjs [--counts=30,60,121,240] [--src=video]
 *   node perf/preload-bench.mjs --counts=240 --stride=2
 */

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromeTreeRss } from "./rss.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const ORIGIN = String(args.url || "http://localhost:4322");
const COUNTS = String(args.counts || "30,60,121,240")
  .split(",")
  .map(Number);
const STRIDE = Number(args.stride || 1);
/** Frame URL prefix, so a downscaled copy can be measured the same way. */
const PREFIX = String(args.prefix || "/1/ezgif-frame-");
const LABEL = String(args.label || "preload-bench");
const SETTLE_MS = Number(args.settle || 4000);

const RESULTS_DIR = path.join(process.cwd(), "perf-results");
mkdirSync(RESULTS_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Must match harness.mjs: chromeTreeRss finds the process tree by matching
 * "Chrome" in the command line, which Playwright's bundled *Chromium* does not
 * satisfy. Launching the real Chrome channel is what makes RSS observable.
 */
const LAUNCH_OPTS = {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  args: [
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
};

/**
 * Replace the document with an empty page on the same origin.
 *
 * The portfolio itself holds a Three.js scene, GSAP and its own frame source,
 * which together dwarf the thing being measured. Serving a bare document keeps
 * the origin (so /1/... still resolves) while removing everything that would
 * otherwise swamp the delta.
 */
async function serveBareDocument(page) {
  await page.route(`${ORIGIN}/`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><meta charset=utf-8><title>preload-bench</title><body style='background:#000'>",
    }),
  );
}

/** Load `count` JPGs, taking every `stride`-th frame, and hold references. */
async function measureJpg(count, stride, prefix) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "preload-bench-"));
  const context = await chromium.launchPersistentContext(
    userDataDir,
    LAUNCH_OPTS,
  );
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await serveBareDocument(page);
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const before = chromeTreeRss(userDataDir);

    const loaded = await page.evaluate(
      async ({ count, stride, prefix }) => {
        // Held on window so nothing is collectible — this mirrors the real
        // component, which keeps every Image in an array for the whole session.
        window.__held = [];
        const jobs = [];
        for (let i = 0; i < count; i++) {
          const n = i * stride + 1;
          if (n > 240) break;
          const img = new Image();
          img.decoding = "async";
          img.src = `${prefix}${String(n).padStart(3, "0")}.jpg`;
          window.__held.push(img);
          jobs.push(
            new Promise((res) => {
              if (img.complete) return res(true);
              img.onload = () => res(true);
              img.onerror = () => res(false);
            }),
          );
        }
        const results = await Promise.all(jobs);
        return results.filter(Boolean).length;
      },
      { count, stride, prefix },
    );

    // Force a decode of every held frame, because RSS only reflects decoded
    // bitmaps once something has actually drawn them.
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 1400;
      c.height = 1400;
      const cx = c.getContext("2d");
      for (const img of window.__held) {
        if (img.naturalWidth) cx.drawImage(img, 0, 0);
      }
      document.body.appendChild(c);
    });

    await sleep(SETTLE_MS);
    let peak = chromeTreeRss(userDataDir);
    for (let i = 0; i < 4; i++) {
      await sleep(500);
      const s = chromeTreeRss(userDataDir);
      if (s && s.rendererSumMb > peak.rendererSumMb) peak = s;
    }
    return { before, after: peak, loaded };
  } finally {
    await context.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

/** Same measurement for the video source, for a like-for-like comparison. */
async function measureVideo(src) {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "preload-bench-"));
  const context = await chromium.launchPersistentContext(
    userDataDir,
    LAUNCH_OPTS,
  );
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await serveBareDocument(page);
    await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const before = chromeTreeRss(userDataDir);

    await page.evaluate(async (src) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      Object.assign(v.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "1px",
        height: "1px",
        opacity: "0.01",
      });
      document.body.appendChild(v);
      window.__vid = v;
      await new Promise((res, rej) => {
        v.addEventListener("loadedmetadata", res, { once: true });
        v.addEventListener("error", rej, { once: true });
        v.src = src;
        v.load();
      });
      const seek = (i) =>
        new Promise((res) => {
          v.addEventListener("seeked", res, { once: true });
          v.currentTime = (i + 0.5) / 30;
        });
      const c = document.createElement("canvas");
      c.width = 1400;
      c.height = 1400;
      const cx = c.getContext("2d");
      document.body.appendChild(c);
      // Scrub the whole range so the decoder reaches its steady state.
      for (let i = 0; i < 240; i += 2) {
        await seek(i);
        cx.drawImage(v, 0, 0);
      }
    }, src);

    await sleep(SETTLE_MS);
    let peak = chromeTreeRss(userDataDir);
    for (let i = 0; i < 4; i++) {
      await sleep(500);
      const s = chromeTreeRss(userDataDir);
      if (s && s.rendererSumMb > peak.rendererSumMb) peak = s;
    }
    return { before, after: peak, loaded: 240 };
  } finally {
    await context.close().catch(() => {});
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

const rows = [];
if (args.src === "video" || args.video) {
  const r = await measureVideo(String(args.video || "/1/rocket.mp4"));
  rows.push({ what: "video (full scrub)", ...r });
} else {
  for (const n of COUNTS) {
    const r = await measureJpg(n, STRIDE, PREFIX);
    rows.push({ what: `${n} jpg (stride ${STRIDE})`, ...r });
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(RESULTS_DIR, `${stamp}-${LABEL}.json`);
writeFileSync(file, JSON.stringify(rows, null, 2));

console.log(`\n=== ${LABEL} ===`);
console.log("what                      loaded  rendererRSS before -> after   delta");
for (const r of rows) {
  const b = r.before?.rendererSumMb ?? 0;
  const a = r.after?.rendererSumMb ?? 0;
  console.log(
    `${r.what.padEnd(24)} ${String(r.loaded).padStart(6)}   ${String(b).padStart(7)} -> ${String(a).padStart(7)} MB  ${String(
      (a - b).toFixed(1),
    ).padStart(7)} MB`,
  );
}
console.log(`saved: ${path.relative(process.cwd(), file)}`);
