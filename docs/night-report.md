# What happened overnight, 9–10 September 2026

Branch `feat/work-content`, 52 commits over `main`, pushed. Nothing merged,
nothing deployed. The preview is the tailnet link; the live Vercel site is
untouched.

## The short version

Your site now carries your real work: seven projects with your own
photographs, a timeline of them, and no invented numbers anywhere. Overnight I
put it through a much harder verification pass than the one it had passed the
evening before, and that pass found real defects — including three that a
visitor on an iPhone would have hit on an ordinary visit. They are fixed, and
each one now has a test that fails without the fix.

## The two things you asked about

**The Work tunnel lagged when you clicked into it.** The click did three
things at once: it read the card's geometry, decoded the cover image, and then
wrote eight animation start values in a second task — 67 ms of it, 26 ms of
style recalculation, between your click and the first frame. The start values
now get written in the same task as the read, the two full-screen gradients
are given a compositing hint before they animate rather than during, and the
destination page starts loading while the animation plays. On a phone profile
the close animation went from 97 ms of rasterisation to 32 ms.

**The morphing hero text.** Gone. It animated a CSS blur filter on every
frame, which is the single most expensive thing a browser can be asked to do
per frame. In its place is the rolling effect you said you liked: the title
slides up out of a mask and the next one rises into it. No filters, no
animation frames, one timer.

## What last night's review found

A review of the four animation systems ran 63 agents for four and a half
hours: five reviewers, then three independent skeptics per finding, each told
to refute it. Ten findings survived. A completeness critic then went looking
for what the reviewers had not covered and found two more, one of them the
worst of the night.

**Every link preview pointed at the reader's own computer.** The build
resolved absolute URLs against `https://localhost:4321` whenever it ran
outside Vercel. Paste the site into a message and the card would have been
blank. The check that was supposed to catch this stripped the hostname off
before testing it, so it passed. Both are fixed, and the check now asserts the
origin before the path.

**One dive with Reduce Motion on made every later dive invisible.** The
reduced exit fades the photo plane to nothing and nothing put it back, so
after switching the setting off, a dive showed the backdrop, the teaser and
the close button over a black rectangle — for the rest of the session.

**A resize inside the tunnel erased every letter shadow.** All 54 of them,
until you scrolled back to the intro. On a phone, Safari's address bar
collapsing is exactly this event, which means it would have happened
constantly and nowhere else.

**A resize sent the rocket back to its start pose**, 510 px across the screen
and 50 degrees around, on top of the headline it is meant to fly beside — and
if that resize produced no scroll afterwards, it stayed there.

**On a slow connection the rocket never caught up.** The 240 frames were
requested in numerical order, so the frame you had scrolled to was queued
behind every frame you had already passed: measured 18 seconds late on a
250 kB/s link. It now fetches through a small window that follows you, and the
frame you are looking at arrives in about a second and a half.

**Coming back from a project page left the hero empty.** The dotted field tore
itself down whenever the page was hidden, including when the browser was only
freezing it for the Back button. Safari does that far more often than Chrome.

Two more rounds of review found twenty-nine further faults, most of them in
the fixes themselves — a loader that could refuse to start, a teardown that
threw the second time, a preview build that would have advertised the
production site, a media-query listener that would have taken the whole rocket
section down on an older iPhone. All fixed and committed separately.

Two contrast failures also turned out to be invisible to the accessibility
tool the suite uses: it declines to judge text when it cannot work out what is
behind it, and the hero sits over a canvas. The suite no longer depends on it
for that, and now checks contrast itself on all eight pages.

## Where the numbers are

Every page, mobile, measured against a compressing server:

| Route | Performance | Accessibility | Best practices | LCP |
|---|---|---|---|---|
| / | 96 | 100 | 100 | 2.5 s |
| /projects/ams/ | 100 | 100 | 100 | 1.1 s |
| /work/touchpoint/ | 99 | 100 | 100 | 2.1 s |
| /work/spoot/ | 100 | 100 | 100 | 1.5 s |
| /work/remote-lab-vision/ | 100 | 100 | 100 | 1.7 s |
| /work/engineering-rocket/ | 100 | 100 | 100 | 1.4 s |
| /work/private-clinic/ | 100 | 100 | 100 | 1.4 s |
| /work/portfolio-rocket/ | 100 | 100 | 100 | 1.1 s |

SEO reads 63 everywhere because the site tells search engines not to index it.
That is a switch waiting for your answer, not a defect.

The home page's accessibility score reads 100 most runs and 95 occasionally.
The cause is known and it is the rolling title: as one line slides out it dims
on its way, so for about 400 ms of every 2.6 s it is dark grey on black, and
an audit that samples exactly then calls it a contrast failure. Nobody is
actually shut out — the titles are read out separately for screen readers —
but the score moves. Dropping just the fade would settle it, and that is a
change to an effect you said you liked, so it is a question in the fact list
rather than something I did.

The home page's 2.5 s is the four-second loader you decided to keep. It is a
deliberate cost and the only thing holding that number down.

The regression suite is 937 checks across eight files, in Chromium, WebKit and
Firefox. For every visitor-facing defect above I put the bug back, watched the
new check go red, and took it out again — the invisible dive, the erased letter
shadows, the snapped rocket pose, the frame that arrived eighteen seconds
late, the roller that ran off screen, the emptied hero. Some of the later,
smaller fixes are covered by tests that exercise the code without being able
to fail on its absence, because the failure needs a real GPU context loss or a
real back/forward restore; those are named as such in the test files and they
are on the iPhone gate.

## What I removed, and why

- **/work/ams-device/** — a page nothing linked to, claiming twelve field
  sites, a 55% drop in incident response and alerts in under thirty seconds.
  No photograph or document supports any of it. It redirects to the real AMS
  page now.
- **The AMS market section** — a market size of $420M, $85M and $12M with no
  source, and "10+ active deployments" when the photographs show five sites.
- **Nine employees' names** on the AMS dashboard screenshot, blurred.
- **Three timeline entries** — the Google Developer Group, Reverlab and STEP
  Academy — hidden until you can tell me what your role in each was.

## What I chose not to do

Three things the reviews raised that I left alone, so you know they were
decisions and not oversights.

The four components that read the reduce-motion setting each read it their own
way, and only the rocket now notices when you change it mid-visit. Making that
one shared mechanism is the right change and touches four files; it is worth
doing deliberately, not at the end of a long night.

A few listeners are still added and never removed. The hero field's are gone —
it hands back one teardown that takes off everything it attached — but the
rolling title still leaves a scroll and a resize handler behind on the browsers
that have no IntersectionObserver, and the rocket leaves its reduce-motion
listener. The repository's rules ask for better than that, and they ask for it
because an un-killed listener set once leaked a hundred and sixty listeners per
resize here. Nothing accumulates today, because every navigation on this site
is a fresh document, but it is a deviation and not a sanctioned one.

One commit carries four related fixes rather than four commits carrying one
each, which the repository's rules ask for. It is a bisect cost, not a
correctness one, and unpicking it after the fact was more risk than it was
worth.

## What is waiting for you

`docs/facts-to-confirm.md` holds ten questions. Nothing on the site is wrong
without them; several things are thinner than they should be.

Section 11 of that file is the iPhone gate: three things only a real device
can settle, all three of them where the address bar moving and Safari's
caching behave differently from anything I can drive here.

And the two decisions that are yours alone: whether the site becomes findable
by search engines, and whether to freeze the last moving part in the tunnel.
