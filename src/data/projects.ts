/**
 * The seven pieces of experience the anime home shows in its Work carousel,
 * and the facts each project page is built from.
 *
 * Every claim here has a source, named in `sources`. The keys are:
 *   official  the event's own page (2026.quackhacks.org, judge.beaverhacks.org)
 *   repo      the project's public GitHub repository and its README
 *   resume    the owner's resume (resume-original.tex), via project-inventory.md
 *   owner     the owner's own notes in his work-experience folder, or his
 *             answers on 2026-10-02
 *   media     what the picked photographs and documents show (docs/media-picks.md)
 * Where two sources disagree, the official record or the repository wins, and
 * the disagreement stays listed in ~/work/school/out/career/project-inventory.md.
 * Nothing goes here that no source supports: a number the owner has not
 * confirmed is left out, not rounded.
 *
 * The tunnel (/tunnel/) keeps its own list in works.ts; this one is the
 * anime home's.
 */

import { picture, type Picture } from "./media";

export type ProjectKind = "Hackathon" | "Work" | "Research" | "Leadership" | "Internship";

export type ProjectLink = { label: string; href: string };

export type Project = {
  slug: string;
  /** The project page. */
  href: string;
  title: string;
  kind: ProjectKind;
  /** What he did, in his role's words. */
  role: string;
  /** As people read it: "May 2026", "2022 – 2024". */
  when: string;
  /** Where: an event, a lab, a company. */
  where: string;
  /** The result line, official wording; omitted when there is none. */
  result?: string;
  /** One sentence for the carousel card. */
  line: string;
  /** The carousel cover, from the curated media (docs/media-picks.md), with
   *  the files the import produced (src/data/media.ts). */
  cover: Picture & { alt: string; focal: string };
  links: ProjectLink[];
  sources: string[];
};

export const projects: readonly Project[] = [
  {
    slug: "touchpoint",
    href: "/work/touchpoint/",
    title: "TouchPoint",
    kind: "Hackathon",
    role: "Hardware: the Raspberry Pi driver board",
    when: "May 2026",
    where: "QuackHacks 3, University of Oregon",
    result: "2nd place overall of 71 teams, 250+ hackers",
    line: "A device that plays Braille through vibration motors, so a blind user can browse the web by touch.",
    cover: {
      ...picture("touchpoint", "cover", 640),
      alt: "The TouchPoint desk at QuackHacks 3: the interface on the monitor, the laptop, the wired gloves and the Raspberry Pi",
      focal: "50% 55%",
    },
    links: [
      { label: "Official project page", href: "https://2026.quackhacks.org/projects/touchpoint" },
      { label: "Winners", href: "https://2026.quackhacks.org/projects/winners/touchpoint" },
      { label: "Source on GitHub", href: "https://github.com/Jakhangir18/Quackhack3.0" },
      { label: "Demo video", href: "https://youtu.be/Pg9wEbOyQJY" },
    ],
    sources: ["official", "repo", "owner", "media"],
  },
  {
    slug: "spoot",
    href: "/work/spoot/",
    title: "SPOOT",
    kind: "Hackathon",
    role: "Phone AR layer, 3D-printed glasses, Raspberry Pi bring-up",
    when: "May 2026",
    where: "BeaverHacks 2026, Oregon State",
    result: "3rd place, Google — Best Use of Gemini",
    line: "Glasses that show where a sound came from and what it was, for people who cannot hear one side.",
    cover: {
      ...picture("spoot", "cover", 640),
      alt: "Jakhangir with his teammate and the Google track presenter at BeaverHacks 2026",
      focal: "55% 40%",
    },
    links: [
      { label: "Official project page", href: "https://judge.beaverhacks.org/cmlfqho300000kv04wi9199a5/projects/cmoq6kaau00yzjv04otw9fqd8" },
      { label: "Source on GitHub", href: "https://github.com/Jakhangir18/BeaverHacks-2026" },
      { label: "Demo video", href: "https://www.youtube.com/watch?v=r0NJpTgAblA" },
    ],
    sources: ["official", "repo", "owner", "media"],
  },
  {
    slug: "zyp",
    href: "/work/zyp/",
    title: "Zyp",
    kind: "Internship",
    role: "Software engineering intern: frontend, motion and 3D",
    when: "Summer 2026",
    where: "Zyp, Inc.",
    line: "The motion and the 3D on zyp.co: a scroll-scrubbed hero, a canvas globe of payment arcs, tests that hold it together.",
    cover: {
      ...picture("zyp", "cover", 640),
      alt: "The zyp.co hero: an office with a laptop on a white desk, under 'The back office management platform for global companies'",
      focal: "50% 45%",
    },
    links: [{ label: "zyp.co", href: "https://www.zyp.co" }],
    sources: ["resume", "owner"],
  },
  {
    slug: "gdg",
    href: "/work/gdg/",
    title: "GDG on Campus",
    kind: "Leadership",
    role: "President",
    when: "Spring 2026 — now",
    where: "Google Developer Group on Campus, Oregon State",
    result: "200+ students registered",
    line: "President of Oregon State's Google Developer Group chapter, where 200+ registered students build with Google technology.",
    cover: {
      ...picture("gdg", "cover", 640),
      alt: "Presenting Google Developer Group on Campus Oregon State from the stage",
      focal: "45% 50%",
    },
    links: [{ label: "Chapter website", href: "https://gdgc-osu.com" }],
    sources: ["resume", "owner", "media"],
  },
  {
    slug: "remote-lab-vision",
    href: "/work/remote-lab-vision/",
    title: "Remote Lab Vision",
    kind: "Research",
    role: "Undergraduate researcher, URSA Engage",
    when: "2025 – 2026",
    where: "Oregon State University",
    line: "Which camera can hold a readable feed for a remote chemistry lab: four cameras measured in LabVIEW, one chosen and mounted.",
    cover: {
      ...picture("remote-lab-vision", "cover", 640),
      alt: "Jakhangir at one of the remote lab rigs, the control screen beside him",
      focal: "60% 40%",
    },
    links: [],
    sources: ["owner", "media"],
  },
  {
    slug: "ams",
    href: "/projects/ams/",
    title: "AMS Tablet",
    kind: "Work",
    role: "Full-stack and hardware developer",
    when: "Nov 2024 – Sep 2025",
    where: "Automated Monitoring Solutions, Aktau",
    line: "A pre-shift checkpoint tablet: identity, temperature, breath alcohol and SpO2, with a dashboard behind it.",
    cover: {
      ...picture("ams", "cover", 640),
      alt: "The AMS tablet installed on a wall with its sensors, a Raspberry Pi desktop on the screen",
      focal: "55% 55%",
    },
    links: [],
    sources: ["resume", "owner", "media"],
  },
  {
    slug: "engineering-rocket",
    href: "/work/engineering-rocket/",
    title: "Rocket club",
    kind: "Leadership",
    role: "President",
    when: "2022 – 2024",
    where: "Mangystau region, Kazakhstan",
    line: "Led a student rocket club: airframes modelled in CAD and printed in sections, Arduino avionics tested on the bench.",
    cover: {
      ...picture("engineering-rocket", "cover", 640),
      alt: "The printed avionics bay held in hand beside the white nose cone",
      focal: "45% 50%",
    },
    links: [],
    sources: ["resume", "owner", "media"],
  },
];
