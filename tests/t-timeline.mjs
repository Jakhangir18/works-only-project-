// The Timeline: entries reveal, the year marker sticks, durations are right,
// links reach the project pages, and reduced motion shows everything at once.
import { chromium, webkit } from 'playwright';
import { BASE, VIEWPORTS, check, summarize } from './lib.mjs';

const results = [];

for (const [ename, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.querySelector('#timeline')?.scrollIntoView());
  await page.waitForTimeout(1200);

  const info = await page.evaluate(() => {
    const s = document.querySelector('#timeline');
    const entries = [...document.querySelectorAll('.s-timeline__entry')];
    const years = [...document.querySelectorAll('.s-timeline__year')];
    return {
      exists: !!s,
      entries: entries.length,
      revealed: entries.filter((e) => e.classList.contains('is-in')).length,
      kinds: [...new Set(entries.map((e) => e.dataset.kind))],
      yearPosition: years[0] ? getComputedStyle(years[0]).position : null,
      yearsAscending: years.map((y) => y.textContent.trim()),
      times: [...document.querySelectorAll('.s-timeline__entry time')].map((t) => t.getAttribute('datetime')),
      links: [...document.querySelectorAll('a.s-timeline__body')].map((a) => a.getAttribute('href')),
      heights: entries.map((e) => Math.round(e.getBoundingClientRect().height)),
      drafts: entries.filter((e) => /Reverlab|STEP Academy|Google Developer/.test(e.textContent)).length,
    };
  });

  const tag = ename;
  results.push(check(`${tag} timeline section exists`, info.exists, 'missing'));
  results.push(check(`${tag} seven live entries`, info.entries === 7, `${info.entries}`));
  results.push(check(`${tag} draft entries stay hidden`, info.drafts === 0, `${info.drafts} rendered`));
  results.push(check(`${tag} every entry has a machine-readable date`, info.times.length === info.entries && info.times.every((t) => /^\d{4}-\d{2}$/.test(t)), info.times.join(',')));
  results.push(check(`${tag} years run newest first`, JSON.stringify(info.yearsAscending) === JSON.stringify([...info.yearsAscending].sort().reverse()), info.yearsAscending.join(',')));
  results.push(check(`${tag} year marker is sticky`, info.yearPosition === 'sticky', `position: ${info.yearPosition}`));
  results.push(check(`${tag} kinds are the four expected`, info.kinds.every((k) => ['work', 'research', 'competition', 'club'].includes(k)), info.kinds.join(',')));
  results.push(check(`${tag} long entries are taller than short ones`, Math.max(...info.heights) > Math.min(...info.heights) * 1.2, info.heights.join(',')));
  results.push(check(`${tag} project links are internal routes`, info.links.every((h) => h.startsWith('/')), info.links.join(',')));

  // Every timeline link must resolve.
  for (const href of info.links) {
    const resp = await page.request.get(BASE + href);
    results.push(check(`${tag} timeline link ${href} resolves`, resp.status() === 200, `status ${resp.status()}`));
  }

  // No ancestor of the sticky year may clip or contain it.
  const stickyAncestors = await page.evaluate(() => {
    const y = document.querySelector('.s-timeline__year');
    const bad = [];
    for (let n = y.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      // Only auto, scroll, hidden and overlay create a scrolling mechanism and
      // capture a sticky descendant. clip suppresses overflow without one.
      if (/(auto|scroll|hidden|overlay)/.test(cs.overflowY + cs.overflowX)) bad.push(`${n.tagName}.${n.className.split(' ')[0]} overflow:${cs.overflowX}/${cs.overflowY}`);
      if (cs.contain !== 'none') bad.push(`${n.tagName}.${n.className.split(' ')[0]} contain:${cs.contain}`);
    }
    return bad;
  });
  results.push(check(`${tag} nothing clips or contains the sticky year`, stickyAncestors.length === 0, stickyAncestors.slice(0, 2).join(', ')));

  // The year must actually stay put while its group scrolls past.
  const stuck = await page.evaluate(async () => {
    const y = document.querySelector('.s-timeline__year');
    const start = y.getBoundingClientRect().top;
    window.scrollBy(0, 300);
    await new Promise((r) => setTimeout(r, 400));
    const after = y.getBoundingClientRect().top;
    return { start: Math.round(start), after: Math.round(after), moved: Math.abs(after - start) };
  });
  results.push(check(`${tag} the year holds while its group scrolls`, stuck.moved < 300, `moved ${stuck.moved}px`));

  await ctx.close();
  await browser.close();
}

// Reduced motion: every entry visible at once, no transition.
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => {
    const entries = [...document.querySelectorAll('.s-timeline__entry')];
    return {
      total: entries.length,
      shown: entries.filter((e) => getComputedStyle(e).opacity === '1').length,
      transition: entries[0] ? getComputedStyle(entries[0]).transitionDuration : null,
    };
  });
  results.push(check('timeline: every entry visible under reduced motion', r.shown === r.total, `${r.shown}/${r.total}`));
  results.push(check('timeline: no transition under reduced motion', /^0s/.test(r.transition || ''), r.transition));
  await browser.close();
}

// Layout at every width.
{
  const browser = await chromium.launch();
  for (const [w, h, name] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(5500);
    await page.evaluate(() => document.querySelector('#timeline')?.scrollIntoView());
    await page.waitForTimeout(600);
    const fit = await page.evaluate(() => {
      const entries = [...document.querySelectorAll('.s-timeline__entry')];
      const over = entries.filter((e) => e.scrollWidth > e.clientWidth + 1).length;
      return { over, docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
    results.push(check(`timeline: no entry overflows at ${name} (${w}px)`, fit.over === 0, `${fit.over} entries overflow`));
    results.push(check(`timeline: page does not scroll sideways at ${name}`, !fit.docOverflow, 'document overflows'));
    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'timeline', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
