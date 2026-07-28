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
    title: "AMS Tablet",
    site: "/projects/ams",
    blurb:
      "Automated pre-shift inspection and workforce verification at industrial checkpoints.",
    size: "hero",
    palette: { background: "#080f1a", accent: "#60a5fa" },
    poster: { mark: "AMS", motif: "crosshair" },
    cover: {
      src: "/projects/ams/images/cover.jpg",
      alt: "AMS tablet interface at an industrial inspection checkpoint",
      focalPoint: { x: "50%", y: "44%" },
    },
  },
  {
    title: "GoChain",
    site: "/work/gochain",
    blurb:
      "A Web3 platform that turns everyday environmental actions into verifiable on-chain impact.",
    size: "feature",
    palette: { background: "#071a0f", accent: "#4ade80" },
    poster: { mark: "GC", motif: "orbit" },
  },
  {
    title: "Private Clinic Setup",
    site: "/work/private-clinic",
    blurb:
      "Digital, operational and physical infrastructure for a new medical clinic, concept to launch.",
    size: "standard",
    palette: { background: "#0e0a18", accent: "#a78bfa" },
    poster: { mark: "PCS", motif: "signal" },
  },
  {
    title: "Engineering Rocket",
    site: "/work/engineering-rocket",
    blurb:
      "Applied aerospace research — propulsion, structural analysis and recovery from first principles.",
    size: "standard",
    palette: { background: "#180a06", accent: "#fb923c" },
    poster: { mark: "ER", motif: "trajectory" },
  },
  {
    title: "Portfolio Rocket",
    site: "/work/portfolio-rocket",
    blurb:
      "This site: 240 scroll-driven frames, GSAP, and a custom sequencing engine in Astro.",
    size: "standard",
    palette: { background: "#0d0d0d", accent: "#f5f5f5" },
    poster: { mark: "PR", motif: "crosshair" },
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
