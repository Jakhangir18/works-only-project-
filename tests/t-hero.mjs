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
