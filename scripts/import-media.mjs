// Turns the owner's picked media into the files the project pages serve.
//
//   node scripts/import-media.mjs <manifest.json> [--only=<slug>] [--ids=<id>,<id>] [--force]
//
// The manifest is a list of entries. Each entry is one of:
//   { slug, id, kind: "image", src, widths?: [640, 1280, 1920], quality?: 80 }
//   { slug, id, kind: "video", src, maxHeight?: 720, start?: seconds, duration?: seconds,
//     keepAudio?: true, playFrom?: seconds }
//   `start`/`duration` trim the source; `playFrom` is where playback begins in the
//   trimmed file (the visitor can still seek back), and the poster is taken there.
//   `blur: [[from, to], ...]` blurs the whole frame over those seconds of the
//   trimmed file: a privacy cut for a pan across people who did not agree to be
//   on the site, which reads as motion blur.
//   { slug, id, kind: "slides", src, pages: [1, 3, 4], width?: 1600 }
//
// Output lands under public/projects/<slug>/media/:
//   image  -> <id>-<w>.webp for each width no larger than the source, plus <id>-thumb.webp (480w)
//   video  -> <id>.mp4 (H.264, faststart, no audio unless keepAudio) and <id>-poster.webp
//   slides -> <id>-p<page>.webp
// and a media.json beside them with every file's intrinsic size, so the pages can
// reserve their boxes before the files decode.
//
// Widths larger than the source are skipped: an upscaled file is bytes the
// layout cannot use (CLAUDE.md invariant 7 is the same rule for layers).
// Run it through `heavy`: ffmpeg and sharp at full tilt make the host swap.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
// Re-encoding a whole slug with x264 slow takes minutes; --ids picks entries.
const ids = args.find((a) => a.startsWith("--ids="))?.slice(6).split(",");
const force = args.includes("--force");
if (!manifestPath) {
  console.error("usage: node scripts/import-media.mjs <manifest.json> [--only=<slug>] [--ids=<id>,<id>] [--force]");
  process.exit(2);
}

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const entries = JSON.parse(readFileSync(manifestPath, "utf8"));
const index = new Map();

function outDir(slug) {
  const dir = join(root, "public/projects", slug, "media");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function record(slug, id, data) {
  if (!index.has(slug)) {
    const file = join(outDir(slug), "media.json");
    index.set(slug, existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});
  }
  index.get(slug)[id] = data;
}

function fresh(file) {
  return !force && existsSync(file) && statSync(file).size > 0;
}

async function image(e) {
  const dir = outDir(e.slug);
  const meta = await sharp(e.src).rotate().metadata();
  // EXIF orientation 5-8 swaps the axes after rotate().
  const swap = (meta.orientation ?? 1) >= 5;
  const srcW = swap ? meta.height : meta.width;
  const srcH = swap ? meta.width : meta.height;
  const listed = e.widths ?? [640, 1280, 1920];
  const widths = listed.filter((w) => w <= srcW);
  // A source between two listed widths also gets its own width, or a 1200 px
  // photograph would only ever be served at 640. A source wider than every
  // listed width does not: the list is the cap, or a 3000 px phone photo put
  // a 1.35 MB file in the srcset (Usher's hero, 2026-10-06).
  const capped = widths.length === listed.length;
  if (!widths.length || (!capped && srcW - widths[widths.length - 1] > 160)) widths.push(srcW);
  const files = [];
  for (const w of widths) {
    const file = join(dir, `${e.id}-${w}.webp`);
    if (!fresh(file)) await sharp(e.src).rotate().resize({ width: w }).webp({ quality: e.quality ?? 80 }).toFile(file);
    files.push({ w, src: `/projects/${e.slug}/media/${e.id}-${w}.webp` });
  }
  const thumb = join(dir, `${e.id}-thumb.webp`);
  if (!fresh(thumb)) await sharp(e.src).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(thumb);
  record(e.slug, e.id, {
    kind: "image",
    width: srcW,
    height: srcH,
    files,
    thumb: `/projects/${e.slug}/media/${e.id}-thumb.webp`,
  });
}

function probe(src) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration",
    "-of", "json", src,
  ]).toString();
  const j = JSON.parse(out);
  const s = j.streams[0];
  const rot = Math.abs(Number(s.side_data_list?.find((d) => "rotation" in d)?.rotation ?? 0));
  const turned = rot === 90 || rot === 270;
  const audio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src]).toString().trim() !== "";
  return { width: turned ? s.height : s.width, height: turned ? s.width : s.height, duration: Number(j.format.duration), audio };
}

async function video(e) {
  const dir = outDir(e.slug);
  const file = join(dir, `${e.id}.mp4`);
  const poster = join(dir, `${e.id}-poster.webp`);
  const maxH = e.maxHeight ?? 720;
  const trim = [
    ...(e.start != null ? ["-ss", String(e.start)] : []),
    ...(e.duration != null ? ["-t", String(e.duration)] : []),
  ];
  if (!fresh(file)) {
    execFileSync("ffmpeg", [
      "-y", "-v", "error", ...trim, "-i", e.src,
      // Even dimensions, height capped; a portrait clip is capped by its height too.
      "-vf", [
        `scale=-2:'min(${maxH},ih)'`,
        ...(e.blur ?? []).map(([a, b]) => `boxblur=luma_radius=24:chroma_radius=12:enable='between(t,${a},${b})'`),
      ].join(","),
      "-c:v", "libx264", "-preset", "slow", "-crf", String(e.crf ?? 28), "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      ...(e.keepAudio ? ["-c:a", "aac", "-b:a", "96k"] : ["-an"]),
      file,
    ], { stdio: "inherit" });
  }
  if (!fresh(poster)) {
    const at = String(e.posterAt ?? e.playFrom ?? 0.5);
    const png = join(tmpdir(), `${e.slug}-${e.id}-poster.png`);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", at, "-i", file, "-frames:v", "1", png]);
    await sharp(png).webp({ quality: 78 }).toFile(poster);
    rmSync(png, { force: true });
  }
  const p = probe(file);
  record(e.slug, e.id, {
    kind: "video",
    width: p.width,
    height: p.height,
    duration: Math.round(p.duration * 10) / 10,
    bytes: statSync(file).size,
    src: `/projects/${e.slug}/media/${e.id}.mp4`,
    poster: `/projects/${e.slug}/media/${e.id}-poster.webp`,
    ...(e.playFrom != null ? { playFrom: e.playFrom } : {}),
    ...(p.audio ? { audio: true } : {}),
  });
}

async function slides(e) {
  const dir = outDir(e.slug);
  const width = e.width ?? 1600;
  const pages = [];
  for (const n of e.pages) {
    const file = join(dir, `${e.id}-p${n}.webp`);
    if (!fresh(file)) {
      const base = join(tmpdir(), `${e.slug}-${e.id}-p${n}`);
      execFileSync("pdftoppm", ["-f", String(n), "-l", String(n), "-png", "-singlefile", "-scale-to-x", String(width), "-scale-to-y", "-1", e.src, base]);
      await sharp(`${base}.png`).webp({ quality: 82 }).toFile(file);
      rmSync(`${base}.png`, { force: true });
    }
    const m = await sharp(file).metadata();
    pages.push({ page: n, src: `/projects/${e.slug}/media/${e.id}-p${n}.webp`, width: m.width, height: m.height });
  }
  record(e.slug, e.id, { kind: "slides", pages });
}

for (const e of entries) {
  if (only && e.slug !== only) continue;
  if (ids && !ids.includes(e.id)) continue;
  if (!existsSync(e.src)) {
    console.error(`missing source: ${e.slug}/${e.id}: ${e.src}`);
    process.exitCode = 1;
    continue;
  }
  const run = { image, video, slides }[e.kind];
  if (!run) throw new Error(`unknown kind ${e.kind} for ${e.slug}/${e.id}`);
  await run(e);
  console.log(`ok ${e.slug}/${e.id} (${e.kind})`);
}

for (const [slug, data] of index) {
  writeFileSync(join(outDir(slug), "media.json"), JSON.stringify(data, null, 2) + "\n");
}
