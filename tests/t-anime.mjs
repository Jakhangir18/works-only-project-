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
      // The name rides the arc as two words from opposite corners, so it is
      // two <text> nodes; read them in order and compare them as one line.
      const words = [...document.querySelectorAll('.anime-hero__headline text')];
      return {
        h1: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1')?.textContent?.trim() || '',
        headline: words.map((t) => t.textContent?.trim() || '').join(' ').trim(),
        cards: document.querySelectorAll('.anime-hero__screen').length,
        shots: [...document.querySelectorAll('.anime-hero__screen img')].map((i) => i.getAttribute('src')),
      };
    });
    results.push(check(`${tag} exactly one h1`, hero.h1 === 1, `${hero.h1}`));
    results.push(check(`${tag} the heading is the owner's name`, /jakhangir/i.test(hero.h1Text), hero.h1Text));
    // The drawn headline is decorative, but it must say the same thing as the
    // heading: a link preview and a screen reader should not disagree with the
    // page a sighted visitor sees.
    results.push(check(`${tag} the drawn headline matches the heading`, hero.headline.replace(/\s+/g, ' ').toLowerCase() === hero.h1Text.replace(/\s+/g, ' ').toLowerCase(), `${hero.headline} vs ${hero.h1Text}`));
    // The ring is concave, so only its far half is ever on screen; each
    // project sits on it twice to keep that half full. Fourteen cards, seven
    // distinct shots.
    results.push(check(`${tag} fourteen cards on the wheel`, hero.cards === 14, `${hero.cards} cards`));
    results.push(check(`${tag} seven distinct shots on the wheel`, new Set(hero.shots).size === 7, `${new Set(hero.shots).size} distinct`));

    // Every shot must actually resolve: a missing screenshot leaves a hole
    // where a project should be, and nothing else on the page would notice.
    const missing = [];
    for (const src of hero.shots) {
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

    // 5. The work panels and the timeline board.
    const sections = await page.evaluate(() => ({
      panels: document.querySelectorAll('.anime-work__panel').length,
      links: [...document.querySelectorAll('.anime-work__link')].map((a) => a.getAttribute('href')),
      notes: document.querySelectorAll('.board__note').length,
      pins: document.querySelectorAll('.board__pin').length,
      drafts: [...document.querySelectorAll('.board__name')].map((n) => n.textContent.trim()),
    }));
    results.push(check(`${tag} a panel for every project`, sections.panels === 7, `${sections.panels} panels`));
    results.push(check(`${tag} every panel has a way in`, sections.links.length === 7 && sections.links.every((h) => h && h.startsWith('/')), sections.links.join(',')));
    results.push(check(`${tag} the board is pinned`, sections.notes > 0 && sections.notes === sections.pins, `${sections.notes} notes, ${sections.pins} pins`));
    // The three entries whose roles are unconfirmed must not reach the page.
    const leaked = sections.drafts.filter((t) => /Google Developer Group|Reverlab|STEP Academy/i.test(t));
    results.push(check(`${tag} unconfirmed entries stay off the board`, leaked.length === 0, leaked.join(', ')));

    results.push(check(`${tag} no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | ')));
    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'anime', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
