# CLAUDE.md

Personal portfolio of Jakhangir Tynshimov. Astro 5, static, one page plus one page per project. Deployed on Vercel from `main`.

## Read first

- `docs/design-spec.md` — the design decisions (palette, type, motion, page structure, copy rules, quality gates). The spec wins over taste.
- `docs/plans/2026-09-09-minimal-redesign.md` — the task list, the open questions for the owner, and which facts are still unconfirmed.
- `features.json`, `claude-progress.txt`, `init.sh` — long-task harness. Run `./init.sh` first in every session; append one line to `claude-progress.txt` at the end.

## Layout

- `src/content/work/<slug>.md` is the single source of truth for a project (frontmatter = metadata, body = Problem / Approach / Solution / Outcome). `draft: true` keeps a page out of the build. Schema: `src/content.config.ts`.
- `src/pages/index.astro` composes `Hero`, `WorkList`, `About`, `Contact`; `src/pages/work/[slug].astro` renders one project.
- `src/layouts/Base.astro` owns the head, fonts, `<ClientRouter />` and the two scripts (`src/scripts/reveal.ts`, `src/scripts/follower.ts`). Total client JS stays under 12 KB gzipped (`init.sh` prints the number).
- `src/styles/tokens.scss` holds every color, size and duration as a CSS custom property; `src/styles/global.scss` holds the reset, `.mono`, `.reveal`, `.prose`, `.follower`; `src/styles/_import.scss` is injected into every SCSS block and only carries the `mq()` mixin.
- Media lives in `public/projects/<slug>/` (`cover.webp` 1600 wide, `thumb.webp` 480 wide, `gallery/NN.webp` 1200 wide). Sources come from `../in/my_work_experience/_web/` (outside the repo). `public/projects` stays under 15 MB; HEIC, MOV and PDFs over 2 MB never enter the repo.

## Rules that survived the redesign

- Write per-frame values on the leaf element that consumes them (`transform` on `.follower`), never a custom property on an ancestor: inherited properties invalidate the whole subtree.
- Whatever a script creates it destroys: `cancelAnimationFrame` and listener removal on `astro:before-swap`.
- A hidden state (`opacity: 0`) exists only under `html.js`, so a failed script still shows every word.
- Measure the production build (`npm run build && npm run preview -- --host 127.0.0.1 --port 4347`), never the dev server. Playwright WebKit is a hint, not Safari; label findings *confirmed in WebKit* or *needs the owner's iPhone*.
- Verify visually: screenshot desktop 1440x900 and mobile 390x844 in Chromium and WebKit and look at them. The QA scripts live in `../out/qa/` (`run.mjs`, `follower.mjs`, `vt.mjs`, `lighthouse.sh`).
- Copy: first person, American English, numbers only when the owner or a document confirms them, no adjectives about the author. Owner-approved project texts are verbatim; ask before changing a fact.
- One change per commit. Work on a branch; nothing merges to `main` or deploys without the owner's word.

## Commands

`npm run dev` (127.0.0.1:4321), `npm run build`, `npm run preview -- --port <n>`, `npx astro check`. `./init.sh` runs check + build and prints sizes.

## History

`docs/archive/` holds the notes from the animation-heavy version removed on 2026-09-09. Nothing there describes the current site.
