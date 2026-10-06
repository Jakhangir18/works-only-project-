// Captures of the public site www.zyp.co for the Zyp case page: the sections
// his internship built, shot from the live site so the page shows what the
// public sees. Same browser the shots use (scripts/shots.mjs).
//
//   heavy node scripts/zyp-captures.mjs [--out=<dir>]   (default ../in/zyp-captures-<date>/)
//
// Writes PNGs at 1440x900 @2x: the header at rest, the trusted-by cylinder,
// the tablet band, the testimonial ring, the whole coverage globe. These are
// sources for docs/media-manifest-zyp.json, not site files: run
// scripts/import-media.mjs on the manifest afterwards.
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/home/ubuntu/work/landing-page/repo/node_modules/");
const { chromium } = require("playwright");
const BIN = process.env.PERF_CHROMIUM || "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const SITE = "https://www.zyp.co/";
const date = new Date().toISOString().slice(0, 10);
const OUT = resolve(process.argv.find((a) => a.startsWith("--out="))?.slice(6) || `../in/zyp-captures-${date}`);
await mkdir(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: BIN, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(SITE, { waitUntil: "load", timeout: 90000 });
await sleep(4000);

/* Scroll a section's top to a given offset from the viewport's top, let the
   site settle, then shoot the viewport (the section's own motion included). */
async function shoot(name, selector, offset = 0, settle = 2500) {
  const ok = await page.evaluate(({ selector, offset }) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: "instant" });
    return true;
  }, { selector, offset });
  if (!ok) { console.log(`missing ${selector}`); return; }
  await sleep(settle);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log(file);
}

// The header pill at rest at the top of the page.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await sleep(1500);
await page.screenshot({ path: join(OUT, "header.png"), clip: { x: 0, y: 0, width: 1440, height: 160 } });
console.log(join(OUT, "header.png"));
await shoot("trusted", ".trusted", 120);
await shoot("tablet", "#tablet-scroll", 0, 3500);
await shoot("films", ".films__film", 80);
await shoot("ring", "#testimonials", 40, 3500);
await shoot("coverage", "#coverage", 40, 3500);
await browser.close();
