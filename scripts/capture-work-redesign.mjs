import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = "http://localhost:4322";
const OUTPUT_DIR = path.resolve("docs/work-redesign-visuals");
const INTRO_VH = 140;
const END_HOLD_VH = 60;

const configurations = [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    workStepVh: 80,
  },
  {
    name: "mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    workStepVh: 72,
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await fs.mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});

const report = [];
const flipChecks = [];

try {
  for (const configuration of configurations) {
    const context = await browser.newContext({
      viewport: configuration.viewport,
      deviceScaleFactor: configuration.deviceScaleFactor,
    });
    const page = await context.newPage();
    const messages = [];

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        messages.push(`console.${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      messages.push(`pageerror: ${String(error)}`);
    });

    await page.goto(BASE_URL, { waitUntil: "load", timeout: 60_000 });
    await page.waitForFunction(
      () =>
        !document.querySelector(".js-site-loader") &&
        document.documentElement.classList.contains("is-works-ready") &&
        !document.documentElement.classList.contains("is-scroll-blocked"),
      { timeout: 60_000, polling: 250 },
    );

    const workCount = await page.locator("a-work").count();
    const workTravelEnd =
      INTRO_VH + workCount * configuration.workStepVh;
    const pinDistanceVh = workTravelEnd + END_HOLD_VH;

    const states = [
      {
        name: "first-card",
        time: INTRO_VH + configuration.workStepVh * 0.28,
      },
      {
        name: "hero-card",
        time: INTRO_VH + configuration.workStepVh * 0.5,
      },
      {
        name: "poster-card",
        time: INTRO_VH + configuration.workStepVh * 1.5,
      },
      {
        name: "last-card-hold",
        time: workTravelEnd + END_HOLD_VH * 0.5,
      },
      {
        name: "pin-release",
        time: pinDistanceVh,
        afterReleasePx: 8,
      },
    ];

    for (const state of states) {
      const position = await page.evaluate(
        ({ time, total, afterReleasePx }) => {
          const section = document.querySelector(".s-work");
          if (!(section instanceof HTMLElement)) {
            throw new Error("Work section not found");
          }
          const top = section.getBoundingClientRect().top + window.scrollY;
          const pinDistance = section.offsetHeight - window.innerHeight;
          const y =
            top +
            (time / total) * pinDistance +
            (afterReleasePx || 0);
          window.scrollTo(0, y);
          return { top, pinDistance, y };
        },
        {
          time: state.time,
          total: pinDistanceVh,
          afterReleasePx: state.afterReleasePx,
        },
      );

      // ScrollTrigger has scrub: 1; wait for the visual state to settle before
      // capturing. This is a visual probe, not a frame-time measurement.
      await wait(1_400);

      const snapshot = await page.evaluate(() => {
        const viewportCenter = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        const cards = [...document.querySelectorAll("a-work")].map((work) => {
          const card = work.querySelector(".a__card");
          const rect = card?.getBoundingClientRect();
          if (!(work instanceof HTMLElement) || !rect) return null;
          return {
            index: work.dataset.workIndex,
            classes: work.className,
            progress: work.getAttribute("progress"),
            coverState: work.dataset.coverState || "poster",
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              centerX: rect.left + rect.width / 2,
              centerY: rect.top + rect.height / 2,
            },
            distance: Math.hypot(
              rect.left + rect.width / 2 - viewportCenter.x,
              rect.top + rect.height / 2 - viewportCenter.y,
            ),
          };
        }).filter(Boolean);
        const nearest = cards.sort((a, b) => a.distance - b.distance)[0];
        const sectionRect = document
          .querySelector(".s-work")
          ?.getBoundingClientRect();
        const container = document.querySelector(
          ".s-work .js-container",
        );
        const containerStyle =
          container instanceof HTMLElement
            ? getComputedStyle(container)
            : null;
        const contactRect = document
          .querySelector(".contact-section")
          ?.getBoundingClientRect();

        return {
          scrollY: window.scrollY,
          nearest,
          section: sectionRect
            ? { top: sectionRect.top, bottom: sectionRect.bottom }
            : null,
          containerPosition: containerStyle?.position || null,
          contactTop: contactRect?.top ?? null,
          numbering: [...document.querySelectorAll("a-work")]
            .map((work) =>
              work.querySelector(".a__card__index")?.textContent?.trim(),
            ),
        };
      });

      const fileName = `${configuration.name}-${state.name}.png`;
      await page.screenshot({
        path: path.join(OUTPUT_DIR, fileName),
        scale: "device",
      });

      report.push({
        configuration: configuration.name,
        state: state.name,
        viewport: configuration.viewport,
        deviceScaleFactor: configuration.deviceScaleFactor,
        position,
        snapshot,
      });
    }

    const tierChecks = [
      { tier: "hero", workIndex: 0 },
      { tier: "feature", workIndex: 1 },
      { tier: "standard", workIndex: 2 },
    ];

    for (const check of tierChecks) {
      const time =
        INTRO_VH + (check.workIndex + 0.5) * configuration.workStepVh;
      await page.evaluate(
        ({ time, total }) => {
          const section = document.querySelector(".s-work");
          if (!(section instanceof HTMLElement)) {
            throw new Error("Work section not found");
          }
          const top = section.getBoundingClientRect().top + window.scrollY;
          const pinDistance = section.offsetHeight - window.innerHeight;
          window.scrollTo(0, top + (time / total) * pinDistance);
        },
        { time, total: pinDistanceVh },
      );
      await wait(1_400);

      const source = await page.evaluate((tier) => {
        const work = document.querySelector(`a-work.a-work--${tier}`);
        const card = work?.querySelector(".a__card");
        const link = work?.querySelector("a");
        if (
          !(work instanceof HTMLElement) ||
          !(card instanceof HTMLElement) ||
          !(link instanceof HTMLAnchorElement)
        ) {
          throw new Error(`Visible ${tier} card not found`);
        }
        const rect = card.getBoundingClientRect();
        link.click();
        return {
          tier,
          boxWidth: card.offsetWidth,
          boxHeight: card.offsetHeight,
          rectWidth: rect.width,
          rectHeight: rect.height,
          posterMotif: work.dataset.posterMotif,
          coverState: work.dataset.coverState || "poster",
        };
      }, check.tier);

      await page.waitForSelector(".dive.is-open", { timeout: 2_000 });
      const overlay = await page.evaluate(() => {
        const camera = document.querySelector(".dive__camera");
        const poster = document.querySelector(".dive__poster");
        const cover = document.querySelector(".dive__cover");
        if (
          !(camera instanceof HTMLElement) ||
          !(poster instanceof HTMLElement) ||
          !(cover instanceof HTMLImageElement)
        ) {
          throw new Error("Dive rig not found");
        }
        return {
          cameraWidth: Number.parseFloat(camera.style.width),
          cameraHeight: Number.parseFloat(camera.style.height),
          posterClass: poster.className,
          posterDisplay: poster.style.display,
          coverDisplay: cover.style.display,
        };
      });

      assert.equal(overlay.cameraWidth, source.boxWidth);
      assert.equal(overlay.cameraHeight, source.boxHeight);
      if (source.coverState === "ready") {
        assert.equal(overlay.posterDisplay, "none");
        assert.notEqual(overlay.coverDisplay, "none");
      } else {
        assert.match(overlay.posterClass, new RegExp(source.posterMotif));
        assert.notEqual(overlay.posterDisplay, "none");
        assert.equal(overlay.coverDisplay, "none");
      }

      flipChecks.push({
        configuration: configuration.name,
        ...source,
        ...overlay,
      });

      await wait(1_250);
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector(".dive")?.classList.contains("is-open"),
        { timeout: 2_000 },
      );
    }

    if (messages.length) {
      throw new Error(
        `${configuration.name} emitted browser errors:\n${messages.join("\n")}`,
      );
    }

    await context.close();
  }
} finally {
  await browser.close();
}

for (const configuration of configurations) {
  const snapshots = report.filter(
    (item) => item.configuration === configuration.name,
  );
  const byState = Object.fromEntries(
    snapshots.map((item) => [item.state, item.snapshot]),
  );
  const expectedWidths =
    configuration.name === "desktop"
      ? { hero: 440, feature: 390, standard: 340 }
      : { hero: 272, feature: 240, standard: 208 };

  assert.deepEqual(byState["hero-card"].numbering, [
    "01",
    "02",
    "03",
    "04",
    "05",
  ]);
  assert.ok(
    Math.abs(byState["hero-card"].nearest.rect.width - expectedWidths.hero) <
      1,
  );
  assert.ok(
    Math.abs(
      byState["poster-card"].nearest.rect.width - expectedWidths.feature,
    ) < 1,
  );
  assert.ok(
    Math.abs(
      byState["last-card-hold"].nearest.rect.width -
        expectedWidths.standard,
    ) < 1,
  );
  assert.ok(
    Math.abs(
      byState["last-card-hold"].nearest.rect.centerX -
        configuration.viewport.width / 2,
    ) <=
      configuration.viewport.width * 0.05,
  );
  assert.ok(
    Math.abs(
      byState["last-card-hold"].nearest.rect.centerY -
        configuration.viewport.height / 2,
    ) <=
      configuration.viewport.height * 0.05,
  );
  assert.equal(byState["last-card-hold"].containerPosition, "fixed");
  assert.equal(byState["pin-release"].containerPosition, "relative");
  assert.ok(
    byState["pin-release"].contactTop <= configuration.viewport.height,
  );
}

await fs.writeFile(
  path.join(OUTPUT_DIR, "verification.json"),
  `${JSON.stringify({ screenshots: report, flipChecks }, null, 2)}\n`,
);

console.log(
  JSON.stringify(
    {
      screenshots: report.length,
      flipChecks,
      result: "PASS",
    },
    null,
    2,
  ),
);
