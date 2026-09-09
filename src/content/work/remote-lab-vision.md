---
title: "Remote Lab Vision"
summary: "The camera system that lets students run a real chemistry lab from a browser."
year: "2025"
kind: "Research"
role: "Camera evaluation and integration in LabVIEW"
team: "With Professor Lucas Ellis and Stephen Stockton"
stack: ["LabVIEW", "NI-IMAQdx", "OBSBOT Meet 2-4K", "Aluminum extrusion mounts"]
where: "URSA Engage, Oregon State University"
cover:
  src: "/projects/remote-lab-vision/cover.webp"
  alt: "Two glass columns on an aluminum frame with the control unit and emergency stop of a remote chemistry lab rig"
  width: 1600
  height: 2133
order: 3
draft: false
---

Oregon State runs one of the largest online degree programs in the country, and chemical engineering has a problem the rest of the catalog does not: the lab. Remote Learning Labs are real benchtop apparatus, in a real building, operated over the internet by students who may never enter it. I evaluated and integrated the vision system those labs see through, research funded by URSA Engage, with Professor Lucas Ellis and Stephen Stockton.

## Problem

A remote lab lives or dies on its video feed. The student is not watching a webcam stream for comfort. They are reading a meniscus, timing a color change, judging whether a bed has fluidized. That is a measurement instrument disguised as a camera, and it has to deliver resolution, frame rate and color fidelity into LabVIEW, which is what actually drives the hardware. When we started, there was no baseline: no data on which cameras could hold a stable high-resolution feed inside LabVIEW, and no way to justify the spend on one over another for every future rig.

## Approach

I treated it as an instrumentation problem rather than a purchasing one. Four cameras across three categories went onto the bench: the OBSBOT Meet 2-4K, a Logitech C922 Pro Stream, a GoPro Hero 8 Black and a Yi action camera. Each was acquired through the NI-IMAQdx module in LabVIEW, and each was tested for what it actually delivered rather than what the box claimed: true resolution and frame rate as received by LabVIEW, standard UVC plug-and-play against proprietary driver stacks, and RGB pixel intensity histograms to compare sensor dynamic range and noise under real lab lighting. Then I mounted them on custom aluminum extrusion and calibrated focal length to the target.

## Solution

The action cameras failed outright: closed software ecosystems that will not surrender a clean stream to a third-party acquisition layer, regardless of sensor quality. The Logitech connected without complaint but did not resolve enough detail to read an instrument. The OBSBOT Meet 2-4K came out as the viable solution on the balance of resolution, LabVIEW compatibility and cost, and its histogram showed the broadest, smoothest intensity distribution of the four: better dynamic range and visibly less sensor noise in lab lighting. That result is now the baseline every current and future rig in the lab is built against.

## Outcome

The vision architecture is in use across the Remote Learning Labs, which let students run genuine chemical engineering coursework from a browser: students who are remote, who cannot travel to campus, or who cannot physically access a lab bench. The known limitation is the fixed lens: adjusting the view still means walking over and moving the camera by hand. The path out of that is a DSLR body, Canon Rebel T5i or T8i, for interchangeable optics, true optical zoom and software-driven focus. This research was funded by URSA Engage through Oregon State's Office of Undergraduate Research, Scholarship, and the Arts.
