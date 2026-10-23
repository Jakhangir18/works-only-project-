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

## 2026-09-10 23:36 | Overnight: 63-agent adversarial review plus eleven /code-review rounds on feat/work-content; fixed the invisible dive, the erased tunnel letter shadows, the snapped rocket pose, the 18s-late rocket frame, the off-screen hero roller, the emptied hero after Back, share cards pointing at localhost, and card+dive text that was unreadable on its own cover; suite 843 -> 961 checks, branch pushed
- files: docs/night-report.md, src/components/AWork.astro, src/utils/DiveTransition.ts, src/components/RocketBackground.astro, tests/t-a11y.mjs, tests/t-dive.mjs
- git: feat/work-content@8fcb8cc
- next: Owner answers docs/facts-to-confirm.md (11 sections incl. the iPhone gate), then merge to main and deploy

## 2026-09-29 11:28 | Night restore of the anime+rocket home (feat/anime 425f3e0): npm ci + build clean with no env fixes, 1120/1120 checks before and after, 22 screenshots, 3 content commits from mac-desktop/feat/work-card-covers (TouchPoint schematic+repo, SPOOT repo, RLV camera photo), restore report in ~/work/works-only/docs/night-2026-09-30/
- files: src/pages/work/touchpoint.astro, src/pages/work/spoot.astro, src/pages/work/remote-lab-vision.astro, public/projects/touchpoint/docs/driver-board-schematic.pdf, public/projects/remote-lab-vision/gallery/06.webp
- git: night/restore-2026-09-30@832a12c
- next: Owner: settle TouchPoint prize + Sadap identity, run the iPhone gate (report section 9), decide figure slot/nav/contact; then push the branch

## 2026-09-29 11:56 | Night fixes on the restored anime branch: TouchPoint prize corrected to 2nd place overall of 71 teams in five places, SPOOT dated May 2026 with Google's Best Use of Gemini; GitHub/LinkedIn/Devpost in the contact section plus a resume slot; og-home.jpg recaptured from the anime home; CLAUDE.md, claude-progress.txt and features.json describe the anime home. Build rc 0 (9 pages), suite 1120/1120 at 76c0b77, /code-review no findings. Report: ~/work/works-only/docs/night-2026-09-30/fixes-report.md
- files: src/pages/work/touchpoint.astro, src/pages/work/spoot.astro, src/data/timeline.ts, src/data/works.ts, src/components/WhyWorkWithMe.astro, src/components/ContactSection.astro, public/og-home.jpg, CLAUDE.md, claude-progress.txt, features.json
- git: night/restore-2026-09-30@76c0b77
- next: Owner: settle Sadap Clinic identity (fixes-report owner question 1), supply resume PDF, run the iPhone gate (restore-report section 9); then push the branch

## 2026-09-29 11:57 | Resume linked: /resume.pdf is the combined variant, byte-identical to ~/work/school/out/career/resume-combined.pdf built 2026-09-29; the contact link reads "Resume (PDF)". The PDF uses the official placements (TouchPoint 2nd Place Overall at QuackHacks 3, SPOOT 3rd Place in Google's Best Use of Gemini at BeaverHacks 2026)
- files: public/resume.pdf, src/components/ContactSection.astro
- git: night/restore-2026-09-30@33efd95
- next: Owner: approve the combined resume variant (or pick another; ai-ml and swe still say "top prize"), settle Sadap Clinic identity, run the iPhone gate (restore-report section 9); then push the branch

## 2026-09-29 13:03 | Final review nits and a follow-up fix: contact comments match the rendered new-tab cue; project links hide the arrow from screen readers and announce new tabs with a scoped visually-hidden rule (project pages do not load u-sr-only); Remote Lab Vision photo shows two columns; build 9 pages, 1120/1120
- files: src/components/ContactSection.astro, src/components/ProjectLayout.astro, src/pages/work/remote-lab-vision.astro
- git: night/restore-2026-09-30@305dd8b
- next: Owner: pick hero figure (docs/night-2026-09-30/hero-figure), settle Sadap and TouchPoint framing, approve the combined resume and a push of night/restore-2026-09-30, run the iPhone gate S1-S11

## 2026-09-30 00:01 | Knowledge moved into the site repo: the anime branch is checked out here, the building session fa68cc50 resumes from here, claude-progress.txt records the recovered hero-portrait plan (from IMG_3384) and the owner's open questions, init.sh builds and runs the suite and fails loudly (1120/1120)
- files: claude-progress.txt, init.sh
- git: night/restore-2026-09-30@22ccf7e
- next: Run ./init.sh first; owner: approve pushing night/restore-2026-09-30, pick the hero approach (anime portrait from IMG_3384 via agy-image -r), settle Sadap and TouchPoint framing, iPhone gate S1-S11

## 2026-10-01 00:12 | Restored the main portfolio chat fa68cc50 (2026-09-09..09-28) from ~/trash/2026-09-30 back into ~/.claude/projects/-home-ubuntu-work-works-only-repo/; who trashed it around 2026-09-30 23:43 is unknown (no log). Site code untouched; anime home confirmed on preview :4400
- files: ../../../.claude/projects/-home-ubuntu-work-works-only-repo/fa68cc50-bd2f-407c-b4e8-393f81e0c714.jsonl
- git: night/restore-2026-09-30@aa1a289
- next: Owner: decide whether to restore 4 other trashed chats (school, gdgc-site, two host chats in ~) before trash-purge removes them (14 days); then the open site questions (push, hero figure, Sadap/TouchPoint, resume, iPhone gate)

## 2026-10-01 04:14 | Fixed the rocket's resting pose under prefers-reduced-motion: the controller returned before writing --x/--y and the stylesheet's offset-distance: 0% was dead because the craft uses offset-path: none, so the rocket parked at the section's top-left corner, 1236 px from where its trail starts; it now samples the path once and writes the pose, debounced 200 ms and skipped when the section box is unchanged (svh plus the iOS URL bar), removes any previous listener, and leaves early when the trail is missing. /code-review high found three issues in the first version, all fixed before the commit; 1120/1120 checks green
- files: src/utils/RocketFlight.ts, src/components/AnimeRocket.astro
- git: night/restore-2026-09-30@de0cb2b
- next: F21: teach perf/harness.mjs the anime home - readiness is html losing is-scroll-blocked plus .js-anime-intro gaining is-gone; geometry anchors are .anime-work and .rocket-flight instead of .s-work and .js-rocket-story

## 2026-10-01 18:50 | F21 done properly: perf/harness.mjs learned the anime home (route settled by what the page holds, anime readiness signals, .anime-work and .rocket-flight anchors, dive phase skipped) and four Mac-only assumptions that made runs wrong were fixed - the chrome channel probe, the headless default, the 240-frame preload wait, and a fixed 600ms settle against Lenis's 1.05s easing; each run now calibrates the wheel because a step does not always move the page by its own pixel count. Four configurations plus a stubbed control: the hero wheel halves the frame rate at rest at 1440x900 (idle-top 33.2 vs 16.7 stubbed) and costs nothing measurable at 390x844; budgets are not met and the trade-off is recorded. /code-review high returned 11 findings on the first version, all acted on
- files: perf/harness.mjs, CLAUDE.md, claude-progress.txt, features.json
- git: night/restore-2026-09-30@671a749
- next: F10 is the owner's: what to do about the hero wheel, after he scrolls the anime home on his own Mac and iPhone, since a GPU may absorb what this software rasteriser cannot. Then perf/regression.mjs needs the same route and launch treatment, and perf/rss.mjs measures nothing on Linux

## 2026-10-02 01:01 | Put the anime portrait into the hero's empty centre slot: fetched Jakanime2.png from the Mac, trimmed and resized to 340w/510w webp (48 and 86 KB) aimed at the 170 CSS px the slot actually renders, sized by height with max(220px, 78%) of the stage so his feet sit on its bottom edge, eager and high priority as the LCP candidate. /code-review high found four issues first, including public/hero being untracked, which would have shipped a blank reserved box to production; all fixed before the commit. 1120/1120 checks green
- files: src/components/AnimeHero.astro, public/hero/jak-340.webp, public/hero/jak-510.webp, claude-progress.txt
- git: night/restore-2026-09-30@ba8f441
- next: Owner: what to do with Work and Timeline - both sections already exist and the order is hero, rocket, space, Work, Timeline, contact. Also open: the whole hero sits below the fold on a landscape phone (667x375), which predates the figure, and F10, the wheel decision

## 2026-10-02 04:21 | Hero reworked to the owner's direction after the s0animation reference: the name split to the corners on one arc, a concave ring of fourteen slots whose cards turn with it, the figure at 64svh a step back from the screen, the stage edge to edge, screens 176px, new lines. /code-review high found nine issues, all acted on: Explore was unclickable behind the faded half of the ring (now pointer-events: none plus backface-visibility: hidden, 0 of 6 hit-tests blocked at four viewports), the figure overflowed a portrait tablet (now also bounded by 118% of the stage), invariant 7 broken by upscaled edge cards (laid out at 246px, scaled 0.715), sizes, dead CSS, stale comments, grammar. Suite 1124/1124 (+4 checks); one tunnel contrast check flaked once and passed alone. Re-measured: desktop idle-top 50.0 / 66.6 / 83.3 ms with five long frames (was 33.2), phone unchanged at 16.7; recorded in CLAUDE.md and the progress log
- files: src/components/AnimeHero.astro, tests/t-anime.mjs, public/hero/jak-500.webp, public/hero/jak-760.webp, CLAUDE.md, claude-progress.txt
- git: night/restore-2026-09-30@fcbd13d
- next: Owner: F10 on the heavier wheel - the three cheapest experiments are the per-card box-shadow, baking the image filter into the shot webps, and a stepped opacity instead of the cos ramp, each with its own before/after run; then what the carousel screens should show, the portrait-tablet layout, and the ten retro items

## 2026-10-02 05:42 | The space sequence, to the owner's direction after s0animation.com/design: hero, then Why work with me (the tunnel's bento section, now carrying its own four colour variables so it reads in either theme), then the rocket, which ends in a burst - a ring born at its exit corner on the same ScrollTrigger callback, scaling ahead of the wipe and fading as the wipe takes the screen - into one palette violet shared by the wipe, the star field and the work panels, which now sit in that light with even panels mirrored as the reference alternates its cases. Built per build-animation: plan file first (composition answers, write list, rest state, reduced-motion ending), five one-change commits, visual pass at four burst frames on both sizes, measured on both. /code-review high returned nine findings, all acted on in five fix commits: the wipe's end seam (now max(330vmax, 360vh), flat to 88%, five sampled pixels #1b0f3f on both viewports), the burst promoted for life with opacity 1 at rest (now 180vmax, zero at rest, promoted only inside its window), constant rewrites every frame (leaves remember their last string; one ramp), a retinted tunnel under a 'tunnel untouched' message, a glow that did not follow the media, three literal copies of the token. Suite 1124/1124 with one Firefox-only flake (NS_BINDING_ABORTED on the hero image, passes alone, recorded). Desktop rocket phases: 3 and 5 long frames after the round, against 5 and 6 before it and 2 and 3 before the burst; phone unchanged
- files: src/pages/index.astro, src/components/WhyWorkWithMe.astro, src/components/AnimeRocket.astro, src/utils/RocketFlight.ts, src/components/AnimeSpace.astro, src/components/AnimeWork.astro, src/styles/variables-scss/_colors.scss, docs/space-sequence-plan.md, CLAUDE.md, claude-progress.txt
- git: night/restore-2026-09-30@ba1ee86
- next: Owner: scroll the sequence on the Mac and iPhone (preview :4400); decide F10 on the wheel and whether the remaining long frames in the rocket phases on this rasteriser matter on real hardware; say whether s0's Deep Dive 3D blow-out is wanted (a route-level transition, separate design); the carousel screens' content; the ten retro items

## 2026-10-02 08:16 | Round three of the anime home built to the owner's direction, 21 commits 9588cc9..401a391 on night/restore-2026-09-30: copy without the hardware lean and the Raffaele lab named; the rocket bursting right under the bento footer; space black with a black intro cover; a sticky star stage the wipe reveals, sliding right to left; GitHub-dark Work with a star tail; wheel cards with body; the figure at 74svh leaning after the pointer; Geist for prose; split-text headings; shimmer + magnetic buttons; spotlight + border beam cards; an At Oregon State section. Each animated commit measured before/after on the VPS (no GPU) and recorded; /code-review high returned ten findings, nine fixed in seven commits (stale rects under scroll, write-then-read, time datetime, one label map and date formatter, dead copy path, star timing off the height ratio, figure will-change under reduce, shared leaf-write helper), one declined (pagehide teardown would break bfcache). Found and fixed on the way: 353711e had deleted restAtStart() so the rocket threw under reduced motion; t-anime now runs a reduced context. Suite 1130/1130 three times. Incident: a claude -resume in a second tmux window ran a twin of this session for ~10 min; owner killed it; lesson saved to memory
- files: src/components/AnimeHero.astro, src/components/AnimeRocket.astro, src/components/AnimeSpace.astro, src/components/AnimeWork.astro, src/components/AnimeIntro.astro, src/components/AnimeCampus.astro, src/components/AnimeTimeline.astro, src/components/WhyWorkWithMe.astro, src/components/BentoCard.astro, src/components/SplitHeading.astro, src/components/ContactSection.astro, src/utils/AnimeHero.ts, src/utils/RocketFlight.ts, src/utils/Space.ts, src/utils/Reveal.ts, src/utils/Magnetic.ts, src/utils/BentoGlow.ts, src/utils/leafWrite.ts, src/utils/AnimeSite.ts, src/data/timeline.ts, src/styles/variables-scss/_colors.scss, src/styles/variables-scss/_fonts.scss, src/styles/global.scss, public/fonts/geist.css, tests/t-anime.mjs, tests/t-timeline.mjs, tests/lib.mjs, docs/anime-direction-plan.md, CLAUDE.md
- git: night/restore-2026-09-30@401a391
- next: Owner on his Mac and iPhone: the whole page at 1440x900 and on the phone (the burst under the footer, the star hand-off, Work, the campus rows, the hero tilt); the pointer-phase and phone rocket-down readings need a GPU verdict; open decisions: F10 (wheel), the touch beam lap on real phones, meta description/OG text still hardware-led, no will-change on the star layers (unmeasured), the ten retro items

## 2026-10-02 21:09 | Portfolio v4 home rebuilt (owner flying, autonomous): curated media (65 items, privacy fixes), hero name on a build-time cylinder behind the wheel with pre-blurred twins, bento line in the grid, rocket beside the bento crashing into space, WORK tunnel plus a 3D carousel of seven, far layers out of the tree, paradise timeline (painted sky, meadow, trail, ten stops), sign-off contact without resume, case-page system plus TouchPoint; /code-review high acted on (drag, keyboard reach, loops, years-only, thumbs). t-anime 79/79, harness in band, 17/17 scroll assertions
- files: src/components/AnimeHero.astro, src/components/AnimeRocket.astro, src/components/AnimeWork.astro, src/components/AnimeParadise.astro, src/components/AnimeContact.astro, src/utils/RocketFlight.ts, src/utils/WorkCarousel.ts, src/utils/Paradise.ts, src/data/projects.ts, src/data/media.ts, src/layouts/CaseLayout.astro, src/pages/work/touchpoint.astro
- git: feat/portfolio-v4@279c652
- next: Six case pages being built by Opus agents (SPOOT, Zyp, GDG, RLV, AMS, Rocket); then re-shoot the hero wheel, full suite, second review, CLAUDE.md, the Discord post (~/work/school/out/mhacks-2026/discord-team-post.md), report

## 2026-10-02 22:26 | Portfolio v4 complete on feat/portfolio-v4 (owner flying, autonomous): seven bespoke case pages (TouchPoint by hand, SPOOT, Zyp, GDG, Remote Lab Vision, AMS, Rocket club by Opus agents) on a shared case system; hero wheel shows them; share cards; held-back items kept off public/; three /code-review rounds acted on; CLAUDE.md invariants 10-12 added; full suite 1142/1142; harness desktop and phone x4 with 17/17 scroll assertions; Discord post v3 ready (not sent)
- files: src/layouts/CaseLayout.astro, src/pages/work/touchpoint.astro, src/pages/work/spoot.astro, src/pages/work/zyp.astro, src/pages/work/gdg.astro, src/pages/work/remote-lab-vision.astro, src/pages/projects/ams/index.astro, src/pages/work/engineering-rocket.astro, src/components/AnimeWork.astro, CLAUDE.md, docs/portfolio-v4-design.md
- git: feat/portfolio-v4@e835887
- next: Owner: review on Mac and iPhone via :4400; answer the held-back items (GDG report, AMS deck p7, Track:Google slide, GDG speaker, launch-day rockets); decide deploy and the portfolio link for the Discord post

## 2026-10-02 23:26 | retro: read-once keyed per reader (session_id+agent_id), review-gate accepts review-done before task-done/push, lesson on re-measuring animated fixes, Mac ssh target and work folder in the memory index, 17 dead memory paths removed (agent-lint 0/0); sleep-loop hook rule declined by the owner
- files: ../../../.claude/hooks/read-once.py, ../../../.claude/hooks/review-gate.py, .claude/skills/build-animation/LESSONS.md, ../../../.claude/auto-memory/MEMORY.md, ../../../.claude/auto-memory/mac-desktop-layout.md, ../../../.claude/auto-memory/vps-primary-dev-migration.md, ../../../.claude/auto-memory/no-auto-tmux-on-login.md, ../../../.claude/auto-memory/friend-account-and-ssh-hardening.md, ../../../.claude/auto-memory/api-keys-missing-on-host.md, ../../../.claude/auto-memory/clip2vps-image-paste.md
- git: feat/portfolio-v4@eb96b5e

## 2026-10-03 02:37 | Portfolio v5 (owner flying, autonomous): memory freed (11 sessions to md); GDG Co-President + Drive figures; rocket explodes on the right; no machine numbering on case pages; video player with sound/seek/start points + liquid glass case bar; owner-only photo picker on :4401; constellation into WORK; WORK as word rows (carousel deleted); space -> Earth -> grass descent with pointer-pressed grass; two /code-review rounds acted on; full suite 1172/1173 (one flaky tunnel contrast check, passes on rerun); harness in band
- files: src/utils/RocketFlight.ts, src/utils/Constellation.ts, src/utils/WorkRows.ts, src/utils/workStack.ts, src/utils/GrassField.ts, src/utils/player.ts, src/components/AnimeWork.astro, src/components/AnimeSpace.astro, src/components/AnimeParadise.astro, src/components/case/CaseClip.astro, src/layouts/CaseLayout.astro, src/pages/work/gdg.astro, scripts/pick-server.mjs, CLAUDE.md, docs/portfolio-v5-design.md
- git: feat/portfolio-v5@d2f938b
- next: Owner: try photos on http://100.122.188.86:4401/ and press Send; then pin with scripts/pin-picks.mjs. Decide the Vercel preview route (repo is public). Review on Mac/iPhone at :4400.

## 2026-10-03 10:32 | Portfolio v6 (owner asleep, autonomous): WORK as on Vercel on the home (tunnel wall in home mode, constellation hand-off within 1 px, no numbering, dive with Lenis lock and return), the wall dissolves into the descent's stars, painted Gemini meadow + seamless walk tile + regrained grass, Zyp live 97-frame hero (agent), full-screen explosion flash, picks pinned and picker stopped; two /code-review rounds + a third on fixes acted on; perf cuts measured (phone x4 WORK 9-35 frames >50ms vs tunnel 11-28); full suite green (routes 774, a11y 112, anime 119, work 100, dive 67, others green); clean orphan branch preview/portfolio pushed, Vercel preview built (protected by Vercel Authentication)
- files: src/utils/WorkSection.ts, src/utils/WorkDust.ts, src/components/SWork.astro, src/components/AWork.astro, src/data/workCards.ts, src/utils/DiveTransition.ts, src/utils/AnimeSite.ts, src/utils/Space.ts, src/utils/Constellation.ts, src/utils/workStack.ts, src/components/AnimeParadise.astro, src/utils/Paradise.ts, src/utils/GrassField.ts, src/styles/helpers/_stars.scss, tests/t-anime.mjs, tests/t-work.mjs, tests/t-dive.mjs, tests/t-a11y.mjs, perf/harness.mjs, CLAUDE.md, docs/portfolio-v5-design.md
- git: feat/portfolio-v5@b22324c
- next: Owner: look at v6 on http://100.122.188.86:4400 (Mac, iPhone) or the Vercel preview (his login); decide production or preview protection for the Discord link; verdict on WORK smoothness on real hardware

## 2026-10-03 18:51 | v6 shipped to main as one clean commit 15a1432 (site sources only, no notes, no resume); Vercel Production deployment built successfully, but works-only-project.vercel.app still serves the July deployment: the owner must promote 15a1432 in the Vercel dashboard
- files: CLAUDE.md
- git: feat/portfolio-v5@116df8d
- next: Owner: Vercel dashboard -> project -> Deployments -> 15a1432 'feat: portfolio v6, the anime home' -> Promote to Production (or check Settings -> Domains owns works-only-project.vercel.app); then check the site on Mac and iPhone

## 2026-10-06 04:04 | v7: full review and fixes (rocket hand-off black in time, narrow route tail, five star tiles, meadow greens, return key expiry, indexing + sitemap/robots), Usher case page (MHacks 2026, eighth project, owner's photos and clips, picker pool), Zyp page as the internship story with the offer letter's facts; /simplify and /code-review acted on; suite 1589 checks green; harness within the base band
- files: src/utils/RocketFlight.ts, src/utils/Space.ts, src/utils/WorkDust.ts, src/styles/helpers/_stars.scss, src/utils/GrassField.ts, src/utils/returnKey.ts, src/pages/work/usher.astro, src/pages/work/zyp.astro, src/data/projects.ts, src/data/timeline.ts, src/data/media.ts, src/layouts/CaseLayout.astro, src/pages/sitemap.xml.ts, tests/t-anime.mjs, scripts/pick-pool.mjs, CLAUDE.md, docs/portfolio-v5-design.md
- git: feat/portfolio-v5@7c95305
- next: Owner: open http://100.122.188.86:4400 on Mac and iPhone (rocket hand-off, the dissolve, /work/usher/, /work/zyp/, the meadow); swap Usher pictures on http://100.122.188.86:4401/work/usher/ if wanted (pin-picks, import, rebuild); then ship main as one clean orphan commit like preview/portfolio and promote in Vercel

## 2026-10-06 23:37 | v8 (owner's notes): Usher picks pinned (no duplicate photo, lighter images, importer width cap/quality/prune), Zyp role 'software engineer intern' beside the product team, home sticky stages in lvh (no band under them on iPhone), phone perf: descent scenery out of the layer tree a screen away, rays/tufts only while visible (phone x4 WORK -30% slow frames, paradise 0-2), three /code-review rounds; suite 1589/1589; shipped to main b9598ed, Vercel production built
- files: src/components/AnimeRocket.astro, src/components/AnimeSpace.astro, src/components/SWork.astro, src/components/AnimeParadise.astro, src/utils/Paradise.ts, src/utils/Space.ts, src/utils/WorkSection.ts, src/utils/workStack.ts, src/pages/work/usher.astro, src/pages/work/zyp.astro, src/data/projects.ts, src/data/timeline.ts, scripts/import-media.mjs, docs/media-manifest-usher.json, CLAUDE.md, docs/portfolio-v5-design.md
- git: feat/portfolio-v5@a7a025f
- next: Owner: tell the domain name so the live site can be checked; open it on iPhone (Safari, Chrome): no band under the stages, scroll smoothness; production deploy b9598ed is built

## 2026-10-07 21:16 | Live: www.tynshimov.com serves v8 (b9598ed); apex 308 to www; sitemap/robots/OG on the domain; desktop and phone load with no console errors; CLAUDE.md records the domain. Old works-only-project.vercel.app answers DEPLOYMENT_NOT_FOUND while resumes and LinkedIn drafts still link it
- files: CLAUDE.md
- git: feat/portfolio-v5@20c89d6
- next: Owner: keep old links alive (Vercel -> Settings -> Domains: add works-only-project.vercel.app redirecting to www.tynshimov.com) or switch the resumes/LinkedIn to tynshimov.com (in ~/work/school); check the site on iPhone

## 2026-10-07 21:23 | Old address works-only-project.vercel.app re-added by the owner: serves the live v8 site (200 on /, /work/zyp/, /work/usher/, /projects/ams/), so resume and LinkedIn links work again
- files: CLAUDE.md
- git: feat/portfolio-v5@8e6c239
- next: Optional: canonical links to www.tynshimov.com (the old address serves duplicates, no redirect); owner checks the site on iPhone

## 2026-10-07 21:29 | works-only-project.vercel.app now 308-redirects every path to www.tynshimov.com (vercel.json host rule, /:path(.*)); shipped to main 74278c1 + 731e2c1; checked /, case pages, query strings, /work/ams-device
- files: vercel.json, CLAUDE.md
- git: feat/portfolio-v5@b05bc15
- next: Owner: check the site on iPhone (band under stages, smoothness)

