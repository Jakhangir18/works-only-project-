// The rocket sequence: its 240 frames stay off the critical path, it still
// scrubs, and it never shows a blank canvas — including on a slow link.
import { chromium } from 'playwright';
import { BASE, check, summarize } from './lib.mjs';

const results = [];
const browser = await chromium.launch();

// 1. No frame is requested before the load event.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const frames = [];
  page.on('request', (r) => { if (/ezgif-frame/.test(r.url())) frames.push(r.url()); });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  const atLoad = frames.length;
  const onlyFirst = frames.every((u) => /frame-001\./.test(u));
  const atLoadStats = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    return {
      frames: res.filter((r) => /ezgif-frame/.test(r.name)).length,
      kb: Math.round(res.reduce((n, r) => n + (r.transferSize || 0), 0) / 1024),
    };
  });
  await page.waitForTimeout(4000);
  // Frame 001 is deliberately fetched at once so the section is never blank
  // when it first appears; the other 239 must wait for idle or a scroll.
  results.push(check('rocket: only the first frame is on the critical path', atLoad <= 1 && onlyFirst, `${atLoad} frames at load: ${frames.map((u) => u.split('/').pop()).join(',')}`));
  // The whole set is 240 files; a handful may slip in when idle fires before
  // the load event on a fast machine. Anything near the full set means the
  // deferral broke.
  results.push(check('rocket: the set is not on the critical path', atLoadStats.frames <= 6, `${atLoadStats.frames} frames by load`));
  results.push(check('rocket: critical path stays under 1 MB', atLoadStats.kb < 1024, `${atLoadStats.kb} KB by load`));
  results.push(check('rocket: the set does load once idle', frames.length >= 200, `${frames.length} frames after idle`));
  await ctx.close();
}

// 2. It scrubs: distinct frames render as the section passes.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const story = await page.evaluate(() => {
    const s = document.querySelector('.js-rocket-story');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  results.push(check('rocket: the story section exists', !!story, 'missing'));
  if (story) {
    const lits = [];
    for (let i = 0; i <= 12; i++) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), story.top + (story.height - 900) * i / 12);
      await page.waitForTimeout(260);
      lits.push(await page.evaluate(() => {
        const c = document.querySelector('.js-rocket-canvas');
        if (!c || !c.width) return 0;
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let k = 0; k < d.length; k += 4 * 307) if (d[k] + d[k + 1] + d[k + 2] > 30) lit++;
        return lit;
      }));
    }
    const drawn = lits.filter((n) => n > 0).length;
    results.push(check('rocket: frames render through the section', drawn >= 5, `${drawn}/13 samples drew`));
    results.push(check('rocket: the frame changes as you scroll', new Set(lits.filter(Boolean)).size >= 3, lits.join(',')));
  }
  await ctx.close();
}

// 3. On a slow link the canvas must not stay blank: a frame that arrives late
//    still gets drawn.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 400 * 1024, uploadThroughput: 200 * 1024,
  });
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(5500);
  const story = await page.evaluate(() => {
    const s = document.querySelector('.js-rocket-story');
    const r = s.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  let blank = 0;
  const samples = 14;
  for (let i = 0; i < samples; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), story.top + (story.height - 900) * i / (samples - 1));
    await page.waitForTimeout(320);
    const lit = await page.evaluate(() => {
      const c = document.querySelector('.js-rocket-canvas');
      if (!c || !c.width) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 4 * 307) if (d[k] + d[k + 1] + d[k + 2] > 30) n++;
      return n;
    });
    if (lit < 3) blank++;
  }
  results.push(check('rocket: never blank on a 400 KB/s link', blank <= 2, `${blank}/${samples} blank samples`));
  await ctx.close();
}

// 4. A resize mid-story must not send the rocket back to its start pose.
//    TransitionVideo re-inits the motion controller on a 200 ms resize
//    debounce, 200 ms after the story section's own handler has already run,
//    so nothing downstream can repair a reset — and a resize that produces no
//    follow-on scroll event leaves the wrong pose on screen indefinitely.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  const story = await page.evaluate(() => {
    const s = document.querySelector('.js-rocket-story');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { top: r.top + window.scrollY, height: r.height };
  });
  if (story) {
    const pose = () => page.evaluate(() => {
      const el = document.querySelector('.js-rocket-container');
      return el ? getComputedStyle(el).transform : null;
    });
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), story.top + (story.height - 800) * 0.45);
    await page.waitForTimeout(700);
    const before = await pose();
    // Bare resize events: no viewport change, so nothing produces the stray
    // scroll that repaired this by accident in some runs. Five of them,
    // because whether the story section's rAF lands before or after the
    // 200 ms re-init is a race — the defect showed in 3 of 5 sampled runs.
    const after = [];
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(500);
      after.push(await pose());
    }
    const startPose = await page.evaluate(() => {
      window.updateRocketMotion?.(0);
      const el = document.querySelector('.js-rocket-container');
      return el ? getComputedStyle(el).transform : null;
    });
    const drifted = after.filter((p) => p !== before);
    results.push(check('rocket: mid-story pose is not the start pose', !!before && before !== startPose, `${before} vs start ${startPose}`));
    results.push(check('rocket: a resize does not snap the pose back to the start', drifted.length === 0, `${drifted.length}/5 resizes moved it: ${drifted[0] || 'none'}`));
  }
  await ctx.close();
}

await browser.close();
const s = summarize(results);
console.log(JSON.stringify({ suite: 'rocket', ...s }, null, 1));
process.exit(s.failed ? 1 : 0);
