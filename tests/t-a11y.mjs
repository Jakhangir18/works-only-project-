// axe on every route, plus keyboard reach and a visible focus indicator.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { BASE, ROUTES, check, summarize, sweepScroll } from './lib.mjs';

const results = [];
const browser = await chromium.launch();

for (const [w, h, size] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
  for (const route of ROUTES) {
    const tag = `${size}${route}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: size === 'phone', hasTouch: size === 'phone' });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await sweepScroll(page);

    const res = await new AxeBuilder({ page }).analyze();
    const bad = res.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    results.push(check(`${tag} axe serious/critical`, bad.length === 0,
      bad.map((v) => `${v.id}(${v.nodes.length}) ${v.nodes[0]?.target?.[0] || ''}`).join(' | ')));

    // axe declines to judge contrast when it cannot resolve the background,
    // and the hero sits over a canvas — so the two failures Lighthouse found
    // there were reported by axe as "incomplete" and counted as nothing. This
    // resolves the effective background by walking up for the first opaque
    // colour, the way a reader's eye does, and applies the WCAG AA ratio.
    if (route === '/') {
      const contrast = await page.evaluate(() => {
        const lum = (c) => {
          const v = c.map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
          return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        };
        const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
        const over = (fg, bg) => {
          const a = fg.length > 3 ? fg[3] : 1;
          return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        };
        const bgOf = (el) => {
          let n = el.parentElement;
          while (n) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c.length >= 3 && (c.length < 4 || c[3] === 1)) return c.slice(0, 3);
            n = n.parentElement;
          }
          return [0, 0, 0];
        };
        const bad = [];
        for (const el of document.querySelectorAll('p, h1, h2, h3, a, span, li')) {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (Number(cs.opacity) < 0.95) continue;
          // Decoration announced to nobody is not text a reader has to read.
          if (el.closest('[aria-hidden="true"]')) continue;
          const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!text) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          const fg = over(parse(cs.color), bgOf(el));
          const l1 = lum(fg), l2 = lum(bgOf(el));
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio + 0.01 < need) bad.push(`${el.className || el.tagName} ${ratio.toFixed(2)}:1 needs ${need}`);
        }
        return bad;
      });
      results.push(check(`${tag} static text meets the WCAG AA contrast ratio`, contrast.length === 0, contrast.slice(0, 3).join(' | ')));
    }

    const moderate = res.violations.filter((v) => v.impact === 'moderate');
    results.push(check(`${tag} axe moderate`, moderate.length === 0,
      moderate.map((v) => `${v.id}(${v.nodes.length})`).join(' | ')));

    // Keyboard: every focusable element must be reachable and show a ring.
    if (size === 'desktop') {
      const focusables = await page.evaluate(() =>
        [...document.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"])')]
          .filter((a) => !a.closest('[inert]') &&
            (typeof a.checkVisibility === 'function'
              ? a.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })
              : true)).length);

      const reached = [];
      const noRing = [];
      for (let i = 0; i < focusables + 3; i++) {
        await page.keyboard.press('Tab');
        const r = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || a === document.body) return null;
          const cs = getComputedStyle(a);
          const rect = a.getBoundingClientRect();
          return {
            id: a.tagName + ' ' + (a.getAttribute('href') || a.textContent?.trim().slice(0, 20) || ''),
            ring: !(cs.outlineStyle === 'none' || cs.outlineWidth === '0px'),
            zero: rect.width === 0 || rect.height === 0,
          };
        });
        if (!r) continue;
        reached.push(r.id);
        if (!r.ring) noRing.push(r.id);
      }
      results.push(check(`${tag} keyboard reaches every control`, reached.length >= focusables,
        `${reached.length} reached of ${focusables}`));
      results.push(check(`${tag} focus ring on every control`, noRing.length === 0, noRing.slice(0, 3).join(', ')));
    }
    await ctx.close();
  }
}
await browser.close();

const s = summarize(results);
console.log(JSON.stringify({ suite: 'a11y', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
