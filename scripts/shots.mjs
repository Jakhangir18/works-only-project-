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
