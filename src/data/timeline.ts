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
  /** Kept out of the build until the owner confirms the role and the dates. */
  draft?: boolean;
};

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
    title: "TouchPoint",
    org: "QuackHacks 3.0, University of Oregon",
    kind: "competition",
    start: "2026-05",
    end: "2026-05",
    summary:
      "A haptic glove for deafblind web browsing. 2nd overall, and the Google track.",
    href: "/work/touchpoint",
  },
  {
    title: "SPOOT",
    org: "BeaverHacks 2026, Oregon State",
    kind: "competition",
    start: "2026-04",
    end: "2026-04",
    summary:
      "Glasses that show where a sound came from. 3rd in the Google track.",
    href: "/work/spoot",
  },
  {
    title: "Sadap Clinic",
    org: "Aktau, Kazakhstan",
    kind: "work",
    start: "2026-01",
    end: "2026-01",
    summary:
      "The clinic's booking channel: doctor search, patient accounts, three languages.",
    href: "/work/private-clinic",
  },
  {
    title: "Remote Lab Vision",
    org: "URSA Engage, Oregon State",
    kind: "research",
    start: "2025-11",
    end: "2026-04",
    summary:
      "Which camera can hold a readable feed inside LabVIEW, answered with histograms.",
    href: "/work/remote-lab-vision",
  },
  {
    title: "AMS Tablet",
    org: "Automated monitoring solutions",
    kind: "work",
    start: "2023-10",
    end: "2026-04",
    summary:
      "Pre-shift inspection and workforce verification at industrial checkpoints.",
    href: "/projects/ams",
  },
  {
    title: "Rocket club",
    org: "Faculty of Science and Technology, Kazakhstan",
    kind: "club",
    start: "2022-04",
    end: "2025-04",
    summary:
      "Printed airframes, avionics on the bench, and a design loop a beginner could join.",
    href: "/work/engineering-rocket",
  },
  {
    title: "Google Developer Group on Campus",
    org: "Oregon State",
    kind: "club",
    start: "2026-04",
    end: "2026-06",
    summary: "Club impact reporting and event support.",
    draft: true,
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
