// Shared helpers for the regression suite.
export const BASE = process.env.SITE || 'http://127.0.0.1:4347';

export const ROUTES = [
  '/',
  '/projects/ams/',
  '/work/touchpoint/',
  '/work/spoot/',
  '/work/remote-lab-vision/',
  '/work/engineering-rocket/',
  '/work/private-clinic/',
  '/work/portfolio-rocket/',
];

export const VIEWPORTS = [
  [320, 640, 'xs'],
  [390, 844, 'phone'],
  [768, 1024, 'tablet'],
  [1024, 768, 'laptop'],
  [1440, 900, 'desktop'],
  [2560, 1440, 'wide'],
];

/** A test result: name, pass, and the detail that proves it either way. */
export function check(name, pass, detail) {
  return { name, pass: !!pass, detail };
}

export function summarize(results) {
  const failed = results.filter((r) => !r.pass);
  return { total: results.length, failed: failed.length, failures: failed };
}

/** Collect console errors, page errors and failed requests for a page. */
export function watch(page) {
  const errors = [];
  const failed = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon\.ico/.test(m.text())) errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 200)));
  page.on('requestfailed', (r) => {
    const t = r.failure()?.errorText || '';
    if (!/ERR_ABORTED/.test(t)) failed.push(r.url().slice(0, 160) + ' ' + t);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) failed.push(r.status() + ' ' + r.url().slice(0, 160));
  });
  return { errors, failed };
}

/** Scroll the whole page in steps so lazy work is triggered, then return to top. */
export async function sweepScroll(page, step = 0.8) {
  await page.evaluate(async (frac) => {
    const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += Math.round(window.innerHeight * frac)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, H);
    await new Promise((r) => setTimeout(r, 200));
    window.scrollTo(0, 0);
  }, step);
  await page.waitForTimeout(300);
}

/** Absolute top and height of the Work section. */
export async function workBox(page) {
  return page.evaluate(() => {
    const s = document.querySelector('.s-work');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
}

/** Scroll into the pinned tunnel until a card link is fully on screen. */
export async function findCardInView(page, box) {
  for (let step = 200; step <= 5000; step += 200) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + step);
    await page.waitForTimeout(320);
    const href = await page.evaluate(() => {
      const hit = [...document.querySelectorAll('a-work a[href]')].find((a) => {
        const r = a.getBoundingClientRect();
        return r.width > 20 && r.height > 20 && r.top > 0 && r.bottom < window.innerHeight;
      });
      if (!hit) return null;
      window.__card = hit;
      return hit.getAttribute('href');
    });
    if (href) return href;
  }
  return null;
}
