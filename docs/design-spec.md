# Minimal redesign — design spec

Date: 2026-09-09. Owner decisions recorded in this file are final unless the owner changes them.

## Decisions (owner, 2026-09-09)

1. Full minimal redesign. Three.js hero, 240-frame rocket sequence, letter-tunnel Work section and the dive transition are removed, not fixed.
2. GoChain is removed. Private Clinic, Engineering Rocket and AMS Tablet are rewritten from real material; their pages stay hidden (`draft: true`) until the owner answers the fact questions in `docs/plans/2026-09-09-minimal-redesign.md`.
3. Result is shown on the VPS over Tailscale and pushed as branch `redesign/minimal`. Nothing merges to `main` and nothing deploys to Vercel until the owner says so.
4. Hero line: "CS + Physics student, Oregon State. Builds hardware and web."

## Goal

A portfolio a recruiter or professor reads in two minutes and believes. Every sentence is specific and defensible. Nothing on the page exists to look impressive; the work does that.

## References (awwwards, verified 2026-09-09)

- gionatannese.com (SOTD 2026-09-05, minimal, portfolio): vertical project list, title + discipline tags + 2-3 sentence blurb, sparse nav, text-forward.
- arturospatino.com (minimal, portfolio): neutral light ground, numbered sections (001, 002), generous line-height, imagery that breathes.
- Common pattern across the awwwards "portfolio" and "minimal" tags: one serif display face + one mono for metadata, off-white or near-black ground, a numbered list of work with hover previews, one page per project, contact as the last section with the email as the largest element.

## Aesthetic

- Ground: warm off-white `#fff2ed` (already in the palette). Ink: `#160000`. Muted ink: `rgba(22,0,0,.55)`. Rule lines: `rgba(22,0,0,.14)`. Accent `#f40c3f` only for link hover underline and the focus ring. No dark mode in v1.
- Type: PP Editorial New Regular for display and prose (already licensed, in `public/fonts`). PP Fraktion Mono Regular for labels, numbers, metadata, nav. Bigger Display is dropped.
- Scale (fluid, `clamp`): display `clamp(3rem, 9vw, 8.5rem)` line-height 0.95; list title `clamp(2rem, 5vw, 4.5rem)`; prose `clamp(1.0625rem, 1.2vw, 1.25rem)` line-height 1.5, measure 34em; mono `0.75rem` letter-spacing `0.08em` uppercase.
- Grid: 12 columns, gutter `clamp(1rem, 2vw, 2rem)`, page padding `clamp(1.25rem, 4vw, 4rem)`. Sections separated by a 1px rule and `clamp(5rem, 14vh, 12rem)` of space.
- No cards, no shadows, no gradients, no blur, no emoji, no icons except an arrow glyph.

## Motion

- Page load: nothing blocks. Hero words fade + rise 0.4em over 400ms with a 60ms stagger (line at 160ms), once. No loader, no progress bar. Hidden states exist only under `html.js`; without JS every word is visible.
- Scroll reveal: labels, summaries, metadata and gallery items get `opacity 0 -> 1`, `translateY 0.4em -> 0`, 400ms, `cubic-bezier(.2,.7,.2,1)`, once, when they enter the viewport (IntersectionObserver, threshold 0, rootMargin -12% bottom). Elements already in view on load or after a view-transition swap reveal synchronously. Titles that carry a `transition:name` and prose bodies never sit under a reveal. No pinning, no scrub, no parallax.
- Work list hover (pointer: fine only): a 320x200 cover follows the cursor with a lerp of 0.12 per frame; it appears on the first pointermove over a row (never on scroll under a resting cursor), fades in 200ms after the image has decoded, swaps on row change, hides on scroll and on leave. rAF loop runs only while a row is hovered and is cancelled before a view-transition swap. Thumbs are warmed on idle. On touch devices each row shows its cover inline below the title, no JS.
- Page transitions: Astro `<ClientRouter />` view transitions, 300ms crossfade; project title uses `transition:name` so it persists from list to page. Falls back to a normal navigation where unsupported. Under reduced motion the view-transition pseudo-elements get `animation: none`.
- `prefers-reduced-motion: reduce` turns every transition and the hover follower off; content is visible immediately.
- No Lenis, no GSAP, no Three.js. Total client JS budget: under 12 KB gzipped.

## Pages

### `/`

1. Nav (sticky, mono): `JT` wordmark left; `Work`, `About`, `Contact` right; on mobile the three links stay visible (no burger).
2. Hero: "Jakhangir Tynshimov" as the display line, then the hero line in mono. Below it, one small line "Now — <current role>" once the owner confirms the ZIP wording; omitted until then.
3. Selected work: heading "Selected work" + count. Numbered rows `01 … 06`. Each row: index (mono), title (serif), one-line summary (prose, muted), meta right (year, kind). Whole row is the link. Hover preview as above.
4. About: two paragraphs, first person, facts only (Oregon State, CS + physics, hackathons, URSA research, rocket club presidency in Kazakhstan). Then a mono list: "Currently", "Based in", "Email", "GitHub", "LinkedIn".
5. Contact: "Say hello" heading, email as the largest text on the page, GitHub and LinkedIn links.
6. Footer: "© 2026 Jakhangir Tynshimov", "Set in Editorial New and Fraktion Mono", "Built with Astro", local time in Oregon (static text, no JS clock).

### `/work/<slug>`

1. Nav (same).
2. Header: index + title (display), one-line summary, meta grid (Year, Role, Team, Stack, Where, Links).
3. Cover image (`<img>` with width/height, `loading="eager"`, `fetchpriority="high"`).
4. Prose sections in this order: Problem, Approach, Solution, Outcome. Markdown body rendered from the content collection.
5. Gallery: CSS grid, 2 columns desktop, 1 column mobile, `loading="lazy"`, explicit width/height, captions in mono. No lightbox.
6. Downloads / links list (mono).
7. Next project link (title + arrow), then footer.

## Content model

Astro content collection `work` (`src/content/work/<slug>.md`), schema in `src/content.config.ts`:

```ts
{
  title: string
  summary: string            // one line, shown in the list and page header
  year: string               // "2026" or "2023 — 2025"
  kind: string               // "Hardware + web", "Research", "Product"
  role: string
  team?: string
  stack: string[]
  where?: string             // "QuackHacks 3.0, University of Oregon"
  links?: { label: string; href: string }[]
  cover: { src: string; alt: string; width: number; height: number }
  gallery?: { src: string; alt: string; width: number; height: number; caption?: string }[]
  order: number              // list position, ascending
  draft: boolean             // true = excluded from build
}
```

Body: Markdown with `## Problem`, `## Approach`, `## Solution`, `## Outcome` headings. Text for TouchPoint, SPOOT and Remote Lab Vision is copied verbatim from `PROJECT-PAGE-PROMPTS.md` blocks 06-08 (owner-approved), with the honest-limitation sentences kept.

## Media

- Source: `~/work/works-only-project/in/my_work_experience/_web/<slug>/` (converted webp library from the Mac, `manifest.json` + `MEDIA-INDEX.md`), plus `public/projects/ams/images/*.jpg` already in the repo.
- Output: `public/projects/<slug>/cover.webp` (1600 wide), `gallery/NN.webp` (1200 wide), `thumb.webp` (480 wide, used by the hover preview). Quality 82. Every image gets width/height in the collection entry.
- Budget: `public/projects` <= 15 MB after the change (it is 11 MB of AMS JPGs today; those become webp).
- Never commit HEIC, MOV, PDF over 2 MB, or the 240-frame sequence.

## Accessibility and quality gates

- axe: 0 serious/critical. Lighthouse (production build, mobile): Performance >= 95, Accessibility 100, Best Practices 100, SEO >= 90.
- Keyboard: every link reachable from the top with a visible focus ring; no zero-area links.
- 0 console errors in Chromium and WebKit, desktop 1440x900 and mobile 390x844.
- Text contrast >= 4.5:1 for prose, >= 3:1 for large display text.
- `<html lang="en">`, one `<h1>` per page, real `<title>` and description per page, `robots` stays `noindex` until the owner asks to index.
- Real Safari on the owner's iPhone before merge: `safari-gate` checklist in the plan.

## Copy rules

- First person, past tense for finished work, present for ongoing.
- Numbers only when the owner or a document confirms them. Claims like "first in the world" are out; "we searched for X and found none that does Y" is in.
- No adjectives that describe the owner ("passionate", "innovative", "detail-oriented"). Describe the work instead.
- British/American: American English.
