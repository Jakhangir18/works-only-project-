export type WorkItem = {
  caption: string;
  site: string;
};

export type ProjectInfo = {
  title: string;
  site: string;
  /** One line, shown on the far side of the dive transition. The project page
   *  stays the source of truth — this is a teaser, never a copy of it. */
  blurb: string;
};

export const projects: ProjectInfo[] = [
  {
    title: "AMS Tablet",
    site: "/projects/ams",
    blurb:
      "Automated pre-shift inspection and workforce verification at industrial checkpoints.",
  },
  {
    title: "GoChain",
    site: "/work/gochain",
    blurb:
      "A Web3 platform that turns everyday environmental actions into verifiable on-chain impact.",
  },
  {
    title: "Private Clinic Setup",
    site: "/work/private-clinic",
    blurb:
      "Digital, operational and physical infrastructure for a new medical clinic, concept to launch.",
  },
  {
    title: "Engineering Rocket",
    site: "/work/engineering-rocket",
    blurb:
      "Applied aerospace research — propulsion, structural analysis and recovery from first principles.",
  },
  {
    title: "Portfolio Rocket",
    site: "/work/portfolio-rocket",
    blurb:
      "This site: 240 scroll-driven frames, GSAP, and a custom sequencing engine in Astro.",
  },
];

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  let i = arr.length;
  while (i > 0) {
    const j = Math.floor(Math.random() * i--);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildWorksList(): WorkItem[] {
  // Each project gets 4 slots so the scroll tunnel has enough density.
  const expanded: WorkItem[] = [];
  for (const project of projects) {
    for (let i = 1; i <= 4; i++) {
      expanded.push({ caption: project.title, site: project.site });
    }
  }
  return shuffle(expanded);
}
