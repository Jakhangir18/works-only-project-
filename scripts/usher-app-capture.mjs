// A capture of Usher's judge web app in its scripted demo mode, for the Usher
// case page: no Pi needed ("Try demo" plays a conversation by itself).
//
//   heavy node scripts/usher-app-capture.mjs [--repo=~/work/usher/repo] [--out=<png>]
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire("/home/ubuntu/work/landing-page/repo/node_modules/");
const { chromium } = require("playwright");
const BIN = process.env.PERF_CHROMIUM || "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) || d;
const REPO = resolve(arg("repo", `${homedir()}/work/usher/repo`));
const OUT = resolve(arg("out", `${homedir()}/work/works-only/in/mwe-2026-10-06/usher/judge-app.png`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: BIN, headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`file://${REPO}/frontend/index.html`, { waitUntil: "load" });
await sleep(800);
await page.click("#demo");
// Four lines in, the summary arrives (app.js: i === 3); give it a moment more.
await sleep(16000);
await page.screenshot({ path: OUT, type: "png" });
console.log(OUT);
await browser.close();
