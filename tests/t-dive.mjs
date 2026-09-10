// The dive: it opens from a card, shows the teaser and the close control,
// prefetches the destination, closes cleanly, and leaks nothing over cycles.
import { chromium } from 'playwright';
import { BASE, check, summarize, workBox, findCardInView } from './lib.mjs';

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 140)); });
const prefetched = [];
page.on('request', (r) => { if (r.resourceType() === 'other' && /\/work\/|\/projects\//.test(r.url())) prefetched.push(r.url()); });

await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForTimeout(6000);
const box = await workBox(page);
const href = await findCardInView(page, box);
results.push(check('dive: a card is reachable in the tunnel', !!href, href || 'none found'));

if (href) {
  const before = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    scrollY: window.scrollY,
    overflow: document.documentElement.style.overflow,
  }));

  await page.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  await page.waitForTimeout(2600);

  const open = await page.evaluate(() => {
    const d = document.querySelector('.dive');
    const t = document.querySelector('.dive__teaser');
    const c = document.querySelector('.dive__close');
    return {
      isOpen: d?.classList.contains('is-open'),
      hidden: d?.getAttribute('aria-hidden'),
      teaser: t ? getComputedStyle(t).opacity : null,
      close: c ? getComputedStyle(c).opacity : null,
      glowHint: getComputedStyle(document.querySelector('.dive__glow')).willChange,
      vignetteHint: getComputedStyle(document.querySelector('.dive__vignette')).willChange,
      scrollLocked: document.documentElement.style.overflow === 'hidden',
      links: [...document.querySelectorAll('link[rel=prefetch]')].map((l) => l.getAttribute('href')),
    };
  });
  results.push(check('dive: opens', open.isOpen === true, `is-open=${open.isOpen}`));
  results.push(check('dive: teaser is shown once settled', Number(open.teaser) === 1, `opacity ${open.teaser}`));
  results.push(check('dive: close control is shown', Number(open.close) === 1, `opacity ${open.close}`));
  results.push(check('dive: compositing hints cleared after the timeline', open.glowHint === 'auto' && open.vignetteHint === 'auto', `${open.glowHint}/${open.vignetteHint}`));
  results.push(check('dive: scroll is locked while open', open.scrollLocked, `overflow=${open.scrollLocked}`));
  results.push(check('dive: exactly one prefetch link', open.links.length === 1, open.links.join(',')));
  results.push(check('dive: prefetch points at the clicked project', open.links[0] === href, `${open.links[0]} vs ${href}`));
  results.push(check('dive: the destination was requested during the dive', prefetched.some((u) => u.includes(href.replace(/^\//, ''))), prefetched.slice(0, 2).join(' ')));

  // Close and check the page is restored.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1600);
  const closed = await page.evaluate(() => ({
    isOpen: document.querySelector('.dive')?.classList.contains('is-open'),
    scrollLocked: document.documentElement.style.overflow === 'hidden',
    links: document.querySelectorAll('link[rel=prefetch]').length,
    hiddenCards: [...document.querySelectorAll('a-work a')].filter((a) => a.style.visibility === 'hidden').length,
    scrollY: window.scrollY,
  }));
  results.push(check('dive: closes', closed.isOpen === false, `is-open=${closed.isOpen}`));
  results.push(check('dive: scroll unlocked on close', !closed.scrollLocked, 'still locked'));
  results.push(check('dive: prefetch link dropped on close', closed.links === 0, `${closed.links} left`));
  results.push(check('dive: card made visible again', closed.hiddenCards === 0, `${closed.hiddenCards} still hidden`));
  results.push(check('dive: scroll position kept', Math.abs(closed.scrollY - before.scrollY) < 4, `${before.scrollY} -> ${closed.scrollY}`));

  // Three more cycles: node count must not grow.
  for (let i = 0; i < 3; i++) {
    const h2 = await findCardInView(page, box);
    if (!h2) break;
    await page.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await page.waitForTimeout(2000);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1400);
  }
  const after = await page.evaluate(() => ({ nodes: document.querySelectorAll('*').length, links: document.querySelectorAll('link[rel=prefetch]').length }));
  results.push(check('dive: no node growth over four cycles', after.nodes - before.nodes < 40, `${before.nodes} -> ${after.nodes}`));
  results.push(check('dive: no prefetch links accumulate', after.links === 0, `${after.links} left`));
}

results.push(check('dive: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | ')));
await browser.close();

const s = summarize(results);
console.log(JSON.stringify({ suite: 'dive', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
