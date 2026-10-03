// Turns the owner's picks (docs/picks/<time>.json, written by scripts/pick-server.mjs)
// into manifest changes.
//
//   node scripts/pin-picks.mjs docs/picks/<file>.json [--dry-run] [--starred-only] [--pool=<pool.json>]
//
// For each pick, finds the entry with that slug and id in docs/media-manifest*.json:
//   - a pool item: its `source` (from ~/work/works-only/in/pick-pool/pool.json)
//     becomes the entry's `src`. A source outside ~/work/works-only/in/ is refused.
//     The trim, blur and poster time of the old source no longer apply and are
//     removed; the pool item's own privacy cut (`edit`) is written instead.
//   - "original" with a start point: only `playFrom` changes.
//   - playFrom is a time in the clip the owner watched. For a pool clip that is
//     the clip after the pool's own cut, which is the cut written here, so it is
//     kept as is; for a pick of the entry's current source it is moved into the
//     entry's trimmed timeline.
// Writes the manifests back as 2-space JSON with a trailing newline, then prints
// the import commands to run. It never runs them. --dry-run prints the changes
// and writes nothing. --starred-only applies only the picks marked to keep.

import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

const repo = resolve(dirname(new URL(import.meta.url).pathname), "..");
const IN = join(homedir(), "work/works-only/in");
const POOL_JSON = process.argv.find((a) => a.startsWith("--pool="))?.slice(7) ?? join(IN, "pick-pool/pool.json");
const KEY = /^[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}$/;
// Keys that describe the old source, not the slot.
const SOURCE_KEYS = ["start", "duration", "blur", "posterAt", "note"];

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const starredOnly = args.includes("--starred-only");
if (!file) {
  console.error("usage: node scripts/pin-picks.mjs docs/picks/<file>.json [--dry-run] [--starred-only]");
  process.exit(2);
}

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const picksDoc = JSON.parse(readFileSync(file, "utf8"));
if (!picksDoc || typeof picksDoc.picks !== "object") fail(`${file}: no "picks" object`);
if (!existsSync(POOL_JSON)) fail(`no pool at ${POOL_JSON}: run scripts/pick-pool.mjs`);
const pool = JSON.parse(readFileSync(POOL_JSON, "utf8"));
const inRoot = realpathSync(IN);

const manifests = readdirSync(join(repo, "docs"))
  .filter((f) => /^media-manifest.*\.json$/.test(f))
  .sort()
  .map((f) => {
    const path = join(repo, "docs", f);
    const text = readFileSync(path, "utf8");
    const entries = JSON.parse(text);
    if (JSON.stringify(entries, null, 2) + "\n" !== text) fail(`${f} is not in 2-space JSON with a trailing newline; refusing to rewrite it`);
    return { name: `docs/${f}`, path, entries, dirty: false, ids: new Map() };
  });

function find(slug, id) {
  for (const m of manifests) {
    const entry = m.entries.find((e) => e.slug === slug && e.id === id);
    if (entry) return { m, entry };
  }
  return null;
}

function insideIn(p) {
  let real;
  try {
    real = realpathSync(p);
  } catch {
    return null;
  }
  return real.startsWith(inRoot + sep) ? real : null;
}

const short = (p) => (p.startsWith(IN + sep) ? relative(IN, p) : p);
const fmt = (v) => (v === undefined ? "-" : JSON.stringify(v));
let changes = 0;
let problems = 0;
const problem = (msg) => {
  problems++;
  console.log(`  ! ${msg}`);
};

console.log(`${file}: ${Object.keys(picksDoc.picks).length} picks from ${picksDoc.page ?? "?"} (${picksDoc.receivedAt ?? picksDoc.sentAt ?? "?"})${dryRun ? ", dry run" : ""}\n`);

for (const [key, pick] of Object.entries(picksDoc.picks)) {
  const star = pick.star ? "*" : " ";
  if (!KEY.test(key)) {
    problem(`${key}: not a slot key`);
    continue;
  }
  if (starredOnly && !pick.star) {
    console.log(`${star} ${key}: not starred, skipped`);
    continue;
  }
  const [slug, id] = key.split("/");
  const hit = find(slug, id);
  if (!hit) {
    problem(`${key}: no entry in ${manifests.map((m) => m.name).join(", ")}`);
    continue;
  }
  const { m, entry } = hit;
  if (entry.kind !== "image" && entry.kind !== "video") {
    problem(`${key}: a ${entry.kind} entry is not a slot`);
    continue;
  }
  const playFrom = typeof pick.playFrom === "number" && Number.isFinite(pick.playFrom) && pick.playFrom >= 0 ? pick.playFrom : undefined;
  const before = { ...entry };
  const notes = [];

  if (pick.pool === "original") {
    if (playFrom === undefined) {
      console.log(`${star} ${key}: original, nothing to change`);
      continue;
    }
    if (entry.kind !== "video") {
      problem(`${key}: a start point on an image`);
      continue;
    }
    entry.playFrom = playFrom;
  } else {
    const item = (pool[slug] ?? []).find((i) => i.id === pick.pool);
    if (!item) {
      problem(`${key}: pool item ${pick.pool} is not in pool.json for ${slug}`);
      continue;
    }
    if (item.kind !== entry.kind) {
      problem(`${key}: ${item.kind === "image" ? "an image" : "a clip"} cannot fill ${entry.kind === "image" ? "an image" : "a video"} slot`);
      continue;
    }
    const source = insideIn(item.source);
    if (!source) {
      problem(`${key}: source ${item.source} is missing or outside ${IN}/`);
      continue;
    }
    const current = existsSync(entry.src) ? realpathSync(entry.src) : entry.src;
    if (source === current) {
      // The same file the entry already uses: keep its cut. The owner watched
      // the pool's cut, so move the time into the entry's.
      if (playFrom !== undefined) {
        const t = playFrom + (item.edit?.start ?? 0) - (entry.start ?? 0);
        if (t < 0 || (entry.duration != null && t >= entry.duration)) {
          problem(`${key}: start ${playFrom}s of ${pick.pool} falls outside this entry's cut (start ${entry.start ?? 0}, duration ${entry.duration ?? "full"}); change it by hand`);
          continue;
        }
        entry.playFrom = Math.round(t * 100) / 100;
      } else {
        console.log(`${star} ${key}: ${pick.pool} is the current source, nothing to change`);
        continue;
      }
    } else {
      entry.src = source;
      for (const k of SOURCE_KEYS) delete entry[k];
      delete entry.playFrom;
      if (item.edit) {
        if (item.edit.start != null) entry.start = item.edit.start;
        if (item.edit.duration != null) entry.duration = item.edit.duration;
        if (item.edit.blur) entry.blur = item.edit.blur;
        notes.push("the pool's privacy cut is written with it");
      }
      if (playFrom !== undefined && entry.kind === "video") entry.playFrom = playFrom;
      entry.note = `picked by the owner (${picksDoc.receivedAt ?? picksDoc.sentAt ?? "unknown time"}) from pool item ${slug}/${pick.pool}`;
      if (entry.keepAudio) notes.push("keepAudio is on: listen to the new clip's sound before publishing");
      if (entry.widths) notes.push(`widths ${JSON.stringify(entry.widths)} kept; the new picture is ${item.w}x${item.h}`);
    }
  }

  const keys = [...new Set([...Object.keys(before), ...Object.keys(entry)])].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(entry[k]));
  if (!keys.length) {
    console.log(`${star} ${key}: no change`);
    continue;
  }
  changes++;
  m.dirty = true;
  if (!m.ids.has(slug)) m.ids.set(slug, new Set());
  m.ids.get(slug).add(id);
  console.log(`${star} ${key} (${m.name})`);
  for (const k of keys) {
    const a = k === "src" ? short(before[k] ?? "") : fmt(before[k]);
    const b = k === "src" ? short(entry[k] ?? "") : fmt(entry[k]);
    console.log(`    ${k}: ${a} -> ${b}`);
  }
  for (const n of notes) console.log(`    warn: ${n}`);
}

console.log(`\n${changes} entr${changes === 1 ? "y" : "ies"} changed${problems ? `, ${problems} pick${problems === 1 ? "" : "s"} refused (marked !)` : ""}.`);
if (!changes) process.exit(problems ? 1 : 0);

if (dryRun) console.log("dry run: no manifest written.");
else {
  for (const m of manifests) if (m.dirty) writeFileSync(m.path, JSON.stringify(m.entries, null, 2) + "\n");
  console.log(`wrote ${manifests.filter((m) => m.dirty).map((m) => m.name).join(", ")}`);
}

console.log("\nthen run:");
for (const m of manifests) {
  for (const [slug, ids] of m.ids) {
    console.log(`  heavy node scripts/import-media.mjs ${m.name} --only=${slug} --ids=${[...ids].join(",")} --force`);
  }
}
if (problems) process.exitCode = 1;
