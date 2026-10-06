# Media picks, portfolio v4 (2026-10-02)

Curated by Opus vision subagents, one per project group. Each one viewed every non-thumb
file in `~/work/works-only/in/mwe-2026-10-02/` (copied read-only from the owner's Mac folder
`~/Desktop/my_work_experienceh`). Paths below are relative to that folder unless absolute.
The main thread opens each pick before it ships.

## TouchPoint
- cover: `_web/touchpoint/touchpoint-21.webp` (focal 58% 42%): both gloves, six fingertip motors, the Pi, the palm buttons
- hero: `_web/touchpoint/touchpoint-01.webp` (focal 50% 51%): the web UI "Feel every word." with the wired gloves; 9:16, so the full frame on a phone; 1600 px wide, so the desktop strip is 1600x900
- gallery, in order:
  1. `touchpoint-05`: at the team desk, UI on the monitor. "QuackHacks 3 at the University of Oregon: 24 hours, a team of three."
  2. `touchpoint-02`: parts on the table, Pi, thumb joystick. "The parts: a Raspberry Pi and a thumb joystick for navigation."
  3. `touchpoint-23`: the schematic. "The Pi driver board he designed: 8 motor channels, 5 debounced keys." (the only proof of the board; no photo shows the soldered board)
  4. `touchpoint-21`: "Six vibration motors, three per hand, play Grade 1 Braille."
  5. `touchpoint-22.mp4`: 141 s; explains on camera 0:00-1:40, glove close-up 1:45-2:20 (loop candidate). New poster at 2:02. Check the audio before publishing.
  6. `touchpoint-11`: demo to a visitor. Privacy: blur the visitor's "HELLO SHABBIR" name tag.
  7. `touchpoint-17`: explaining to two visitors.
  8. `touchpoint-20`: on stage, slide "2nd Overall / TouchPoint". "2nd place overall of 71 submissions at QuackHacks 3."
- on hold: `touchpoint-19`: a slide reading "Track: Goog..." naming TouchPoint and the team, with prize boxes. This matches the owner's note that they were named the Google track winner but a team could keep only one prize, so they kept 2nd overall. The official winners page lists another team for the Google track. Owner to confirm the wording before it ships.
- misfiled: `touchpoint-10` and `touchpoint-12` show chemistry-lab equipment ("CBEE 414 Fall Term 2025"). They belong to Remote Lab Vision.
- rejects: 03 (Google Cloud table, no hardware), 04 (asleep under the desk, owner's call), 06/07/16 (venue only; 06 is a possible section background), 08 (prize pile), 09/15/18 (organizers), 13 (duplicate of 21), 14 (another team)

## SPOOT
- cover: `_web/spoot/spoot-01.webp` (focal 55% 40%)
- hero: `_web/spoot/spoot-02.webp` (focal 40% 55%): the award moment under the BEAVERHACKS banner
- gallery: spoot-01; `spoot-04.mp4` (45 s walk to the stage, new poster at 0:42); spoot-02
- gap: no picture shows the glasses, the mic array, the OLED or the AR page. The page is text-led until the owner supplies hardware photos. The YouTube demo (r0NJpTgAblA, Carson Secrest's channel) can be linked.
- rejects: spoot-03 (duplicate of 02)

## Remote Lab Vision
- The URSA PDF (`chamistry lab - URSA/Jack_presentation.pdf`) is ONE poster page (3312x2592 pt), not a deck. It embeds full-resolution originals. Extract with `pdfimages -png`; p-002 (rig one), p-011 (rig two) and p-012 (camera on stand) need a 90° clockwise rotation.
- cover: `_web/remote-lab-vision/remote-lab-vision-11.webp` (focal 45% 50%): rig one, flow controllers, columns, control box
- hero: `_web/remote-lab-vision/remote-lab-vision-02.webp` (focal 68% 55%): Jakhangir at his poster; the phone crop at x 68% drops the other man
- gallery, in order:
  1. RLV-11: "One of two rigs students run remotely through a computer."
  2. PDF image 11 (rig two): "The second remote rig, with its control box and laptop."
  3. `remote-lab-vision-12.mp4`: 31 s walk through both rigs. Poster at t≈5.5 s. Serve muted (it has an audio track).
  4. RLV-10: "LabVIEW block diagram: the NI-IMAQdx camera capture loop."
  5. RLV-03: "LabVIEW control panel with the camera's live view of the rig."
  6. PDF image 12 / site gallery/06: "Camera test setup: a candidate camera clamped and aimed at the rig."
  7. Poster crop, the camera strip plus the histogram column: "Four cameras compared in LabVIEW by delivered image and RGB intensity histograms."
  8. RLV-01: at the rig. Privacy: the colleague's face is in close-up. Crop from x≥35%.
  9. The full poster, re-rendered from the PDF at about 2400 px: "Research poster: the OBSBOT Meet 2 4K chosen after the benchmark."
- Poster regions to use as slides: the whole page, the Objectives panel, the four-camera strip, the RGB histogram column, Conclusion & Future Efforts.
- Misfiled TouchPoint files 10 and 12 (the CBEE 414 binder and the bubble columns) belong here.
- rejects: RLV-04 (duplicate of 03), 05/06/09 (overlapping diagrams), 07/08 (fragments), the 12 poster (motion blur)

## AMS Tablet (facts to correct; the owner must confirm the new captions)
- cover: `repo/public/projects/ams/images/deploy-construction.webp` (focal 55% 55%): the custom unit with a Raspberry Pi desktop on screen. Only 512 px wide, so ask the owner for the original.
- hero: `mwe-jpg/ams-tablet/IMG_2325.jpg` (focal 38% 32%): the real tablet in use. **Blur three faces** first (it looks like a blood-donor centre).
- gallery: 1 `_web/ams-tablet/ams-tablet-08-01.png` (product render slide); 2 `ams-tablet-07.webp` (instruction card: camera, temperature, breathalyser, pulse sensor; credit line "Данил, Камила, Улан, Джахангир"); 3 deploy-construction; 4 deploy-akimat (finger presses "Открыть дверь"); 5 deploy-police (do not use the wider PDF version: it shows an officer and CCTV); 6 AMS.pdf p.6 phone crop with the nine names blurred
- manufacturing block: these files show **Frigate camera monitoring at a fabrication shop** (people detected), not the tablet being made. M1 `mwe-jpg/ams-manufacture/camphoto_1903590565.jpg` (crop out the IP bar); M2 `IMG_8164.jpg` cropped to the Frigate zone panel (removes "Ulan Aitbay is presenting" and the Meet code). Matches the resume line "YOLO/Frigate person detection".
- AMS.pdf slides: p.1 (product and four checks), p.2 (the problem), p.5 (components: AWS face recognition, remote temperature, pulse oximetry, Dingo B02 alcohol sensor), p.6 (admin app, blur the names), p.7 (five installations). Skip p.3, p.4 (AI art with a typo), p.8-10 (business claims), p.12-13 (faces; p.13 labels him "SEO, Web development"), p.14 (phone number).
- **Wrong on the current site:**
  - `patent.webp` reads **No. 9794** (filed 04.09.2024, published 15.11.2024), not 8784. Authors: Mukhalev, Aitbai, Medet, Kuatova. **Jakhangir is not an author.** Use it only as company context, or drop it.
  - `certification.webp` is a supplier's EAEU declaration for the Alcogran/Dingo B-02 breathalyser (ARIDES, Armenia). It is not an AMS certificate. Remove it.
  - `dashboard-mobile.webp` carries a Gemini-style sparkle watermark and English UI where the original is Russian. It looks AI-edited. Replace it with the p.6 crop.
  - Captions per AMS.pdf p.7: deploy-akimat is ESG's Samal Avenue construction site in Aktau; deploy-construction is Trubremcenter (pipe repair); deploy-industrial is the Aktau regional Akimat (blurry). The owner must approve these site names.
  - "ESG" is a client construction company's brand, on two of the five installs.
  - deploy-manufacturing: a teammate's face fills half the frame. Drop it unless she consents.
- Missing pictures to ask for: Raspberry Pi assembly, wiring or soldering; the OBSBOT on its extrusion mount; AWS or Docker deployment.
- rejects: the award photos (Idea Battle; the award is not a confirmed fact): ams-tablet-01/04/05, IMG_0408, IMG_2610, IMG_2613; the team photos 03/06 and IMG_2326/7644; duplicates 02, 08, IMG_7909; ams-manufacture-01/02/03 and IMG_8163

## Rocket club
- cover: `_web/engineering-rocket/engineering-rocket-07.webp` (focal 55% 45%): the assembled rocket, its avionics and the team. Privacy: the second person's face is clear (owner consent; crop if she is a minor).
- hero: `engineering-rocket-09.webp`, a 1600x900 band at y≈920-1820 (focal 40% 48%): the printed avionics bay, the servo mount, the nose cone
- gallery, in order:
  1. R19 (original `mwe-jpg/root/IMG_1939.jpg`, 1800 px): "Nose cone sections modelled as separate parts for 3D printing."
  2. R05: "Arduino avionics powered on the bench, tested before integration."
  3. R30 poster, cropped 1:1 on the board: "The avionics board: an Arduino with its sensors on perfboard." (video 30 is broken; use the still)
  4. R06, top 60%: "A 3D-printed sled holding the Arduino and its battery."
  5. R04: "Hand assembly: avionics bay and printed rings on the bench."
  6. R02: "The avionics bay fitted between two airframe sections."
  7. R07: "The assembled rocket, with its avionics board alongside."
  8. `engineering-rocket-31.mp4`, **trimmed to 0:00-0:29** (a crowd of schoolchildren after that): "Two rockets set up on the pads." These rockets are coloured, not the printed white one; owner to confirm. A late white streak is probably a contrail.
  9. R20: "Certificate of thanks («Алғыс»), Mangystau region, 2024." The certificate thanks him for youth-policy work in Mangystau, not for the club, so keep the caption neutral.
- rejects: R01/03/08 (GASYR conference, possible minors), R10-18 (slicer duplicates), R21 (duplicate), R22 (another account's Instagram), R23 (image search), R24 (low-res, possibly another creator's), R25-28 (home propellant prep: off the fact list, poor safety optics), R29 (broken)

## GDG on Campus OSU
- cover: `mwe-jpg/root/IMG_2940.jpg`, 3:4 crop from x=430: speaker on stage under the slide "GOOGLE DEVELOPER GROUP On Campus · Oregon State"
- hero: `mwe-jpg/root/IMG_2953.jpg` (native 16:9, focal 44% 60%): speaker under "WHY JOIN GDG?". Probably Jakhangir (same GDG shirt and cap as in the selfie IMG_4078). The owner confirms before any caption names him.
- gallery: 1 IMG_2940; 2 External PDF embedded image 3 (about 30 members under the "Welcome to GDG on Campus @ Oregon State" screen); 3 Internal PDF embedded image 4 (2160x2880, a workshop presenter); 4 External image 5 (small, "Build Projects" slide); 5 External image 4 (chapter table with a Google "G"). Extract with `pdfimages -png`.
- slides: the External (Donors) PDF p.1 at 200 dpi. Hold the Internal (School Heads) p.1: its member chart shows about 300 for 2026 against the owner's "about 200", and it lists COE funding.
- The reports are named "Template", say "Established – 2026" and use the old "Google Developer Student Club" name. Treat them as drafts.
- `gdg-club-01.mp4` (501 MB original, 60 s of three people at a dark curtain, webcam quality): only if the owner confirms it is the chapter's video.

## Rowerlab
- thumbnail: `_web/reverlab/reverlab-04.webp` (from `mwe-jpg/reverlab/IMG_3841.jpg`): rowerlab.pl on a laptop, cropped to the page
- dated before/after evidence, publish only with the owner's OK: GTmetrix F 26% (Jan 2, 2025, IMG_3848) to D 69% (Feb 12, 2025, reverlab-02); PageSpeed desktop 28 (Jan 3, IMG_3846/3847, LCP 6.0 s, TBT 1820 ms) to 50/51 (Feb 12)

## STEP Academy
- thumbnail: `_web/step-academy/step-academy-01.webp`, 3:2 centre crop. The letter states its purpose: a master class on Python.

## Unsorted root files that belong to other projects
- TouchPoint: IMG_2819 (glove prototype with motors and breadboard: strong), IMG_2835 (stage, "2nd Overall — TouchPoint"), IMG_9344 (slide "Track: Google — TouchPoint", team with prize boxes; corroborates touchpoint-19)
- AMS manufacturing: IMG_8163, IMG_8164, camphoto_1903590565, camphoto_959030623 (Frigate workshop monitoring; blur IPs and Meet details)
- ACM@OSU: IMG_4076 (another club's slide, unused)

## Usher (MHacks 2026, added 2026-10-06)
Sources: the owner's uploads, copied read-only to `~/work/works-only/in/mwe-2026-10-06/usher/`
(the Mac stays canonical: `~/Desktop/1..13.jpg` from 2026-10-05, `~/Downloads/IMG_4195/4212/4213.HEIC`,
`56E07395-….JPG`, and three HLG clips tone-mapped to `_sdr/`). Viewed by the main thread.
- cover: `desktop-8.jpg` (focal 50% 55%): the headset on the table, the mic array on its mount, the motors taped at the temples
- hero: `desktop-2.jpg`: the headset worn, eyepiece down (a teammate's face; the team is on Devpost)
- app: `judge-app.png`: the judge web app in its scripted demo, captured headless from the repo's `frontend/index.html`
- gallery, in order on the page: g01 `desktop-3` (the web app on a laptop, him in the feed); g02 `desktop-1`
  (a teammate at the curved monitor with the tunnel-vision overlay); g03 `desktop-5` (the parts);
  g05 `desktop-7` (the headband printing on an Elegoo); g07 `desktop-11` (breadboard on the band);
  g08 `desktop-12` (prototype, the OLED hanging, face sketches on the whiteboard); g06 `desktop-9`
  (the team on the floor at night); g04 `desktop-6` (a teammate seated in the headset, him beside);
  g12 `IMG_4213` (the four of them behind the MHACKS letters)
- held, not imported (in the picker's pool only): `desktop-13` (headset + OLED + Pi, a near-duplicate of 12);
  `hall-selfie` (him in the judging hall); `IMG_4195` is denied in `docs/pick-deny.json` (two people in it are
  not on the team and have not said yes)
- clips: `demo` = `video-1871` (12 s, the headset worn at the judging table, the Pi in hand), silent;
  `table` = `IMG_4190` cut to 62-102 s (a teammate wearing the headset while another wires and explains),
  with sound. `video-1864` (10 s, two teammates at table 60) not used.
- rejects: `desktop-4` (a matcha cup)
- privacy: strangers in the background of 1 and 7 are small and turned away; the judging-hall clips show
  other teams at their tables in passing.

## Zyp, second round (2026-10-06)
Captures of the public site by `scripts/zyp-captures.mjs` (chromium, 1440x900 @2x), in
`~/work/works-only/in/zyp-captures-2026-10-06/`, manifest `docs/media-manifest-zyp-2.json`:
- header: the glass pill and Book a demo over the blurred office (a 1440x160 clip)
- trusted: the logo row and the statement under the hero's end
- tablet: the dashboard band
- films: the Clients film window with its transport
- globe: the whole coverage globe (replaces the 2 October crop g04 on the page)
- not used: ring (the testimonial ring shows "Coming soon" placeholders on the live site)
