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

const realWorks = [
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

/* ========================= TEMPORARY — DELETE ME =========================
 * Placeholder entries that exist only to judge the carousel at 10 works
 * instead of 5: pacing, scroll length, tier scarcity and poster density.
 * They are NOT projects and must not ship.
 *
 * These are deliberately not inventions and not copies. Every one is titled
 * PLACEHOLDER, linked to `#`, given a grey palette and a numeric poster mark,
 * so it is obvious on screen that it is scaffolding — duplicating a real work
 * would have reintroduced exactly the repetition that was just removed.
 *
 * The tier mix is chosen to sit exactly on the scarcity limits at n=10
 * (heroLimit ceil(10/8)=2, promotedLimit ceil(10/3)=4): one hero and one
 * feature added to the real one of each gives 2 hero and 4 promoted, so this
 * is the densest ladder the rule permits at 10, and it exercises the assert at
 * its boundary. Making one more of these `feature` fails `npm run build` with
 * "5 hero/feature works exceed the limit of 4 for 10 works" — verified.
 *
 * TO REVERT: delete this array and drop the `...placeholderWorks` spread from
 * the `works` export below. Nothing else in the codebase references it.
 * ======================================================================= */
const placeholderWorks = [
  {
    title: "PLACEHOLDER 06",
    site: "#",
    blurb: "Temporary entry for pacing evaluation at ten works. Not a project.",
    size: "hero",
    palette: { background: "#141414", accent: "#8a8a8a" },
    poster: { mark: "06", motif: "orbit" },
  },
  {
    title: "PLACEHOLDER 07",
    site: "#",
    blurb: "Temporary entry for pacing evaluation at ten works. Not a project.",
    size: "feature",
    palette: { background: "#121212", accent: "#9a9a9a" },
    poster: { mark: "07", motif: "trajectory" },
  },
  {
    title: "PLACEHOLDER 08",
    site: "#",
    blurb: "Temporary entry for pacing evaluation at ten works. Not a project.",
    size: "standard",
    palette: { background: "#161616", accent: "#8a8a8a" },
    poster: { mark: "08", motif: "signal" },
  },
  {
    title: "PLACEHOLDER 09",
    site: "#",
    blurb: "Temporary entry for pacing evaluation at ten works. Not a project.",
    size: "standard",
    palette: { background: "#101010", accent: "#9a9a9a" },
    poster: { mark: "09", motif: "crosshair" },
  },
  {
    title: "PLACEHOLDER 10",
    site: "#",
    blurb: "Temporary entry for pacing evaluation at ten works. Not a project.",
    size: "standard",
    palette: { background: "#181818", accent: "#8a8a8a" },
    poster: { mark: "10", motif: "orbit" },
  },
] as const satisfies readonly ProjectInfo[];

export const works = [
  ...realWorks,
  ...placeholderWorks,
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
