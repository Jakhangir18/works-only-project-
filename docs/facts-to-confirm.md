# Facts to confirm

Fill in the blanks and send the whole file back, or answer by number in chat. Everything here is either missing from the site or is a guess drawn from file dates, and a guess does not go on a public page.

Guessed dates come from when files were saved on the Mac, which is not when the thing happened. Correct them freely.

---

## 1. TouchPoint — QuackHacks 3.0

- Prize: the QuackHacks site lists **Meta glasses** for 2nd overall; your note says **iPhone**. Which is right, or leave prizes off the page?
  Answer: ________
- Hardware: **six** motors on the fingers and **eight** channels on the board — correct?
  Answer: ________
- "NEMO" is written on the schematic. What is it — the team, the board, something else?
  Answer: ________
- Date on the page now: **May 2026**. Correct?
  Answer: ________

## 2. SPOOT — BeaverHacks 2026

- Direct GitHub repository URL (the page links your profile, not the project):
  Answer: ________
- Month: the text says **April 2026**, the photographs are dated **May 2026**. Which?
  Answer: ________
- Is there a photograph of the glasses themselves? The folder has only the award ceremony.
  Answer: ________

## 3. Remote Lab Vision — URSA Engage

- Start and end of the project (guessed **Nov 2025 — Apr 2026** from photo dates):
  Answer: ________
- Professor Lucas Ellis's exact title (Professor, Assistant Professor, Instructor?):
  Answer: ________
- Stephen Stockton's role:
  Answer: ________
- Was the poster published anywhere with a public link?
  Answer: ________

## 4. AMS Tablet

- Your role and your dates (guessed **Oct 2023 — Apr 2026**):
  Answer: ________
- The photographs show deployments at a regional government office, a construction site, an industrial site, a manufacturing plant and a police checkpoint. Which of those actually shipped, and roughly when?
  Answer: ________
- The images include a patent and a certification. Whose are they, and what do they cover?
  Answer: ________
- One photo shows an "IDEA BATTLE 500 000 ₸" cheque with Mangystau Hub and Aralteс branding. What was that, and did you win it?
  Answer: ________
- The page used to claim a market size — TAM ~$420M, SAM ~$85M, SOM ~$12M — and
  "10+ active deployments". Nothing supports any of those, so the market
  section is gone and the deployment figure now says what the photographs
  show: five sites. Give me the real numbers and I will put them back with
  their source named.
  Answer: ________

### Two things on the AMS page that involve other people

- **The dashboard screenshot published nine employees' names with their
  check-in times, and highlighted in red who arrived late on 9 October 2024.**
  That is other people's attendance record on a public page. I blurred the
  name column; the interface still reads and the original is untouched in your
  media folder. Say the word if you have their consent and want it back.
  Answer: ________
- One deployment photograph shows a colleague's face clearly. Photographs of
  people at work are normal on a portfolio, so I left it — but you know them
  and I do not. Keep it?
  Answer: ________
- The tablets in the deployment photographs are branded **ESG**, not AMS. Is
  ESG the product name, the client, or the manufacturer?
  Answer: ________
- The patent image is a Republic of Kazakhstan utility model patent, № 8784,
  registered 2024, and the certification is an EAEU declaration of conformity.
  Are you named on either, and may the documents stay on a public page?
  Answer: ________

## 5. Engineering Rocket

- Club name and city:
  Answer: ________
- Years you were involved, and were you the president (the folder is named "rocket club - presidence"):
  Answer: ________
- Did the rockets fly? How many launches, and to what altitude?
  Answer: ________
- What did you design yourself, as opposed to the club collectively?
  Answer: ________
- The certificates say "Алғыс" — what were they awarded for? The one on the
  page is made out to Тыңшымов Джахангир, dated 2024, and mentions the
  Mangystau region, which is the only hard date I have for this project.
  Answer: ________
- How many people were in the club?
  Answer: ________

## 6. Sadap Clinic

- Which parts were yours and which your partner's (the repository is under `kuatovakamila`)?
  Answer: ________
- When did you work on it (guessed **Jan 2026**)?
  Answer: ________
- Is it fine to name the collaborator on the page?
  Answer: ________

## 7. Current role

- Is "frontend and 3D interaction engineering at ZIP" accurate, and may it be said publicly (check your internship terms)?
  Answer: ________
- Spelling: **ZIP** or **Zip**?
  Answer: ________
- Start date (guessed **Aug 2026**):
  Answer: ________

## 8. Timeline entries that are hidden until you confirm them

These three are written but do not render, because I cannot verify your role in them.

- **Google Developer Group on Campus, Oregon State** — guessed Apr–Jun 2026. Your role? The folder holds two impact reports and a video.
  Answer: ________
- **Reverlab / rowerlab.pl** — guessed Jan–Feb 2025. The photographs are PageSpeed reports for a Polish bicycle shop. What did you do, and for whom?
  Answer: ________
- **STEP Academy** — guessed May 2025, a letter of thanks. What was it for?
  Answer: ________

Anything else that belongs on the timeline? ACM, Microsoft Ambassador and Mangistau HUB have folders on your Mac but no material in them.
  Answer: ________

## 9. Contact and reach

- LinkedIn URL:
  Answer: ________
- Keep the public email as `tynshimj@oregonstate.edu`?
  Answer: ________
- Should the site be indexable by search engines? It carries `robots: noindex` today, so nobody can find it.
  Answer: ________

## 10. Two design calls

- ~~The home page holds a four-second "Loading Experience" screen. Keep it, shorten it, or drop it?~~
  **Answered 2026-09-10: keep it.** The home page's largest contentful paint therefore stays around 3.8 s on mobile with compression, and that is a deliberate cost, not a defect. Nothing further to do here.
- In the Work tunnel each letter's shadow shifts by about 1.6 px per frame. Freezing it would cut more per-frame work; it would also make the tunnel very slightly stiller. Freeze it?
  Answer: ________

## 11. The iPhone gate — three things only a real device can settle

Everything else in this branch is measured. These three are not, because the
automation cannot produce the input that triggers them.

1. **The letter shadows in the Work tunnel, while the address bar moves.**
   Scroll down into the tunnel, then back up, several times, so Safari's
   address bar collapses and returns. Every letter should keep its drop
   shadow throughout. This was broken until this morning and is now covered by
   a test at two viewports in two engines, but a desktop resize and an iOS
   address-bar collapse are not literally the same event.

2. **A dive taken while the address bar is moving.** Tap a card, and while the
   dive plays, scroll-flick so the bar changes height. The photo should end up
   filling the screen at the right size, not oversized or shrunken.

3. **The hero field after the Back button.** Open a project from the tunnel,
   then press Back. The dotted surface behind the hero should still be there
   and still moving. Safari restores pages from its back/forward cache far
   more often than Chrome does, and no browser automation on this host would
   produce that restore, so it is untested. The teardown now distinguishes a
   real unload from a freeze, which is the fix; the device is the proof.

If any of the three misbehaves, a short screen recording is worth more than a
description.
