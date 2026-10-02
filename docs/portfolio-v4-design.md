# Portfolio v4: design and progress

Branch `feat/portfolio-v4`, from `night/restore-2026-09-30` @ 401a391. Nothing is pushed or
deployed. The preview is `portfolio-preview` on tailnet :4400, serving `dist/`.

Approved plan: `~/.claude/plans/glittery-whistling-moon.md`. The owner is flying and
unreachable (2026-10-02 evening PT). Work runs autonomously and ends in a Russian report.

## Owner decisions (2026-10-02)
- Prize wording is exact and official: 2nd overall of 71 (QuackHacks 3) and 3rd in Google's
  Best Use of Gemini track (BeaverHacks 2026). Never "won both".
- The Work carousel has seven cards: TouchPoint, SPOOT, AMS Tablet, Remote Lab Vision, Rocket
  club, Zyp internship, GDG on Campus OSU. GDG is emphasised: he is President, about 200
  registered (owner's figure).
- Rowerlab (rowerlab.pl, remote, a company in Poland) goes into the timeline.
- His top priority is the best photos. Picks are in `docs/media-picks.md`.
- Pending last task: the Discord post. See `~/work/school/out/mhacks-2026/discord-team-post.md`.

## Research inputs (Opus lanes, 2026-10-02; every URL was opened by the lane)
### Motion
- **Name sign:** curved like the carousel, distant, no live filter. Decision: a build-time
  SVG with per-glyph cylinder projection (`src/utils/cylinderText.ts`). It is cheaper than
  static CSS 3D letters and avoids WebKit bug 278043 (blurry text next to a 3D sibling).
- **Blur band:** `backdrop-filter` re-filters on every frame the wheel moves (cost grows with
  area × radius, developer.chrome.com/blog/animated-blur), and iOS 16 hung on Gaussian blur
  (WebKit 249314). Decision: each card gets a pre-blurred copy of its shot whose opacity
  rises with the card's angle, computed in CSS from the existing `--turn`, so there are no
  new JS writes. A static white haze sits at the screen edges.
- **Rocket companion:** a sticky 100svh stage in a margin lane spanning the bento section.
  The path is authored in viewport space and sampled once per resize. One scrub drives it.
  The crash continues on the same timeline: fly on, tumble, impact, burst, wipe. The burst
  disc is laid out at its final size and scaled up from about 0.02. At phone width the lane
  runs behind the cards.
- **WORK:**
  - Pin and scrub. Phase A: the letters, reusing the tunnel's measured letter code where
    possible.
  - Phase B: seven cards placed once at `rotateY(i·360/7) translateZ(R)`, with
    R = (w/2)/tan(π/7). One ring transform per frame.
  - Drag goes through a Draggable proxy that calls scrollTo. Scroll stays the one source of
    truth.
  - Snap in 1/7 steps.
  - Reduced motion: a flat row with native scroll-snap.
- **Paradise:**
  - A sticky stage with one scrub.
  - Sky: space, indigo and dawn gradient layers, cross-faded by opacity, never by tweening
    background colour.
  - A pre-rendered sun-ray image, slowly rotated.
  - Three or four hill layers with translateY parallax.
  - Two or three rows of grass tiles, swayed by `skewX` ±3° from the bottom on a
    `repeat:-1` GSAP timeline, paused off-screen.
  - The path is drawn with one `stroke-dashoffset` scrub (length from `getTotalLength()`
    once per resize).
  - Milestones pop by class toggle.
  - All glow is baked into images.
- **iOS:**
  - A filter, mask, opacity < 1 or overflow other than visible/clip flattens `preserve-3d`.
  - Use svh, not dvh.
  - Never put `content-visibility` on a 3D ring.

### Case-study pages (Awwwards SOTD and Honorable Mention portfolios, Aug-Sep 2026)
References: pensatori-irrazionali.com, boc.studio, revelatio.studio, k95.it,
lxlcreative.co.uk, artemartemartem.com, michaelgatt.com, khanhnguyen.design, haoqi.design,
jesperlandberg.com, gilhuybrecht.com, meermohsin.me, juliencalot.com, gionatannese.com.

Every case study ends on a next-project card. Measures are short (26-45ch for ledes).
Captions sit under full-bleed figures. A Details block (Role / Year / Stack) opens each page.

| Project | Concept | Signature (transform/opacity only) |
|---|---|---|
| TouchPoint | "The plate": a Braille-cell title; the schematic as a zoomable plate with four callouts; question headings; a numbered contact sheet | plate zoom (one layer, laid out zoomed, scaled down at rest) |
| SPOOT | "One video, one bearing": the shortest page on black; a thesis sentence; the video in a compass ring; "How it hears" in three figures | bearing needle (one SVG group rotate) |
| AMS Tablet | "Spec sheet": split screen with a sticky product photo; four numbered checks; deployment pairs; the deck as a horizontal track | sticky screen crossfade per check |
| Remote Lab Vision | "The paper": typographic opening, abstract, numbered sections, Fig. n captions, a sticky figure rail | rail crossfade by IntersectionObserver |
| Rocket club | "Launch log": stills before words; a build film strip; launch contact sheets of muted clips | FLIP from tile to lightbox |
| Zyp | "The live artefact": a zyp.co recording in a browser frame; deliverable sections with short loops | the frame lands (rotateX 14° to 0°) |
| GDG | "Annual report": full-bleed event video; tally line "~200 members"; the impact report as a spread | page turn (rotateY of one page) |

- **Shared type:**
  - Bigger Display titles: clamp(56px, 10vw, 168px)/0.88.
  - Editorial New ledes at ≤34ch.
  - Geist body 18/1.6 at 60-66ch.
  - Fraktion Mono labels at 12-13px.
- **Shared components:** Meta, Figure, Clip (preload none, poster, IntersectionObserver
  play/pause, muted), Deck, Sheet, Plate, Credits, Next.
- **Contact:** concept A, "The last line". One full-width Bigger Display sentence with one
  accent word; the email as the largest link with Write/Copy; GitHub / LinkedIn / Devpost
  in mono; a local-time status line. No resume link.

## Progress log
- B3 (item 4), 36ec446: the bento closing line sits in the grid's empty cell.
- B1/B2 (items 3a/3b), db0a2df: the name on a cylinder behind the wheel (build-time SVG
  projection), pre-blurred card twins instead of backdrop-filter lenses, a full-bleed stage,
  curved mono lines that type in. Desktop idle-top 50.0/66.7 -> 33.3/50.0.
- B4 (item 5), 10e2159: the rocket flies beside the bento in a sticky stage (behind content
  on desktop, edge lanes in front on phone), loops, tumbles, crashes; flash, debris, burst
  and wipe come from the impact point. Phone x4 rocket-down: 8 frames over 50 ms (was 4-5).
- Data (f4404e7): `src/data/projects.ts` (seven carousel entries with sources) and
  `src/data/media.ts` (a build-time reader for media.json). Zyp has no photos, so zyp.co
  was captured: screenshots and a scroll recording.
- Media (7243e6f, bb31af1): 65 curated items imported, privacy fixes checked by eye, HDR
  clips converted to SDR; two rocket-club avionics clips found among the unsorted videos.
- B5 (item 6), fa0d259 and 5e5a561: WORK letters as concave rings (the tunnel), then a 3D
  carousel of the seven. The hero wheel and the work stage leave the layer tree when a
  screen away. That cut phone x4 rocket-down from 13-18 to 1 frame over 50 ms.
- B6 (item 7), 9373c8e (and harness phases 43f30d6): the descent from space (painted sky,
  clouds, meadow) and the walk (trail, ten signposts, firefly, swaying grass).
  AnimeCampus and AnimeTimeline are no longer on the home.
- B7 (item 8), ff89693: AnimeContact on a dusk sky, no resume link anywhere.
- Phase 3: the case system 27f07ed, TouchPoint d80b885. Six Opus agents are building
  SPOOT, Zyp, GDG, Remote Lab Vision, AMS and Rocket club in parallel (one file each).
- Then: switch the hero wheel to the seven projects and re-shoot their pages; the full
  suite; /simplify and /code-review; the CLAUDE.md as-built; the Discord post; the report.
