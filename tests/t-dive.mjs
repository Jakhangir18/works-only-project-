// The dive: it opens from a card, shows the teaser and the close control,
// prefetches the destination, closes cleanly, and leaks nothing over cycles.
import { chromium, webkit } from 'playwright';
import { BASE, check, summarize, workBox, findCardInView } from './lib.mjs';

const results = [];

/**
 * Wait for the entry timeline to actually finish, and say so if it does not.
 * A fixed sleep reported a slow machine as a defect; a gate that resolves a
 * frame early does the same in the other direction, so this waits for the two
 * things the timeline's last beat sets — the teaser and the close control both
 * fully on — and then gives the layers a moment to re-raster, because clearing
 * will-change at onComplete is itself a repaint and the pixel checks below read
 * the screen. Failures are reported rather than swallowed: a missing overlay
 * node would otherwise collapse every wait to nothing and let the checks that
 * follow measure a dive that never played.
 */
async function settle(page, results, tag) {
  const ok = await page
    .waitForFunction(() => {
      const teaser = document.querySelector('.dive__teaser');
      const close = document.querySelector('.dive__close');
      if (!teaser || !close) return false;
      return Number(getComputedStyle(teaser).opacity) >= 0.999 &&
        Number(getComputedStyle(close).opacity) >= 0.999;
    }, null, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  results.push(check(`${tag} the entry timeline finishes`, ok, 'teaser or close control never reached full opacity in 15 s'));
  await page.waitForTimeout(700);
  return ok;
}

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
  await settle(page, results, 'dive');

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

  // The teaser sits over the project's cover at full bleed, and a cover can be
  // a screenshot of a white web page. Same method as the tunnel cards: hide the
  // glyphs, screenshot, average what is behind each string, put the string's
  // own colour over it. Without the teaser's wash and the eyebrow's plate this
  // reports 1.28:1.
  {
    const targets = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.dive__teaser *').forEach((el) => {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 4 || r.height < 4) return;
        const x = Math.max(0, Math.round(r.x));
        const y = Math.max(0, Math.round(r.y));
        out.push({ cls: String(el.className || el.tagName).slice(0, 30),
          rect: { x, y, w: Math.min(Math.round(r.width), innerWidth - x), h: Math.min(Math.round(r.height), innerHeight - y) },
          color: cs.color, op: Number(cs.opacity), size: parseFloat(cs.fontSize), weight: cs.fontWeight });
      });
      return out;
    });
    await page.evaluate(() => {
      const st = document.createElement('style');
      st.className = 'hide-teaser-text';
      st.textContent = '.dive__teaser *{color:transparent !important}';
      document.head.appendChild(st);
    });
    await page.waitForTimeout(250);
    const png = (await page.screenshot()).toString('base64');
    await page.evaluate(() => document.querySelectorAll('style.hide-teaser-text').forEach((e) => e.remove()));
    const measured = await page.evaluate(async ({ png, targets }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + png;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const lum = (v) => { const a = v.map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
      const parse = (v) => (v.match(/[\d.]+/g) || []).map(Number);
      return targets.map((t) => {
        const d = g.getImageData(t.rect.x, t.rect.y, Math.max(1, t.rect.w), Math.max(1, t.rect.h)).data;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++; }
        const bg = [r / n, gg / n, b / n];
        const col = parse(t.color);
        const fg = [0, 1, 2].map((i) => col[i] * t.op + bg[i] * (1 - t.op));
        const l1 = lum(fg), l2 = lum(bg);
        const large = t.size >= 24 || (t.size >= 18.66 && Number(t.weight) >= 700);
        return { cls: t.cls, ratio: Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)), need: large ? 3 : 4.5 };
      });
    }, { png, targets });
    const bad = measured.filter((m) => m.ratio + 0.01 < m.need).map((m) => `${m.cls} ${m.ratio}:1 needs ${m.need}`);
    results.push(check('dive: the teaser pixel check found its strings', measured.length >= 3, `${measured.length} strings measured`));
    results.push(check('dive: teaser text is legible on the cover', bad.length === 0, bad.slice(0, 3).join(' | ')));
  }

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

// A dive taken with reduced motion on fades the flip plane to opacity 0 on the
// way out. If the full-motion path does not put it back, every later dive in
// the session renders as a black rectangle: backdrop, teaser and close button
// over nothing. The OS setting can change mid-session, so this is reachable.
{
  const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rpage = await rctx.newPage();
  rpage.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
  rpage.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 140)); });
  await rpage.goto(BASE + '/', { waitUntil: 'load' });
  await rpage.waitForTimeout(6000);
  const rbox = await workBox(rpage);
  const rhref = rbox ? await findCardInView(rpage, rbox) : null;
  // Guard the premise: without these, a card that stops being reachable makes
  // the whole regression silently vanish while the suite still reports green.
  results.push(check('dive/reduced: a card is reachable', !!rhref, rhref || 'none'));
  if (rhref) {
    await rpage.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await rpage.waitForTimeout(1200);
    await rpage.keyboard.press('Escape');
    await rpage.waitForTimeout(1200);
    const parked = await rpage.evaluate(() => getComputedStyle(document.querySelector('.dive__flip')).opacity);

    await rpage.emulateMedia({ reducedMotion: 'no-preference' });
    const again = await findCardInView(rpage, rbox);
    results.push(check('dive/reduced: a card is reachable again after the switch', !!again, again || 'none'));
    if (again) {
      await rpage.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
      await rpage.waitForTimeout(2600);
      const shown = await rpage.evaluate(() => ({
        flip: getComputedStyle(document.querySelector('.dive__flip')).opacity,
        open: document.querySelector('.dive')?.classList.contains('is-open'),
      }));
      results.push(check('dive: the reduced exit parks the flip plane at 0', Number(parked) < 0.1, `opacity ${parked}`));
      results.push(check('dive: a full dive after a reduced one is visible', shown.open === true && Number(shown.flip) > 0.9, `is-open=${shown.open} flip opacity ${shown.flip}`));
    }
  }
  await rctx.close();
}

results.push(check('dive: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | ')));
await browser.close();

// WebKit has never implemented <link rel=prefetch>, so the same code that warms
// the destination in Chromium fetched nothing in Safari — on the one engine
// where the dive is slowest. The fallback is a same-origin fetch.
{
  const wb = await webkit.launch();
  const wctx = await wb.newContext({ viewport: { width: 1440, height: 900 } });
  const wpage = await wctx.newPage();
  const werrors = [];
  wpage.on('pageerror', (e) => werrors.push(String(e).slice(0, 140)));
  const warmed = [];
  wpage.on('request', (r) => { if (/\/work\/[a-z-]+\/?$/.test(r.url())) warmed.push(r.url()); });
  await wpage.goto(BASE + '/', { waitUntil: 'load' });
  await wpage.waitForTimeout(6000);
  const wbox = await workBox(wpage);
  const whref = wbox ? await findCardInView(wpage, wbox) : null;
  results.push(check('dive/webkit: a card is reachable', !!whref, whref || 'none'));
  if (whref) {
    await wpage.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await settle(wpage, results, 'dive/webkit');
    const wopen = await wpage.evaluate(() => {
      const d = document.querySelector('.dive');
      return {
        isOpen: d?.classList.contains('is-open'),
        teaser: getComputedStyle(document.querySelector('.dive__teaser')).opacity,
        flip: getComputedStyle(document.querySelector('.dive__flip')).opacity,
      };
    });
    results.push(check('dive/webkit: opens', wopen.isOpen === true, `is-open=${wopen.isOpen}`));
    results.push(check('dive/webkit: the composition is visible', Number(wopen.flip) > 0.9, `flip opacity ${wopen.flip}`));
    results.push(check('dive/webkit: teaser is shown', Number(wopen.teaser) === 1, `opacity ${wopen.teaser}`));
    results.push(check('dive/webkit: the destination is warmed during the dive', warmed.some((u) => u.includes(whref.replace(/^\//, ''))), warmed.slice(0, 2).join(' ') || 'nothing requested'));
    await wpage.keyboard.press('Escape');
    await wpage.waitForTimeout(1600);
    const wclosed = await wpage.evaluate(() => ({
      isOpen: document.querySelector('.dive')?.classList.contains('is-open'),
      locked: document.documentElement.style.overflow === 'hidden',
    }));
    results.push(check('dive/webkit: closes and unlocks scroll', wclosed.isOpen === false && !wclosed.locked, `is-open=${wclosed.isOpen} locked=${wclosed.locked}`));
  }
  results.push(check('dive/webkit: no runtime errors', werrors.length === 0, werrors.slice(0, 2).join(' | ')));
  await wb.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'dive', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
