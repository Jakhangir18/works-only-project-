export type WorkSize = "standard" | "feature" | "hero";

export type PosterMotif = "orbit" | "crosshair" | "signal" | "trajectory";

export type WorkPalette = {
  background: string;
  accent: string;
};

export type WorkCover = {
  src: string;
  alt: string;
  focalPoint: {
    x: string;
    y: string;
  };
};

export type WorkPoster = {
  mark: string;
  motif: PosterMotif;
};

export type ProjectInfo = {
  title: string;
  site: string;
  /** One line, shown on the far side of the dive transition. The project page
   * stays the source of truth — this is a teaser, never a copy of it. */
  blurb: string;
  /** Editorial importance. Layout consumes this enum; it never derives it. */
  size: WorkSize;
  palette: WorkPalette;
  /** Always present: it is the real visual for coverless work and the stable
   * fallback while an optional cover is loading or fails to decode. */
  poster: WorkPoster;
  cover?: WorkCover;
};

export const works = [
  {
    title: "TouchPoint",
    site: "/work/touchpoint",
    blurb:
      "A haptic glove that lets a deafblind user browse the web by feel — built in 24 hours.",
    size: "hero",
    palette: { background: "#1a1206", accent: "#fbbf24" },
    poster: { mark: "TP", motif: "signal" },
    cover: {
      src: "/projects/touchpoint/cover.webp",
      alt: "The TouchPoint glove wired to its driver board on the hackathon table",
      focalPoint: { x: "50%", y: "45%" },
    },
  },
  {
    title: "SPOOT",
    site: "/work/spoot",
    blurb:
      "AR glasses that show where a sound came from — and whether it is worth turning for.",
    size: "feature",
    palette: { background: "#08151f", accent: "#38bdf8" },
    poster: { mark: "SP", motif: "orbit" },
    cover: {
      src: "/projects/spoot/cover.webp",
      alt: "The SPOOT team on stage receiving the Google track award at BeaverHacks 2026",
      focalPoint: { x: "45%", y: "40%" },
    },
  },
  {
    title: "AMS Tablet",
    site: "/projects/ams",
    blurb:
      "Automated pre-shift inspection and workforce verification at industrial checkpoints.",
    size: "feature",
    palette: { background: "#080f1a", accent: "#60a5fa" },
    poster: { mark: "AMS", motif: "crosshair" },
    cover: {
      src: "/projects/ams/images/cover.webp",
      alt: "AMS tablet interface at an industrial inspection checkpoint",
      focalPoint: { x: "50%", y: "44%" },
    },
  },
  {
    title: "Remote Lab Vision",
    site: "/work/remote-lab-vision",
    blurb:
      "The camera system that lets students run a real chemistry lab from a browser.",
    size: "standard",
    palette: { background: "#0a1a14", accent: "#34d399" },
    poster: { mark: "RLV", motif: "signal" },
    cover: {
      src: "/projects/remote-lab-vision/cover.webp",
      alt: "Two glass columns on an aluminium frame with the control unit of a remote chemistry lab rig",
      focalPoint: { x: "50%", y: "38%" },
    },
  },
  {
    title: "Engineering Rocket",
    site: "/work/engineering-rocket",
    blurb:
      "A student rocket club in Kazakhstan: 3D-printed airframes, Arduino avionics, launches.",
    size: "standard",
    palette: { background: "#180a06", accent: "#fb923c" },
    poster: { mark: "ER", motif: "trajectory" },
    cover: {
      src: "/projects/engineering-rocket/cover.webp",
      alt: "Holding a printed rocket airframe at the faculty of science and technology",
      focalPoint: { x: "50%", y: "35%" },
    },
  },
  {
    title: "Sadap Clinic",
    site: "/work/private-clinic",
    blurb:
      "A multi-speciality clinic online: doctor search, booking and a corporate portal.",
    size: "standard",
    palette: { background: "#0e0a18", accent: "#a78bfa" },
    poster: { mark: "SC", motif: "signal" },
    cover: {
      src: "/projects/private-clinic/cover.webp",
      alt: "The Sadap Clinic home page with its doctor search",
      focalPoint: { x: "50%", y: "25%" },
    },
  },
  {
    title: "Portfolio Rocket",
    site: "/work/portfolio-rocket",
    blurb:
      "This site: a 240-frame scroll sequence, GSAP, and the performance work behind it.",
    size: "standard",
    palette: { background: "#0d0d0d", accent: "#f5f5f5" },
    poster: { mark: "PR", motif: "crosshair" },
    cover: {
      src: "/projects/portfolio-rocket/cover.webp",
      alt: "A frame from the scroll sequence: the rocket opened up, avionics board visible",
      focalPoint: { x: "50%", y: "50%" },
    },
  },
] as const satisfies readonly ProjectInfo[];

function assertScarcePromotedWorks(items: readonly ProjectInfo[]) {
  const heroCount = items.filter((work) => work.size === "hero").length;
  const promotedCount = items.filter(
    (work) => work.size === "hero" || work.size === "feature",
  ).length;
  const heroLimit = Math.ceil(items.length / 8);
  const promotedLimit = Math.ceil(items.length / 3);

  if (heroCount > heroLimit) {
    throw new Error(
      `[works] Build blocked: ${heroCount} hero works exceed the limit of ${heroLimit} for ${items.length} works.`,
    );
  }

  if (promotedCount > promotedLimit) {
    throw new Error(
      `[works] Build blocked: ${promotedCount} hero/feature works exceed the limit of ${promotedLimit} for ${items.length} works.`,
    );
  }
}

// This module is evaluated while Astro renders SWork.astro. An invalid editorial
// mix therefore fails `npm run build`; there is no browser-only warning path.
assertScarcePromotedWorks(works);

// Kept as a compatibility export until the dive reads all visual metadata from the
// clicked card. Both names reference the same validated, stable list.
export const projects: readonly ProjectInfo[] = works;
