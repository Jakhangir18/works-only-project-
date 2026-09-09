# Minimal Portfolio Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `executing-plans` (inline) or dispatch one fresh subagent per task. Steps use checkbox (`- [ ]`) syntax for tracking. Read `docs/design-spec.md` first; this plan argues from it.

**Goal:** Replace the animation-heavy template with a minimal, honest portfolio: hero, numbered work list with hover previews, one page per project, about, contact; three real projects live on day one, three more once the owner confirms facts.

**Architecture:** Astro 5 static site, one base layout, one content collection (`work`) as the single source of truth for projects, SCSS tokens, under 12 KB of client JS (scroll reveal, hover preview, view transitions). All heavy systems (Three.js, GSAP, rocket frames, letter tunnel, dive) are deleted in the first task so nothing later has to coexist with them.

**Tech Stack:** Astro ^5.7 (content layer, `<ClientRouter />`), Sass, PP Editorial New + PP Fraktion Mono (already in `public/fonts`), `sharp` (from Astro's tree) + `ffmpeg` for media, Playwright + axe + Lighthouse from `~/work/Personal-Website/repo/audit/node_modules` for QA.

**Spec:** `docs/design-spec.md`

## Global Constraints

- Branch `redesign/minimal` off `main` (3f6e954). No commits to `main`, no `--force`, no deploy. One change per commit.
- Client JS total <= 12 KB gzipped. No GSAP, Lenis, Three.js. No per-frame CSS custom property writes on ancestors (CLAUDE.md invariant 2 still applies to the hover follower: write `transform` on the follower element only).
- `public/projects` <= 15 MB. No HEIC / MOV / PDF > 2 MB in the repo.
- Copy: American English, first person, no self-describing adjectives, no unconfirmed numbers. Hero line verbatim: "CS + Physics student, Oregon State. Builds hardware and web."
- Every `<img>` has `width`, `height`, `alt`. Focus ring visible on every interactive element. `prefers-reduced-motion` turns motion off.
- Verify on the production build (`npm run build && npm run preview`), never the dev server.
- Routing: this thread (Fable) does T1-T7 (foundation, Work list, project template). T8-T14 may go to Opus subagents (`model: opus`, one task each, explicit file allowlist) with this thread verifying each diff. Media conversion is an exact tool (`sharp`/`ffmpeg`), not a model. Codex is not used for this redesign (quality objective; Claude writes, Claude reviews per the routing rules).

## Open questions for the owner (answer any time; nothing below blocks T1-T9)

Facts that gate the hidden pages. Until answered the page stays `draft: true`.

1. TouchPoint prize: the QuackHacks site lists Meta glasses for 2nd overall; your note says iPhone (Google track?). Which is true, or leave prizes out?
2. TouchPoint: 6 motors on fingers, 8 channels on the board? "NEMO" on the schematic is the team, the board, or something else?
3. SPOOT: direct GitHub repo URL (the text links to your profile now).
4. Remote Lab Vision: dates (start/end), Lucas Ellis's exact title, was the URSA poster published anywhere (link)?
5. AMS Tablet: your role and dates; what "Android tablet + web dashboard" shipped where (the photos show police, construction, manufacturing deployments); the patent and certification in the photos, whose are they?
6. Engineering Rocket: club name and city, years, your role (president?), did rockets fly and how high, what did you design yourself, what the certificate is for.
7. Private Clinic (sadapclinic.kz, with kuatovakamila): what exactly was yours (frontend, Supabase schema, deploy, i18n, doctor search)?
8. "Now" line: is "Frontend and 3D interaction engineering at ZIP" accurate and allowed publicly? Spelling: ZIP or Zip?
9. LinkedIn URL. Public email stays `tynshimj@oregonstate.edu`?
10. Should the site be indexable (`robots: index`) after merge?

## File structure (end state)

```
src/
  layouts/Base.astro            head, fonts, ClientRouter, Nav, Footer, reveal + follower scripts
  components/Nav.astro          wordmark + 3 links
  components/Footer.astro
  components/Hero.astro
  components/WorkList.astro     numbered rows, hover preview follower
  components/About.astro
  components/Contact.astro
  components/Gallery.astro      CSS grid of gallery entries
  components/Meta.astro         dl grid for project metadata
  content.config.ts             `work` collection schema
  content/work/<slug>.md        one file per project
  pages/index.astro
  pages/work/[slug].astro
  styles/tokens.scss            colors, type scale, spacing, motion tokens
  styles/global.scss            reset, base, utilities (reveal, visually-hidden)
  scripts/reveal.ts             IntersectionObserver reveal
  scripts/follower.ts           hover preview
scripts/media.mjs               in/_web -> public/projects conversion
public/projects/<slug>/{cover,thumb}.webp, gallery/NN.webp
features.json, init.sh, claude-progress.txt   long-task harness
```

Deleted: `src/components/{AWork,BentoCard,ContactSection,DottedSurface,HeroHome,MorphingText,Navigation,ProjectLayout,RocketBackground,RocketStorySection,SWork,TextSlidesOverlay,TransitionVideo,WhyWorkWithMe}.astro`, `src/utils/*`, `src/data/works.ts`, `src/pages/work/*.astro` (old five), `src/pages/projects/ams/index.astro`, `src/assets/works/*.mp4`, `src/styles/site/_dive.scss`, `public/1/` (240 frames), `public/nasa-nns.html`, `perf/`, `scripts/capture-work-redesign.mjs`, `docs/work-redesign-visuals/`, dependency `three`, `@types/three`, `playwright-core`.

---

### Task 0: Long-task harness and branch hygiene

**Files:**
- Create: `features.json`, `init.sh`, `claude-progress.txt`
- Modify: `.gitignore` (add `.claude/memory/`, `perf-results/` already there)

- [ ] **Step 1: Write `features.json`** (F1-F12 as listed in the file; only `passes` changes later).
- [ ] **Step 2: Write `init.sh`**: `npm ci` if `node_modules` missing, `npx astro check`, `npm run build`, print `du -sh public/projects dist`, exit non-zero on any failure.
- [ ] **Step 3: Run `./init.sh`** on the untouched branch. Expected: passes (baseline build works), log to `../logs/init-baseline.log`.
- [ ] **Step 4: Commit** `chore: long-task harness (features.json, init.sh, progress log)`.

### Task 1: Strip the heavy systems

**Files:**
- Delete: everything in the "Deleted" list above.
- Modify: `package.json` (remove `three`, `@types/three`, `playwright-core`, `perf:*` scripts), `src/pages/index.astro` (temporary minimal page: `<h1>Jakhangir Tynshimov</h1>` inside an `<html>` shell so the build stays green), `astro.config.mjs` (add `vite.server.allowedHosts: ['.ts.net']`, `server.host: '127.0.0.1'`).

- [ ] **Step 1: `git rm -r`** the listed paths. `git rm -r public/1 perf src/utils src/components src/data src/pages/work src/pages/projects src/assets docs/work-redesign-visuals scripts/capture-work-redesign.mjs public/nasa-nns.html src/styles/site/_dive.scss`.
- [ ] **Step 2: Edit `package.json`**, run `npm install` to refresh the lockfile. Expected: `three` gone from `package-lock.json`.
- [ ] **Step 3: Write the temporary `src/pages/index.astro`** and fix `src/styles/global.scss` / `_import.scss` so nothing imports the deleted `_dive.scss`.
- [ ] **Step 4: Run `./init.sh`**. Expected: `astro check` 0 errors, build succeeds, `dist/` contains only `index.html`, fonts, icons, `projects/ams`.
- [ ] **Step 5: Commit** `refactor: remove Three.js hero, rocket sequence, letter tunnel and dive (redesign step 1)`.

### Task 2: Design tokens and global styles

**Files:**
- Create: `src/styles/tokens.scss`
- Rewrite: `src/styles/global.scss`, `src/styles/site/_base.scss`, `src/styles/site/_text.scss`
- Delete: `src/styles/variables-css/*`, `src/styles/variables-scss/*`, `src/styles/helpers/{_colors,_easing,_grid}.scss` (keep `_responsive.scss` + `_fonts.scss` if still referenced; otherwise delete). Update `src/styles/_import.scss` accordingly and the `additionalData` line in `astro.config.mjs`.

`tokens.scss` (CSS custom properties on `:root`):

```scss
:root {
  --bg: #fff2ed;
  --ink: #160000;
  --ink-2: rgba(22, 0, 0, 0.55);
  --rule: rgba(22, 0, 0, 0.14);
  --accent: #f40c3f;
  --font-serif: "Editorial New", Georgia, serif;
  --font-mono: "Fraktion Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --fs-display: clamp(3rem, 9vw, 8.5rem);
  --fs-title: clamp(2rem, 5vw, 4.5rem);
  --fs-h2: clamp(1.5rem, 2.6vw, 2.25rem);
  --fs-prose: clamp(1.0625rem, 1.2vw, 1.25rem);
  --fs-mono: 0.75rem;
  --measure: 34em;
  --pad: clamp(1.25rem, 4vw, 4rem);
  --gap: clamp(1rem, 2vw, 2rem);
  --section: clamp(5rem, 14vh, 12rem);
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --dur: 500ms;
}
@media (prefers-reduced-motion: reduce) { :root { --dur: 0ms; } }
```

`global.scss`: `modern-normalize` import, `html { background: var(--bg); color: var(--ink); }`, `body { font: 400 var(--fs-prose)/1.5 var(--font-serif); -webkit-font-smoothing: antialiased; }`, `.mono { font: 400 var(--fs-mono)/1.4 var(--font-mono); letter-spacing: .08em; text-transform: uppercase; }`, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }`, `.reveal { opacity: 0; transform: translateY(16px); transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease); } .reveal.is-in { opacity: 1; transform: none; }`, `.visually-hidden`.

- [ ] **Step 1: Write tokens and global styles.**
- [ ] **Step 2: Build** (`./init.sh`). Expected: green, CSS < 8 KB.
- [ ] **Step 3: Commit** `feat(styles): design tokens, base typography, reveal utility`.

### Task 3: Base layout, Nav, Footer

**Files:**
- Create: `src/layouts/Base.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`, `src/scripts/reveal.ts`

`Base.astro` props: `title: string`, `description: string`. Head: charset, viewport, title, description, `robots noindex,nofollow` (until Q10), icons, preload `PPEditorialNew-Regular.woff2` and `PPFraktionMono-Regular.woff2`, `@import` of the two font CSS files inline (`is:inline`), `<ClientRouter />` from `astro:transitions`. Body: `<Nav />`, `<main><slot /></main>`, `<Footer />`, `<script>import "../scripts/reveal";</script>`.

`reveal.ts`: on `astro:page-load`, `document.querySelectorAll('.reveal')` → IntersectionObserver `{ threshold: 0.15 }` adds `is-in` and unobserves. If `matchMedia('(prefers-reduced-motion: reduce)').matches` add `is-in` to all immediately.

`Nav.astro`: `<header class="nav">` with `<a href="/" class="nav__mark mono">JT</a>` and `<nav aria-label="Primary"><a href="/#work">Work</a><a href="/#about">About</a><a href="/#contact">Contact</a></nav>`, sticky top, `background: var(--bg)`, bottom rule, all mono. No burger.

`Footer.astro`: three mono lines per spec.

- [ ] **Step 1: Write the three components and the script.** `index.astro` uses `Base` with an `<h1>`.
- [ ] **Step 2: Build; open `dist/index.html`** and confirm the two font preloads and `<meta name="view-transition" ...>` output are present (`grep -c 'astro-transition' dist/index.html` > 0).
- [ ] **Step 3: Commit** `feat(layout): base layout, nav, footer, scroll reveal`.

### Task 4: Content collection and the first three projects

**Files:**
- Create: `src/content.config.ts`, `src/content/work/touchpoint.md`, `src/content/work/spoot.md`, `src/content/work/remote-lab-vision.md`, plus `draft: true` stubs `ams-tablet.md`, `engineering-rocket.md`, `private-clinic.md` (frontmatter only, body says "Draft — waiting for facts", never built while `draft: true`).

`content.config.ts`:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const image = z.object({ src: z.string(), alt: z.string(), width: z.number(), height: z.number() });

const work = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/work" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    year: z.string(),
    kind: z.string(),
    role: z.string(),
    team: z.string().optional(),
    stack: z.array(z.string()),
    where: z.string().optional(),
    links: z.array(z.object({ label: z.string(), href: z.string() })).optional(),
    cover: image,
    gallery: z.array(image.extend({ caption: z.string().optional() })).optional(),
    order: z.number(),
    draft: z.boolean().default(false),
  }),
});
export const collections = { work };
```

Body text: copy the `intro`, `problem`, `approach`, `solution`, `outcome` strings from `in/my_work_experience/PROJECT-PAGE-PROMPTS.md` blocks 06/07/08 verbatim under `## Problem` … `## Outcome`; `intro` becomes `summary` shortened to one sentence plus the full intro as the first paragraph of the body. Covers point at `/projects/<slug>/cover.webp` with the real dimensions produced in Task 9 (until then use 1600x1067 and fix in Task 9's commit).

- [ ] **Step 1: Write the schema and six entries.**
- [ ] **Step 2: `npx astro check`**. Expected: 0 errors; a deliberate typo in a frontmatter key must fail (try `stak:` once, see the error, revert). This is the collection's test.
- [ ] **Step 3: Commit** `content: work collection with TouchPoint, SPOOT, Remote Lab Vision; drafts for AMS, Rocket, Clinic`.

### Task 5: Hero

**Files:** Create `src/components/Hero.astro`; modify `src/pages/index.astro`.

Markup: `<section class="hero" aria-labelledby="hero-title"><h1 id="hero-title" class="hero__name"><span class="reveal">Jakhangir</span> <span class="reveal">Tynshimov</span></h1><p class="hero__line mono reveal">CS + Physics student, Oregon State. Builds hardware and web.</p></section>`. Min-height `calc(100svh - 4rem)` with the name pinned to the bottom of the block (`display:flex; flex-direction:column; justify-content:flex-end`). Name uses `--fs-display`, `line-height: .95`, `letter-spacing: -.02em`, `text-wrap: balance`.

- [ ] **Step 1: Write it; build; screenshot** at 1440x900 and 390x844 (`node ~/work/works-only-project/out/deployed/shoot.mjs http://127.0.0.1:4321/ out/hero` against `npm run preview -- --host 127.0.0.1`). Look at both. Name must not wrap mid-word on 390px.
- [ ] **Step 2: Commit** `feat(home): hero`.

### Task 6: Work list with hover preview (Fable)

**Files:** Create `src/components/WorkList.astro`, `src/scripts/follower.ts`; modify `src/pages/index.astro`.

Data: `const works = (await getCollection("work", ({ data }) => !data.draft)).sort((a, b) => a.data.order - b.data.order)`.

Markup per row:

```html
<li class="work__row reveal">
  <a href={`/work/${entry.id}`} class="work__link" data-thumb={thumbSrc}>
    <span class="work__idx mono">01</span>
    <span class="work__title" transition:name={`title-${entry.id}`}>TouchPoint</span>
    <span class="work__summary">A haptic glove that lets a deafblind user browse the web by feel.</span>
    <span class="work__meta mono">2026 · Hardware + web</span>
    <img class="work__inline" src={thumbSrc} alt="" width="480" height="300" loading="lazy" />
  </a>
</li>
```

Layout: CSS grid `grid-template-columns: 3rem 1fr auto` desktop, rows separated by `border-top: 1px solid var(--rule)`, padding `1.5rem 0`, title `--fs-title`, summary max-width `var(--measure)` muted. `.work__inline` hidden at `(pointer: fine)`, shown at `(pointer: coarse)` under the title. Hover on fine pointers: title color stays, index turns `--accent`, the follower appears.

`follower.ts`: one `<div class="follower" aria-hidden="true"><img></div>` appended to body once per `astro:page-load`, `position: fixed; width: 320px; aspect-ratio: 16/10; pointer-events: none; opacity: 0; transition: opacity 200ms`. `pointerenter` on `.work__link` sets `img.src` from `data-thumb` and starts a rAF loop that lerps `x,y` toward the pointer (`0.12`) and writes `transform: translate3d(x,y,0)`; `pointerleave` fades out and stops the loop (`cancelAnimationFrame`). Guards: `matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches`, else the script does nothing. Bundle must stay under 2 KB.

- [ ] **Step 1: Write the component with the row grid, no follower yet. Build, screenshot desktop + mobile.** Confirm inline covers show on mobile only.
- [ ] **Step 2: Add `follower.ts`. Playwright check** (`out/qa/follower.mjs`): hover row 1 → `.follower` opacity becomes 1 and `img.src` ends with `touchpoint/thumb.webp`; move to row 2 → src changes; leave → opacity 0 and `requestAnimationFrame` no longer scheduled (spy via `page.evaluate` wrapping rAF counter before/after 500ms).
- [ ] **Step 3: Keyboard:** Tab reaches each row link and focus ring is visible (screenshot with `page.keyboard.press('Tab')` x3).
- [ ] **Step 4: Commit** `feat(home): numbered work list with hover preview`.

### Task 7: Project page

**Files:** Create `src/pages/work/[slug].astro`, `src/components/Meta.astro`, `src/components/Gallery.astro`.

`[slug].astro`: `getStaticPaths` from `getCollection("work", e => !e.data.draft)`; `const { Content } = await render(entry)`; `Base` with `title={`${title} — Jakhangir Tynshimov`}`. Header: `<p class="mono">0N / Selected work</p><h1 transition:name={`title-${id}`}>{title}</h1><p class="lede">{summary}</p><Meta …/>`. Cover `<img>` eager + `fetchpriority="high"` with width/height. `<article class="prose"><Content /></article>` with `h2` styled as the mono section labels ("01 Problem" etc. via CSS counters). `<Gallery items={gallery} />`. Links list. "Next" = the following entry by `order` (wrap to first).

`Meta.astro`: `<dl class="meta">` pairs for Year, Role, Team, Stack (joined with " · "), Where; empty ones skipped. Two columns desktop, one on mobile.

`Gallery.astro`: `<ul class="gallery">` grid 2 cols / 1 col, each `<figure><img loading="lazy" width height alt><figcaption class="mono">`.

- [ ] **Step 1: Write it. Build.** Expected: `dist/work/touchpoint/index.html`, `spoot`, `remote-lab-vision` exist; no `dist/work/ams-tablet` (draft).
- [ ] **Step 2: Screenshot each page** desktop + mobile at 0/50/100%. Check headings hierarchy with `page.evaluate` listing `h1,h2` (exactly one h1).
- [ ] **Step 3: View transition:** Playwright Chromium: click row 1 from `/`, wait for `astro:after-swap`; URL is `/work/touchpoint`, `h1` text "TouchPoint"; browser back returns to `/` with scroll restored near the list.
- [ ] **Step 4: Commit** `feat(work): project page with meta, prose sections, gallery, next link`.

### Task 8: About, Contact (Opus subagent allowed; allowlist: `src/components/About.astro`, `src/components/Contact.astro`, `src/pages/index.astro`)

About copy (first draft, owner may edit): "I study computer science and physics at Oregon State University. I build hardware at hackathons — a haptic glove for deafblind web browsing that took 2nd overall at QuackHacks 3.0, and sound-locating glasses that placed 3rd in the Google track at BeaverHacks — and I did URSA-funded research on the camera system behind Oregon State's remote chemistry labs. Before Oregon I ran a student rocket club in Kazakhstan." Second paragraph lists tools: "Day to day: Python, C++, TypeScript, Astro, Raspberry Pi, LabVIEW, 3D printing." Mono list: Based in — Corvallis, Oregon; Email; GitHub — github.com/Jakhangir18; LinkedIn — (pending Q9). "Currently" line omitted until Q8.

Contact: `<section id="contact"><h2 class="mono">Say hello</h2><a class="contact__email" href="mailto:tynshimj@oregonstate.edu">tynshimj@oregonstate.edu</a>` at `--fs-title`, then GitHub / LinkedIn mono links.

- [ ] Write, build, screenshot, check contrast of `--ink-2` on `--bg` >= 4.5:1 with axe, commit `feat(home): about and contact`.

### Task 9: Media pipeline (exact tool)

**Files:** Create `scripts/media.mjs`; output into `public/projects/<slug>/`; update `cover`/`gallery` dimensions in the three content entries; convert `public/projects/ams/images/*.jpg` to webp and delete the JPGs.

Input: `~/work/works-only-project/in/my_work_experience/_web/<slug>/` (rsync from the Mac; the Mac must be awake — `tailscale status` shows it online). Selection per `PROJECT-PAGE-PROMPTS.md`: TouchPoint cover `touchpoint-13` (img_2676), gallery 15/19/20/10/12 + schematic preview; SPOOT cover `spoot-03` cropped left (`sharp.extract`), gallery 02/01; Remote Lab Vision cover `remote-lab-vision-11` (IMG_9790), gallery 02/03/07/13.

`media.mjs`: for each `{slug, cover, gallery[]}` in a manifest object at the top of the script, run `sharp(input).rotate().resize({width})` → webp q82 → `cover.webp` 1600, `thumb.webp` 480 (aspect 16/10, `fit: cover`), `gallery/NN.webp` 1200; print a JSON line `{slug, file, width, height, kb}` for pasting into the content entries. Refuse to run if total output exceeds 15 MB.

- [ ] **Step 1:** `rsync` the `_web` folder into `in/` (see command in `claude-progress.txt`). Record `du -sh`.
- [ ] **Step 2:** Run `node scripts/media.mjs`, paste dimensions into the `.md` entries, `du -sh public/projects` (<= 15 MB).
- [ ] **Step 3:** Build; screenshot each project page; every image renders (no broken `<img>` — check `naturalWidth > 0` for all `img` via Playwright).
- [ ] **Step 4:** Commit `assets: covers, thumbs and galleries for TouchPoint, SPOOT, Remote Lab Vision; AMS jpg -> webp`.

### Task 10: Motion polish and advisor review

- [ ] Run the `motion-advisor` agent on `Hero`, `WorkList`, `follower.ts`, `Base.astro` (view transitions) with the spec's motion section; apply accepted findings.
- [ ] Verify `prefers-reduced-motion`: Playwright context with `reducedMotion: 'reduce'` → all `.reveal` have `is-in` immediately after load, follower never mounts.
- [ ] Commit `polish(motion): advisor findings`.

### Task 11: QA gate

- [ ] `out/qa/run.mjs`: production build served on `127.0.0.1:4347`; Chromium + WebKit, 1440x900 + 390x844, screenshots at 0/25/50/75/100 for `/` and each `/work/*`; console errors, failed requests, axe (`@axe-core/playwright`) serious/critical count, keyboard sweep (count focusable, all reachable, all non-zero area), Lighthouse mobile + desktop via `~/work/Personal-Website/repo/audit/lighthouse.sh` pattern. Write `out/qa/report.json`.
- [ ] Budgets from the spec: 0 errors, axe 0, LH mobile perf >= 95 / a11y 100, JS <= 12 KB gz (`gzip -c dist/_astro/*.js | wc -c`).
- [ ] Look at every screenshot (not just the numbers): no overflow, no overlapping text, name fits on 390px, list rows align, gallery grid intact.
- [ ] `/code-review` on the full diff `main..redesign/minimal` (opus), then `/simplify`; fix findings; flip `features.json` entries only after this.
- [ ] Commit `qa: report and fixes`.

### Task 12: Show it to the owner

- [ ] `tmux new -d -s wop-preview 'cd ~/work/works-only-project/repo && npm run build && npx astro preview --host 127.0.0.1 --port 4347 2>&1 | tee ../logs/preview.log'`.
- [ ] `tailscale serve --bg --https=8447 http://127.0.0.1:4347` (leave :443 → :4500 for landing-page untouched). Confirm `tailscale serve status` shows 8447.
- [ ] Push the branch: `git push -u origin redesign/minimal`.
- [ ] Report in Russian: link `https://vps-worker.taild24189.ts.net:8447`, what to check on the iPhone (`safari-gate` checklist: sticky nav with address-bar collapse, `100svh` hero, view transition back/forward, hover follower absent on touch, images decode), and the open questions list.

### Task 13: Copy pass

- [ ] Read every string on the built pages (`dist/**/*.html` text extraction) and apply the copy rules from the spec; rewrite anything generic. Owner's project texts stay verbatim.
- [ ] Commit `copy: final pass`.

### Task 14: After the owner answers (per project, one commit each)

- [ ] AMS Tablet: rewrite from the existing bespoke page facts + answers, media from `_web/ams-tablet`, `draft: false`.
- [ ] Engineering Rocket: from `_web/engineering-rocket` + answers.
- [ ] Private Clinic: from sadapclinic.kz screenshot + answers.
- [ ] "Now" line and LinkedIn once Q8/Q9 are answered.
- [ ] Re-run Task 11 and update the preview.

## Verification (end to end)

1. `./init.sh` exits 0 (check + build).
2. `node out/qa/run.mjs` → report shows 0 console errors, 0 axe serious, LH mobile >= 95, JS <= 12 KB gz.
3. Screenshots reviewed by eye for `/` and three project pages, both engines, both viewports.
4. `/code-review` on `main..redesign/minimal` with no open blockers.
5. Owner opens `https://vps-worker.taild24189.ts.net:8447` on the Mac and the iPhone and runs the safari-gate list.
