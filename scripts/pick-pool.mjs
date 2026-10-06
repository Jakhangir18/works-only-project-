// Builds the pool of alternative photos and clips for the owner-only picker
// (scripts/pick-server.mjs, scripts/pick/picker.js).
//
//   heavy node scripts/pick-pool.mjs [--force] [--plan]
//
// --plan lists what would enter the pool and stops before encoding anything.
//
// Reads the owner's media, read-only, from ~/work/works-only/in/mwe-2026-10-02/:
//   _web/<folder>/        the converted library (index: _web/manifest.json)
//   mwe-jpg/<folder>/     JPG originals; mwe-jpg/root/ holds several projects
//   prepared/<slug>/      edited, privacy-fixed versions (they win over the raw file)
//   videos/               original clips
// and writes ~/work/works-only/in/pick-pool/:
//   <slug>/<poolId>-thumb.webp   480 px wide
//   <slug>/<poolId>-1280.webp    1280 px wide, or the source width when smaller
//   <slug>/<poolId>.mp4          a preview clip (H.264, faststart, short side <= 720)
//   <slug>/<poolId>-poster.webp  the clip's poster
//   _sdr/<source>-sdr.mp4        an SDR master of an HDR (HLG) iPhone clip; it is the
//                                item's `source`, since import-media does not tone-map.
//                                Never served and never pruned
//   pool.json                    { slug: [{ id, kind, thumb, full, w, h, source, ... }] }
// `source` is the absolute path scripts/pin-picks.mjs writes into the manifest.
//
// docs/pick-deny.json lists what must never enter the pool (privacy, rejects,
// held items) and the privacy cuts a clip needs; both are applied here, and the
// run fails if a denied file is still in pool.json at the end. Files in the pool
// directory that pool.json does not reference are deleted, so a newly denied
// file stops being served too.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, openSync, readSync, closeSync,
  readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import sharp from "sharp";

const repo = resolve(dirname(new URL(import.meta.url).pathname), "..");
const IN = join(homedir(), "work/works-only/in");
const MWE = join(IN, "mwe-2026-10-02");
// The second drop (2026-10-06): one folder per slug, photos and clips as the
// owner uploaded them (in/mwe-2026-10-06/README.md in each folder says where
// each file came from). _sdr/ there holds the import's own SDR masters.
const MWE2 = join(IN, "mwe-2026-10-06");
const MWE2_FOLDERS = { usher: "usher" };
const OUT = join(IN, "pick-pool");
const MASTERS = join(OUT, "_sdr");
const force = process.argv.includes("--force");
sharp.concurrency(2);

const SLUGS = ["usher", "touchpoint", "spoot", "zyp", "gdg", "remote-lab-vision", "ams", "engineering-rocket"];
// _web folder -> case slug.
const WEB_FOLDERS = {
  touchpoint: "touchpoint",
  spoot: "spoot",
  "remote-lab-vision": "remote-lab-vision",
  "ams-tablet": "ams",
  "ams-manufacture": "ams",
  "engineering-rocket": "engineering-rocket",
  "gdg-club": "gdg",
};
// Misfiled in the owner's folders (docs/media-picks.md): chemistry-lab equipment.
const MOVES = { "touchpoint-10": "remote-lab-vision", "touchpoint-12": "remote-lab-vision" };
// mwe-jpg/root/ files named in docs/media-picks.md. Root files that are the
// original of a _web item follow that item; any other root file stays out.
const ROOT_FILES = {
  IMG_2819: "touchpoint",
  IMG_2835: "touchpoint",
  IMG_9344: "touchpoint",
  IMG_2940: "gdg",
  IMG_2953: "gdg",
  camphoto_959030623: "ams",
};
const MWE_FOLDERS = { "ams-tablet": "ams", "ams-manufacture": "ams" };
// Clips in videos/. IMG_1941/1942 and IMG_2817 lose to their prepared SDR copies.
const VIDEO_FILES = {
  "rocket club - presidence/IMG_1817.MOV": "engineering-rocket",
  "rocket club - presidence/IMG_1818.MOV": "engineering-rocket",
  "IMG_1941.MOV": "engineering-rocket",
  "IMG_1942.MOV": "engineering-rocket",
  "Quackkack 30/IMG_2817.MOV": "touchpoint",
  "GDG-CLUB/0309.mp4": "gdg",
};

// Not pictures of the work: logos from the PDFs, and one render kept twice.
const SKIP = {
  "prepared/remote-lab-vision/ursa-000.png": "OSU logo",
  "prepared/remote-lab-vision/ursa-001.png": "OSU logo",
  "prepared/gdg/ext-002.png": "GDG logo",
  "prepared/gdg/int-002.png": "GDG logo",
  "prepared/remote-lab-vision/poster-4800.png": "the poster-2400.png render at twice the size",
};

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
// Pictures this small are logos and banner fragments from the PDFs.
const MIN_LONG = 600;
const MIN_SHORT = 300;
// Bump when the output recipe changes, so cached files are rebuilt.
const RECIPE = 1;

const deny = JSON.parse(readFileSync(join(repo, "docs/pick-deny.json"), "utf8"));
const denyTokens = new Map();
for (const e of deny.entries) for (const t of e.match) denyTokens.set(t.toLowerCase(), e.reason);
const edits = deny.edits ?? [];

const stemOf = (p) => basename(p, extname(p));
const lower = (s) => s.toLowerCase();
const log = (...a) => console.log(...a);

/* ---------- candidates ---------- */

const candidates = [];
const unassigned = [];

const skipped = [];
function add(c) {
  const rel = relative(MWE, c.path);
  if (SKIP[rel]) {
    skipped.push(`${c.slug}: ${rel} (${SKIP[rel]})`);
    return;
  }
  const keys = new Set([lower(stemOf(c.path))]);
  const sdr = lower(stemOf(c.path)).replace(/-sdr$/, "");
  keys.add(sdr);
  for (const k of c.extraKeys ?? []) keys.add(lower(k));
  candidates.push({ ...c, keys });
}

const webManifest = JSON.parse(readFileSync(join(MWE, "_web/manifest.json"), "utf8"));
const webById = new Map(webManifest.map((e) => [e.id, e]));
const webSlugBySourceStem = new Map();
for (const e of webManifest) {
  if (!(e.slug in WEB_FOLDERS) || e.kind === "doc") continue;
  webSlugBySourceStem.set(lower(stemOf(e.source)), MOVES[e.id] ?? WEB_FOLDERS[e.slug]);
}

for (const [folder, slug] of Object.entries(WEB_FOLDERS)) {
  const dir = join(MWE, "_web", folder);
  for (const f of readdirSync(dir).sort()) {
    const ext = lower(extname(f));
    const stem = stemOf(f);
    if (/-(thumb|poster)$/.test(stem)) continue;
    const kind = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
    if (!kind) continue;
    const entry = webById.get(stem);
    const extraKeys = [stem];
    if (entry && entry.kind !== "doc") extraKeys.push(stemOf(entry.source));
    add({ slug: MOVES[stem] ?? slug, kind, path: join(dir, f), origin: "web", webId: stem, extraKeys });
  }
}

for (const [folder, slug] of Object.entries(MWE_FOLDERS)) {
  const dir = join(MWE, "mwe-jpg", folder);
  for (const f of readdirSync(dir).sort()) {
    if (IMAGE_EXT.has(lower(extname(f)))) add({ slug, kind: "image", path: join(dir, f), origin: "mwe" });
  }
}

{
  const dir = join(MWE, "mwe-jpg/root");
  for (const f of readdirSync(dir).sort()) {
    if (!IMAGE_EXT.has(lower(extname(f)))) continue;
    const stem = stemOf(f);
    const slug = ROOT_FILES[stem] ?? webSlugBySourceStem.get(lower(stem));
    if (slug) add({ slug, kind: "image", path: join(dir, f), origin: "mwe" });
    else unassigned.push(`mwe-jpg/root/${f}`);
  }
}

for (const slug of SLUGS) {
  const dir = join(MWE, "prepared", slug);
  if (!existsSync(dir)) continue;
  const files = readdirSync(dir).sort();
  const names = new Set(files.map((f) => stemOf(f)));
  for (const f of files) {
    const ext = lower(extname(f));
    const stem = stemOf(f);
    const kind = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
    if (!kind) continue;
    // ursa-011.png loses to its rotated ursa-011-rot.png.
    if (names.has(`${stem}-rot`)) continue;
    add({ slug, kind, path: join(dir, f), origin: "prepared" });
  }
}

for (const [rel, slug] of Object.entries(VIDEO_FILES)) {
  const path = join(MWE, "videos", rel);
  if (existsSync(path)) add({ slug, kind: "video", path, origin: "raw" });
}

// The second drop: every picture and clip in the folder, the raw clip rather
// than its SDR master (the pool tone-maps HDR itself, into its own _sdr/).
for (const [folder, slug] of Object.entries(MWE2_FOLDERS)) {
  const dir = join(MWE2, folder);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).sort()) {
    const ext = lower(extname(f));
    const kind = IMAGE_EXT.has(ext) ? "image" : VIDEO_EXT.has(ext) ? "video" : null;
    if (!kind) continue;
    add({ slug, kind, path: join(dir, f), origin: kind === "video" ? "raw" : "mwe" });
  }
}

/* ---------- deny, edits ---------- */

// Tokens and keys are compared raw and in the pool-id form, so a file whose
// id would come out as a denied id (Touchpoint_04.png -> touchpoint-04) is caught.
const idForm = (s) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
for (const [t, why] of [...denyTokens]) denyTokens.set(idForm(t), why);

function denialOf(c) {
  for (const k of [...c.keys].flatMap((k) => [k, idForm(k)])) if (denyTokens.has(k)) return `${k}: ${denyTokens.get(k)}`;
  return null;
}

function editOf(c) {
  const e = edits.find((x) => x.match.some((t) => c.keys.has(lower(t))));
  if (!e) return undefined;
  return { start: e.start, duration: e.duration, ...(e.blur ? { blur: e.blur } : {}) };
}

const denied = [];
let live = candidates.filter((c) => {
  const why = denialOf(c);
  if (why) denied.push(`${c.slug}: ${relative(MWE, c.path)} (${why})`);
  return !why;
});

/* ---------- probe ---------- */

function ffprobe(path) {
  const j = JSON.parse(execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,color_transfer,bit_rate:stream_side_data=rotation:format=duration,bit_rate",
    "-of", "json", path,
  ]).toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`no video stream in ${path}`);
  const rot = Math.abs(Number(v.side_data_list?.find((d) => "rotation" in d)?.rotation ?? 0));
  const turned = rot === 90 || rot === 270;
  return {
    w: turned ? v.height : v.width,
    h: turned ? v.width : v.height,
    codec: v.codec_name,
    pixFmt: v.pix_fmt,
    hdr: v.color_transfer === "arib-std-b67" || v.color_transfer === "smpte2084",
    rotated: rot !== 0,
    duration: Number(j.format.duration),
    bitrate: Number(j.format.bit_rate ?? 0),
    audio: j.streams.some((s) => s.codec_type === "audio"),
  };
}

const failed = [];
const small = [];
for (const c of live) {
  try {
    if (c.kind === "image") {
      const m = await sharp(c.path).metadata();
      const swap = (m.orientation ?? 1) >= 5;
      c.w = swap ? m.height : m.width;
      c.h = swap ? m.width : m.height;
      if (Math.max(c.w, c.h) < MIN_LONG || Math.min(c.w, c.h) < MIN_SHORT) {
        small.push(`${c.slug}: ${relative(MWE, c.path)} ${c.w}x${c.h}`);
        c.bad = true;
      }
    } else {
      c.probe = ffprobe(c.path);
      c.w = c.probe.w;
      c.h = c.probe.h;
    }
  } catch (err) {
    failed.push(`${c.slug}: ${relative(MWE, c.path)} (${err.message.split("\n")[0]})`);
    c.bad = true;
  }
}
live = live.filter((c) => !c.bad);

/* ---------- dedupe ---------- */

// Prepared files first; among the _web conversion and the JPG original, the
// bigger file; among clips, the _web conversion before the raw camera file.
const TIER = { prepared: 3, web: 2, mwe: 2, raw: 1 };
live.sort((a, b) =>
  a.slug.localeCompare(b.slug) ||
  TIER[b.origin] - TIER[a.origin] ||
  b.w * b.h - a.w * a.h ||
  a.path.localeCompare(b.path));

const dupes = [];
const kept = [];
const owner = new Map(); // slug/key -> kept candidate
const hashes = new Map(); // slug/sha1 -> kept candidate
for (const c of live) {
  const hit = [...c.keys].map((k) => owner.get(`${c.slug}/${k}`)).find(Boolean);
  let twin = hit;
  if (!twin && c.kind === "image") {
    c.sha1 = createHash("sha1").update(readFileSync(c.path)).digest("hex");
    twin = hashes.get(`${c.slug}/${c.sha1}`);
  }
  if (twin) {
    dupes.push(`${c.slug}: ${relative(MWE, c.path)} = ${relative(MWE, twin.path)}`);
    for (const k of c.keys) owner.set(`${c.slug}/${k}`, twin);
    if (!twin.webId && c.webId) twin.webId = c.webId;
    continue;
  }
  for (const k of c.keys) owner.set(`${c.slug}/${k}`, c);
  if (c.sha1) hashes.set(`${c.slug}/${c.sha1}`, c);
  kept.push(c);
}

/* ---------- ids ---------- */

const sanitize = (s) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
const taken = new Set();
for (const c of kept) {
  const base = sanitize(c.webId ?? stemOf(c.path).replace(/-sdr$/i, ""));
  let id = base;
  for (let n = 2; taken.has(`${c.slug}/${id}`); n++) id = `${base}-${n}`;
  taken.add(`${c.slug}/${id}`);
  c.id = id;
  c.edit = c.kind === "video" ? editOf(c) : undefined;
}

// Before anything is encoded: no kept item may carry a denied id or key.
const leaks = kept.flatMap((c) => [c.id, ...c.keys].filter((t) => denyTokens.has(idForm(t))).map((t) => `${c.slug}/${c.id}: ${t}`));
if (leaks.length) {
  console.error(`refusing to build, denied files would enter the pool:\n  ${leaks.join("\n  ")}`);
  process.exit(1);
}

if (process.argv.includes("--plan")) {
  for (const c of kept) log(`${c.slug.padEnd(20)} ${c.id.padEnd(36)} ${c.kind.padEnd(5)} ${c.origin.padEnd(8)} ${relative(MWE, c.path)}${c.edit ? " (edit)" : ""}`);
  log(`\n${kept.length} items; denied ${denied.length}, duplicates ${dupes.length}, too small ${small.length}, unassigned root ${unassigned.length}, failed ${failed.length}`);
  process.exit(0);
}

/* ---------- build ---------- */

const cacheFile = join(OUT, ".cache.json");
mkdirSync(OUT, { recursive: true });
const cache = existsSync(cacheFile) && !force ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
const nextCache = {};

function signature(c, extra = {}) {
  const s = statSync(c.path);
  return createHash("sha1").update(JSON.stringify({ RECIPE, p: c.path, m: s.mtimeMs, z: s.size, edit: c.edit ?? null, ...extra })).digest("hex");
}

// A file is reused only when its recipe signature matches and it is on disk.
function fresh(file, sig) {
  nextCache[file] = sig;
  return cache[file] === sig && existsSync(file) && statSync(file).size > 0;
}

function tmpOf(file) {
  return join(dirname(file), `.tmp-${basename(file)}`);
}

async function sharpTo(file, pipeline) {
  const tmp = tmpOf(file);
  await pipeline.toFile(tmp);
  renameSync(tmp, file);
}

function ffmpeg(args, file) {
  const tmp = tmpOf(file);
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", ...args, tmp], { stdio: ["ignore", "inherit", "inherit"] });
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  renameSync(tmp, file);
}

// The top-level atoms of an MP4: faststart puts moov before mdat.
function moovFirst(path) {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(8);
    let pos = 0;
    const size = statSync(path).size;
    while (pos + 8 <= size) {
      readSync(fd, head, 0, 8, pos);
      let len = head.readUInt32BE(0);
      const type = head.toString("latin1", 4, 8);
      if (type === "moov") return true;
      if (type === "mdat") return false;
      if (len === 1) {
        const big = Buffer.alloc(8);
        readSync(fd, big, 0, 8, pos + 8);
        len = Number(big.readBigUInt64BE(0));
      }
      if (len < 8) return false;
      pos += len;
    }
    return false;
  } finally {
    closeSync(fd);
  }
}

const TONEMAP = "zscale=tin=arib-std-b67:min=bt2020nc:pin=bt2020:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
const SHORT_720 = "scale='if(gt(iw,ih),-2,trunc(min(720,iw)/2)*2)':'if(gt(iw,ih),trunc(min(720,ih)/2)*2,-2)'";

const references = new Set([join(OUT, "pool.json")]);
const pool = Object.fromEntries(SLUGS.map((s) => [s, []]));
const url = (slug, file) => `/__pool/${slug}/${file}`;

async function buildImage(c) {
  const dir = join(OUT, c.slug);
  const thumb = join(dir, `${c.id}-thumb.webp`);
  const full = join(dir, `${c.id}-1280.webp`);
  const fullW = Math.min(1280, c.w);
  if (!fresh(thumb, signature(c, { o: "thumb" }))) {
    await sharpTo(thumb, sharp(c.path).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }));
  }
  if (!fresh(full, signature(c, { o: "full" }))) {
    await sharpTo(full, sharp(c.path).rotate().resize({ width: fullW, withoutEnlargement: true }).webp({ quality: 80 }));
  }
  references.add(thumb).add(full);
  return {
    id: c.id, kind: "image",
    thumb: url(c.slug, basename(thumb)), full: url(c.slug, basename(full)),
    w: c.w, h: c.h, source: c.path,
  };
}

async function buildVideo(c) {
  const dir = join(OUT, c.slug);
  let source = c.path;
  let p = c.probe;
  if (p.hdr) {
    // The master import-media will encode from: tone-mapped, full resolution up to 1080 on the short side.
    // Kept in _sdr/, which the server never serves and the prune never
    // empties: a pinned manifest may point at it.
    mkdirSync(MASTERS, { recursive: true });
    const master = join(MASTERS, `${stemOf(c.path)}-sdr.mp4`);
    if (!fresh(master, signature(c, { o: "master" }))) {
      log(`  tone-mapping ${relative(MWE, c.path)} (${p.duration.toFixed(1)} s)`);
      ffmpeg([
        "-i", c.path,
        "-vf", `${TONEMAP},scale='if(gt(iw,ih),-2,trunc(min(1080,iw)/2)*2)':'if(gt(iw,ih),trunc(min(1080,ih)/2)*2,-2)'`,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
        ...(p.audio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
        "-movflags", "+faststart",
      ], master);
    }
    references.add(master);
    source = master;
    p = ffprobe(master);
  }

  const preview = join(dir, `${c.id}.mp4`);
  const sig = signature(c, { o: "preview", source });
  const copyable = !c.edit && p.codec === "h264" && p.pixFmt === "yuv420p" && !p.hdr && !p.rotated &&
    Math.min(p.w, p.h) <= 1080 && p.bitrate > 0 && p.bitrate <= 3e6 && extname(source).toLowerCase() === ".mp4" && moovFirst(source);
  if (!fresh(preview, sig)) {
    if (copyable) {
      copyFileSync(source, tmpOf(preview));
      renameSync(tmpOf(preview), preview);
    } else {
      log(`  encoding preview ${c.slug}/${c.id} (${p.duration.toFixed(1)} s)`);
      const trim = c.edit ? ["-ss", String(c.edit.start ?? 0), ...(c.edit.duration != null ? ["-t", String(c.edit.duration)] : [])] : [];
      const blur = (c.edit?.blur ?? []).map(([a, b]) => `boxblur=luma_radius=24:chroma_radius=12:enable='between(t,${a},${b})'`);
      ffmpeg([
        ...trim, "-i", source,
        "-vf", [SHORT_720, ...blur, "format=yuv420p"].join(","),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
        ...(p.audio ? ["-c:a", "aac", "-b:a", "96k"] : ["-an"]),
        "-movflags", "+faststart",
      ], preview);
    }
  }
  const out = ffprobe(preview);
  const poster = join(dir, `${c.id}-poster.webp`);
  const thumb = join(dir, `${c.id}-thumb.webp`);
  if (!fresh(poster, signature(c, { o: "poster", source }))) {
    const png = join(dir, `.tmp-${c.id}-poster.png`);
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", (out.duration * 0.3).toFixed(2), "-i", preview, "-frames:v", "1", png]);
    await sharpTo(poster, sharp(png).resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 78 }));
    rmSync(png, { force: true });
  }
  if (!fresh(thumb, signature(c, { o: "vthumb", source }))) {
    await sharpTo(thumb, sharp(poster).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }));
  }
  references.add(preview).add(poster).add(thumb);
  return {
    id: c.id, kind: "video",
    thumb: url(c.slug, basename(thumb)), full: url(c.slug, basename(preview)), poster: url(c.slug, basename(poster)),
    w: out.w, h: out.h, duration: Math.round(out.duration * 10) / 10, audio: out.audio,
    source, ...(c.edit ? { edit: c.edit } : {}),
  };
}

for (const c of kept) {
  mkdirSync(join(OUT, c.slug), { recursive: true });
  try {
    pool[c.slug].push(c.kind === "image" ? await buildImage(c) : await buildVideo(c));
  } catch (err) {
    failed.push(`${c.slug}: ${relative(MWE, c.path)} (${err.message.split("\n")[0]})`);
  }
}

/* ---------- check, write, prune ---------- */

// Written aside and renamed, so the server never reads half a file.
writeFileSync(tmpOf(join(OUT, "pool.json")), JSON.stringify(pool, null, 2) + "\n");
renameSync(tmpOf(join(OUT, "pool.json")), join(OUT, "pool.json"));
writeFileSync(cacheFile, JSON.stringify(nextCache, null, 2) + "\n");
references.add(cacheFile);

let pruned = 0;
function prune(dir) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (p === MASTERS) continue;
    if (f.isDirectory()) {
      prune(p);
      if (!readdirSync(p).length) rmSync(p, { recursive: true });
    } else if (!references.has(p)) {
      rmSync(p);
      pruned++;
    }
  }
}
prune(OUT);

log("\npool items per slug:");
for (const s of SLUGS) {
  const items = pool[s];
  log(`  ${s.padEnd(20)} ${String(items.length).padStart(3)}  (${items.filter((i) => i.kind === "image").length} images, ${items.filter((i) => i.kind === "video").length} videos)`);
}
log(`\ndenied (${denied.length}):\n  ${denied.join("\n  ")}`);
log(`\nduplicates dropped (${dupes.length}):\n  ${dupes.join("\n  ")}`);
log(`\ntoo small (${small.length}):\n  ${small.join("\n  ")}`);
log(`\nskipped (${skipped.length}):\n  ${skipped.join("\n  ")}`);
log(`\nroot files not assigned to a case page (${unassigned.length}):\n  ${unassigned.join("\n  ")}`);
log(`\nstale files pruned: ${pruned}`);
if (failed.length) {
  console.error(`\nfailed (${failed.length}):\n  ${failed.join("\n  ")}`);
  process.exitCode = 1;
}
log(`\nwrote ${join(OUT, "pool.json")}`);
