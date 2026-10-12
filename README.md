# tynshimov.com

Source of my portfolio site, **https://www.tynshimov.com**.

![Home page of tynshimov.com](docs/media/og-home.jpg)

A static Astro site with scroll-driven animation: a Three.js dotted surface behind the hero, a 240-frame image sequence drawn to a canvas while the page scrolls, and a pinned "Work" section that opens into a stack of project cards. Each card leads to a case page under `/work/`.

The site comes with a Playwright performance harness that measures the production build. Every performance fix is recorded with before and after numbers in [PERF-NOTES.md](PERF-NOTES.md).

## Stack

- [Astro](https://astro.build) 5, static output, no UI framework islands; interactivity is plain TypeScript in component `<script>` tags
- GSAP and ScrollTrigger for the scroll timelines, Lenis for smooth scrolling
- Three.js for the hero background
- Sass for styles
- TypeScript, checked with `@astrojs/check`
- `playwright-core` for the performance and regression scripts
- Deployed on Vercel (`vercel.json` holds the redirects)

## Structure

```
src/
  pages/          index.astro, case pages in work/ and projects/ams/, robots.txt and sitemap.xml routes
  components/     page sections (hero, rocket sequence, Work section, timeline, contact)
  components/case/  building blocks for the case pages
  layouts/        CaseLayout.astro
  utils/          animation controllers (WorkSection, DiveTransition, RocketFlight, SmoothScroll, ...)
  data/           project, work-card and timeline content
  styles/         SCSS helpers, variables and global styles
public/           images, video and the frame sequence for the rocket section
perf/             performance harness and regression sweep
docs/             design plans, cross-browser audit, findings
PERF-NOTES.md     measurement log: baselines, kept changes, rejected hypotheses
```

## Run locally

Requires Node.js and npm.

```bash
npm install
npm run dev          # dev server on http://localhost:4321
```

Production build and preview:

```bash
npm run build        # writes dist/
npm run preview      # serves dist/ on :4321 (needs a build first)
```

Pass extra arguments after `--`, for example `npm run dev -- --port 4399`.

## Performance harness

The `perf:*` scripts measure a running production preview on port 4322, never the dev server:

```bash
npm run build && npm run preview -- --port 4322
```

Then, in a second terminal:

```bash
npm run perf:harness                       # frame timing, long tasks, forced reflows, heap and listener deltas
npm run perf:harness -- --cpu=4            # with 4x CPU throttling
npm run perf:harness -- --mobile           # 390 x 844 viewport
npm run perf:harness -- --dive-only --browser=webkit   # also: chromium (default), firefox
npm run perf:regression                    # routes, open/close/reopen, resize teardown, keyboard focus, reduced motion, first-load LCP/TBT
npm run perf:analyze -- <trace.json> [thresholdMs]     # classify a captured trace into gc/layout/style/paint/decode/script
```

- `perf/harness.mjs` scrolls the Work section open and closed three times, opens and closes the card-to-case transition five times and scrolls through the rocket sequence, recording per-frame timings for each phase. Results are written as JSON to `perf-results/` (gitignored).
- Chromium runs use the system Chrome (`channel: "chrome"`) and report the full set of metrics. Firefox and WebKit runs report frame timing only, because Playwright has no CDP session for them.
- Budgets the site is held to: median frame at most 16.7 ms, p95 at most 25 ms, no long tasks, flat heap after three interaction cycles, no listeners added per resize.

Example from [PERF-NOTES.md](PERF-NOTES.md), Work section opened and closed three times on desktop with 4x CPU throttling:

| Metric | Before | After |
|---|---|---|
| median frame | 25.7-26.2 ms | 13.3 ms |
| p95 frame | 40 ms | 14.3 ms |
| long tasks | ~20 | 0 |
| event listeners at load | 189 (+160 per resize) | 89 (+0 per resize) |

[PERF-NOTES.md](PERF-NOTES.md) lists each change with the metric it moved, and the changes that were measured and reverted. Cross-browser findings are in [docs/cross-browser-audit.md](docs/cross-browser-audit.md).

## Deploy

The site is deployed on Vercel. `astro.config.mjs` takes the canonical site URL from the Vercel environment, or from `SITE_URL` when it is set; `vercel.json` redirects the old `works-only-project.vercel.app` address to www.tynshimov.com.
