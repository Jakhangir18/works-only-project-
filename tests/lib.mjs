// Shared helpers for the regression suite.
export const BASE = process.env.SITE || 'http://127.0.0.1:4347';

/**
 * The tunnel-era home page. It did not go away when the light home page took
 * over `/`: it is still built and still shipped, so the suites that test the
 * letter tunnel, the dive, the rocket sequence and the old hero point here
 * rather than being retired. When it is finally deleted they go with it.
 */
export const TUNNEL = '/tunnel/';

/** The two pages that mount the letter tunnel: [label, path]. */
export const WORK_PAGES = [['tunnel', '/tunnel/'], ['home', '/']];

/**
 * Open a page that carries the letter tunnel and wait until it is ready. The
 * tunnel page gets a fixed sleep (it has no ready flag). The home waits for
 * its opening cover to hand the page over, then for WorkSection's own
 * `is-works-ready`.
 */
export async function openWorkPage(page, path) {
  await page.goto(BASE + path, { waitUntil: 'load' });
  if (path === '/') {
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-scroll-blocked'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => document.documentElement.classList.contains('is-works-ready'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
  } else {
    await page.waitForTimeout(6000);
  }
}

export const ROUTES = [
  '/',
  '/tunnel/',
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
    // An abort is the engine's own decision, not a failure: Chromium says
    // ERR_ABORTED, Firefox NS_BINDING_ABORTED, WebKit "cancelled". Firefox
    // aborts an <img src> fetch once it settles on a srcset candidate, which
    // is what firefox/phone saw twice on /hero/jak-500.webp.
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(t)) failed.push(r.url().slice(0, 160) + ' ' + t);
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
  for (let step = 200; step <= Math.max(5000, box.height); step += 200) {
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
