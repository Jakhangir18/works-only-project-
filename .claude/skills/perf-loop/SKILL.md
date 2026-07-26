---
name: perf-loop
description: Closed-loop performance debugging and verification for web front-ends — 3D/WebGL scenes, scroll-driven animations, image-sequence effects, expanding/rotating UI. Use this skill whenever the user reports jank, stutter, lag, freezing, dropped frames, slow scroll, or "the animation feels heavy", and also whenever they ask to "check the whole site", "make sure there are no bugs", "remove unnecessary code", or confirm that a fix actually worked. Do not skip this skill because a fix looks obvious — its entire purpose is that fixes are proven with measurements instead of declared done.
---

# Perf Loop

## The one rule

A performance fix is finished when a **measurement** says so, not when the code looks better.

Never write "this should feel smoother now." Either you have a before-number and an after-number for the exact interaction the user complained about, or the loop has not finished. If you cannot measure something, say so out loud instead of guessing — an honest "I couldn't measure this" is far more useful than a confident guess that turns out wrong.

## Loop shape

```
inventory → harness → baseline → hypotheses
      ↓                              ↓
      └── regression sweep ← fix ONE thing ← re-measure ← keep or revert
```

Each pass through the loop changes **exactly one thing**. Multiple simultaneous changes make it impossible to know what helped, and a change that made things worse hides behind one that helped.

---

## Phase 0 — Inventory (read only, change nothing)

Before touching anything, build a map and write it to `PERF-NOTES.md` in the repo root:

1. Framework, bundler, and versions (read `package.json`, lockfile, config files).
2. Every animation system in the project and the files it lives in — WebGL/Three.js/R3F, GSAP/ScrollTrigger, Framer Motion, Lenis/smooth-scroll, CSS transitions/keyframes, raw `requestAnimationFrame` loops, `IntersectionObserver`, scroll/resize/pointer listeners.
3. **Count the render loops.** How many independent `requestAnimationFrame` loops exist? More than one is a common cause of jank. Note which loop drives which effect.
4. Every asset the animations depend on: image sequences (count frames, total bytes, dimensions), 3D models, textures, fonts, video.
5. The specific components behind the interaction the user described.

State clearly what you found *before* proposing anything.

## Phase 1 — Build the harness (do this before any fix)

Measure the **production build**, not the dev server. Dev builds carry HMR, source maps, and un-minified React — they lie about performance in both directions.

```bash
<build command>   # e.g. npm run build
<start command>   # e.g. npm run start / npx serve dist
```

Then write a repeatable measurement script (Playwright preferred; install it if absent) that:

- opens the production URL,
- runs the **exact interaction the user complained about** — click the element, scroll through the animated section at a fixed speed, resize, repeat 3×,
- samples frame timing via `requestAnimationFrame` deltas,
- records long tasks via `PerformanceObserver` (`longtask`),
- records JS heap size before and after 3 open/close cycles,
- collects console errors and warnings,
- prints a JSON summary and appends it to `perf-results/<timestamp>.json`.

Report these numbers every time:

| Metric | Budget |
|---|---|
| median frame time | ≤ 16.7 ms (60 fps) |
| p95 frame time | ≤ 25 ms |
| worst single frame | ≤ 50 ms |
| long tasks (> 50 ms) during the interaction | 0 |
| INP on the interaction | < 200 ms |
| heap growth after 3 open/close cycles | flat within noise (a rising line means a leak) |
| console errors / warnings | 0 |

Also run once with **CPU throttled 4×** and once at a **390 × 844 viewport**. Jank that only appears on a mid-range phone is still jank, and it is where most visitors live.

## Phase 2 — Baseline

Run the harness on the untouched code. Save the numbers. Everything after this is compared against them. Do not start fixing before a baseline exists — without it there is no way to prove anything, and no way to notice that a "fix" made things worse.

## Phase 3 — Hypotheses, ranked

Write a ranked list of suspected causes with the evidence for each, then work down it. Consult `references/common-causes.md` for the usual suspects in 3D + scroll-animation projects.

Rank by (expected win) ÷ (risk of breaking something). Cheap, reversible, high-impact first.

## Phase 4 — The loop itself

For each hypothesis, in order:

1. State the hypothesis and the number you expect to move.
2. Make **one** change. Nothing else — no drive-by refactors, no renaming, no reformatting.
3. Rebuild, rerun the harness.
4. Compare against the previous run.
   - **Improved** — keep it, commit alone with a message that names the metric and the delta (`perf(work-carousel): decode WebP frames off main thread — p95 42ms → 18ms`).
   - **No change or worse** — `git revert` / restore, mark the hypothesis dead in `PERF-NOTES.md`, move on. A change that doesn't help is not neutral; it is extra code to maintain.
5. Repeat until every budget in Phase 1 is met.

**Stop condition.** If three hypotheses in a row fail to move the numbers, stop looping. Report what was tried, what the profile actually shows, and ask the user which direction to take. Grinding through a fourth guess wastes their time and yours — the loop is meant to converge, not to run forever.

## Phase 5 — Regression sweep

Only after the budgets are met. Verify and report each item:

- Every route loads; no console errors or warnings.
- The animated interaction works forward *and* backward (open → close → open, scroll down → up → down).
- Fast repeated triggering doesn't break state or stack timelines.
- Resize and orientation change don't corrupt layout or the 3D scene.
- Mobile viewport + touch input.
- Keyboard focus reaches interactive elements; `prefers-reduced-motion` is respected.
- Unmount/route-change disposes what it created — geometries, materials, textures, GSAP timelines, `ScrollTrigger` instances, event listeners, observers, rAF handles. Leaks show up as heap growth, so re-run that check.
- First-load numbers didn't regress: bundle size, LCP, TBT.

## Phase 6 — Dead code

Only remove what is **proven** unused — via a tool (`knip`, `ts-prune`, `depcheck`) or by tracing references — never by eye, and never in the same commit as a perf fix. Delete in one separate commit, then run the full regression sweep again. Anything ambiguous gets listed in `PERF-NOTES.md` for the user to decide, not deleted.

## Phase 7 — Report

```markdown
## What was wrong
[root cause in plain language, one paragraph, with the profile evidence that shows it]

## Metrics
| Metric | Before | After | Budget |

## Changes (one commit each)
| Commit | File(s) | What it does | Metric moved |

## Tried and reverted
[hypothesis → what the numbers said → why it was dropped]

## Still open / needs your call
[anything unresolved — say it plainly, don't bury it]
```

---

## Boundaries

These exist so the user can trust the diff without reading every line:

- **One change per commit.** Never mix a perf fix with formatting, renaming, or dead-code removal.
- **Formatting means formatting.** If asked to reformat, change whitespace and layout only — no logic edits, no renamed variables.
- **Never "fix" performance by removing the feature.** Reducing the animation to nothing hits every budget and solves nothing. If a feature genuinely cannot hit budget, say that and present the trade-offs.
- **Don't touch code outside the diagnosed path** without saying why first.
- **No dependency upgrades or framework migrations** as a perf fix unless the user agrees first.
- **No `git push --force`, no committing to `main` directly** unless the user asks. Work on a branch.
- **Report honestly.** If a budget is still missed, the report says so in the top section, not in a footnote.
