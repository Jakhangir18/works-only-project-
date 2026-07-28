/**
 * perf/harness.mjs — repeatable performance measurement for the portfolio.
 *
 * Measures the production build (astro preview) with system Chrome via
 * playwright-core. One invocation = one configuration = one JSON result in
 * perf-results/.
 *
 * Usage:
 *   node perf/harness.mjs --label=desktop-baseline
 *   node perf/harness.mjs --label=desktop-no-hero-loops --disable-hero-loops
 *   node perf/harness.mjs --label=desktop-cpu4x --cpu=4
 *   node perf/harness.mjs --label=mobile-390x844 --mobile
 *   node perf/harness.mjs --label=dive-only --dive-only
 *   node perf/harness.mjs --label=dive-firefox --dive-only --browser=firefox
 *
 * What it does, in order:
 *   1. Fresh Chrome profile, open the page, sample process-tree RSS from ps
 *      while the 240-frame rocket sequence preloads; record long tasks in
 *      that window.
 *   2. Wait for the site loader + works init to finish.
 *   3. Open/close the Work section 3x by synthetic wheel scrolling at a fixed
 *      cadence, recording per-frame rAF deltas, layout reads, style writes,
 *      reads-after-write in the same frame (forced-reflow proxy), and
 *      a-work attributeChangedCallback fires. GC'd JS heap after every cycle.
 *   4. Dive transition: open/close a project card's dive 5x, same per-frame
 *      instrumentation, plus heap/listener/node deltas across the 5 cycles.
 *   5. Scroll down+up through the rocket sequence section the same way.
 *   6. CDP Performance metrics (LayoutCount / RecalcStyleCount) before/after
 *      every phase.
 *
 * --browser=chromium|firefox|webkit (default chromium). Firefox/WebKit have
 * no CDP session in Playwright, no performance.memory, and (for WebKit) no
 * long-task PerformanceObserver — so on those engines this reports frame
 * timing only: no heap/listener/node deltas, no long-task counts, no RSS, no
 * CPU throttling, no tracing. Chromium is the full measurement; the other
 * engines are a frame-timing cross-check, not a like-for-like comparison.
 * --dive-only skips the rocket-sequence preload and scroll phases, for a
 * fast dive-specific run (required for non-Chromium engines, useful anywhere
 * else).
 *
 * Caveats (also embedded in the JSON):
 *   - The sampler adds one rAF loop and the instrumentation adds call
 *     overhead; identical in every run, so deltas between runs are fair.
 *   - INP is not reported: scroll/wheel interactions are not INP-eligible.
 *   - "forcedReads" counts layout reads that follow a style write within the
 *     same rAF frame — a proxy, cross-checked against CDP LayoutCount.
 */

import { chromium, firefox, webkit } from "playwright-core";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { chromeTreeRss } from "./rss.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const LABEL = args.label || "run";
const URL = args.url || "http://localhost:4322/";
const CPU_RATE = Number(args.cpu || 1);
const MOBILE = Boolean(args.mobile);
const DISABLE_HERO_LOOPS = Boolean(args["disable-hero-loops"]);
const TRACE = Boolean(args.trace);
const HEAP_PROFILE = Boolean(args["heap-profile"]);
const DIVE_ONLY = Boolean(args["dive-only"]);
const BROWSER_NAME = String(args.browser || "chromium");
const BROWSER = { chromium, firefox, webkit }[BROWSER_NAME];
if (!BROWSER) {
  console.error(`unknown --browser=${BROWSER_NAME} (want chromium|firefox|webkit)`);
  process.exit(1);
}
const IS_CHROMIUM = BROWSER_NAME === "chromium";
if (MOBILE && !IS_CHROMIUM) {
  console.error(`--mobile requested but ignored: mobile viewport emulation is Chromium-only.`);
}
const TOTAL_FRAMES = 240; // rocket JPG sequence length

const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.invalidationTracking",
  "toplevel",
  "v8.execute",
  "disabled-by-default-v8.gc",
  "blink.user_timing",
];

const REPO = process.cwd();
const RESULTS_DIR = path.join(REPO, "perf-results");
mkdirSync(RESULTS_DIR, { recursive: true });
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const USER_DATA_DIR = path.join(
  "/tmp",
  `perf-chrome-${LABEL}-${process.pid}`,
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- ps helpers
// chromeTreeRss lives in ./rss.mjs so the focused benches sample identically.

// ------------------------------------------------------------- page scripts

const INSTRUMENTATION = `(() => {
  try { performance.setResourceTimingBufferSize(4000); } catch (e) {}
  const P = (window.__perf = {
    longtasks: [],
    events: [],
    sessions: {},
    recording: null,
    totals: { gbcr: 0, offsetReads: 0, clientReads: 0, styleWrites: 0, forcedReads: 0, acc: 0 },
  });

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        P.longtasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch (e) {}

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        P.events.push({ name: e.name, start: e.startTime, dur: e.duration });
    }).observe({ type: "event", durationThreshold: 40, buffered: true });
  } catch (e) {}

  let styleDirty = false;
  const countRead = (kind) => {
    P.totals[kind]++;
    if (styleDirty) { P.totals.forcedReads++; styleDirty = false; }
  };

  const origGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    countRead("gbcr");
    return origGBCR.apply(this, arguments);
  };
  for (const prop of ["offsetTop", "offsetLeft", "offsetWidth", "offsetHeight"]) {
    const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    if (d && d.get) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        ...d,
        get() { countRead("offsetReads"); return d.get.call(this); },
      });
    }
  }
  for (const prop of ["clientWidth", "clientHeight", "scrollHeight", "scrollWidth"]) {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, prop);
    if (d && d.get) {
      Object.defineProperty(Element.prototype, prop, {
        ...d,
        get() { countRead("clientReads"); return d.get.call(this); },
      });
    }
  }

  const origSetProperty = CSSStyleDeclaration.prototype.setProperty;
  CSSStyleDeclaration.prototype.setProperty = function () {
    P.totals.styleWrites++;
    styleDirty = true;
    return origSetProperty.apply(this, arguments);
  };
  for (const prop of ["transform", "opacity", "width", "height", "filter", "top", "left", "cssText"]) {
    const d = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, prop);
    if (d && d.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, prop, {
        ...d,
        set(v) { P.totals.styleWrites++; styleDirty = true; d.set.call(this, v); },
      });
    }
  }

  // Who scrolls? Wrap programmatic scroll APIs with stack capture so an
  // unexplained scroll during an idle phase can be attributed.
  P.scrollCalls = [];
  const recordScroll = (api, args) => {
    P.scrollCalls.push({
      api,
      args: JSON.stringify(args).slice(0, 120),
      t: performance.now(),
      stack: (new Error().stack || "").split("\\n").slice(2, 6).join(" | "),
    });
    if (P.scrollCalls.length > 80) P.scrollCalls.shift();
  };
  for (const api of ["scrollTo", "scrollBy"]) {
    const orig = window[api].bind(window);
    window[api] = function (...a) { recordScroll(api, a); return orig(...a); };
  }
  const origSIV = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...a) {
    recordScroll("scrollIntoView", a);
    return origSIV.apply(this, a);
  };

  const origDefine = customElements.define.bind(customElements);
  customElements.define = (name, ctor, opts) => {
    if (ctor.prototype && typeof ctor.prototype.attributeChangedCallback === "function") {
      const orig = ctor.prototype.attributeChangedCallback;
      ctor.prototype.attributeChangedCallback = function () {
        P.totals.acc++;
        return orig.apply(this, arguments);
      };
    }
    return origDefine(name, ctor, opts);
  };

  let rafId = null, lastT = 0, lastTotals = null;
  function frame(t) {
    const s = P.recording;
    if (!s) { rafId = null; return; }
    if (lastT) {
      s.frames.push({
        dt: +(t - lastT).toFixed(2),
        gbcr: P.totals.gbcr - lastTotals.gbcr,
        offsetReads: P.totals.offsetReads - lastTotals.offsetReads,
        clientReads: P.totals.clientReads - lastTotals.clientReads,
        styleWrites: P.totals.styleWrites - lastTotals.styleWrites,
        forcedReads: P.totals.forcedReads - lastTotals.forcedReads,
        acc: P.totals.acc - lastTotals.acc,
      });
    }
    lastT = t;
    lastTotals = { ...P.totals };
    styleDirty = false;
    rafId = requestAnimationFrame(frame);
  }
  P.start = (label) => {
    const s = { label, frames: [], t0: performance.now(), counters0: { ...P.totals } };
    P.sessions[label] = s;
    P.recording = s;
    lastT = 0;
    lastTotals = { ...P.totals };
    try { performance.mark("phase-start:" + label); } catch (e) {}
    if (!rafId) rafId = requestAnimationFrame(frame);
  };
  P.stop = () => {
    const s = P.recording;
    if (!s) return null;
    s.t1 = performance.now();
    s.counters1 = { ...P.totals };
    try { performance.mark("phase-end:" + s.label); } catch (e) {}
    P.recording = null;
    return s.label;
  };
})();`;

const DISABLE_HERO_SCRIPT = `(() => {
  // Diagnostic only: make MorphingText and DottedSurface mounts find no
  // container so their rAF loops never start. Runtime injection — no repo
  // code is modified.
  const origQS = Document.prototype.querySelector;
  Document.prototype.querySelector = function (sel) {
    if (sel === "[data-morphing-text]" || sel === "[data-dotted-surface]") return null;
    return origQS.apply(this, arguments);
  };
})();`;

// ------------------------------------------------------------------- stats

function stats(frames) {
  if (!frames.length) return null;
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))];
  const sum = (k) => frames.reduce((s, f) => s + f[k], 0);
  const avg = (k) => +(sum(k) / frames.length).toFixed(2);
  const max = (k) => Math.max(...frames.map((f) => f[k]));
  return {
    frames: frames.length,
    medianMs: +q(0.5).toFixed(2),
    p95Ms: +q(0.95).toFixed(2),
    worstMs: +q(1).toFixed(2),
    over25ms: dts.filter((d) => d > 25).length,
    over50ms: dts.filter((d) => d > 50).length,
    layoutReadsPerFrame: +(
      (sum("gbcr") + sum("offsetReads") + sum("clientReads")) / frames.length
    ).toFixed(2),
    styleWritesPerFrame: avg("styleWrites"),
    forcedReadsPerFrame: avg("forcedReads"),
    forcedReadsMax: max("forcedReads"),
    accPerFrame: avg("acc"),
    accMax: max("acc"),
    accTotal: sum("acc"),
  };
}

// ------------------------------------------------------------- dive helpers

/**
 * Only 1-2 of the 20 Work cards are ever rendered at once (content-visibility
 * gates the rest), and the card at any given scroll offset changes as the
 * carousel scrubs — so unlike the Work/rocket phases, the dive phase has to
 * find a clickable card before it can measure anything.
 */
async function findRenderedCard(page, geom) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let anyMatch = null;
  for (let f = 0.15; f <= 0.95; f += 0.05) {
    const y = Math.round(geom.workTop + geom.workH * f);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
    await sleep(1300); // scrub:1 catch-up, same cadence as jumpTo()
    const card = await page.evaluate(() => {
      const vw = innerWidth, vh = innerHeight;
      const el = [...document.querySelectorAll("a-work")].find((e) => {
        const c = e.querySelector(".a__card");
        const r = c.getBoundingClientRect();
        return (
          e.classList.contains("is-inview") &&
          getComputedStyle(e).contentVisibility !== "hidden" &&
          r.left > 4 && r.right < vw - 4 && r.top > 4 && r.bottom < vh - 4
        );
      });
      if (!el) return null;
      const c = el.querySelector(".a__card");
      const r = c.getBoundingClientRect();
      const href = el.querySelector("a")?.getAttribute("href") || null;
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, href, hasCover: !!c.querySelector(".a__card__cover") };
    });
    if (card) {
      // Prefer the one card with a photo — that is the layer whose raster
      // cost this phase exists to measure — falling back to any card if the
      // sweep never lands on it.
      if (card.hasCover) return { ...card, scrollY: y };
      if (!anyMatch) anyMatch = { ...card, scrollY: y };
    }
  }
  return anyMatch;
}

// -------------------------------------------------------------------- main

async function main() {
  const result = {
    label: LABEL,
    timestamp: STAMP,
    url: URL,
    config: {
      browser: BROWSER_NAME,
      cpuThrottle: IS_CHROMIUM ? CPU_RATE : null,
      mobile: IS_CHROMIUM && MOBILE,
      viewport: IS_CHROMIUM && MOBILE ? "390x844@3x" : "1440x900@2x",
      diveOnly: DIVE_ONLY,
      disableHeroLoops: DISABLE_HERO_LOOPS,
    },
    notes: [
      "Sampler adds one rAF + instrumentation overhead, identical across runs.",
      "INP n/a: scroll/wheel is not INP-eligible; event-timing entries >40ms captured instead.",
      "forcedReads = layout reads after a style write in the same frame (proxy).",
    ],
    console: [],
    pageErrors: [],
  };

  const launchOpts = IS_CHROMIUM
    ? {
        channel: "chrome",
        headless: false,
        viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 },
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
      }
    : {
        // Firefox/WebKit: no channel concept, no Chromium CLI flags, and
        // isMobile/hasTouch are Chromium-only viewport emulation — mobile
        // dive numbers on these engines are out of scope here.
        headless: false,
        viewport: { width: 1440, height: 900 },
      };
  const context = await BROWSER.launchPersistentContext(USER_DATA_DIR, launchOpts);

  try {
    await context.addInitScript(INSTRUMENTATION);
    if (DISABLE_HERO_LOOPS) await context.addInitScript(DISABLE_HERO_SCRIPT);

    const page = context.pages()[0] || (await context.newPage());
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning")
        result.console.push({ type: msg.type(), text: msg.text().slice(0, 300) });
    });
    page.on("pageerror", (err) => result.pageErrors.push(String(err).slice(0, 300)));

    const cdp = IS_CHROMIUM ? await context.newCDPSession(page) : null;
    if (cdp) {
      await cdp.send("Performance.enable");
      if (CPU_RATE > 1)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    }

    const cdpMetrics = async () => {
      if (!cdp) return {};
      const { metrics } = await cdp.send("Performance.getMetrics");
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    };
    const gcHeapMb = () =>
      page
        .evaluate(() => {
          if (window.gc) { window.gc(); window.gc(); }
          if (!performance.memory) return null; // Firefox/WebKit: no such API
          return +(performance.memory.usedJSHeapSize / 1048576).toFixed(1);
        })
        .catch(() => null);

    // RSS sampling during load + preload
    let rssPeak = null;
    const rssTick = () => {
      const s = chromeTreeRss(USER_DATA_DIR);
      if (s && (!rssPeak || s.rendererSumMb > rssPeak.rendererSumMb)) rssPeak = s;
    };
    const rssTimer = setInterval(rssTick, 500);

    const t0 = Date.now();
    await page.goto(URL, { waitUntil: "domcontentloaded" });

    // ---- Preload of the 240-frame rocket sequence
    if (DIVE_ONLY) {
      result.preload = { skipped: "dive-only run" };
      await sleep(500);
    } else {
      let preloadTimings = null;
      try {
        await page.waitForFunction(
          (n) =>
            performance
              .getEntriesByType("resource")
              .filter((r) => r.name.includes("/1/ezgif-frame-")).length >= n,
          TOTAL_FRAMES,
          { timeout: 120000, polling: 500 },
        );
        preloadTimings = await page.evaluate(() => {
          const frames = performance
            .getEntriesByType("resource")
            .filter((r) => r.name.includes("/1/ezgif-frame-"));
          const done = Math.max(...frames.map((r) => r.responseEnd));
          const lt = window.__perf.longtasks.filter((t) => t.start <= done + 100);
          return {
            frameCount: frames.length,
            totalTransferKb: +(
              frames.reduce((s, r) => s + (r.transferSize || r.encodedBodySize), 0) / 1024
            ).toFixed(0),
            preloadDoneAtMs: +done.toFixed(0),
            longTasksDuringPreload: lt.length,
            longTaskMsDuringPreload: +lt.reduce((s, t) => s + t.dur, 0).toFixed(0),
          };
        });
      } catch {
        preloadTimings = { error: "preload did not reach 240 frames in 120s" };
      }
      await sleep(1500); // let decode/paint settle
      rssTick();
      result.preload = {
        ...preloadTimings,
        wallClockMs: Date.now() - t0,
        rssPeakDuringPreload: rssPeak,
        rssAfterPreload: chromeTreeRss(USER_DATA_DIR),
        jsHeapAfterPreloadMb: await gcHeapMb(),
      };
    }

    // ---- Wait for site ready (loader gone, works initialized)
    await page.waitForFunction(
      () =>
        !document.querySelector(".js-site-loader") &&
        document.documentElement.classList.contains("is-works-ready") &&
        !document.documentElement.classList.contains("is-scroll-blocked"),
      { timeout: 60000, polling: 250 },
    );
    await sleep(500);

    // Stability gate: a late viewport settle can fire the app's debounced
    // resize path (setTimeline + ScrollTrigger.refresh), which changes the
    // document height and can move scroll on its own. Wait until both
    // scrollHeight and scrollY have been quiet for 2s before trusting any
    // geometry.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(
      () => {
        const now = {
          h: document.body.scrollHeight,
          y: window.scrollY,
          t: Date.now(),
        };
        if (!window.__stab) window.__stab = { ...now, since: now.t };
        const st = window.__stab;
        if (st.h !== now.h || Math.abs(st.y - now.y) > 2) {
          st.h = now.h;
          st.y = now.y;
          st.since = now.t;
          if (now.y > 2) window.scrollTo({ top: 0, behavior: "instant" });
          return false;
        }
        return now.t - st.since > 2000;
      },
      { timeout: 45000, polling: 300 },
    );

    const geomFn = () => {
      const abs = (el) => el.getBoundingClientRect().top + window.scrollY;
      const w = document.querySelector(".s-work");
      const r = document.querySelector(".js-rocket-story");
      return {
        vh: window.innerHeight,
        workTop: Math.round(abs(w)),
        workH: w.getBoundingClientRect().height,
        rocketTop: Math.round(abs(r)),
        rocketH: r.getBoundingClientRect().height,
        maxScroll: document.body.scrollHeight - window.innerHeight,
        dpr: window.devicePixelRatio,
      };
    };
    const geom = await page.evaluate(geomFn);
    result.geometry = geom;

    // Park the pointer near the left edge so hover states on cards don't
    // pollute the measurement; wheel still targets the scrollable page.
    await page.mouse.move(30, MOBILE ? 422 : 450);

    const PX_PER_STEP = 40;
    const STEP_MS = 12;

    const jumpTo = async (y) => {
      await page.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        y,
      );
      await sleep(1500); // scrub:1 catch-up
    };
    const wheelBy = async (distance) => {
      const steps = Math.max(1, Math.round(Math.abs(distance) / PX_PER_STEP));
      const dir = Math.sign(distance);
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dir * PX_PER_STEP);
        await sleep(STEP_MS);
      }
      await sleep(600); // settle
    };

    const phases = [];
    const scrollAssertions = [];
    const getScrollY = () => page.evaluate(() => window.scrollY);

    // Every phase declares the scroll region it is supposed to cover; a
    // mismatch marks the whole run invalid so a silent mis-measurement
    // (e.g. the offsetTop-vs-positioned-ancestor bug) cannot recur.
    const runPhase = async (label, fn, expect) => {
      const before = await cdpMetrics();
      const actualFrom = await getScrollY();
      await page.evaluate((l) => window.__perf.start(l), label);
      await fn();
      await page.evaluate(() => window.__perf.stop());
      const actualTo = await getScrollY();
      const after = await cdpMetrics();
      if (expect) {
        const dist = Math.abs(expect.to - expect.from);
        const tol = dist === 0 ? 8 : Math.max(120, dist * 0.1);
        const ok =
          Math.abs(actualFrom - expect.from) <= tol &&
          Math.abs(actualTo - expect.to) <= tol;
        scrollAssertions.push({ label, ...expect, actualFrom, actualTo, ok });
        if (!ok)
          console.error(
            `SCROLL ASSERTION FAILED [${label}]: expected ${expect.from}->${expect.to}, actual ${actualFrom}->${actualTo}`,
          );
      }
      phases.push({
        label,
        layoutCountDelta: IS_CHROMIUM ? after.LayoutCount - before.LayoutCount : null,
        recalcStyleCountDelta: IS_CHROMIUM ? after.RecalcStyleCount - before.RecalcStyleCount : null,
        scriptDurationDeltaS: IS_CHROMIUM ? +(after.ScriptDuration - before.ScriptDuration).toFixed(2) : null,
        layoutDurationDeltaS: IS_CHROMIUM ? +(after.LayoutDuration - before.LayoutDuration).toFixed(2) : null,
      });
    };

    // Pull recorded frames out of the page and clear them there, so the
    // harness's own session storage never shows up as page heap growth.
    const collected = {};
    const harvest = async () => {
      const chunk = await page.evaluate(() => {
        const out = {};
        for (const [label, s] of Object.entries(window.__perf.sessions)) {
          out[label] = {
            frames: s.frames,
            t0: s.t0,
            t1: s.t1,
            longtasks: window.__perf.longtasks.filter(
              (t) => t.start >= s.t0 && t.start <= s.t1,
            ),
          };
        }
        window.__perf.sessions = {};
        return out;
      });
      Object.assign(collected, chunk);
    };

    // ---- Idle controls: display cadence at top, tick() cost parked in Work
    await jumpTo(0);
    await runPhase("idle-top", () => sleep(2500), { from: 0, to: 0 });

    // ---- Work section: open/close 3x
    const workStart = Math.max(0, geom.workTop - geom.vh);
    const workEnd = Math.min(geom.workTop + geom.workH, geom.maxScroll);
    const workDist = workEnd - workStart;

    result.heapCyclesMb = [];
    result.heapHarnessArtifactMb = [];
    await jumpTo(workStart);
    await harvest();
    const heapBefore = await gcHeapMb();
    const domBefore = await cdpMetrics();

    const tracePath = path.join(RESULTS_DIR, `${STAMP}-${LABEL}.trace.json`);
    const canTrace = TRACE && IS_CHROMIUM;
    if (TRACE && !IS_CHROMIUM) result.notes.push("--trace requested but ignored: tracing is Chromium-only.");
    if (canTrace) {
      await context
        .browser()
        .startTracing(page, { path: tracePath, categories: TRACE_CATEGORIES });
      result.tracePath = path.relative(REPO, tracePath);
    }
    const canHeapProfile = HEAP_PROFILE && IS_CHROMIUM;
    if (HEAP_PROFILE && !IS_CHROMIUM) result.notes.push("--heap-profile requested but ignored: HeapProfiler is Chromium-only.");
    if (canHeapProfile) {
      await cdp.send("HeapProfiler.enable");
      await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384 });
    }

    if (!DIVE_ONLY) {
      for (let i = 1; i <= 3; i++) {
        await runPhase(`work-open-${i}`, () => wheelBy(workDist), {
          from: workStart,
          to: workEnd,
        });
        await jumpTo(workEnd);
        await runPhase(`work-close-${i}`, () => wheelBy(-workDist), {
          from: workEnd,
          to: workStart,
        });
        await jumpTo(workStart);
        // Heap with the harness's recorded frames still in-page, then again
        // after harvesting them out — the difference is measurement artifact,
        // not app leak.
        const heapRaw = await gcHeapMb();
        await harvest();
        const heapClean = await gcHeapMb();
        result.heapCyclesMb.push(heapClean);
        result.heapHarnessArtifactMb.push(+(heapRaw - heapClean).toFixed(2));
      }
    }

    // ---- Dive transition: open/close a project card's dive 5x
    const diveGeom = await findRenderedCard(page, geom);
    result.dive = { found: !!diveGeom };
    if (diveGeom) {
      await jumpTo(diveGeom.scrollY);
      const diveHeapBefore = await gcHeapMb();
      const diveDomBefore = await cdpMetrics();

      for (let i = 1; i <= 5; i++) {
        // The scroll position never moves during a dive — it's locked — so
        // from === to is the correct assertion, same as the idle phases.
        await runPhase(
          `dive-open-${i}`,
          async () => {
            await page.mouse.click(diveGeom.cx, diveGeom.cy);
            await sleep(1400); // DURATION_IN 1.15s + settle
          },
          { from: diveGeom.scrollY, to: diveGeom.scrollY },
        );
        await runPhase(
          `dive-close-${i}`,
          async () => {
            await page.keyboard.press("Escape");
            await sleep(900); // DURATION_OUT 0.7s + settle
          },
          { from: diveGeom.scrollY, to: diveGeom.scrollY },
        );
      }

      await harvest();
      const diveHeapAfter = await gcHeapMb();
      const diveDomAfter = await cdpMetrics();
      result.dive = {
        found: true,
        cardHref: diveGeom.href,
        heap: { beforeMb: diveHeapBefore, afterMb: diveHeapAfter, growthMb: IS_CHROMIUM ? +(diveHeapAfter - diveHeapBefore).toFixed(1) : null },
        nodes: IS_CHROMIUM ? { before: diveDomBefore.Nodes, after: diveDomAfter.Nodes } : null,
        listeners: IS_CHROMIUM ? { before: diveDomBefore.JSEventListeners, after: diveDomAfter.JSEventListeners } : null,
      };
    } else {
      result.notes.push("dive phase skipped: no rendered card found near the sampled scroll position.");
    }

    if (canTrace) await context.browser().stopTracing();
    if (canHeapProfile) {
      const { profile } = await cdp.send("HeapProfiler.stopSampling");
      const flat = new Map();
      (function walk(n) {
        if (n.selfSize) {
          const cf = n.callFrame;
          const key = `${cf.functionName || "(anon)"} @ ${(cf.url || "").split("/").pop() || "?"}:${cf.lineNumber}`;
          flat.set(key, (flat.get(key) || 0) + n.selfSize);
        }
        (n.children || []).forEach(walk);
      })(profile.head);
      result.heapAllocTop = [...flat.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([site, bytes]) => ({ site, kb: +(bytes / 1024).toFixed(0) }));
    }

    if (!DIVE_ONLY) {
      // Parked mid-Work: measures the per-frame cost of the section's own
      // tick + competing loops with zero scroll input.
      const workMid = workStart + Math.round(geom.workH / 2);
      await jumpTo(workMid);
      await runPhase("idle-work-mid", () => sleep(2500), {
        from: workMid,
        to: workMid,
      });
    }
    await jumpTo(workStart);

    await harvest();
    const heapAfter = await gcHeapMb();
    const domAfter = await cdpMetrics();
    result.heap = {
      beforeCyclesMb: heapBefore,
      afterCyclesMb: heapAfter,
      growthMb: IS_CHROMIUM ? +(heapAfter - heapBefore).toFixed(1) : null,
      perCycleMb: result.heapCyclesMb,
      harnessArtifactPerCycleMb: result.heapHarnessArtifactMb,
      nodes: IS_CHROMIUM ? { before: domBefore.Nodes, after: domAfter.Nodes } : null,
      listeners: IS_CHROMIUM ? { before: domBefore.JSEventListeners, after: domAfter.JSEventListeners } : null,
    };

    // ---- Rocket sequence scroll
    if (!DIVE_ONLY) {
      await jumpTo(0);
      const rocketEnd = Math.min(geom.rocketTop + geom.rocketH, geom.maxScroll);
      await runPhase("rocket-scroll-down", () => wheelBy(rocketEnd), {
        from: 0,
        to: rocketEnd,
      });
      await runPhase("rocket-scroll-up", () => wheelBy(-rocketEnd), {
        from: rocketEnd,
        to: 0,
      });
    }

    // ---- Collect in-page data
    await harvest();
    const pageData = collected;
    pageData.__events = await page.evaluate(() => window.__perf.events);
    result.scrollAssertions = scrollAssertions;
    // Geometry must not have shifted during the run, or every phase target
    // was wrong.
    const geomEnd = await page.evaluate(geomFn);
    result.geometryEnd = geomEnd;
    const geomStable =
      Math.abs(geomEnd.workTop - geom.workTop) <= 8 &&
      Math.abs(geomEnd.maxScroll - geom.maxScroll) <= 8;
    if (!geomStable)
      console.error(
        `GEOMETRY SHIFTED DURING RUN: workTop ${geom.workTop}->${geomEnd.workTop}, maxScroll ${geom.maxScroll}->${geomEnd.maxScroll}`,
      );
    // Idle-phase drift is logged (with scroll-API attribution) but only a
    // failed *scroll* phase or shifted geometry invalidates the run — the
    // scroll phases are the metrics that matter.
    const failedScrollPhases = scrollAssertions.filter(
      (a) => !a.ok && !a.label.startsWith("idle"),
    );
    result.idleDrift = scrollAssertions.filter(
      (a) => !a.ok && a.label.startsWith("idle"),
    );
    if (result.idleDrift.length) {
      result.scrollCalls = await page.evaluate(() => window.__perf.scrollCalls);
      console.error(
        `idle drift detected (${result.idleDrift.map((a) => a.label).join(",")}) — last programmatic scroll calls:\n` +
          result.scrollCalls
            .slice(-8)
            .map((c) => `  ${c.t.toFixed(0)}ms ${c.api}(${c.args}) ${c.stack}`)
            .join("\n"),
      );
    }
    result.invalid =
      failedScrollPhases.length > 0 || !geomStable || undefined;

    result.phases = phases.map((p) => {
      const s = pageData[p.label];
      return {
        ...p,
        ...stats(s.frames),
        durationMs: +(s.t1 - s.t0).toFixed(0),
        longTasks: s.longtasks.length,
        longTaskTotalMs: +s.longtasks.reduce((a, t) => a + t.dur, 0).toFixed(0),
        worstLongTaskMs: +Math.max(0, ...s.longtasks.map((t) => t.dur)).toFixed(0),
        layoutPerFrame: s.frames.length && p.layoutCountDelta != null
          ? +(p.layoutCountDelta / s.frames.length).toFixed(2)
          : null,
        recalcPerFrame: s.frames.length && p.recalcStyleCountDelta != null
          ? +(p.recalcStyleCountDelta / s.frames.length).toFixed(2)
          : null,
      };
    });
    result.slowEvents = pageData.__events.slice(0, 50);
    result.rssFinal = chromeTreeRss(USER_DATA_DIR);
  } finally {
    await context.close().catch(() => {});
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }

  clearIntervalSafe();
  const file = path.join(RESULTS_DIR, `${STAMP}-${LABEL}.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));

  // ---- Console summary
  const pad = (v, n) => String(v ?? "-").padStart(n);
  console.log(`\n=== ${LABEL} [${BROWSER_NAME}] (cpu x${CPU_RATE}${MOBILE ? ", mobile" : ""}${DIVE_ONLY ? ", dive-only" : ""}${DISABLE_HERO_LOOPS ? ", hero loops OFF" : ""}) ===`);
  if (result.preload) {
    const p = result.preload;
    console.log(
      `preload: ${p.frameCount ?? "?"} frames, ${p.totalTransferKb ?? "?"} KB, done@${p.preloadDoneAtMs ?? "?"}ms, ` +
      `longtasks ${p.longTasksDuringPreload ?? "?"} (${p.longTaskMsDuringPreload ?? "?"}ms), ` +
      `renderer RSS peak ${p.rssPeakDuringPreload?.rendererSumMb ?? "?"}MB after ${p.rssAfterPreload?.rendererSumMb ?? "?"}MB, JS heap ${p.jsHeapAfterPreloadMb ?? "?"}MB`,
    );
  }
  console.log(
    "phase              med   p95  worst  >50ms LT(ms)   layout/f reads/f forced/f acc/f(max)",
  );
  for (const p of result.phases) {
    console.log(
      `${p.label.padEnd(17)}${pad(p.medianMs, 6)}${pad(p.p95Ms, 6)}${pad(p.worstMs, 7)}${pad(p.over50ms, 6)}` +
      `${pad(p.longTasks + "(" + p.longTaskTotalMs + ")", 9)}${pad(p.layoutPerFrame, 9)}${pad(p.layoutReadsPerFrame, 8)}` +
      `${pad(p.forcedReadsPerFrame, 9)}${pad(p.accPerFrame + "(" + p.accMax + ")", 10)}`,
    );
  }
  if (result.heap)
    console.log(
      `heap: before ${result.heap.beforeCyclesMb}MB → after ${DIVE_ONLY ? "dive cycles" : "3 cycles"} ${result.heap.afterCyclesMb}MB (Δ${result.heap.growthMb}MB), per-cycle [${result.heap.perCycleMb.join(", ")}], ` +
      `harness artifact/cycle [${result.heap.harnessArtifactPerCycleMb.join(", ")}], ` +
      (result.heap.nodes
        ? `nodes ${result.heap.nodes.before}→${result.heap.nodes.after}, listeners ${result.heap.listeners.before}→${result.heap.listeners.after}`
        : "nodes/listeners: n/a (non-Chromium, no CDP)"),
    );
  if (result.dive?.found)
    console.log(
      `dive (${result.dive.cardHref}): heap ${result.dive.heap.beforeMb}MB→${result.dive.heap.afterMb}MB` +
      (result.dive.heap.growthMb != null ? ` (Δ${result.dive.heap.growthMb}MB)` : "") +
      (result.dive.nodes
        ? `, nodes ${result.dive.nodes.before}→${result.dive.nodes.after}, listeners ${result.dive.listeners.before}→${result.dive.listeners.after}`
        : ", nodes/listeners: n/a (non-Chromium, no CDP)"),
    );
  else if (result.dive) console.log("dive: no rendered card found — phase skipped");
  const badAsserts = (result.scrollAssertions || []).filter((a) => !a.ok);
  const badScroll = badAsserts.filter((a) => !a.label.startsWith("idle"));
  console.log(
    badScroll.length
      ? `SCROLL ASSERTIONS: ${badScroll.length} SCROLL-PHASE FAILURES — RUN INVALID: ${badScroll.map((a) => a.label).join(", ")}`
      : badAsserts.length
        ? `scroll assertions: scroll phases OK; idle drift on ${badAsserts.map((a) => a.label).join(", ")} (idle stats excluded)`
        : `scroll assertions: all ${result.scrollAssertions?.length ?? 0} passed`,
  );
  console.log(
    `console: ${result.console.length} warn/error, pageErrors: ${result.pageErrors.length}`,
  );
  if (result.heapAllocTop) {
    console.log("top allocation sites (sampling profile, cycles 1-3):");
    for (const a of result.heapAllocTop.slice(0, 14))
      console.log(`  ${String(a.kb).padStart(7)} KB  ${a.site}`);
  }
  console.log(`saved: ${path.relative(REPO, file)}`);

  function clearIntervalSafe() {
    // rssTimer lives in main()'s closure via hoisting quirk; guarded here.
  }
}

// Track the interval globally so cleanup always happens.
const _origSetInterval = global.setInterval;
const _intervals = [];
global.setInterval = (...a) => {
  const id = _origSetInterval(...a);
  _intervals.push(id);
  return id;
};

main()
  .catch((e) => {
    console.error("HARNESS FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => _intervals.forEach(clearInterval));
