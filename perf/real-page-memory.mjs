/**
 * Attribute resident memory on the real page without changing production code.
 *
 * Each variant launches a fresh Chrome profile. The frame variants are selected
 * before application code runs by wrapping HTMLImageElement.src:
 *   1918  — remap the shipped /1/960/ path to the original /1/ path
 *   960   — leave the shipped path unchanged
 *   none  — suppress frame requests and replace updateRocketFrame with a no-op
 *
 * Attribution variants build on `none`:
 *   no-three — also prevent the Three.js hero scene from mounting
 *   no-fonts — also abort local web-font requests
 *   bare     — serve an empty same-origin document (browser/process baseline)
 *
 * Usage:
 *   node perf/real-page-memory.mjs --variants=1918,none --runs=3
 *   node perf/real-page-memory.mjs --variants=1918,none --runs=3 --mobile --cpu=4
 *   node perf/real-page-memory.mjs --variants=none,no-three,no-fonts,bare --runs=3
 */

import { chromium } from "playwright-core";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromeTreeRss } from "./rss.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    return match ? [match[1], match[2] ?? true] : [arg, true];
  }),
);

const ORIGIN = String(args.url || "http://localhost:4322").replace(/\/$/, "");
const VARIANTS = String(args.variants || "1918,none")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const RUNS = Number(args.runs || 1);
const MOBILE = Boolean(args.mobile);
const CPU_RATE = Number(args.cpu || 1);
const LABEL = String(args.label || "real-page-memory");
const RESULTS_DIR = path.join(process.cwd(), "perf-results");
const VALID_VARIANTS = new Set([
  "1918",
  "960",
  "none",
  "no-three",
  "no-fonts",
  "bare",
]);

for (const variant of VARIANTS) {
  if (!VALID_VARIANTS.has(variant)) {
    throw new Error(`Unknown variant "${variant}"`);
  }
}
if (!Number.isInteger(RUNS) || RUNS < 1) {
  throw new Error("--runs must be a positive integer");
}

mkdirSync(RESULTS_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function frameInitScript(variant) {
  performance.setResourceTimingBufferSize(4000);
  const noFrames = ["none", "no-three", "no-fonts"].includes(variant);
  const original = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "src",
  );
  const rocketPath = /\/1\/(?:960\/)?ezgif-frame-/;

  Object.defineProperty(HTMLImageElement.prototype, "src", {
    ...original,
    set(value) {
      let next = String(value);
      if (rocketPath.test(next)) {
        if (noFrames) return;
        if (variant === "1918") {
          next = next.replace("/1/960/ezgif-frame-", "/1/ezgif-frame-");
        }
      }
      original.set.call(this, next);
    },
  });

  if (noFrames) {
    const noop = () => {};
    Object.defineProperty(window, "updateRocketFrame", {
      configurable: true,
      get: () => noop,
      set: () => {},
    });
    document.addEventListener(
      "DOMContentLoaded",
      () => document.querySelector(".js-rocket-canvas")?.remove(),
      { capture: true, once: true },
    );
  }

  if (variant === "no-three") {
    document.addEventListener(
      "DOMContentLoaded",
      () => document.querySelector("[data-dotted-surface]")?.remove(),
      { capture: true, once: true },
    );
  }
}

function updatePeak(current, sample) {
  if (!sample) return current;
  if (!current || sample.rendererSumMb > current.rendererSumMb) return sample;
  return current;
}

async function runVariant(variant, run) {
  const profileDir = mkdtempSync(
    path.join(tmpdir(), `real-page-memory-${variant}-`),
  );
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chrome",
    headless: false,
    viewport: MOBILE
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
    deviceScaleFactor: MOBILE ? 3 : 2,
    isMobile: MOBILE,
    hasTouch: MOBILE,
    args: [
      "--js-flags=--expose-gc",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });

  let timer;
  let peak = null;
  const consoleMessages = [];
  const pageErrors = [];
  try {
    if (variant !== "bare") {
      await context.addInitScript(frameInitScript, variant);
    }
    const page = context.pages()[0] ?? (await context.newPage());
    if (variant === "bare") {
      await page.route(`${ORIGIN}/`, (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><meta charset=utf-8><title>memory baseline</title><body style='background:#000'>",
        }),
      );
    }
    if (variant === "no-fonts") {
      await page.route("**/*.woff2", (route) => route.abort());
    }
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        consoleMessages.push({
          type: message.type(),
          text: message.text().slice(0, 300),
        });
      }
    });
    page.on("pageerror", (error) =>
      pageErrors.push(String(error).slice(0, 300)),
    );

    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    if (CPU_RATE > 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    }

    timer = setInterval(() => {
      peak = updatePeak(peak, chromeTreeRss(profileDir));
    }, 250);

    await page.goto(`${ORIGIN}/`, {
      waitUntil: variant === "bare" ? "load" : "domcontentloaded",
      timeout: 60000,
    });

    if (variant === "bare") {
      await sleep(6000);
    } else {
      await page.waitForFunction(
        () =>
          !document.querySelector(".js-site-loader") &&
          document.documentElement.classList.contains("is-works-ready") &&
          !document.documentElement.classList.contains("is-scroll-blocked"),
        null,
        { timeout: 60000, polling: 250 },
      );
      if (variant === "1918" || variant === "960") {
        await page.waitForFunction(
          () =>
            performance
              .getEntriesByType("resource")
              .filter((entry) =>
                /\/1\/(?:960\/)?ezgif-frame-/.test(entry.name),
              ).length >= 240,
          null,
          { timeout: 120000, polling: 250 },
        );
      }
      await sleep(2500);
    }

    await page.evaluate(() => {
      window.gc?.();
      window.gc?.();
    });
    const afterLoad = chromeTreeRss(profileDir);

    let rocketRequests = 0;
    let rocketTransferKb = 0;
    if (variant !== "bare") {
      const geometry = await page.evaluate(() => {
        const section = document.querySelector(".js-rocket-story");
        const rect = section.getBoundingClientRect();
        return {
          top: rect.top + window.scrollY,
          height: rect.height,
          maxScroll: document.body.scrollHeight - window.innerHeight,
        };
      });
      const rocketEnd = Math.min(
        geometry.top + geometry.height,
        geometry.maxScroll,
      );

      // One rAF per step gives the real scroll driver a chance to request and
      // paint every frame instead of coalescing a synthetic instant jump.
      for (let index = 0; index < 240; index++) {
        const y = Math.round((rocketEnd * index) / 239);
        await page.evaluate(
          (nextY) =>
            new Promise((resolve) => {
              window.scrollTo({ top: nextY, behavior: "instant" });
              requestAnimationFrame(() => resolve());
            }),
          y,
        );
      }
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            window.scrollTo({ top: 0, behavior: "instant" });
            requestAnimationFrame(() => resolve());
          }),
      );
      await sleep(3500);

      const resources = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => /\/1\/(?:960\/)?ezgif-frame-/.test(entry.name))
          .map((entry) => ({
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
          })),
      );
      rocketRequests = resources.length;
      rocketTransferKb = +(
        resources.reduce(
          (sum, entry) =>
            sum + (entry.transferSize || entry.encodedBodySize || 0),
          0,
        ) / 1024
      ).toFixed(0);
    }

    await page.evaluate(() => {
      window.gc?.();
      window.gc?.();
    });
    await sleep(500);
    const final = chromeTreeRss(profileDir);
    peak = updatePeak(peak, final);
    const metrics = Object.fromEntries(
      (await cdp.send("Performance.getMetrics")).metrics.map((metric) => [
        metric.name,
        metric.value,
      ]),
    );

    return {
      variant,
      run,
      viewport: MOBILE ? "390x844@3x" : "1440x900@2x",
      cpuThrottle: CPU_RATE,
      rocketRequests,
      rocketTransferKb,
      afterLoad,
      final,
      peak,
      jsHeapMb: +(metrics.JSHeapUsedSize / 1048576).toFixed(1),
      nodes: metrics.Nodes,
      listeners: metrics.JSEventListeners,
      console: consoleMessages,
      pageErrors,
    };
  } finally {
    clearInterval(timer);
    await context.close().catch(() => {});
    rmSync(profileDir, { recursive: true, force: true });
  }
}

const results = [];
for (let run = 1; run <= RUNS; run++) {
  // Reverse every other pass so machine drift does not always favor the same
  // variant.
  const order = run % 2 === 0 ? [...VARIANTS].reverse() : VARIANTS;
  for (const variant of order) {
    const result = await runVariant(variant, run);
    results.push(result);
    console.log(
      `${variant.padEnd(9)} run ${run}: page renderer(max) ${result.final?.rendererMaxMb ?? "?"} MB, ` +
        `renderer tree ${result.final?.rendererSumMb ?? "?"} MB, ` +
        `GPU ${result.final?.gpuMb ?? "?"} MB, total ${result.final?.totalMb ?? "?"} MB, ` +
        `JS heap ${result.jsHeapMb} MB, frames ${result.rocketRequests}`,
    );
  }
}

const output = path.join(RESULTS_DIR, `${stamp}-${LABEL}.json`);
writeFileSync(
  output,
  JSON.stringify(
    {
      label: LABEL,
      timestamp: stamp,
      url: ORIGIN,
      variants: VARIANTS,
      runs: RUNS,
      viewport: MOBILE ? "390x844@3x" : "1440x900@2x",
      cpuThrottle: CPU_RATE,
      results,
    },
    null,
    2,
  ),
);
console.log(`saved: ${path.relative(process.cwd(), output)}`);
