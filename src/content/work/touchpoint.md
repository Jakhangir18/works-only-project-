---
title: "TouchPoint"
summary: "A haptic glove that lets a deafblind user browse the web by feel, built in 24 hours."
year: "2026"
kind: "Hardware + web"
role: "Driver board, motor control, interaction model"
team: "With William Tu and Marcus Tin"
stack: ["Raspberry Pi", "Coin vibration motors", "Custom driver board", "Python", "Google page parser"]
where: "QuackHacks 3.0, University of Oregon"
cover:
  src: "/projects/touchpoint/cover.webp"
  alt: "TouchPoint glove with the driver board and vibration motors on the fingers"
  width: 1600
  height: 1067
order: 1
draft: false
---

TouchPoint is a haptic glove that lets someone who is both blind and hard of hearing browse the web by feel. Built in 24 hours at QuackHacks 3.0 with William Tu and Marcus Tin, it took 2nd place overall out of the full field and won the Google track.

## Problem

People who are blind rely on screen readers, and screen readers rely on hearing. Age-related hearing loss quietly removes that channel, and the fallback is a refreshable braille display: hardware that starts around $2,000 and is priced out of reach for most of the people who need it. That leaves a group with no practical way onto the internet at all, not because the technology does not exist, but because the version of it that works costs more than a laptop. We searched for a cheaper device that did the same job and could not find one.

## Approach

We stopped trying to reproduce a braille display and asked what the minimum viable sense of touch actually is. A braille cell renders characters. What a user navigating the web really needs first is structure: where am I, what is nearby, what is one level down. So we modeled the page as a tree and gave the hand two separate jobs: the fingers receive, the thumb navigates. Six micro vibration motors sit on the index, middle and ring fingers of both hands and deliver patterns; a five-button joystick under the right palm walks the tree, up and down through siblings, left and right through depth. I designed the driver board around a Raspberry Pi, with eight motor channels and five debounced key inputs on a single sheet.

## Solution

A Google-backed parser fetches a page, strips it to its semantic skeleton and summarizes each branch, so the user is never handed raw markup. That tree is streamed to the Pi, which renders the current node as a vibration pattern across the fingertips while the thumb joystick moves the cursor through the structure. Everything runs on commodity parts, a Raspberry Pi, coin vibration motors, a hand-soldered driver board and a glove, which is what pulls the cost down by roughly two orders of magnitude against a commercial braille display.

## Outcome

TouchPoint won the Google track at QuackHacks 3.0 and placed 2nd overall against every team at the event, a 24-hour hackathon at the University of Oregon in May 2026 sponsored by Google, MongoDB, MLH, Base44 and Emberex. Engineers visiting from Google stopped at our table to work through the interaction model with us. The honest limitation: this is a 24-hour prototype that proves the navigation model is learnable, not a product. The next question is whether the tree metaphor still holds on a page with a thousand nodes.
