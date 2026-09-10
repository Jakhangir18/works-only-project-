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
