// Phone-sized screenshots of the project pages, for the cards that turn behind
// the figure in the hero.
//
// The reference floats app-store screens around its character. Ours are the
// project pages themselves, shot at 390x844 — which means they are always what
// the site actually looks like today rather than a mockup that drifts from it.
// Re-run this after changing a project page.
//
// The phone's bezel is drawn in CSS, not baked into the image, so the frame
// costs no bytes and follows the theme.
//
// Usage: node scripts/shots.mjs            (needs a preview on SITE, default :4347)
//        SITE=http://127.0.0.1:4322 node scripts/shots.mjs
//        node scripts/shots.mjs --blur-only (re-derive the blurred twins only)
//
// Each shot also gets a blurred twin, <slug>-blur.webp. The hero fades it in
// over the sharp one as a card turns toward the edge of the screen, which is
// the depth-of-field look without a backdrop-filter re-blurring the moving
// wheel every frame. Small and soft by design: a blur has no detail to lose
// when the browser scales it up.

import sharp from "sharp";
import { mkdir, readdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const BASE = process.env.SITE || "http://127.0.0.1:4347";
const OUT = resolve("public/shots");
const WIDTH = 390;
const HEIGHT = 844;
/* Shot at 2x and written at 1x so the result is sharp on a phone without
   carrying a 2x file: the card is at most ~156 px wide on screen. */
const SCALE = 2;
const CARD_WIDTH = 420;
const QUALITY = 72;
/* Seven cards at a few tens of kilobytes each. Anything near this means a page
   started rendering something enormous. */
const BUDGET = 900 * 1024;
const BLUR_WIDTH = 140;
const BLUR_SIGMA = 2.6;

/* The twin is drawn over the sharp shot and has to cover it completely at the
   edge, so it is opaque: the hero's CSS treatment of the shot (grayscale 0.9,
   brightness 1.9, contrast 0.62, then 0.42 opacity over the white bezel) is
   baked into its pixels here, step by step and clamped after each step the way
   CSS filter functions are. Keep these in step with `.anime-hero__screen img`. */
const SHOT_GRAYSCALE = 0.9;
const SHOT_BRIGHTNESS = 1.9;
const SHOT_CONTRAST = 0.62;
const SHOT_OPACITY = 0.42;

async function writeBlur(source, slug) {
  const { data, info } = await sharp(source)
    .resize({ width: BLUR_WIDTH })
    .blur(BLUR_SIGMA)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const clamp = (v) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (let c = 0; c < 3; c++) {
      let v = [r, g, b][c];
      v = v + (luma - v) * SHOT_GRAYSCALE;
      v = clamp(v * SHOT_BRIGHTNESS);
      v = clamp((v - 0.5) * SHOT_CONTRAST + 0.5);
      v = v * SHOT_OPACITY + (1 - SHOT_OPACITY);
      data[i + c] = Math.round(v * 255);
    }
  }
  await sharp(data, { raw: info })
    .webp({ quality: 60 })
    .toFile(join(OUT, `${slug}-blur.webp`));
}

/* NODE_PATH does not apply to ESM, so playwright is resolved the way the test
   runner resolves it — from the audit install that already has browsers. */
const require = createRequire(
  join(process.env.PLAYWRIGHT_HOME || resolve(process.env.HOME, "work/Personal-Website/repo/audit"), "package.json"),
);
const { chromium } = require("playwright");

const ROUTES = [
  ["touchpoint", "/work/touchpoint/"],
  ["spoot", "/work/spoot/"],
  ["remote-lab-vision", "/work/remote-lab-vision/"],
  ["ams", "/projects/ams/"],
  ["engineering-rocket", "/work/engineering-rocket/"],
  ["private-clinic", "/work/private-clinic/"],
  ["portfolio-rocket", "/work/portfolio-rocket/"],
];

async function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await stat(full)).size;
  }
  return total;
}

if (process.argv.includes("--blur-only")) {
  for (const [slug] of ROUTES) await writeBlur(join(OUT, `${slug}.webp`), slug);
  console.log(`blurred twins: ${ROUTES.length}`);
  process.exit(0);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  /* The pages animate their own content in on scroll. Reduced motion puts
     every reveal straight into its end state, so the shot is the page as
     read rather than the page mid-entrance. */
  reducedMotion: "reduce",
});

await mkdir(OUT, { recursive: true });
await rm(join(OUT, ".tmp.png"), { force: true });

let failed = 0;
for (const [slug, route] of ROUTES) {
  const page = await context.newPage();
  try {
    const response = await page.goto(BASE + route, { waitUntil: "load", timeout: 45000 });
    if (!response || response.status() !== 200) {
      console.error(`FAIL ${slug}: ${response ? response.status() : "no response"} ${route}`);
      failed++;
      await page.close();
      continue;
    }
    // Let the hero image decode; a card of a half-loaded page is worse than no
    // card at all.
    await page.waitForTimeout(1800);
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images]
          .filter((img) => img.getBoundingClientRect().top < window.innerHeight * 1.5)
          .map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))),
      );
    });

    const png = await page.screenshot({ type: "png" });
    const out = join(OUT, `${slug}.webp`);
    await sharp(png)
      .resize({ width: CARD_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out);
    await writeBlur(png, slug);
    const { size } = await stat(out);
    console.log(
      JSON.stringify({ slug, route, out: `/shots/${slug}.webp`, width: CARD_WIDTH, height: Math.round((CARD_WIDTH * HEIGHT) / WIDTH), kb: Math.round(size / 1024) }),
    );
  } catch (error) {
    console.error(`FAIL ${slug}: ${String(error).slice(0, 160)}`);
    failed++;
  } finally {
    await page.close();
  }
}

await browser.close();

const total = await dirSize(OUT);
console.log(`public/shots: ${(total / 1024).toFixed(0)} KB`);
if (total > BUDGET) {
  console.error(`over budget: ${(total / 1024).toFixed(0)} KB > ${(BUDGET / 1024).toFixed(0)} KB`);
  process.exit(1);
}
process.exit(failed ? 1 : 0);
