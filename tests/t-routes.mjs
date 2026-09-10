// Every route in every engine at two sizes: no console errors, no failed
// requests, one h1, one main, no horizontal overflow, every visible image
// decoded and sized.
import { chromium, webkit, firefox } from 'playwright';
import { BASE, ROUTES, check, summarize, watch, sweepScroll } from './lib.mjs';

const ENGINES = { chromium, webkit, firefox };
const SIZES = [[1440, 900, 'desktop'], [390, 844, 'phone']];
const results = [];

for (const [ename, engine] of Object.entries(ENGINES)) {
  let browser;
  try {
    browser = await engine.launch();
  } catch (e) {
    results.push(check(`${ename}: launch`, false, String(e).slice(0, 120)));
    continue;
  }
  for (const [w, h, size] of SIZES) {
    for (const route of ROUTES) {
      const tag = `${ename}/${size}${route}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: size === 'phone', hasTouch: size === 'phone' });
      const page = await ctx.newPage();
      const seen = watch(page);
      let status = 0;
      try {
        const resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
        status = resp ? resp.status() : 0;
        await page.waitForTimeout(1200);
        await sweepScroll(page);
      } catch (e) {
        results.push(check(`${tag} loads`, false, String(e).slice(0, 140)));
        await ctx.close();
        continue;
      }
      results.push(check(`${tag} status 200`, status === 200, `status ${status}`));
      results.push(check(`${tag} no console errors`, seen.errors.length === 0, seen.errors.slice(0, 2).join(' | ')));
      results.push(check(`${tag} no failed requests`, seen.failed.length === 0, seen.failed.slice(0, 2).join(' | ')));

      const dom = await page.evaluate(() => {
        const imgs = [...document.images].filter((i) => {
          if (!i.getAttribute('src') || i.getClientRects().length === 0) return false;
          const r = i.getBoundingClientRect();
          return r.right > 0 && r.left < window.innerWidth && r.bottom > -window.innerHeight && r.top < window.innerHeight * 2;
        });
        return {
          h1: document.querySelectorAll('h1').length,
          main: document.querySelectorAll('main').length,
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          title: document.title,
          imgsBroken: imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')),
          imgsUnsized: imgs.filter((i) => !i.hasAttribute('width') || !i.hasAttribute('height')).map((i) => i.getAttribute('src')),
          imgsNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
        };
      });
      results.push(check(`${tag} exactly one h1`, dom.h1 === 1, `h1=${dom.h1}`));
      results.push(check(`${tag} exactly one main`, dom.main === 1, `main=${dom.main}`));
      results.push(check(`${tag} no horizontal overflow`, !dom.overflowX, 'scrollWidth > clientWidth'));
      results.push(check(`${tag} has a title`, dom.title.length > 3, dom.title));
      results.push(check(`${tag} images decoded`, dom.imgsBroken.length === 0, dom.imgsBroken.slice(0, 2).join(', ')));
      results.push(check(`${tag} images sized`, dom.imgsUnsized.length === 0, dom.imgsUnsized.slice(0, 2).join(', ')));
      results.push(check(`${tag} images have alt`, dom.imgsNoAlt.length === 0, dom.imgsNoAlt.slice(0, 2).join(', ')));

      // A section label must never sit on top of the text it introduces.
      // At one column a sticky label pins itself over its own paragraph.
      const overlaps = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('.proj-story-section').forEach((sec) => {
          const l = sec.querySelector('.proj-story-section__label')?.getBoundingClientRect();
          const b = sec.querySelector('.proj-story-section__body')?.getBoundingClientRect();
          if (!l || !b) return;
          const clash = !(l.bottom <= b.top + 1 || b.bottom <= l.top + 1 || l.right <= b.left + 1 || b.right <= l.left + 1);
          if (clash) bad.push(sec.querySelector('.proj-story-section__heading')?.textContent.trim());
        });
        return bad;
      });
      results.push(check(`${tag} section labels do not overlap their text`, overlaps.length === 0, overlaps.join(', ')));

      // Critical-path budget. Everything decorative — the Three.js field, the
      // 240 rocket frames, the card covers — is meant to arrive after the page
      // is usable. A breach means something moved back in front of the reader.
      if (ename === 'chromium') {
        const budget = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const upToLoad = performance
            .getEntriesByType('resource')
            .filter((r) => r.responseEnd <= nav.loadEventEnd);
          return {
            count: upToLoad.length,
            kb: Math.round(upToLoad.reduce((n, r) => n + (r.transferSize || 0), 0) / 1024),
            heavy: upToLoad
              .filter((r) => (r.transferSize || 0) > 150 * 1024)
              .map((r) => `${Math.round(r.transferSize / 1024)}KB ${r.name.split('/').pop()}`),
          };
        });
        results.push(check(`${tag} critical path under 40 resources`, budget.count <= 40, `${budget.count} resources`));
        results.push(check(`${tag} critical path under 600 KB`, budget.kb <= 600, `${budget.kb} KB`));
        results.push(check(`${tag} nothing over 150 KB blocks the page`, budget.heavy.length === 0, budget.heavy.join(', ')));
      }

      await ctx.close();
    }
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'routes', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
