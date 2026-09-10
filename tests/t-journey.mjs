// Journeys a visitor actually makes: tapping a card on a phone, following a
// project link and coming back, and moving through the site by keyboard only.
import { chromium, devices } from 'playwright';
import { BASE, check, summarize, workBox, findCardInView } from './lib.mjs';

const results = [];
const browser = await chromium.launch();

// 1. Touch: tapping a card in the tunnel must reach the project.
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6500);
  const box = await workBox(page);
  const href = await findCardInView(page, box);
  results.push(check('touch: a card is reachable on a phone', !!href, href || 'none'));
  if (href) {
    await page.evaluate(() => window.__card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    await page.waitForTimeout(2600);
    const state = await page.evaluate(() => ({
      dive: document.querySelector('.dive')?.classList.contains('is-open'),
      url: location.pathname,
    }));
    // Either the dive opened or the browser navigated; both are a working tap.
    results.push(check('touch: tapping a card does something', state.dive === true || state.url === href, JSON.stringify(state)));
    if (state.dive) {
      const cta = await page.evaluate(() => {
        const a = document.querySelector('.dive__teaser a[href], .dive a[href]');
        return a ? a.getAttribute('href') : null;
      });
      results.push(check('touch: the open dive offers a way into the project', !!cta, String(cta)));
    }
  }
  results.push(check('touch: no runtime errors', errors.length === 0, errors.slice(0, 2).join(' | ')));
  await ctx.close();
}

// 2. Going to a project and coming back must land where you left.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6500);
  const box = await workBox(page);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), box.top + 1200);
  await page.waitForTimeout(600);

  await page.goto(BASE + '/work/touchpoint/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const back = await page.evaluate(() => {
    const a = document.getElementById('js-back-to-works');
    if (!a) return null;
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  results.push(check('return: the project page has a way back', back === true, 'no back control'));
  if (back) {
    await page.waitForURL(BASE + '/', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const landed = await page.evaluate(() => ({
      y: window.scrollY,
      inWork: (() => {
        const s = document.querySelector('.s-work');
        if (!s) return false;
        const r = s.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      })(),
      loaderGone: !document.querySelector('.js-site-loader'),
      visible: getComputedStyle(document.querySelector('.js-site-wrapper')).opacity === '1',
    }));
    results.push(check('return: lands in the Work section, not at the top', landed.inWork, `scrollY ${landed.y}`));
    results.push(check('return: the loader does not play again', landed.loaderGone, 'loader still present'));
    results.push(check('return: the page is visible', landed.visible, 'wrapper still transparent'));

    // The hero field is torn down on pagehide. Whether the browser reloads the
    // page or restores it from the back/forward cache, the visitor must come
    // back to a hero that still has one.
    await page.waitForTimeout(3500);
    const field = await page.evaluate(() => {
      const host = document.querySelector('[data-dotted-surface]');
      const canvas = host?.querySelector('canvas');
      return { host: !!host, canvas: !!canvas, w: canvas?.width || 0 };
    });
    results.push(check('return: the hero field is back after a back navigation', field.host && field.canvas && field.w > 0, JSON.stringify(field)));

    // No engine here produces a real back/forward restore — all three report
    // persisted false — so the freeze branch is driven directly. A frozen page
    // must keep its canvas: the old teardown destroyed the renderer on both
    // kinds of pagehide and left the hero empty for the rest of the visit.
    // This assertion fails against that teardown.
    //
    // Whether the restored field is actually drawing again is not asserted
    // here and cannot honestly be: a WebGL canvas cannot be read back from
    // outside its own render call without preserveDrawingBuffer, and the
    // animation-frame rate on this page has a floor from other systems that
    // swamps the difference. That half is on the owner's iPhone gate.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const frozen = await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      const canvas = document.querySelector('[data-dotted-surface] canvas');
      return { canvas: !!canvas, w: canvas?.width || 0 };
    });
    results.push(check('return: a freeze keeps the hero field', frozen.canvas && frozen.w > 0, JSON.stringify(frozen)));

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await page.waitForTimeout(800);
    const restored = await page.evaluate(() => {
      const canvas = document.querySelector('[data-dotted-surface] canvas');
      if (!canvas) return { canvas: false };
      const ctx = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return { canvas: true, w: canvas.width, lost: ctx ? ctx.isContextLost() : 'no context' };
    });
    results.push(check('return: a restore leaves a live context on the hero field', restored.canvas && restored.w > 0 && restored.lost === false, JSON.stringify(restored)));

    // A lost GPU context is what a freeze most often costs on iOS. Rendering
    // into one produces a warning every frame and no pixels, so the loss has
    // to be caught and the loop stopped; preventDefault on it is also what
    // makes a restore possible at all. Driven here with WEBGL_lose_context.
    const glErrors = [];
    const onConsole = (m) => { if (m.type() === 'error' || m.type() === 'warning') glErrors.push(m.text().slice(0, 120)); };
    page.on('console', onConsole);
    const lost = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-dotted-surface] canvas');
      if (!canvas) return { canvas: false };
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_lose_context');
      if (!ext) return { canvas: true, ext: false };
      ext.loseContext();
      await new Promise((r) => setTimeout(r, 600));
      const wasLost = gl.isContextLost();
      ext.restoreContext();
      await new Promise((r) => setTimeout(r, 900));
      return { canvas: true, ext: true, wasLost, stillLost: gl.isContextLost() };
    });
    await page.waitForTimeout(600);
    page.off('console', onConsole);
    if (lost.ext) {
      results.push(check('return: a lost context is actually lost, then restored', lost.wasLost === true && lost.stillLost === false, JSON.stringify(lost)));
      results.push(check('return: losing the context does not spam the console', glErrors.length === 0, glErrors.slice(0, 2).join(' | ')));
    } else {
      results.push(check('return: WEBGL_lose_context is available to drive the test', false, JSON.stringify(lost)));
    }

    // Two real unloads in a row. destroy() removes the renderer's canvas from
    // its container, which throws NotFoundError the second time unless it
    // refuses to run twice — and the pagehide listener is no longer once-only.
    const twice = await page.evaluate(async () => {
      const canvasBefore = !!document.querySelector('[data-dotted-surface] canvas');
      const errors = [];
      const onError = (e) => errors.push(String(e.message || e.error));
      window.addEventListener('error', onError);
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      // An engine that reports a listener exception on a queued task rather
      // than synchronously would otherwise be read before it had spoken.
      await new Promise((r) => setTimeout(r, 0));
      window.removeEventListener('error', onError);
      return { canvasBefore, errors };
    });
    // Without this the check passes vacuously wherever WebGL is unavailable:
    // mount() returns before building anything and destroy() never runs.
    results.push(check('return: the field was mounted before the unload test', twice.canvasBefore, 'no canvas to tear down'));
    results.push(check('return: a second unload does not throw out of the teardown', twice.errors.length === 0, twice.errors.join(' | ')));
  }
  await ctx.close();
}

// 3. Keyboard only: reach a project from the home page and come back.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6500);
  let reachedProject = null;
  for (let i = 0; i < 30 && !reachedProject; i++) {
    await page.keyboard.press('Tab');
    const href = await page.evaluate(() => document.activeElement?.getAttribute('href') || null);
    if (href && /^\/(work|projects)\//.test(href)) reachedProject = href;
  }
  results.push(check('keyboard: a project link is reachable by tabbing', !!reachedProject, reachedProject || 'not reached in 30 tabs'));
  if (reachedProject) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    const url = await page.evaluate(() => location.pathname);
    // Compare without the trailing slash: the served page is canonical with
    // one, and a link may be written either way.
    const norm = (u) => u.replace(/\/$/, '');
    const arrived = norm(url) === norm(reachedProject) || (await page.evaluate(() => document.querySelector('.dive')?.classList.contains('is-open'))) === true;
    results.push(check('keyboard: Enter follows the project link', arrived, `at ${url}`));
  }
  await ctx.close();
}

await browser.close();
const s = summarize(results);
console.log(JSON.stringify({ suite: 'journey', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
