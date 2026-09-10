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
    const canvasLit = () => page.evaluate(() => {
      const c = document.querySelector('.js-canvas');
      if (!c || !c.width) return -1;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 4 * 211) if (d[k] + d[k + 1] + d[k + 2] > 20) n++;
      return n;
    });
    const before = await litShadows();
    const beforeCanvas = await canvasLit();
    await page.setViewportSize({ width: w, height: h - 40 });
    await page.waitForTimeout(1200);
    const after = await litShadows();
    // setSize() clears the bitmap and setPoints() rebuilds the field. The draw
    // loop early-exits on unchanged progress, so a bad frame here is never
    // repainted (CLAUDE.md invariant 8) — assert the grid comes back.
    const afterCanvas = await canvasLit();
    results.push(check(`${tag} the point grid survives a resize inside the tunnel`, beforeCanvas > 0 && afterCanvas > 0, `${beforeCanvas} -> ${afterCanvas} lit`));
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(600);
    results.push(check(`${tag} letter shadows are lit inside the tunnel`, before.total > 0 && before.lit === before.total, `${before.lit}/${before.total}`));
    results.push(check(`${tag} letter shadows survive a resize inside the tunnel`, after.total > 0 && after.lit === after.total, `${after.lit}/${after.total} after a 40px height change`));

    // The card's text sits on the project's own photograph, and the CSS-model
    // contrast check in t-a11y cannot see that: the cover is an absolutely
    // positioned sibling, not an ancestor, so that check grades the text
    // against the palette colour the photo covers. This one reads the pixels
    // actually painted — screenshot the page with the glyphs made transparent,
    // average what is behind each string, and put the string's own colour over
    // it. It is how the white title on the clinic's white screenshot was found.
    if (ename === 'chromium' && size === 'desktop') {
      const worst = {};
      for (const frac of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + (box.height - h) * frac);
        await page.waitForTimeout(1200);
        const targets = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('a-work.is-inview.is-cover-ready .a__card').forEach((card) => {
            const name = (card.querySelector('.a__card__title')?.textContent || '?').trim().slice(0, 16);
            ['.a__card__index span', '.a__card__title span', '.a__card__cta span'].forEach((sel) => {
              const el = card.querySelector(sel);
              if (!el) return;
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              if (r.width < 3 || r.height < 3 || r.bottom < 2 || r.top > innerHeight - 2 || r.right < 2 || r.left > innerWidth - 2) return;
              const x = Math.max(0, Math.round(r.x));
              const y = Math.max(0, Math.round(r.y));
              out.push({ sel: sel.split(' ')[0], name,
                rect: { x, y, w: Math.min(Math.round(r.width), innerWidth - x), h: Math.min(Math.round(r.height), innerHeight - y) },
                color: cs.color, op: Number(cs.opacity), size: parseFloat(cs.fontSize), weight: cs.fontWeight });
            });
          });
          return out;
        });
        if (!targets.length) continue;
        await page.evaluate(() => {
          const st = document.createElement('style');
          st.className = 'hide-card-text';
          st.textContent = '.a__card__index span,.a__card__title span,.a__card__cta span{color:transparent !important}';
          document.head.appendChild(st);
        });
        await page.waitForTimeout(250);
        const png = (await page.screenshot()).toString('base64');
        await page.evaluate(() => document.querySelectorAll('style.hide-card-text').forEach((e) => e.remove()));
        const measured = await page.evaluate(async ({ png, targets }) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + png;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const lum = (v) => { const a = v.map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
          const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
          return targets.map((t) => {
            const d = g.getImageData(t.rect.x, t.rect.y, Math.max(1, t.rect.w), Math.max(1, t.rect.h)).data;
            let r = 0, gg = 0, b = 0, n = 0;
            for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++; }
            const bg = [r / n, gg / n, b / n];
            const col = parse(t.color);
            const fg = [0, 1, 2].map((i) => col[i] * t.op + bg[i] * (1 - t.op));
            const l1 = lum(fg), l2 = lum(bg);
            const large = t.size >= 24 || (t.size >= 18.66 && Number(t.weight) >= 700);
            return { k: `${t.sel} ${t.name}`, ratio: Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)), need: large ? 3 : 4.5 };
          });
        }, { png, targets });
        for (const m of measured) if (!worst[m.k] || m.ratio < worst[m.k].ratio) worst[m.k] = m;
      }
      const keys = Object.keys(worst);
      const failures = keys.filter((k) => worst[k].ratio + 0.01 < worst[k].need).map((k) => `${k} ${worst[k].ratio}:1 needs ${worst[k].need}`);
      results.push(check(`${tag} the pixel check reached the card text`, keys.length >= 9, `${keys.length} strings measured`));
      results.push(check(`${tag} card text is legible on its own cover`, failures.length === 0, failures.slice(0, 3).join(' | ')));
    }

    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'work', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
