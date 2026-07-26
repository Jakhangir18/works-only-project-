export type WorkItem = {
  caption: string;
  site: string;
};

type ProjectInfo = {
  title: string;
  site: string;
};

const projects: ProjectInfo[] = [
  { title: "AMS Tablet", site: "/projects/ams" },
  { title: "GoChain", site: "/work/gochain" },
  { title: "Private Clinic Setup", site: "/work/private-clinic" },
  { title: "Engineering Rocket", site: "/work/engineering-rocket" },
  { title: "Portfolio Rocket", site: "/work/portfolio-rocket" },
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
