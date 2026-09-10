// Hero rolling titles: cycles, pauses when it cannot be seen, off under
// reduced motion, and the longest title fits the mask at every width.
import { chromium } from 'playwright';
import { BASE, VIEWPORTS, check, summarize } from './lib.mjs';

const results = [];
const browser = await chromium.launch();

// 1. It cycles, and exactly one item is current at a time.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(5200);
  const seen = [];
  const currents = [];
  for (let i = 0; i < 5; i++) {
    const s = await page.evaluate(() => ({
      current: [...document.querySelectorAll('.rolling-text__item.is-current')].map((e) => e.textContent.trim()),
      both: [...document.querySelectorAll('.rolling-text__item.is-current.is-leaving')].length,
    }));
    currents.push(s.current.length);
    if (s.current[0]) seen.push(s.current[0]);
    results.push(check(`hero: no item is current and leaving at once (sample ${i})`, s.both === 0, `both=${s.both}`));
    await page.waitForTimeout(2700);
  }
  results.push(check('hero: exactly one current item at every sample', currents.every((n) => n === 1), currents.join(',')));
  results.push(check('hero: the title actually changes', new Set(seen).size >= 3, [...new Set(seen)].join(' / ')));
  await ctx.close();
}

// 2. It stops when the hero is scrolled away, and resumes.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(5200);
  await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 4, behavior: 'instant' }));
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => document.querySelector('.rolling-text__item.is-current')?.textContent.trim());
  await page.waitForTimeout(6000);
  const after = await page.evaluate(() => document.querySelector('.rolling-text__item.is-current')?.textContent.trim());
  results.push(check('hero: paused while off screen', before === after, `${before} -> ${after}`));

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(6000);
  const resumed = await page.evaluate(() => document.querySelector('.rolling-text__item.is-current')?.textContent.trim());
  results.push(check('hero: resumes when scrolled back', resumed !== after, `${after} -> ${resumed}`));
  await ctx.close();
}

// 3. Reduced motion: never starts, and a title is still shown.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(5200);
  const first = await page.evaluate(() => document.querySelector('.rolling-text__item.is-current')?.textContent.trim());
  await page.waitForTimeout(6000);
  const second = await page.evaluate(() => document.querySelector('.rolling-text__item.is-current')?.textContent.trim());
  results.push(check('hero: static under reduced motion', first === second && !!first, `${first} -> ${second}`));
  await ctx.close();
}

// 3b. Returning to the tab must not start the roller while it is off screen.
//     At a landscape-phone viewport the hero pushes the line below the fold at
//     scroll 0: the observer correctly never starts it, and the visibilitychange
//     handler used to restart it anyway from half the observer's test.
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 340 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(5200);
  const geom = await page.evaluate(() => {
    const r = document.querySelector('.rolling-text').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, ih: window.innerHeight };
  });
  const belowFold = geom.top >= geom.ih && geom.bottom > 0;
  results.push(check('hero: the landscape-phone case still puts the line below the fold', belowFold, JSON.stringify(geom)));
  if (belowFold) {
    // Count class changes rather than reading a title: a swap the visitor
    // cannot see is still work, and work is what must not happen.
    await page.evaluate(() => {
      window.__swaps = 0;
      new MutationObserver((ms) => { window.__swaps += ms.length; })
        .observe(document.querySelector('.rolling-text__viewport'), { attributes: true, attributeFilter: ['class'], subtree: true });
    });
    await page.waitForTimeout(6000);
    const idle = await page.evaluate(() => window.__swaps);
    // Playwright cannot drive real tab visibility headlessly, so override the
    // two properties the handler reads and dispatch the event it listens for.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      delete document.hidden;
      delete document.visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      window.__swaps = 0;
    });
    await page.waitForTimeout(9000);
    const afterReturn = await page.evaluate(() => ({ swaps: window.__swaps, top: document.querySelector('.rolling-text').getBoundingClientRect().top, ih: window.innerHeight, sy: window.scrollY }));
    results.push(check('hero: idle off screen does nothing', idle === 0, `${idle} class changes in 6 s`));
    results.push(check('hero: returning to the tab does not start it off screen', afterReturn.swaps === 0, `${afterReturn.swaps} class changes in 9 s, top ${Math.round(afterReturn.top)} vs innerHeight ${afterReturn.ih}, scrollY ${afterReturn.sy}`));
  }
  await ctx.close();
}

// 4. The longest title fits the mask at every width.
for (const [w, h, name] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(5200);
  const fit = await page.evaluate(() => {
    const vp = document.querySelector('.rolling-text__viewport');
    const items = [...document.querySelectorAll('.rolling-text__item')];
    const widest = Math.max(...items.map((i) => i.scrollWidth));
    return { widest, box: vp.clientWidth, over: widest > vp.clientWidth + 1 };
  });
  results.push(check(`hero: longest title fits at ${name} (${w}px)`, !fit.over, `${fit.widest} > ${fit.box}`));
  await ctx.close();
}

await browser.close();
const s = summarize(results);
console.log(JSON.stringify({ suite: 'hero', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
