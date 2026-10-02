export type TimelineKind = "work" | "research" | "competition" | "club";

export type TimelineEntry = {
  title: string;
  org: string;
  kind: TimelineKind;
  /** Inclusive start, "YYYY-MM". */
  start: string;
  /** Inclusive end, "YYYY-MM". Omit for work that is still running. */
  end?: string;
  /** One line. The project page stays the source of truth. */
  summary: string;
  /** Internal route to the project page, when one exists. */
  href?: string;
  /** A 360x240 thumbnail, shown beside the entry when it links somewhere. */
  thumb?: string;
  /** Kept out of the build until the owner confirms the role and the dates. */
  draft?: boolean;
  /** Part of the owner's time at Oregon State; listed in the campus section. */
  campus?: boolean;
  /** Work that is still running and has no results to show yet. */
  status?: "in progress";
};

/** One label per kind, shared by the board, the work tags and the campus
 *  rows, so the same project is never "Competition" in one place and
 *  "Hackathon" in another. Both competitions on record are hackathons. */
export const KIND_LABEL: Record<TimelineKind, string> = {
  work: "Work",
  research: "Research",
  competition: "Hackathon",
  club: "Club",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The span as people read it: one month, two months of one year, two
 *  months of two years, or "— now" for work still running. The pieces
 *  come back separately so a template can wrap each in its own <time>. */
export function when(start: string, end?: string): { text: string; from: string; to?: string } {
  const [ys, ms] = start.split("-").map(Number);
  const from = `${MONTHS[ms - 1]} ${ys}`;
  if (!end) return { text: `${from} — now`, from };
  const [ye, me] = end.split("-").map(Number);
  if (ye === ys && me === ms) return { text: from, from };
  const to = ye === ys ? `${MONTHS[me - 1]} ${ys}` : `${MONTHS[me - 1]} ${ye}`;
  return { text: ye === ys ? `${MONTHS[ms - 1]} – ${to}` : `${from} – ${to}`, from, to };
}

/**
 * Chronology behind the Work section. Dates were drafted from the owner's own
 * material and are corrected by the owner, not guessed further: an entry whose
 * role or dates are still unconfirmed carries `draft: true` and never renders.
 */
export const timeline: readonly TimelineEntry[] = [
  {
    title: "Frontend and 3D interaction",
    org: "ZIP",
    kind: "work",
    start: "2026-08",
    summary: "Interface systems, motion and 3D graphics on the web.",
  },
  {
    title: "Robot arm and hand in simulation",
    org: "Prof. Raffaele De Amicis's lab, Oregon State",
    kind: "research",
    start: "2026-06",
    status: "in progress",
    campus: true,
    summary:
      "MuJoCo simulation of a robot arm and hand: RL in MuJoCo Playground, imitation learning with LeRobot and ACT, VR teleoperation on a Quest. In progress.",
  },
  {
    title: "TouchPoint",
    org: "QuackHacks 3, University of Oregon",
    kind: "competition",
    start: "2026-05",
    end: "2026-05",
    campus: true,
    summary:
      "A haptic glove for deafblind web browsing. 2nd place overall of 71 teams, QuackHacks 3.",
    href: "/work/touchpoint/",
    thumb: "/projects/touchpoint/thumb.webp",
  },
  {
    title: "SPOOT",
    org: "BeaverHacks 2026, Oregon State",
    kind: "competition",
    start: "2026-05",
    end: "2026-05",
    campus: true,
    summary:
      "Glasses that show where a sound came from. 3rd in Google's Best Use of Gemini track.",
    href: "/work/spoot/",
    thumb: "/projects/spoot/thumb.webp",
  },
  {
    title: "Sadap Clinic",
    org: "Aktau, Kazakhstan",
    kind: "work",
    start: "2026-01",
    end: "2026-01",
    summary:
      "The clinic's booking channel: doctor search, patient accounts, three languages.",
    href: "/work/private-clinic/",
    thumb: "/projects/private-clinic/thumb.webp",
  },
  {
    title: "Remote Lab Vision",
    org: "URSA Engage, Oregon State",
    kind: "research",
    start: "2025-11",
    end: "2026-04",
    campus: true,
    summary:
      "Which camera can hold a readable feed inside LabVIEW, answered with histograms.",
    href: "/work/remote-lab-vision/",
    thumb: "/projects/remote-lab-vision/thumb.webp",
  },
  {
    title: "AMS Tablet",
    org: "Automated monitoring solutions",
    kind: "work",
    start: "2023-10",
    end: "2026-04",
    summary:
      "Pre-shift inspection and workforce verification at industrial checkpoints.",
    href: "/projects/ams/",
    thumb: "/projects/ams/images/thumb.webp",
  },
  {
    title: "Rocket club",
    org: "Faculty of Science and Technology, Kazakhstan",
    kind: "club",
    start: "2022-04",
    end: "2025-04",
    summary:
      "Printed airframes, avionics on the bench, and a design loop a beginner could join.",
    href: "/work/engineering-rocket/",
    thumb: "/projects/engineering-rocket/thumb.webp",
  },
  {
    title: "Google Developer Group on Campus",
    org: "Oregon State",
    kind: "club",
    start: "2026-04",
    end: "2026-06",
    summary: "Club impact reporting and event support.",
    draft: true,
    campus: true,
  },
  {
    title: "Reverlab",
    org: "rowerlab.pl",
    kind: "work",
    start: "2025-01",
    end: "2025-02",
    summary: "Web performance work on a bicycle storefront.",
    draft: true,
  },
  {
    title: "STEP Academy",
    org: "Kazakhstan",
    kind: "club",
    start: "2025-05",
    end: "2025-05",
    summary: "Recognised with a letter of thanks.",
    draft: true,
  },
];

/** Whole months covered by an entry, minimum 1. */
export function monthSpan(entry: TimelineEntry, today = new Date()): number {
  const [ys, ms] = entry.start.split("-").map(Number);
  const end = entry.end
    ? entry.end.split("-").map(Number)
    : [today.getFullYear(), today.getMonth() + 1];
  return Math.max(1, (end[0] - ys) * 12 + (end[1] - ms) + 1);
}
