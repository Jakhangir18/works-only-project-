// The Work tunnel: it pins, the cards render, the covers arrive before the
// scrub, the canvas draws, and the keyboard route to the projects exists.
import { chromium, webkit } from 'playwright';
import { BASE, check, summarize, workBox } from './lib.mjs';

const results = [];

for (const [ename, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  for (const [w, h, size] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const tag = `${ename}/${size}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: size === 'phone', hasTouch: size === 'phone' });
    const page = await ctx.newPage();
    const covers = [];
    page.on('response', (r) => { if (/cover\.webp/.test(r.url())) covers.push(r.url().split('/').slice(-2)[0]); });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(6000);

    const box = await workBox(page);
    results.push(check(`${tag} work section exists`, !!box, box ? `${Math.round(box.height)}px tall` : 'missing'));
    if (!box) { await ctx.close(); continue; }

    const cards = await page.evaluate(() => document.querySelectorAll('a-work').length);
    results.push(check(`${tag} seven cards`, cards === 7, `${cards} cards`));

    const srIndex = await page.evaluate(() => {
      const nav = document.querySelector('.s__index');
      return nav ? nav.querySelectorAll('a[href]').length : 0;
    });
    results.push(check(`${tag} keyboard project list has every project`, srIndex === 7, `${srIndex} links`));

    const coversBefore = covers.length;

    // Walk the pinned section.
    const samples = [];
    for (let i = 0; i <= 10; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + (box.height - h) * i / 10);
      await page.waitForTimeout(320);
      samples.push(await page.evaluate(() => {
        const c = document.querySelector('.js-canvas');
        let lit = 0;
        if (c && c.width) {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          for (let k = 0; k < d.length; k += 4 * 211) if (d[k] + d[k + 1] + d[k + 2] > 20) lit++;
        }
        return {
          lit,
          pinned: !!document.querySelector('.s-work .js-container'),
          inview: document.querySelectorAll('a-work.is-inview').length,
          ready: document.querySelectorAll('a-work.is-cover-ready').length,
        };
      }));
    }
    const drew = samples.filter((s) => s.lit > 0).length;
    results.push(check(`${tag} point grid draws through the scrub`, drew >= 4, `${drew}/11 samples lit`));
    results.push(check(`${tag} cards come into view`, samples.some((s) => s.inview > 0), `max inview ${Math.max(...samples.map((s) => s.inview))}`));
    results.push(check(`${tag} covers pre-warm before the scrub`, coversBefore >= 3, `${coversBefore} of ${covers.length} arrived before scrolling`));
    results.push(check(`${tag} every cover ends ready`, samples[samples.length - 1].ready === 7, `${samples[samples.length - 1].ready}/7 ready`));

    // The letter shadows survive a resize taken inside the tunnel. setLetters()
    // rebuilds every ghost with no inline opacity over a stylesheet default of
    // 0, and the per-frame opacity write only runs when the tunnel state
    // changed — which it does not, anywhere inside the works region. On iOS
    // the address bar collapsing fires exactly this resize.
    const litShadows = () => page.evaluate(() => {
      const all = [...document.querySelectorAll('.s__scene__letter__shadow')];
      return { total: all.length, lit: all.filter((el) => Number(getComputedStyle(el).opacity) > 0.9).length };
    });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + (box.height - h) * 0.5);
    await page.waitForTimeout(500);
    const before = await litShadows();
    await page.setViewportSize({ width: w, height: h - 40 });
    await page.waitForTimeout(1200);
    const after = await litShadows();
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    results.push(check(`${tag} letter shadows are lit inside the tunnel`, before.total > 0 && before.lit === before.total, `${before.lit}/${before.total}`));
    results.push(check(`${tag} letter shadows survive a resize inside the tunnel`, after.total > 0 && after.lit === after.total, `${after.lit}/${after.total} after a 40px height change`));

    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'work', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
