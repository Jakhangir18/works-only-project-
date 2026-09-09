---
title: "SPOOT"
summary: "AR glasses that show where a sound came from, and whether it is worth turning for."
year: "2026"
kind: "Wearable + AI"
role: "Phone AR layer, glasses hardware, Raspberry Pi bring-up"
team: "With Carson Secrest"
stack: ["Raspberry Pi", "reSpeaker 4-Mic Array", "faster-whisper", "Gemini Flash", "SSD1306 OLED", "Flask", "WebSocket", "PWA"]
where: "BeaverHacks 2026, Oregon State University"
links:
  - label: "Watch the demo"
    href: "https://www.youtube.com/watch?v=r0NJpTgAblA"
  - label: "Source on GitHub"
    href: "https://github.com/Jakhangir18"
cover:
  src: "/projects/spoot/cover.webp"
  alt: "The SPOOT team on stage receiving the Google track award at BeaverHacks 2026"
  width: 1152
  height: 1200
gallery:
  - src: "/projects/spoot/gallery/01.webp"
    alt: "On stage under the BeaverHacks banner during the award ceremony"
    width: 1200
    height: 900
    caption: "BeaverHacks 2026, Google track, third place"
  - src: "/projects/spoot/gallery/02.webp"
    alt: "The two-person team in the corridor after the ceremony"
    width: 1200
    height: 1600
    caption: "After the ceremony"
order: 2
draft: false
---

SPOOT, Sound Point Of Origin Tracker, is a pair of 3D-printed glasses that tell you where a sound came from and whether it is worth turning your head for. Built in 24 hours at BeaverHacks 2026 with Carson Secrest, for the Google track. I built the phone AR layer, the glasses hardware, and the Raspberry Pi bring-up.

## Problem

Locating a sound is not something one ear can do. The brain works it out by comparing two signals: which ear the sound reached first, and how much louder it was there. Take one ear out and that comparison disappears. The sound is still audible, but it arrives from nowhere. Someone with single-sided deafness turns the same way every time regardless of where the sound actually came from, because nothing in the signal says which way to look. A car behind you, a bike on your right, someone calling your name across a room: all of it lands as undirected noise. But direction alone is not the whole problem either. A HUD that flags every sound in a loud room is a HUD you learn to ignore. The real question a wearable has to answer is narrower: does this one deserve a glance?

## Approach

We split it into a hardware problem and a judgement problem, and refused to solve the hardware one twice. Direction of arrival is already solved silicon. A reSpeaker USB 4-Mic Array with an XVF3800 does beamforming and reports continuous azimuth, so we read the bearing off the vendor tool instead of writing our own. That freed the whole 24 hours for the judgement half. Speech stays on the device: RMS-triggered buffering with adaptive pre- and post-capture windows, an optional Silero VAD gate, then faster-whisper transcribing locally on the Pi, so raw audio never leaves the glasses. Only a compact context goes to the cloud, a transcript snippet, the bearing in degrees, and a volume RMS, and Gemini Flash returns a constrained JSON object: event type, importance, whether it was directed at the wearer, and an eight-word message. Flash-class specifically, because a direction cue goes stale in about a second; one short round trip with a handful of tokens beats a second heavyweight model competing with Whisper for the Pi's RAM and thermal headroom.

## Solution

One pipeline drives two displays. A WebSocket feed on port 8765 paints a clip-on SSD1306 OLED mounted on the frame; a Flask endpoint mirrors the same state to a phone AR overlay that draws bearings over the camera feed as a progressive web app. Both render the same short Gemini caption, so the wearer never reads raw speech-to-text: "car, right" arrives as a warning and "Jak, behind you" arrives as a social cue, already triaged. The system is name-aware: the wearer's name and its aliases are seeded into both Whisper's decoding bias and the Gemini prompt, with fuzzy and phonetic matching, so being called by name survives a noisy room. It is also failure-aware, which matters more than it sounds on a Pi tethered through a phone hotspot. Configurable request spacing, exponential backoff and per-call timeouts against rate limits mean the HUD degrades quietly instead of freezing mid-glance.

## Outcome

SPOOT took third place in the Google track at BeaverHacks 2026, a 24-hour hackathon at Oregon State in April 2026, on a two-person team. It was my first hackathon in the United States. Off-the-shelf assistive hardware for single-sided deafness amplifies or reroutes sound; we found none that renders direction visually, and none that decides what is worth surfacing before it reaches the display. That second layer is what the project is really about. The honest limits are hardware-shaped: azimuth depends on the vendor tool and needs a left-right calibration flip depending on how the mic board is mounted, and end-to-end latency is at the mercy of whatever network the Pi is tethered to.
