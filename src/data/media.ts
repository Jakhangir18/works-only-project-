import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The project media written by scripts/import-media.mjs, read at build time.
 *
 * Each project's public/projects/<slug>/media/media.json records every file
 * the import produced with its intrinsic size, so a page can reserve the box
 * before the file decodes and offer exactly the widths that exist (the import
 * never upscales, so a small source has fewer widths). Build-time only: this
 * reads the disk, and only frontmatter imports it.
 */

export type ImageFile = { w: number; src: string };
export type ImageEntry = { kind: "image"; width: number; height: number; files: ImageFile[]; thumb: string };
export type VideoEntry = {
  kind: "video";
  width: number;
  height: number;
  duration: number;
  bytes: number;
  src: string;
  poster: string;
  /** Where playback starts, in seconds of the file; the visitor can still seek back. */
  playFrom?: number;
  /** The file carries a sound track. */
  audio?: boolean;
};
export type SlidesEntry = { kind: "slides"; pages: { page: number; src: string; width: number; height: number }[] };
type Entry = ImageEntry | VideoEntry | SlidesEntry;

const cache = new Map<string, Record<string, Entry>>();

function manifest(slug: string): Record<string, Entry> {
  if (!cache.has(slug)) {
    const file = join(process.cwd(), "public/projects", slug, "media/media.json");
    cache.set(slug, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  }
  return cache.get(slug)!;
}

function entry<K extends Entry["kind"]>(slug: string, id: string, kind: K): Extract<Entry, { kind: K }> {
  const e = manifest(slug)[id];
  if (!e || e.kind !== kind) throw new Error(`[media] ${slug}/${id} is not a ${kind} in public/projects/${slug}/media/media.json`);
  return e as Extract<Entry, { kind: K }>;
}

export type Picture = { src: string; srcset: string; width: number; height: number; thumb: string };

/** An image with every width the import produced; `src` is the widest up to `cap`. */
export function picture(slug: string, id: string, cap = 1280): Picture {
  const e = entry(slug, id, "image");
  const files = [...e.files].sort((a, b) => a.w - b.w);
  const best = [...files].reverse().find((f) => f.w <= cap) ?? files[0];
  return {
    src: best.src,
    srcset: files.map((f) => `${f.src} ${f.w}w`).join(", "),
    width: e.width,
    height: e.height,
    thumb: e.thumb,
  };
}

/** A clip's length as people read it: rounded once, then split, so 59.6 s
 *  reads 1:00, never 0:60. */
export function clipLength(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function video(slug: string, id: string): VideoEntry {
  return entry(slug, id, "video");
}

export function slides(slug: string, id: string): SlidesEntry {
  return entry(slug, id, "slides");
}

export function has(slug: string, id: string): boolean {
  return id in manifest(slug);
}
