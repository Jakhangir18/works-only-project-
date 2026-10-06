// The light home page: it opens, the wheel turns, the rocket rides its own
// route, the work panels are reachable and the timeline board is pinned.
//
// The tunnel-era suites moved to /tunnel/ when this page took over `/`. This
// one is about what replaced them.
import { chromium, webkit } from 'playwright';
import { createRequire } from 'node:module';
const sharp = createRequire(new URL('../package.json', import.meta.url))('sharp');

/* The letters on a screenshot: runs of rows with bright ink (the letters are
   #fff2ed on near-black; the dimmed star field stays far below the bar),
   each with its left and right ink edge. */
async function inkRowsOf(png) {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  const runs = [];
  let cur = null;
  for (let y = 0; y < info.height; y++) {
    let l = -1;
    let r = -1;
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 200) {
        if (l < 0) l = x;
        r = x;
      }
    }
    if (l >= 0) {
      if (cur && y - cur.bottom <= 2) {
        cur.bottom = y;
        cur.left = Math.min(cur.left, l);
        cur.right = Math.max(cur.right, r);
      } else {
        cur = { top: y, bottom: y, left: l, right: r };
        runs.push(cur);
      }
    }
  }
  return runs.filter((r) => r.bottom - r.top > 10);
}
import { BASE, check, summarize, workBox } from './lib.mjs';

/* A navigation, tried twice: headless WebKit on this host once answered a
   same-page goto with "WebKit encountered an internal error" while the Zyp
   page's frames were still in flight (2026-10-06, the last full run), and
   an uncaught goto takes the whole suite down with it. The second try is
   the test; the first failure is logged in the check's detail. */
async function visit(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load' });
    return '';
  } catch (first) {
    await page.waitForTimeout(1500);
    await page.goto(url, { waitUntil: 'load' });
    return `first try: ${String(first).split('\n')[0].slice(0, 80)}`;
  }
}

const results = [];

// WebKit reports a same-origin load that a navigation cancelled as a page
// error, even when the page's own code catches the rejection: "Fetch API
// cannot load <url> due to access control checks" for a fetch, and "Cannot
// load blob:<url> ..." for the blob createImageBitmap decodes from. The Zyp
// case page fetches and decodes its frames ahead of the scroll, and this
// suite leaves it with frames in flight. Same origin cannot fail an access
// control check, so this is the engine's own cancellation, like the aborts
// tests/lib.mjs ignores. WebKit mangles the scheme in the message ("http:
// /host", "blob: ttp://host"), so only the host is compared.
const host = new URL(BASE).host.replace(/[.]/g, '\\.');
const sameOriginLoad = new RegExp(`^(blob:)?h?ttps?:/{1,2}${host}/`);
const cancelledFetch = (text) => {
  const m = /^(?:Fetch API cannot load|Cannot load) (.+?) due to access control checks/.exec(text.trim());
  return !!m && sameOriginLoad.test(m[1].replace(/\s+/g, ''));
};

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
    page.on('pageerror', (e) => { if (!cancelledFetch(String(e))) errors.push(String(e).slice(0, 140)); });
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !cancelledFetch(m.text())) errors.push(m.text().slice(0, 140)); });

    await visit(page, BASE + '/');

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
    // project sits on it twice to keep that half full. Sixteen cards, eight
    // distinct shots (Usher joined on 2026-10-06).
    results.push(check(`${tag} sixteen cards on the wheel`, hero.cards === 16, `${hero.cards} cards`));
    results.push(check(`${tag} eight distinct shots on the wheel`, new Set(hero.shots).size === 8, `${new Set(hero.shots).size} distinct`));
    // Every card carries its pre-blurred twin, the same project's shot.
    results.push(check(`${tag} every card has its blurred twin`, hero.twins.length === 16 && hero.twins.every((src, i) => src === hero.shots[i].replace('.webp', '-blur.webp')), `${hero.twins.length} twins`));

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

    // 4c. Past the crash the page is never a blank or a flat-grey rest state:
    // the black plays in with the crash and stays, and the stars come in on
    // it. 2026-10-06: at 390x844 a reader who stopped between the bento and
    // the stars saw a white screen, then a grey one. Sampled on the runway's
    // own progress r (its top entering at the bottom of the screen = 0, its
    // bottom reaching the bottom = 1), from just past the impact to the star
    // field: a frame is "flat" when a 48 px wide copy has fewer than two
    // pixels off its median; flat black is space.
    // The screen at a scroll position, as grey pixels (optionally shrunk).
    const greyAt = async (y, waitMs, width) => {
      await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
      await page.waitForTimeout(waitMs);
      const img = sharp(await page.screenshot());
      return (width ? img.resize(width, null) : img).greyscale().raw().toBuffer({ resolveWithObject: true });
    };
    const runway = flight;
    if (runway) {
      const flat = [];
      for (let r = 0.58; r <= 1.3; r += 0.08) {
        const { data } = await greyAt(runway.top - h + r * runway.height, 700, 48);
        const sorted = [...data].sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        const drawn = data.filter((v) => Math.abs(v - median) > 24).length;
        if (drawn < 2 && median > 40) flat.push(`r=${r.toFixed(2)} median ${median}`);
      }
      results.push(check(`${tag} no blank or flat-grey rest state after the crash`, flat.length === 0, flat.join('; ') || 'stars or black at every sample'));

      // The black plays in time: rest above the impact, cross it, and the
      // screen is black within a second; go back above it, and the page is
      // back. (The first in-time version put the black in the crash's
      // timeline, whose pause(0) re-rendered it to 0 at once.)
      const medianOf = (d) => [...d].sort((a, b) => a - b)[d.length >> 1];
      await greyAt(runway.top - h + 0.5 * runway.height, 500, 48);
      // The crash's flash fades over the first 1.1 s and leaves the black a
      // little warm until then (a median of about 50 at 1 s in Chromium), so
      // the sample waits the crash out.
      const { data: crossed } = await greyAt(runway.top - h + 0.6 * runway.height, 1700, 48);
      const { data: back } = await greyAt(runway.top - h + 0.5 * runway.height, 1000, 48);
      results.push(check(`${tag} the black plays in on the crossing and out on the way back`, medianOf(crossed) < 60 && medianOf(back) > 200, `crossed ${medianOf(crossed)}, back ${medianOf(back)}`));
    }

    // 5. WORK (the letter tunnel, as on /tunnel/) and the timeline walk.
    const CASES = ['/work/usher/', '/work/touchpoint/', '/work/spoot/', '/work/zyp/', '/work/gdg/', '/work/remote-lab-vision/', '/projects/ams/', '/work/engineering-rocket/'];
    const sections = await page.evaluate(() => ({
      section: !!document.querySelector('section#work.s-work.s-work--home'),
      cards: [...document.querySelectorAll('#work a-work a[href]')].map((a) => a.getAttribute('href')),
      listed: [...document.querySelectorAll('#work nav.s__index a')].map((a) => a.getAttribute('href')),
      counters: (document.querySelector('#work')?.textContent || '').match(/(?<![:\d])#?0\d\s*\/\s*0?\d(?![:\d])/g) || [],
      notes: document.querySelectorAll('.paradise__stop').length,
      pins: document.querySelectorAll('.paradise__stop time[datetime]').length,
      drafts: [...document.querySelectorAll('.paradise__name')].map((n) => n.textContent.trim()),
    }));
    const sameSet = (list) => list.length === CASES.length && [...list].sort().join() === [...CASES].sort().join();
    results.push(check(`${tag} WORK is the letter tunnel section`, sections.section, 'no section#work.s-work.s-work--home'));
    results.push(check(`${tag} eight cards link to the eight case pages`, sameSet(sections.cards), sections.cards.join(',')));
    results.push(check(`${tag} the keyboard route lists the eight case pages`, sameSet(sections.listed), sections.listed.join(',')));
    results.push(check(`${tag} no "0n / 0n" counter in WORK`, sections.counters.length === 0, sections.counters.join(', ')));

    // 5b. The dissolve: between the last card's hold and the descent the
    // screen is never empty. 2026-10-06: at rest it read as a lattice of
    // dots, because the star field was two tiles. Ten positions across the
    // home-only segment (the section's last screen before it lets go): at
    // each, something bright is drawn: the letters, the dust or the stars.
    const workBoxNow = await workBox(page);
    const workEnd = workBoxNow ? workBoxNow.top + workBoxNow.height : null;
    if (workEnd) {
      const empty = [];
      for (let i = 0; i <= 10; i++) {
        const { data, info } = await greyAt(workEnd - 2 * h + (i / 10) * h, 900);
        let bright = 0;
        for (let k = 0; k < data.length; k += 3) if (data[k] > 90) bright++;
        if (bright < 30) empty.push(`${(i / 10).toFixed(1)}: ${bright} bright px of ${Math.round(info.width * info.height / 3)}`);
      }
      results.push(check(`${tag} the dissolve draws something at every position`, empty.length === 0, empty.join('; ') || 'letters, dust or stars at all 11'));
    }

    // 5b. The hand-off, by pixels: the last frame the star field draws (its
    //     canvas letters) and the first frame WORK shows (its own DOM
    //     letters, the tunnel's ghost letters) must put the four letters on the same pixels. Measured on
    //     screenshots, not from either side's formula.
    const hand = await page.evaluate(() => {
      const work = document.querySelector('#work');
      if (!work) return null;
      // The star field lets go where WORK's top reaches the viewport top.
      return { end: Math.round(work.getBoundingClientRect().top + scrollY), w: innerWidth, h: innerHeight };
    });
    let handOff = null;
    let afterOn = null;
    if (hand) {
      const shotAt = async (y) => {
        for (let i = 0; i < 2; i++) {
          await page.evaluate((y) => window.scrollTo(0, y), y);
          await page.waitForTimeout(700);
        }
        return page.screenshot({ clip: { x: Math.round(hand.w / 2 - 140), y: 0, width: 280, height: hand.h } });
      };
      const before = await inkRowsOf(await shotAt(hand.end - 3));
      const after = await inkRowsOf(await shotAt(hand.end + 3));
      afterOn = await page.evaluate(() => document.querySelector('#work')?.classList.contains('is-on'));
      const off = before.length === after.length ? before.map((b, i) => Math.max(...['top', 'bottom', 'left', 'right'].map((k) => Math.abs(b[k] - after[i][k])))) : null;
      handOff = { before: before.length, after: after.length, off };
    }
    results.push(check(`${tag} WORK's letters land on the constellation's pixels`, !!handOff && handOff.before === 4 && handOff.after === 4 && handOff.off.every((d) => d <= 3), handOff ? `${handOff.before} then ${handOff.after} letters, ${handOff.off ? handOff.off.join('/') + ' px' : 'unmatched'}` : 'missing'));
    results.push(check(`${tag} the tunnel shows its own letters after the hand-off (is-on)`, afterOn === true, `is-on=${afterOn}`));
    // Eleven stops since Usher joined the walk (2026-10-06); pinned like t-timeline's count.
    results.push(check(`${tag} every stop on the walk is dated`, sections.notes === 11 && sections.notes === sections.pins, `${sections.notes} stops, ${sections.pins} dated`));
    // The one entry whose role is still unconfirmed must not reach the page;
    // GDG and Rowerlab were confirmed by the owner on 2026-10-02.
    const leaked = sections.drafts.filter((t) => /STEP Academy/i.test(t));
    results.push(check(`${tag} unconfirmed entries stay off the walk`, leaked.length === 0, leaked.join(', ')));

    // 5c. No machine numbering on the case pages (the owner, 2026-10-03),
    //     and the player on the SPOOT walk: it opens at its start point and
    //     seeks. Once per engine, at the desktop size. A clip's time ("0:00 /
    //     0:30") is not a counter, so a number next to a colon does not count.
    if (size === 'desktop') {
      for (const path of CASES) {
        const retried = await visit(page, BASE + path);
        if (retried) results.push(check(`${tag} ${path} loaded on the second try`, true, retried));
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
    // After the case pages too, which the page's listeners have been hearing.
    results.push(check(`${tag} no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | ')));
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
    page.on('pageerror', (e) => { if (!cancelledFetch(String(e))) errors.push(String(e).slice(0, 140)); });
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text()) && !cancelledFetch(m.text())) errors.push(m.text().slice(0, 140)); });
    await visit(page, BASE + '/');
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
    const redWork = await page.evaluate(() => ({
      cards: document.querySelectorAll('#work a-work a[href]').length,
      on: document.querySelector('#work')?.classList.contains('is-on'),
    }));
    results.push(check(`${tag} WORK is there without the star field's hand-off`, redWork.cards === 8 && !redWork.on, `${redWork.cards} cards, is-on=${redWork.on}`));
    results.push(check(`${tag} no runtime errors`, errors.length === 0, errors.slice(0, 2).join(' | ')));
    await ctx.close();
  }
  await browser.close();
}

const s = summarize(results);
console.log(JSON.stringify({ suite: 'anime', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
