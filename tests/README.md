# Regression suite

Six suites, run against a **production build** being served — never the dev
server.

```bash
npm run build
tmux new -d -s preview 'cd dist && exec python3 -m http.server 4347 --bind 127.0.0.1'
SITE=http://127.0.0.1:4347 npm test
```

Playwright is deliberately not a dependency of this site. The runner links one
in: it defaults to `~/work/Personal-Website/repo/audit/node_modules` and reads
`PLAYWRIGHT_HOME` when that is somewhere else. That install needs chromium,
webkit **and** firefox — `npx playwright install firefox` if firefox is
missing, or the route suite reports a launch failure instead of skipping.

| Suite | What it holds the site to |
|---|---|
| `t-routes` | Every route in three engines at two sizes: 200, no console errors, no failed requests, one `h1`, one `main`, no sideways scroll, every visible image decoded, sized and captioned |
| `t-a11y` | axe with zero serious, critical **or moderate** violations on every route; every control reachable by keyboard with a visible focus ring |
| `t-hero` | The rolling titles cycle, never show two current items, pause off screen, resume, stay still under reduced motion, and fit the mask from 320 px to 2560 px |
| `t-work` | The tunnel pins, seven cards render, the keyboard project list is complete, the point grid draws through the scrub, and covers arrive **before** the scrub rather than during it |
| `t-dive` | A card opens the dive, the teaser and close control appear, compositing hints are released, exactly one prefetch goes out and is dropped on close, scroll is locked then restored, and four cycles add no nodes |
| `t-rocket` | Only the first frame is on the critical path, the rest arrive on idle or first scroll, the sequence scrubs through distinct frames, and the canvas never goes blank on a 400 KB/s link |
| `t-timeline` | Seven live entries and no drafts, machine-readable dates, years newest first, the sticky year survives its ancestors and holds while its group scrolls, every link resolves, reduced motion shows everything, and nothing overflows at six widths |

A failure prints the check name and the evidence. `SITE` defaults to
`http://127.0.0.1:4347`.

## Why the suites assert what they assert

Each of these caught something real:

- **images sized** — 11 MB of unsized JPEG on the AMS page, LCP 29.3 s.
- **one `h1` / one `main`** — the page had two `h1` and no landmark at all.
- **focus ring** — the global reset removed every outline on the site.
- **covers before the scrub** — `loading="lazy"` beat the pre-warm, so covers
  landed one per ~1.8 s *during* the animation.
- **sticky year holds** — `overflow-x: hidden` on `body` made the Timeline's
  year marker stick to the body instead of the viewport.
- **no console errors in firefox** — Three.js logged a WebGL failure on any
  machine without a usable context.
