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
    // and the hero sits over a canvas — so two real failures were reported as
    // "incomplete" and counted as nothing. This resolves the effective
    // background by compositing every layer above the first opaque one, the
    // way a reader's eye does, and applies the WCAG AA ratio.
    {
      // The home page holds its wrapper at opacity 0 behind the loader. Every
      // candidate would then be skipped as invisible and the check would
      // report a clean pass on the one route it was written for, so wait for
      // the page to be shown and assert afterwards that it actually looked at
      // something.
      const shown = await page
        .waitForFunction(() => {
          const w = document.querySelector('.js-site-wrapper');
          return !w || Number(getComputedStyle(w).opacity) > 0.95;
        }, null, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);
      results.push(check(`${tag} the page is actually shown before it is graded`, shown, 'wrapper still transparent after 15 s'));

      const contrast = await page.evaluate(() => {
        const lum = (c) => {
          const v = c.map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
          return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
        };
        // Only the two serializations whose numbers mean what they look like.
        // rgb(0 0 0 / 50%) and color(srgb 0.1 0.2 0.3) would both be misread
        // by a bare number scrape, so anything else returns null and the
        // element is declined rather than guessed at.
        const parse = (value) => {
          const m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
          if (!m || m[1].includes('%') || m[1].includes('/')) return null;
          const n = m[1].split(',').map((x) => Number(x));
          return n.length >= 3 && n.every((x) => Number.isFinite(x)) ? n : null;
        };
        const over = (fg, bg) => {
          const a = fg.length > 3 ? fg[3] : 1;
          return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        };
        // One walk up the tree, reading each ancestor's computed style once:
        // opacity multiplies down the chain even though it does not inherit,
        // and every translucent background layer between the text and the
        // first opaque one is composited rather than skipped.
        const resolve = (el) => {
          let opacity = 1;
          let bg = null;
          let unreadable = false;
          const layers = [];
          // One walk to the root, always: opacity has to keep multiplying past
          // the first opaque background, or an ancestor holding the whole page
          // at opacity 0 — which this site does for four seconds behind its
          // loader — is invisible to the check and every element grades as
          // visible text.
          for (let n = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            opacity *= Number(cs.opacity);
            if (bg !== null) continue;
            if (cs.backgroundImage && cs.backgroundImage !== 'none') { unreadable = true; bg = undefined; continue; }
            const c = parse(cs.backgroundColor);
            if (!c) { unreadable = true; continue; }
            const alpha = c.length > 3 ? c[3] : 1;
            if (alpha === 0) continue;
            layers.push(c);
            if (alpha === 1) {
              let resolved = layers.pop().slice(0, 3);
              while (layers.length) resolved = over(layers.pop(), resolved);
              bg = resolved;
            }
          }
          // A gradient or a colour this cannot read sits between the text and
          // anything it could compare against, so it declines rather than
          // inventing an answer — but only after the opacity walk has run.
          if (unreadable || bg === undefined) return { bg: null, opacity };
          if (bg === null) {
            let resolved = [0, 0, 0];
            while (layers.length) resolved = over(layers.pop(), resolved);
            bg = resolved;
          }
          return { bg, opacity };
        };

        const bad = [];
        let examined = 0;
        const tags = 'p,h1,h2,h3,h4,h5,h6,a,span,li,em,strong,button,label,td,th,figcaption,blockquote,dd,dt';
        for (const el of document.querySelectorAll(tags)) {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          // Decoration announced to nobody is not text a reader has to read.
          if (el.closest('[aria-hidden="true"]')) continue;
          const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!text) continue;
          // content-visibility: auto skips rendering off-screen content, and a
          // skipped subtree measures as empty — checkVisibility with
          // contentVisibilityAuto counts that as visible, while
          // content-visibility: hidden, which is a deliberate not-rendered
          // state, still counts as hidden. The tunnel's cards use both.
          if (typeof el.checkVisibility === 'function' &&
              !el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const resolved = resolve(el);
          if (!resolved.bg || resolved.opacity < 0.95) continue;
          const fgColor = parse(cs.color);
          if (!fgColor) continue;
          examined++;
          const size = parseFloat(cs.fontSize);
          const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
          const need = large ? 3 : 4.5;
          const fg = over(fgColor, resolved.bg);
          const l1 = lum(fg), l2 = lum(resolved.bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio + 0.01 < need) bad.push(`${el.tagName}.${el.className || '-'} ${ratio.toFixed(2)}:1 needs ${need}`);
        }
        return { bad, examined };
      });
      results.push(check(`${tag} the contrast check looked at real text`, contrast.examined >= 5, `${contrast.examined} elements graded`));
      results.push(check(`${tag} static text meets the WCAG AA contrast ratio`, contrast.bad.length === 0, contrast.bad.slice(0, 3).join(' | ')));
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
