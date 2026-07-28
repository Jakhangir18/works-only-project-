/**
 * perf/regression.mjs — Phase 5 functional regression sweep.
 *
 * Usage: node perf/regression.mjs [--url=http://localhost:4322] [--shots-vs=http://localhost:4323]
 *
 * Checks (PASS/FAIL each):
 *  1. every route loads with no console errors/warnings or page errors
 *  2. work section: open → close → open works; state advances both ways
 *  3. rapid repeated triggering doesn't error or stack listeners
 *  4. resize doesn't corrupt state (listeners/nodes stable, geometry rebuilt)
 *  5. keyboard focus reaches nav + work card links
 *  6. prefers-reduced-motion: rocket container stays static
 *  7. first-load: LCP, long tasks in first 8s (TBT proxy), JS bytes
 *  8. optional: mid-tunnel screenshots of this build and --shots-vs build
 *  9. dive opens/closes from hero, feature and standard cards; cover/poster
 *     state and source box size survive the hand-off
 */

import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const URL_MAIN = (args.url || "http://localhost:4322").replace(/\/$/, "");
const URL_BASE = args["shots-vs"] ? String(args["shots-vs"]).replace(/\/$/, "") : null;
const SCRATCH =
  "/private/tmp/claude-501/-Users-jakhangirtynshimov-Desktop-works-only-project/a2863b26-e141-4060-8105-1b2517e63dba/scratchpad";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  "/",
  "/work/gochain/",
  "/work/private-clinic/",
  "/work/ams-device/",
  "/work/engineering-rocket/",
  "/work/portfolio-rocket/",
  "/projects/ams/",
];

async function newPage(context) {
  const page = await context.newPage();
  page.errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      page.errors.push(`console.${m.type()}: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => page.errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  return page;
}

const waitReady = (page) =>
  page.waitForFunction(
    () =>
      !document.querySelector(".js-site-loader") &&
      document.documentElement.classList.contains("is-works-ready") &&
      !document.documentElement.classList.contains("is-scroll-blocked"),
    { timeout: 60000, polling: 250 },
  );

async function main() {
  const context = await chromium.launchPersistentContext(
    path.join("/tmp", `perf-regression-${process.pid}`),
    {
      channel: "chrome",
      headless: false,
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        "--js-flags=--expose-gc",
      ],
    },
  );

  try {
    // ---- 1. routes
    for (const route of ROUTES) {
      const page = await newPage(context);
      const resp = await page.goto(URL_MAIN + route, { waitUntil: "load", timeout: 30000 });
      await sleep(1200);
      check(
        `route ${route}`,
        resp.ok() && page.errors.length === 0,
        page.errors.slice(0, 2).join(" | ") || `status ${resp.status()}`,
      );
      await page.close();
    }

    // ---- main page for interaction checks
    const page = await newPage(context);
    await page.goto(URL_MAIN + "/", { waitUntil: "load" });
    await waitReady(page);
    await sleep(2500);

    const geom = await page.evaluate(() => {
      const w = document.querySelector(".s-work");
      const r = w.getBoundingClientRect();
      return {
        workTop: Math.round(r.top + window.scrollY),
        workH: r.height,
        vh: window.innerHeight,
      };
    });

    const stateAt = () =>
      page.evaluate(() => {
        const ghost = document.querySelector(".s__scene__letter.js-letter");
        const cards = [...document.querySelectorAll("a-work")];
        return {
          ghostTransform: ghost ? getComputedStyle(ghost).transform : null,
          inViewCards: cards.filter((c) => c.classList.contains("is-inview")).length,
          ghosts: document.querySelectorAll(".s__scene .js-letter").length,
          shadows: document.querySelectorAll(".s__scene__letter__shadow").length,
        };
      });

    // ---- 2. open → close → open
    const jump = async (y) => {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
      await sleep(1800);
    };
    await jump(geom.workTop + geom.workH * 0.35);
    const open1 = await stateAt();
    await jump(Math.max(0, geom.workTop - geom.vh));
    const closed = await stateAt();
    await jump(geom.workTop + geom.workH * 0.35);
    const open2 = await stateAt();
    check(
      "work open→close→open",
      open1.ghostTransform !== "none" &&
        open1.inViewCards > 0 &&
        closed.inViewCards === 0 &&
        open2.inViewCards > 0 &&
        open1.ghosts > 0 &&
        open1.shadows === open1.ghosts,
      `ghosts ${open1.ghosts}, shadows ${open1.shadows}, cards in-view open/closed/open: ${open1.inViewCards}/${closed.inViewCards}/${open2.inViewCards}`,
    );

    // ---- 3. rapid jiggle
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    // GC before metric reads — otherwise uncollected garbage from the
    // rebuild masquerades as leaked listeners/nodes.
    const metrics = async () => {
      await page.evaluate(() => {
        if (window.gc) {
          window.gc();
          window.gc();
        }
      });
      return Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
      );
    };
    const m0 = await metrics();
    await page.mouse.move(30, 450);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, i % 2 ? -3000 : 3000);
      await sleep(90);
    }
    await sleep(2000);
    const m1 = await metrics();
    check(
      "rapid jiggle: no errors, listeners stable",
      page.errors.length === 0 &&
        m1.JSEventListeners - m0.JSEventListeners <= 2,
      `listeners ${m0.JSEventListeners}→${m1.JSEventListeners}, errors ${page.errors.length}`,
    );

    // ---- 4. resize
    await page.setViewportSize({ width: 1000, height: 700 });
    await sleep(1500);
    const afterShrink = await page.evaluate(() => ({
      height: document.querySelector(".s-work").style.getPropertyValue("--height"),
      vh: window.innerHeight,
    }));
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(1500);
    const afterRestore = await page.evaluate(() => ({
      height: document.querySelector(".s-work").style.getPropertyValue("--height"),
    }));
    const m2 = await metrics();
    const workCount = await page.locator("a-work").count();
    const expectedShrinkHeight = `${
      ((100 + 140 + workCount * 80 + 60) * 700) / 100
    }px`;
    const expectedRestoreHeight = `${
      ((100 + 140 + workCount * 80 + 60) * 900) / 100
    }px`;
    check(
      "resize rebuilds geometry, no leak",
      afterShrink.height === expectedShrinkHeight &&
        afterRestore.height === expectedRestoreHeight &&
        page.errors.length === 0 &&
        m2.JSEventListeners - m1.JSEventListeners <= 4,
      `--height ${afterShrink.height} → ${afterRestore.height}, listeners ${m1.JSEventListeners}→${m2.JSEventListeners}`,
    );

    // ---- 5. keyboard focus. Nav from the top; cards only where they are
    // rendered — content-visibility:hidden cards are intentionally
    // unfocusable off-screen.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await sleep(600);
    let reachedNav = false;
    for (let i = 0; i < 15 && !reachedNav; i++) {
      await page.keyboard.press("Tab");
      reachedNav = await page.evaluate(
        () => !!document.activeElement?.closest?.(".navigation, .nav-overlay"),
      );
    }
    await jump(geom.workTop + geom.workH * 0.35);
    const cardFocusable = await page.evaluate(() => {
      const card = document.querySelector("a-work.is-inview a");
      if (!card) return false;
      card.focus();
      return document.activeElement === card;
    });
    check(
      "keyboard focus reaches nav; in-view cards focusable",
      reachedNav && cardFocusable,
      `nav ${reachedNav}, in-view card focusable ${cardFocusable}`,
    );

    // ---- 9. Dive from every physical size. This checks the FLIP hand-off,
    // not its frame rate: camera dimensions must equal the source layout box,
    // and poster cards must bypass the image decode path without becoming an
    // empty target.
    const verifyTierDive = async (tier) => {
      const target = await page.evaluate((tier) => {
        const works = [...document.querySelectorAll("a-work")];
        const work = works.find((item) =>
          item.classList.contains(`a-work--${tier}`),
        );
        const section = document.querySelector(".s-work");
        if (!(work instanceof HTMLElement) || !(section instanceof HTMLElement)) {
          return null;
        }

        const index = works.indexOf(work);
        const sectionTop =
          section.getBoundingClientRect().top + window.scrollY;
        const pinDistance = section.offsetHeight - window.innerHeight;
        const totalVh = 140 + works.length * 80 + 60;
        const centreVh = 140 + (index + 0.5) * 80;
        window.scrollTo({
          top: sectionTop + (centreVh / totalVh) * pinDistance,
          behavior: "instant",
        });
        return { index };
      }, tier);

      if (!target) return { ok: false, detail: "target missing" };
      await sleep(1800);

      const source = await page.evaluate((tier) => {
        const work = document.querySelector(`a-work.a-work--${tier}`);
        const card = work?.querySelector(".a__card");
        const link = work?.querySelector("a");
        if (
          !(work instanceof HTMLElement) ||
          !(card instanceof HTMLElement) ||
          !(link instanceof HTMLAnchorElement)
        ) {
          return null;
        }
        const result = {
          width: card.offsetWidth,
          height: card.offsetHeight,
          coverState: work.dataset.coverState || "poster",
          motif: work.dataset.posterMotif || "",
        };
        link.click();
        return result;
      }, tier);

      if (!source) return { ok: false, detail: "source missing" };
      await page.waitForSelector(".dive.is-open", { timeout: 2000 });

      const handoff = await page.evaluate(() => {
        const camera = document.querySelector(".dive__camera");
        const poster = document.querySelector(".dive__poster");
        const cover = document.querySelector(".dive__cover");
        if (
          !(camera instanceof HTMLElement) ||
          !(poster instanceof HTMLElement) ||
          !(cover instanceof HTMLImageElement)
        ) {
          return null;
        }
        return {
          width: Number.parseFloat(camera.style.width),
          height: Number.parseFloat(camera.style.height),
          posterClass: poster.className,
          posterDisplay: poster.style.display,
          coverDisplay: cover.style.display,
        };
      });

      await sleep(1400);
      const opened = await page.evaluate(
        () => document.querySelector(".dive")?.classList.contains("is-open"),
      );
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector(".dive")?.classList.contains("is-open"),
        { timeout: 2000 },
      );

      const boxMatches =
        handoff?.width === source.width && handoff?.height === source.height;
      const visualMatches =
        source.coverState === "ready"
          ? handoff?.posterDisplay === "none" &&
            handoff?.coverDisplay !== "none"
          : handoff?.posterClass.includes(source.motif) &&
            handoff?.posterDisplay !== "none" &&
            handoff?.coverDisplay === "none";

      return {
        ok:
          Boolean(opened) &&
          boxMatches &&
          visualMatches &&
          page.errors.length === 0,
        detail:
          `${source.width}x${source.height} → ${handoff?.width}x${handoff?.height}, ` +
          `${source.coverState}, errors ${page.errors.length}`,
      };
    };

    for (const tier of ["hero", "feature", "standard"]) {
      const outcome = await verifyTierDive(tier);
      check(`dive ${tier} card`, outcome.ok, outcome.detail);
    }

    // ---- screenshots (this build)
    await jump(geom.workTop + geom.workH * 0.3);
    await page.screenshot({ path: path.join(SCRATCH, "current-tunnel.png") });
    await jump(geom.workTop + geom.workH * 0.6);
    await page.screenshot({ path: path.join(SCRATCH, "current-cards.png") });

    // ---- 7. first-load numbers (fresh page)
    const p2 = await newPage(context);
    await p2.addInitScript(() => {
      window.__lt = [];
      window.__lcp = null;
      new PerformanceObserver((l) =>
        l.getEntries().forEach((e) => window.__lt.push(e.duration)),
      ).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((l) => {
        const e = l.getEntries().pop();
        if (e) window.__lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    await p2.goto(URL_MAIN + "/", { waitUntil: "load" });
    await sleep(8000);
    const firstLoad = await p2.evaluate(() => ({
      lcpMs: window.__lcp ? Math.round(window.__lcp) : null,
      longTasks: window.__lt.length,
      tbtProxyMs: Math.round(window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0)),
    }));
    const jsBytes = execSync(
      `find dist/_astro -name '*.js' -exec stat -f %z {} + | awk '{s+=$1} END {print s}'`,
    )
      .toString()
      .trim();
    console.log(
      `first-load: LCP ${firstLoad.lcpMs}ms, long tasks in 8s: ${firstLoad.longTasks} (TBT proxy ${firstLoad.tbtProxyMs}ms), dist JS ${(+jsBytes / 1024).toFixed(0)}KB`,
    );
    await p2.close();
    await page.close();

    // ---- 6. reduced motion (fresh context option needed)
    const rmPage = await newPage(context);
    await rmPage.emulateMedia({ reducedMotion: "reduce" });
    await rmPage.goto(URL_MAIN + "/", { waitUntil: "load" });
    await waitReady(rmPage);
    await sleep(1000);
    await rmPage.evaluate(() => window.scrollTo({ top: 1800, behavior: "instant" }));
    await sleep(1200);
    const rocketTransform = await rmPage.evaluate(
      () => document.querySelector(".js-rocket-container")?.style.transform || "",
    );
    check(
      "prefers-reduced-motion keeps rocket static",
      /translate3d\(0px?, 0px?, 0px?\) rotateZ\(0deg\)/.test(rocketTransform) ||
        rocketTransform === "",
      `transform: "${rocketTransform}"`,
    );
    await rmPage.close();

    // ---- 8. baseline screenshots for visual parity
    if (URL_BASE) {
      const bp = await newPage(context);
      await bp.goto(URL_BASE + "/", { waitUntil: "load" });
      await waitReady(bp).catch(() => {});
      await sleep(2500);
      const bgeom = await bp.evaluate(() => {
        const w = document.querySelector(".s-work");
        const r = w.getBoundingClientRect();
        return { workTop: Math.round(r.top + window.scrollY), workH: r.height };
      });
      await bp.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        bgeom.workTop + bgeom.workH * 0.3,
      );
      await sleep(1800);
      await bp.screenshot({ path: path.join(SCRATCH, "baseline-tunnel.png") });
      await bp.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        bgeom.workTop + bgeom.workH * 0.6,
      );
      await sleep(1800);
      await bp.screenshot({ path: path.join(SCRATCH, "baseline-cards.png") });
      console.log("screenshots saved to scratchpad: current-*.png, baseline-*.png");
      await bp.close();
    }
  } finally {
    await context.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? "ALL CHECKS PASSED" : failed.length + " CHECKS FAILED"} (${results.length} total)`,
  );
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((e) => {
  console.error("REGRESSION SCRIPT FAILED:", e);
  process.exitCode = 1;
});
