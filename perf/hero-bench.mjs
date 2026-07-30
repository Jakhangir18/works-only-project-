/**
 * perf/hero-bench.mjs — frame timing for the hero, parked at page top.
 *
 * The main harness has no hero phase: every phase it measures is scroll-driven,
 * so the two ever-running hero loops (MorphingText's animated blur, the
 * DottedSurface WebGL field) were only ever measured *indirectly*, as
 * competition during Work. `docs/cross-browser-audit.md` finding 8 therefore
 * ends with "do not touch it before measuring the hero specifically" — this is
 * that measurement.
 *
 * Usage:
 *   node perf/hero-bench.mjs --label=hero-webkit --browser=webkit
 *   node perf/hero-bench.mjs --label=hero-wk-filter-on --browser=webkit --force-filter=on
 *   node perf/hero-bench.mjs --label=hero-morph-off --browser=webkit --disable=morph
 *
 * --force-filter=on|off overrides the `.is-safari` branch that disables the
 *   SVG threshold filter, so the filter's cost can be A/B'd on one build.
 * --disable=morph|surface|both attributes cost between the two hero loops.
 *
 * Same engine caveats as harness.mjs: long tasks, heap and CPU throttling are
 * Chromium-only (probed, not assumed), so on WebKit/Firefox this is frame
 * timing only. Playwright WebKit is not Safari.
 */

import { chromium, firefox, webkit } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const LABEL = args.label || "hero";
const URL = args.url || "http://localhost:4322/";
const SECONDS = Number(args.seconds || 8);
const REPEATS = Number(args.repeats || 1);
const CPU_RATE = Number(args.cpu || 1);
const FORCE_FILTER = args["force-filter"] || null; // "on" | "off" | null
const DISABLE = args.disable || null; // "morph" | "surface" | "both"
const BROWSER_NAME = String(args.browser || "chromium");
const BROWSER = { chromium, firefox, webkit }[BROWSER_NAME];
if (!BROWSER) {
  console.error(`unknown --browser=${BROWSER_NAME} (want chromium|firefox|webkit)`);
  process.exit(1);
}
const IS_CHROMIUM = BROWSER_NAME === "chromium";

const REPO = process.cwd();
const RESULTS_DIR = path.join(REPO, "perf-results");
mkdirSync(RESULTS_DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLER = `(() => {
  const P = (window.__hero = { longtasks: [], frames: [], recording: false, supportsLongtask: false });
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.longtasks.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) });
    }).observe({ entryTypes: ["longtask"] });
    P.supportsLongtask = true;
  } catch (e) { P.supportsLongtask = false; }
  let last = 0;
  const tick = (t) => {
    if (P.recording && last) P.frames.push(+(t - last).toFixed(2));
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  P.start = () => { P.frames = []; P.longtasks = []; P.recording = true; P.t0 = performance.now(); };
  P.stop = () => { P.recording = false; P.t1 = performance.now(); };
})();`;

// Kill the loops without touching the repo, the same technique the baseline
// hero-loops-off diagnostic used in PERF-NOTES.
const DISABLE_SCRIPT = (which) => `(() => {
  const off = ${JSON.stringify(which)};
  const realRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => {
    const src = String(cb);
    const isMorph = src.includes("frameCount") || src.includes("doMorph");
    const isSurface = src.includes("renderer") || src.includes("positions");
    if ((off === "morph" || off === "both") && isMorph) return 0;
    if ((off === "surface" || off === "both") && isSurface) return 0;
    return realRaf(cb);
  };
})();`;

function stats(frames) {
  if (!frames.length) return { count: 0 };
  const s = [...frames].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
  return {
    count: s.length,
    medianMs: +q(0.5).toFixed(1),
    p95Ms: +q(0.95).toFixed(1),
    worstMs: +s[s.length - 1].toFixed(1),
    over25ms: s.filter((v) => v > 25).length,
    over50ms: s.filter((v) => v > 50).length,
  };
}

async function main() {
  const result = {
    label: LABEL,
    timestamp: STAMP,
    url: URL,
    config: {
      browser: BROWSER_NAME,
      seconds: SECONDS,
      repeats: REPEATS,
      cpuThrottle: IS_CHROMIUM ? CPU_RATE : null,
      forceFilter: FORCE_FILTER,
      disable: DISABLE,
      viewport: "1440x900",
    },
    notes: [
      "Hero parked at page top; nothing scrolls. Measures the two ever-running hero loops.",
      "Long tasks / heap are Chromium-only (capability probed in-page, not assumed).",
      "Playwright WebKit is not Safari: same lineage, different JIT and media stack.",
    ],
    console: [],
    pageErrors: [],
    runs: [],
  };

  const browser = await BROWSER.launch({ headless: false });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(SAMPLER);
    if (DISABLE) await context.addInitScript(DISABLE_SCRIPT(DISABLE));
    const page = await context.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning")
        result.console.push({ type: m.type(), text: m.text().slice(0, 300) });
    });
    page.on("pageerror", (e) => result.pageErrors.push(String(e).slice(0, 300)));

    const cdp = IS_CHROMIUM ? await context.newCDPSession(page) : null;
    if (cdp && CPU_RATE > 1)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        !document.querySelector(".js-site-loader") &&
        !document.documentElement.classList.contains("is-scroll-blocked"),
      { timeout: 60000, polling: 250 },
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await sleep(1200);

    // "on"/"off" are shorthands; anything else is used verbatim as the filter
    // value, so a candidate chain can be A/B'd without a rebuild.
    const filterCss =
      FORCE_FILTER === "on"
        ? "url(#threshold) blur(0.6px)"
        : FORCE_FILTER === "off"
          ? "none"
          : FORCE_FILTER;
    if (filterCss)
      await page.addStyleTag({
        content: `.morphing-text{-webkit-filter:${filterCss}!important;filter:${filterCss}!important}`,
      });

    result.env = await page.evaluate(() => {
      const c = document.querySelector(".morphing-text");
      return {
        ua: navigator.userAgent,
        htmlClass: document.documentElement.className,
        containerFilter: getComputedStyle(c).filter,
        supportsLongtask: window.__hero.supportsLongtask,
        heroVisible: (() => {
          const r = document.querySelector(".hero-home").getBoundingClientRect();
          return r.bottom > 0 && r.top < window.innerHeight;
        })(),
        scrollY: window.scrollY,
        webglCanvas: !!document.querySelector(".dotted-surface canvas"),
      };
    });

    for (let i = 1; i <= REPEATS; i++) {
      await page.evaluate(() => window.__hero.start());
      await sleep(SECONDS * 1000);
      await page.evaluate(() => window.__hero.stop());
      const data = await page.evaluate(() => ({
        frames: window.__hero.frames,
        longtasks: window.__hero.longtasks,
        supportsLongtask: window.__hero.supportsLongtask,
        durationMs: +(window.__hero.t1 - window.__hero.t0).toFixed(0),
      }));
      result.runs.push({
        run: i,
        ...stats(data.frames),
        durationMs: data.durationMs,
        longTasks: data.supportsLongtask ? data.longtasks.length : null,
        longTaskTotalMs: data.supportsLongtask
          ? +data.longtasks.reduce((a, t) => a + t.dur, 0).toFixed(0)
          : null,
      });
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const file = path.join(RESULTS_DIR, `${STAMP}-${LABEL}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));

  const pad = (v, n) => String(v ?? "-").padStart(n);
  console.log(
    `\n=== ${LABEL} [${BROWSER_NAME}] hero parked, ${SECONDS}s x${REPEATS}` +
      `${FORCE_FILTER ? `, filter forced ${FORCE_FILTER}` : ""}` +
      `${DISABLE ? `, ${DISABLE} disabled` : ""}` +
      `${IS_CHROMIUM && CPU_RATE > 1 ? `, cpu x${CPU_RATE}` : ""} ===`,
  );
  console.log(`filter in effect: ${result.env.containerFilter}   hero visible: ${result.env.heroVisible}   scrollY: ${result.env.scrollY}`);
  console.log("run    frames   med   p95  worst  >25ms >50ms  LT(ms)");
  for (const r of result.runs)
    console.log(
      `${pad(r.run, 3)}${pad(r.count, 10)}${pad(r.medianMs, 6)}${pad(r.p95Ms, 6)}${pad(r.worstMs, 7)}` +
        `${pad(r.over25ms, 7)}${pad(r.over50ms, 6)}${pad(r.longTasks == null ? "n/a" : r.longTasks + "(" + r.longTaskTotalMs + ")", 9)}`,
    );
  console.log(`console: ${result.console.length} warn/error, pageErrors: ${result.pageErrors.length}`);
  if (result.console.length)
    for (const c of result.console.slice(0, 6)) console.log(`  ${c.type}: ${c.text}`);
  console.log(`saved: ${path.relative(REPO, file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
