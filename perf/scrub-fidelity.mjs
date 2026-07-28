/**
 * scrub-fidelity.mjs
 * Does the frame source actually show the frame the scroll asked for?
 *
 * Frame timing cannot answer this. The video source coalesces seeks, so under a
 * fast scrub it can legitimately hit 60 fps while lagging behind the requested
 * index or skipping frames — which would read as a smooth but wrong animation.
 * This samples requested-vs-shown during a scripted scrub and reports the lag.
 *
 * Usage:
 *   node perf/scrub-fidelity.mjs [--force-jpg] [--browser=chromium|webkit]
 *                                [--label=name] [--cpu=4] [--steps=60]
 */

import { chromium, firefox, webkit } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const ORIGIN = String(args.url || "http://localhost:4322");
const BROWSER_NAME = String(args.browser || "chromium");
const FORCE_JPG = Boolean(args["force-jpg"]);
const LABEL = String(args.label || (FORCE_JPG ? "fidelity-jpg" : "fidelity-video"));
const CPU_RATE = Number(args.cpu || 1);
const STEPS = Number(args.steps || 60);
const BROWSER = { chromium, firefox, webkit }[BROWSER_NAME];

const RESULTS_DIR = path.join(process.cwd(), "perf-results");
mkdirSync(RESULTS_DIR, { recursive: true });

const browser = await BROWSER.launch();
const context = await browser.newContext();
if (FORCE_JPG) {
  await context.addInitScript(
    `HTMLMediaElement.prototype.canPlayType = function () { return ""; };`,
  );
}
const page = await context.newPage();
if (BROWSER_NAME === "chromium" && CPU_RATE > 1) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
}

await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__rocketFrameSource), null, {
  timeout: 30000,
});
const kind = await page.evaluate(() => window.__rocketFrameSource);
// Give the JPG path time to actually have frames before judging its fidelity.
await page.waitForTimeout(FORCE_JPG ? 8000 : 2000);

/**
 * Drive progress directly rather than by scrolling, so the requested index is
 * known exactly and the result is not entangled with scroll physics.
 */
const samples = await page.evaluate(
  async ({ steps }) => {
    const out = [];
    const shownIndex = () => {
      const v = document.querySelector(".js-rocket-video-mount video");
      if (v && v.src) return Math.round(v.currentTime * 30 - 0.5);
      return null;
    };
    for (let s = 0; s <= steps; s++) {
      const progress = s / steps;
      const requested = Math.min(239, Math.round(progress * 239));
      window.updateRocketFrame(progress);
      // One frame of settling — a real scrub gives it no more than this.
      await new Promise((r) => requestAnimationFrame(() => r()));
      out.push({ requested, shown: shownIndex() });
    }
    // Where it lands once the scrub stops is what the user actually sees.
    await new Promise((r) => setTimeout(r, 600));
    out.push({ requested: 239, shown: shownIndex(), settled: true });
    return out;
  },
  { steps: STEPS },
);

await browser.close();

const tracked = samples.filter((s) => s.shown !== null && !s.settled);
const lags = tracked.map((s) => Math.abs(s.requested - s.shown));
const settled = samples[samples.length - 1];

const result = {
  label: LABEL,
  browser: BROWSER_NAME,
  cpu: CPU_RATE,
  source: kind,
  steps: STEPS,
  when: new Date().toISOString(),
  trackable: tracked.length > 0,
  medianLagFrames: lags.length
    ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)]
    : null,
  worstLagFrames: lags.length ? Math.max(...lags) : null,
  settledExact: settled.shown === null ? null : settled.shown === settled.requested,
  samples,
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(
  path.join(RESULTS_DIR, `${stamp}-${LABEL}.json`),
  JSON.stringify(result, null, 2),
);

console.log(`\n=== ${LABEL} [${BROWSER_NAME}] cpu x${CPU_RATE} source=${kind} ===`);
if (!result.trackable) {
  console.log(
    "shown-index not observable for this source (JPG draws straight to canvas);",
  );
  console.log("use the pixel comparison instead — see visual check in the findings doc.",);
} else {
  console.log(
    `lag behind requested frame: median ${result.medianLagFrames}, worst ${result.worstLagFrames} frames (of 240)`,
  );
  console.log(`settles on the exact requested frame: ${result.settledExact}`);
}
