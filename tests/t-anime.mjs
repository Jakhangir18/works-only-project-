// The light home page: it opens, the wheel turns, the rocket rides its own
// route, the work panels are reachable and the timeline board is pinned.
//
// The tunnel-era suites moved to /tunnel/ when this page took over `/`. This
// one is about what replaced them.
import { chromium, webkit } from 'playwright';
import { BASE, check, summarize } from './lib.mjs';

const results = [];

for (const [ename, engine] of Object.entries({ chromium, webkit })) {
  let browser;
  try {
    browser = await engine.launch();
  } catch (e) {
    results.push(check(`${ename}: launch`, false, String(e).slice(0, 120)));
    continue;
  }

  for (const [w, h, size] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const tag = `${ename}/${size}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 140)); });

    await page.goto(BASE + '/', { waitUntil: 'load' });

    // 1. The opening hands the page over, and does not outstay its welcome.
    const handedOver = await page
      .waitForFunction(() => !document.documentElement.classList.contains('is-scroll-blocked'), null, { timeout: 12000 })
      .then(() => true)
      .catch(() => false);
    results.push(check(`${tag} the opening hands the page over`, handedOver, 'still scroll-blocked after 12 s'));

    const introGone = await page
      .waitForFunction(() => !document.querySelector('.js-anime-intro'), null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    results.push(check(`${tag} the opening removes itself`, introGone, 'the cover is still in the tree'));

    await page.waitForTimeout(1200);

    // 2. The hero: one real heading, the arched name, seven cards on the wheel.
    const hero = await page.evaluate(() => {
      // The name is laid on a cylinder one glyph at a time, in one SVG per
      // layout (wide and narrow); read the glyphs of the layout this viewport
      // shows, in order, and compare them with the heading's letters.
      const shown = [...document.querySelectorAll('.anime-hero__name')].filter((svg) => getComputedStyle(svg).display !== 'none');
      const glyphs = shown.flatMap((svg) => [...svg.querySelectorAll('text')]);
      return {
        h1: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1')?.textContent?.trim() || '',
        nameLayouts: shown.length,
        headline: glyphs.map((t) => t.textContent?.trim() || '').join(''),
        cards: document.querySelectorAll('.anime-hero__screen').length,
        shots: [...document.querySelectorAll('.anime-hero__screen img:not(.anime-hero__screen-blur)')].map((i) => i.getAttribute('src')),
        twins: [...document.querySelectorAll('.anime-hero__screen-blur')].map((i) => i.getAttribute('src')),
      };
    });
    results.push(check(`${tag} exactly one h1`, hero.h1 === 1, `${hero.h1}`));
    results.push(check(`${tag} the heading is the owner's name`, /jakhangir/i.test(hero.h1Text), hero.h1Text));
    // The drawn headline is decorative, but it must say the same thing as the
    // heading: a link preview and a screen reader should not disagree with the
    // page a sighted visitor sees.
    results.push(check(`${tag} exactly one name layout is shown`, hero.nameLayouts === 1, `${hero.nameLayouts}`));
    results.push(check(`${tag} the drawn name matches the heading`, hero.headline.toLowerCase() === hero.h1Text.replace(/\s+/g, '').toLowerCase(), `${hero.headline} vs ${hero.h1Text}`));
    // The ring is concave, so only its far half is ever on screen; each
    // project sits on it twice to keep that half full. Fourteen cards, seven
    // distinct shots.
    results.push(check(`${tag} fourteen cards on the wheel`, hero.cards === 14, `${hero.cards} cards`));
    results.push(check(`${tag} seven distinct shots on the wheel`, new Set(hero.shots).size === 7, `${new Set(hero.shots).size} distinct`));
    // Every card carries its pre-blurred twin, the same project's shot.
    results.push(check(`${tag} every card has its blurred twin`, hero.twins.length === 14 && hero.twins.every((src, i) => src === hero.shots[i].replace('.webp', '-blur.webp')), `${hero.twins.length} twins`));

    // Every shot must actually resolve: a missing screenshot leaves a hole
    // where a project should be, and nothing else on the page would notice.
    const missing = [];
    for (const src of [...new Set([...hero.shots, ...hero.twins])]) {
      const resp = await page.request.get(BASE + src);
      if (resp.status() !== 200) missing.push(`${resp.status()} ${src}`);
    }
    results.push(check(`${tag} every card's screenshot resolves`, missing.length === 0, missing.slice(0, 3).join(' | ')));

    // 3. The wheel turns. Two samples a second apart must differ.
    if (ename === 'chromium' && size === 'desktop') {
      const turnOf = () => page.evaluate(() => document.querySelector('.anime-hero__screen')?.style.getPropertyValue('--turn') || '');
      const first = await turnOf();
      await page.waitForTimeout(1100);
      const second = await turnOf();
      results.push(check(`${tag} the wheel turns`, !!first && first !== second, `${first} then ${second}`));
    }

    // 4. The rocket rides its own route: at the top of the flight it sits on
    //    the start of the path, further down it has moved along it.
    const flight = await page.evaluate(() => {
      const section = document.querySelector('.rocket-flight');
      const craft = document.querySelector('.js-rocket-craft');
      const trail = document.querySelector('.js-rocket-trail');
      if (!section || !craft || !trail) return null;
      const r = section.getBoundingClientRect();
      return { top: Math.round(r.top + window.scrollY), height: Math.round(r.height) };
    });
    results.push(check(`${tag} the rocket flight exists`, !!flight, flight ? 'found' : 'missing'));

    if (flight) {
      const posOf = () => page.evaluate(() => {
        const c = document.querySelector('.js-rocket-craft');
        return { x: c.style.getPropertyValue('--x'), y: c.style.getPropertyValue('--y') };
      });
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), flight.top - h + flight.height * 0.15);
      await page.waitForTimeout(700);
      const early = await posOf();
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), flight.top - h + flight.height * 0.8);
      await page.waitForTimeout(700);
      const late = await posOf();
      results.push(check(`${tag} the rocket moves along its route`, early.x !== late.x || early.y !== late.y, `${JSON.stringify(early)} then ${JSON.stringify(late)}`));

      // The rocket has to be on the line, not merely moving. Sampling the path
      // in the page and comparing is the only check that catches the two
      // drifting apart, which is exactly what the first build did.
      const onLine = await page.evaluate(() => {
        const craft = document.querySelector('.js-rocket-craft');
        const trail = document.querySelector('.js-rocket-trail');
        const section = document.querySelector('.rocket-flight');
        const box = section.getBoundingClientRect();
        const vb = trail.ownerSVGElement.viewBox.baseVal;
        const sx = box.width / vb.width;
        const sy = box.height / vb.height;
        const x = parseFloat(craft.style.getPropertyValue('--x'));
        const y = parseFloat(craft.style.getPropertyValue('--y'));
        let best = Infinity;
        const len = trail.getTotalLength();
        for (let i = 0; i <= 200; i++) {
          const p = trail.getPointAtLength((len * i) / 200);
          const d = Math.hypot(p.x * sx - x, p.y * sy - y);
          if (d < best) best = d;
        }
        return Math.round(best);
      });
      results.push(check(`${tag} the rocket sits on its route`, onLine <= 6, `${onLine} px off the line`));
    }

    // 4b. The rocket hits on the right (the owner, 2026-10-03).
    const impact = await page.evaluate(() => {
      const el = document.querySelector('.js-rocket-impact');
      const stage = document.querySelector('.js-flight-stage');
      const m = /translate3d\(([-\d.]+)px/.exec(el?.style.transform || '');
      return m && stage ? { x: Number(m[1]), w: stage.clientWidth } : null;
    });
    results.push(check(`${tag} the rocket hits on the right`, !!impact && impact.x > 0.6 * impact.w, impact ? `x ${impact.x} of ${impact.w}` : 'no impact point'));

    // 5. The work rows and the timeline walk.
    const sections = await page.evaluate(() => ({
      panels: document.querySelectorAll('.js-work-slot').length,
      links: [...document.querySelectorAll('.js-work-slot')].map((a) => a.getAttribute('href')),
      listed: document.querySelectorAll('.anime-work__list a').length,
      counters: (document.querySelector('.anime-work')?.textContent || '').match(/(?<![:\d])0\d\s*\/\s*0?\d(?![:\d])/g) || [],
      notes: document.querySelectorAll('.paradise__stop').length,
      pins: document.querySelectorAll('.paradise__stop time[datetime]').length,
      drafts: [...document.querySelectorAll('.paradise__name')].map((n) => n.textContent.trim()),
    }));
    results.push(check(`${tag} a photograph in the rows for every project`, sections.panels === 7 && sections.listed === 7, `${sections.panels} in the rows, ${sections.listed} listed`));
    results.push(check(`${tag} every project has a way in`, sections.links.length === 7 && sections.links.every((h) => h && h.startsWith('/')), sections.links.join(',')));
    results.push(check(`${tag} no "0n / 0n" counter in WORK`, sections.counters.length === 0, sections.counters.join(', ')));

    // 5b. The hand-off: where the star field lets go, WORK's own letters
    //     stand where the constellation drew them (utils/workStack.ts). The
    //     stylesheet repeats the stack's numbers; this holds them together.
    const stack = await page.evaluate(async () => {
      const work = document.querySelector('.anime-work');
      if (!work) return null;
      const top = work.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top + 2);
      await new Promise((r) => setTimeout(r, 700));
      window.scrollTo(0, top + 2);
      await new Promise((r) => setTimeout(r, 700));
      const w = innerWidth;
      const h = document.querySelector('.js-work-stage').clientHeight;
      const size = Math.min(190, Math.max(56, Math.min(0.19 * h, 0.3 * w)));
      const rowH = (h * 0.88) / 4;
      const off = [...document.querySelectorAll('.js-work-centre')].map((el, i) => {
        const r = el.getBoundingClientRect();
        return Math.round(Math.max(Math.abs(r.left + r.width / 2 - w / 2), Math.abs(r.top + r.height / 2 - (h * 0.06 + (i + 0.5) * rowH)), Math.abs(r.height - size)));
      });
      const shown = getComputedStyle(document.querySelector('.js-work-centre')).visibility;
      return { off, shown };
    });
    results.push(check(`${tag} WORK's letters stand where the constellation drew them`, !!stack && stack.off.length === 4 && stack.off.every((d) => d <= 3) && stack.shown === 'visible', stack ? `${stack.off.join('/')} px off, ${stack.shown}` : 'missing'));
    results.push(check(`${tag} every stop on the walk is dated`, sections.notes === 10 && sections.notes === sections.pins, `${sections.notes} stops, ${sections.pins} dated`));
    // The one entry whose role is still unconfirmed must not reach the page;
    // GDG and Rowerlab were confirmed by the owner on 2026-10-02.
    const leaked = sections.drafts.filter((t) => /STEP Academy/i.test(t));
    results.push(check(`${tag} unconfirmed entries stay off the walk`, leaked.length === 0, leaked.join(', ')));

    results.push(check(`${tag} no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | ')));

    // 5c. No machine numbering on the case pages (the owner, 2026-10-03),
    //     and the player on the SPOOT walk: it opens at its start point and
    //     seeks. Once per engine, at the desktop size. A clip's time ("0:00 /
    //     0:30") is not a counter, so a number next to a colon does not count.
    if (size === 'desktop') {
      for (const path of ['/work/touchpoint/', '/work/spoot/', '/work/zyp/', '/work/gdg/', '/work/remote-lab-vision/', '/projects/ams/', '/work/engineering-rocket/']) {
        await page.goto(BASE + path, { waitUntil: 'load' });
        const hits = await page.evaluate(() => (document.body.innerText.match(/Fig\.\s*\d+|(?<![:\d])0\d\s*\/\s*0?\d(?![:\d])/g) || []));
        results.push(check(`${tag} ${path} has no figure numbers or counters`, hits.length === 0, hits.slice(0, 3).join(', ')));
      }
      await page.goto(BASE + '/work/spoot/', { waitUntil: 'load' });
      const frame = page.locator('.js-player').filter({ has: page.locator('video[src*="walk"]') }).first();
      await frame.scrollIntoViewIfNeeded();
      const shownStart = await frame.locator('.js-player-time').textContent();
      results.push(check(`${tag} the walk's player shows its start point`, /^0:26 \//.test(shownStart || ''), shownStart));
      if (ename === 'chromium') {
        await frame.locator('.js-player-big').click();
        await page.waitForTimeout(1500);
        const played = await frame.evaluate((r) => r.querySelector('video').currentTime);
        results.push(check(`${tag} the walk plays from 0:26`, played >= 25.5, `at ${played.toFixed(2)} s`));
        // The bar rests while a clip plays; the pointer brings it up.
        await frame.hover();
        await page.waitForTimeout(400);
        const box = await frame.locator('.js-player-scrub').boundingBox();
        await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
        await page.waitForTimeout(500);
        const sought = await frame.evaluate((r) => r.querySelector('video').currentTime);
        results.push(check(`${tag} the seek bar seeks back`, sought > 8 && sought < 16, `at ${sought.toFixed(2)} s`));
      }
    }
    await ctx.close();
  }

  // 6. Reduced motion is an alternate ending, not a crash: the rocket rests at
  //    the start of its trail and the star field is simply there, in flow.
  //    353711e deleted the rocket's rest function and nothing here noticed;
  //    every controller on the page threw under the setting until the next
  //    visual pass ran with it on.
  {
    const tag = `${ename}/reduced`;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 140)); });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page
      .waitForFunction(() => !document.documentElement.classList.contains('is-scroll-blocked'), null, { timeout: 12000 })
      .catch(() => {});
    await page.waitForTimeout(800);

    const rest = await page.evaluate(() => {
      const craft = document.querySelector('.js-rocket-craft');
      const trail = document.querySelector('.js-rocket-trail');
      const section = document.querySelector('.rocket-flight');
      const space = document.querySelector('.space');
      if (!craft || !trail || !section || !space) return null;
      const box = section.getBoundingClientRect();
      const vb = trail.ownerSVGElement.viewBox.baseVal;
      const start = trail.getPointAtLength(0);
      const x = parseFloat(craft.style.getPropertyValue('--x'));
      const y = parseFloat(craft.style.getPropertyValue('--y'));
      const off = Math.round(Math.hypot((start.x * box.width) / vb.width - x, (start.y * box.height) / vb.height - y));
      const sp = space.getBoundingClientRect();
      const layers = [...document.querySelectorAll('.space__layer')].map((l) => getComputedStyle(l).opacity);
      return { off: Number.isFinite(off) ? off : 9999, gap: Math.round(sp.top - box.bottom), layers };
    });
    results.push(check(`${tag} the rocket rests at the start of its route`, !!rest && rest.off <= 6, rest ? `${rest.off} px off the start` : 'missing'));
    results.push(check(`${tag} the star field is simply there`, !!rest && rest.gap === 0 && rest.layers.length === 2 && rest.layers.every((o) => o === '1'), rest ? `gap ${rest.gap}px, opacity ${rest.layers.join('/')}` : 'missing'));
    results.push(check(`${tag} no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | ')));
    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'anime', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
