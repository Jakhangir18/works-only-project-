/**
 * perf/analyze-trace.mjs — classify long tasks in a Chrome trace.
 *
 * Usage: node perf/analyze-trace.mjs perf-results/<file>.trace.json [thresholdMs]
 *
 * For every RunTask on the renderer main thread longer than the threshold
 * (default 50 ms), attributes time to: gc, layout, style, paint, decode,
 * script, other. Attribution uses merged intervals per category clipped to
 * the task window, so nested events are not double-counted; "script" is
 * script-container time not already claimed by a more specific category;
 * "other" is the unattributed remainder.
 */

import { readFileSync } from "node:fs";

const file = process.argv[2];
const THRESH_MS = Number(process.argv[3] || 50);
if (!file) {
  console.error("usage: node perf/analyze-trace.mjs <trace.json> [thresholdMs]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8"));
const events = Array.isArray(raw) ? raw : raw.traceEvents;

// ---- find the renderer main thread: prefer CrRendererMain metadata (the
// busiest-by-RunTask heuristic can pick a worker/compositor thread), and
// among CrRendererMain threads take the one doing actual style work.
const mainCandidates = new Set();
for (const e of events) {
  if (e.name === "thread_name" && e.args?.name === "CrRendererMain")
    mainCandidates.add(`${e.pid}:${e.tid}`);
}
const runTaskCount = new Map();
const styleCount = new Map();
for (const e of events) {
  const key = `${e.pid}:${e.tid}`;
  if (e.name === "RunTask" && e.ph === "X")
    runTaskCount.set(key, (runTaskCount.get(key) || 0) + 1);
  if (e.name === "UpdateLayoutTree")
    styleCount.set(key, (styleCount.get(key) || 0) + 1);
}
const rank = (k) => (styleCount.get(k) || 0) * 1e9 + (runTaskCount.get(k) || 0);
const pool = mainCandidates.size ? [...mainCandidates] : [...runTaskCount.keys()];
const mainKey = pool.sort((a, b) => rank(b) - rank(a))[0];
if (!mainKey) {
  console.error("no RunTask events found — wrong categories?");
  process.exit(1);
}
const [MAIN_PID, MAIN_TID] = mainKey.split(":").map(Number);
const onMain = (e) => e.pid === MAIN_PID && e.tid === MAIN_TID;

// ---- category classifiers
const CAT = {
  gc: (n) =>
    n === "MajorGC" || n === "MinorGC" ||
    n.startsWith("V8.GC") || n.startsWith("BlinkGC") || n.startsWith("CppGC"),
  layout: (n) => n === "Layout",
  style: (n) => n === "UpdateLayoutTree" || n === "RecalculateStyles",
  paint: (n) =>
    ["Paint", "PaintImage", "CompositeLayers", "UpdateLayerTree", "PrePaint", "Layerize"].includes(n),
  decode: (n) => ["Decode Image", "ImageDecodeTask", "Decode LazyPixelRef"].includes(n),
  script: (n) =>
    ["FunctionCall", "EvaluateScript", "TimerFire", "EventDispatch", "V8.Execute", "RunMicrotasks", "FireAnimationFrame"].includes(n),
};

function mergeIntervals(iv) {
  if (!iv.length) return [];
  iv.sort((a, b) => a[0] - b[0]);
  const out = [iv[0].slice()];
  for (const [s, e] of iv.slice(1)) {
    const last = out[out.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}
const total = (iv) => iv.reduce((s, [a, b]) => s + (b - a), 0);
const subtract = (iv, cut) => {
  // iv minus cut, both merged interval lists
  let res = iv;
  for (const [cs, ce] of cut) {
    const next = [];
    for (const [s, e] of res) {
      if (ce <= s || cs >= e) next.push([s, e]);
      else {
        if (cs > s) next.push([s, cs]);
        if (ce < e) next.push([ce, e]);
      }
    }
    res = next;
  }
  return res;
};

// ---- phase windows from user timing marks
const marks = events
  .filter((e) => e.name && e.name.startsWith && (e.name.startsWith("phase-start:") || e.name.startsWith("phase-end:")) && (e.ph === "R" || e.ph === "I" || e.ph === "n"))
  .map((e) => ({ name: e.name, ts: e.ts }))
  .sort((a, b) => a.ts - b.ts);
const phaseWindows = [];
for (const m of marks) {
  if (m.name.startsWith("phase-start:"))
    phaseWindows.push({ label: m.name.slice(12), start: m.ts, end: Infinity });
  else {
    const w = phaseWindows.find((p) => p.label === m.name.slice(10) && p.end === Infinity);
    if (w) w.end = m.ts;
  }
}
const phaseOf = (ts) => phaseWindows.find((w) => ts >= w.start && ts <= w.end)?.label || "-";

// ---- long tasks
let t0 = Infinity;
for (const e of events) if (e.ts > 0 && e.ts < t0) t0 = e.ts;
const longTasks = events
  .filter((e) => e.name === "RunTask" && e.ph === "X" && onMain(e) && e.dur >= THRESH_MS * 1000)
  .sort((a, b) => a.ts - b.ts);

const children = events.filter((e) => e.ph === "X" && onMain(e) && e.name !== "RunTask");

// Invalidation-tracking instants (why style recalc/layout was needed)
const invalidations = events.filter(
  (e) =>
    onMain(e) &&
    (e.name === "StyleRecalcInvalidationTracking" ||
      e.name === "StyleInvalidatorInvalidationTracking" ||
      e.name === "ScheduleStyleInvalidationTracking" ||
      e.name === "LayoutInvalidationTracking"),
);

const rows = [];
for (const task of longTasks) {
  const tEnd = task.ts + task.dur;
  const inTask = children.filter((c) => c.ts < tEnd && c.ts + (c.dur || 0) > task.ts);
  const clip = ([s, e]) => [Math.max(s, task.ts), Math.min(e, tEnd)];
  const catIv = {};
  for (const cat of ["gc", "layout", "style", "paint", "decode", "script"]) {
    catIv[cat] = mergeIntervals(
      inTask.filter((c) => CAT[cat](c.name)).map((c) => clip([c.ts, c.ts + c.dur])),
    );
  }
  // script must not claim time owned by specific categories
  const specific = mergeIntervals([].concat(catIv.gc, catIv.layout, catIv.style, catIv.paint, catIv.decode));
  const scriptOnly = subtract(catIv.script, specific);
  const claimed = mergeIntervals([].concat(specific, scriptOnly));

  const top = inTask
    .filter((c) => !CAT.script(c.name))
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 3)
    .map((c) => `${c.name}:${(c.dur / 1000).toFixed(0)}ms`);

  rows.push({
    phase: phaseOf(task.ts),
    atS: +((task.ts - t0) / 1e6).toFixed(1),
    durMs: +(task.dur / 1000).toFixed(0),
    gc: +(total(catIv.gc) / 1000).toFixed(1),
    layout: +(total(catIv.layout) / 1000).toFixed(1),
    style: +(total(catIv.style) / 1000).toFixed(1),
    paint: +(total(catIv.paint) / 1000).toFixed(1),
    decode: +(total(catIv.decode) / 1000).toFixed(1),
    script: +(total(scriptOnly) / 1000).toFixed(1),
    other: +((task.dur - total(claimed)) / 1000).toFixed(1),
    top: top.join(" "),
  });
}

// ---- overall GC stats in the trace window
const gcEvents = children.filter((c) => CAT.gc(c.name));
const gcTotalMs = +(gcEvents.reduce((s, e) => s + e.dur, 0) / 1000).toFixed(0);
const majorCount = gcEvents.filter((e) => e.name === "MajorGC" || e.name.includes("FinalizeMC")).length;
const minorCount = gcEvents.filter((e) => e.name === "MinorGC" || e.name.includes("Scavenger")).length;
const decodeAll = children.filter((c) => CAT.decode(c.name));
const decodeTotalMs = +(decodeAll.reduce((s, e) => s + e.dur, 0) / 1000).toFixed(0);

console.log(`trace: ${file}`);
console.log(`renderer main: pid ${MAIN_PID} tid ${MAIN_TID}; tasks >= ${THRESH_MS}ms: ${rows.length}`);
console.log(`GC on main thread overall: ${gcEvents.length} events (${majorCount} major-ish, ${minorCount} minor-ish), ${gcTotalMs}ms total`);
console.log(`Image decode on main thread overall: ${decodeAll.length} events, ${decodeTotalMs}ms total`);
console.log("");
console.log("phase             at(s)  dur    gc  layout style  paint decode script  other  top-non-script-children");
for (const r of rows) {
  console.log(
    `${r.phase.padEnd(17)}${String(r.atS).padStart(6)}${String(r.durMs).padStart(5)}${String(r.gc).padStart(7)}` +
    `${String(r.layout).padStart(7)}${String(r.style).padStart(7)}${String(r.paint).padStart(7)}${String(r.decode).padStart(7)}` +
    `${String(r.script).padStart(7)}${String(r.other).padStart(7)}  ${r.top}`,
  );
}
const dom = (k) => rows.filter((r) => {
  const cats = { gc: r.gc, layout: r.layout, style: r.style, paint: r.paint, decode: r.decode, script: r.script, other: r.other };
  return Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0] === k;
}).length;
console.log("");
console.log(
  `dominated-by: script ${dom("script")}, gc ${dom("gc")}, layout ${dom("layout")}, style ${dom("style")}, paint ${dom("paint")}, decode ${dom("decode")}, other ${dom("other")}`,
);

// ---- what invalidated style/layout inside the long tasks
const invAgg = new Map();
for (const task of longTasks) {
  const tEnd = task.ts + task.dur;
  for (const inv of invalidations) {
    if (inv.ts < task.ts || inv.ts > tEnd) continue;
    const d = inv.args?.data || {};
    const key = `${inv.name.replace("InvalidationTracking", "")} | ${d.reason || "?"} | ${d.nodeName || d.selectorPart || d.extraData || "?"}`;
    invAgg.set(key, (invAgg.get(key) || 0) + 1);
  }
}
if (invAgg.size) {
  console.log("");
  console.log("top invalidation sources inside long tasks (kind | reason | node/selector : count):");
  for (const [k, v] of [...invAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
    console.log(`  ${String(v).padStart(6)}  ${k}`);
} else {
  console.log("(no invalidation-tracking events in trace — category missing?)");
}
