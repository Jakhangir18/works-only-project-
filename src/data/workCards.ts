import { projects } from "./projects";
import { picture } from "./media";
import type { ProjectInfo } from "./works";

/**
 * The anime home's WORK cards: the eight of projects.ts in the shape the
 * tunnel's cards take (works.ts's ProjectInfo), so the home and /tunnel/
 * share SWork, AWork and the dive. The owner, 2026-10-03: WORK as it was on
 * Vercel, with these projects.
 *
 * Palettes and poster marks carry over from works.ts where the tunnel
 * already had the project; Zyp, GDG and Usher get their own. The cover is the
 * project's pinned cover at up to 1440 px: the dive grows it to the full
 * screen (Zyp's is 640 or 1440, nothing between). The blurb is the
 * card's one line from projects.ts.
 */

const LOOK: Record<string, Pick<ProjectInfo, "size" | "palette" | "poster">> = {
  usher: { size: "hero", palette: { background: "#140f0a", accent: "#ffb978" }, poster: { mark: "US", motif: "signal" } },
  touchpoint: { size: "hero", palette: { background: "#1a1206", accent: "#fbbf24" }, poster: { mark: "TP", motif: "signal" } },
  spoot: { size: "feature", palette: { background: "#08151f", accent: "#38bdf8" }, poster: { mark: "SP", motif: "orbit" } },
  zyp: { size: "feature", palette: { background: "#0c1020", accent: "#8ea2ff" }, poster: { mark: "ZY", motif: "crosshair" } },
  gdg: { size: "hero", palette: { background: "#0a1410", accent: "#4ade80" }, poster: { mark: "GDG", motif: "orbit" } },
  "remote-lab-vision": { size: "standard", palette: { background: "#0a1a14", accent: "#34d399" }, poster: { mark: "RLV", motif: "signal" } },
  ams: { size: "feature", palette: { background: "#080f1a", accent: "#60a5fa" }, poster: { mark: "AMS", motif: "crosshair" } },
  "engineering-rocket": { size: "standard", palette: { background: "#180a06", accent: "#fb923c" }, poster: { mark: "ER", motif: "trajectory" } },
};

export const workCards: ProjectInfo[] = projects.map((p) => {
  const look = LOOK[p.slug];
  if (!look) throw new Error(`workCards: no palette for ${p.slug}`);
  const cover = picture(p.slug, "cover", 1440);
  const [fx = "50%", fy = "50%"] = p.cover.focal.split(/\s+/);
  return {
    title: p.title,
    site: p.href,
    blurb: p.line,
    ...look,
    cover: {
      src: cover.src,
      alt: p.cover.alt,
      width: cover.width,
      height: cover.height,
      focalPoint: { x: fx, y: fy },
    },
  };
});
