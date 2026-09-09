import { getCollection, type CollectionEntry } from "astro:content";

export type Work = CollectionEntry<"work">;

/** Live projects, in list order. */
export async function getWorks(): Promise<Work[]> {
  const works = await getCollection("work", ({ data }) => !data.draft);
  return works.sort((a, b) => a.data.order - b.data.order);
}

/** "01", "02", ... */
export const pad = (n: number): string => String(n).padStart(2, "0");

/** The 480x300 hover thumb sits next to the cover: /projects/<slug>/thumb.webp */
export const thumbFor = (work: Work): string =>
  work.data.cover.src.replace(/\/[^/]+$/, "/thumb.webp");
