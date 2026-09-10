# Task log

## 2026-09-09 23:23 | Minimal redesign: heavy systems removed, new home (hero, work list with hover preview, about, contact), 3 project pages with real media, code-review findings fixed, branch pushed, preview on :8447
- files: src/pages/index.astro, src/pages/work/[slug].astro, src/components/WorkList.astro, src/scripts/follower.ts, src/scripts/reveal.ts, scripts/media.mjs, src/content.config.ts
- git: redesign/minimal@7ae78db
- next: Rerun QA + Lighthouse on a quiet host (F10); owner answers Q1-Q10; Task 14 pages for AMS, Rocket, Clinic

## 2026-09-10 01:39 | Fixed the tailnet preview (astro preview rejects the Tailscale host in Astro 5.17; dist/ now served by python3 http.server behind tailscale serve :8447) and diagnosed the host slowdown: OOM kill at 00:15 from 15+ concurrent claude sessions, CPU now saturated by the landing-page ffmpeg AV1 job (reniced to 15)
- files: astro.config.mjs, CLAUDE.md
- git: redesign/minimal@f1fd767
- next: Rerun QA + Lighthouse (F10) once the ffmpeg job ends; owner answers Q1-Q10; Task 14 pages for AMS, Rocket, Clinic

## 2026-09-10 07:10 | Real content into the live site on feat/work-content: 7 real projects with photos in Work, 3 new project pages from approved texts, 3 invented pages rewritten from facts, new Timeline section, a11y to 0 serious violations, AMS LCP 29.3s->1.3s, rocket frames off the critical path; code-review 10 findings fixed; branch pushed, preview on :8447
- files: src/data/works.ts, src/data/timeline.ts, src/components/STimeline.astro, src/components/RocketBackground.astro, src/components/ProjectLayout.astro, src/pages/work/touchpoint.astro
- git: feat/work-content@24dac7d
- next: Owner answers Q1-Q10 (dates, roles, prizes), runs the Safari gate on the iPhone, decides on the 4s loader + morphing title; then merge to main

