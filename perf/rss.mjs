/**
 * rss.mjs
 * Process-tree resident-set sampling for a Playwright-launched Chrome.
 *
 * Decoded images and video frames live off the JS heap, so performance.memory
 * cannot see them. `ps` over the browser's process tree can, which is why every
 * memory claim in this repo is an RSS number rather than a heap number.
 *
 * Extracted from harness.mjs so the focused benches can measure the same way.
 */

import { execSync } from "node:child_process";

export function chromeTreeRss(userDataDir) {
  let out;
  try {
    out = execSync("ps -axo pid=,ppid=,rss=,command=", {
      maxBuffer: 32 * 1024 * 1024,
    }).toString();
  } catch {
    return null;
  }
  const rows = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.push({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] });
  }
  const root = rows.find(
    (r) => r.cmd.includes(userDataDir) && r.cmd.includes("Chrome"),
  );
  if (!root) return null;
  const byPpid = new Map();
  for (const r of rows) {
    if (!byPpid.has(r.ppid)) byPpid.set(r.ppid, []);
    byPpid.get(r.ppid).push(r);
  }
  const tree = [];
  const queue = [root];
  while (queue.length) {
    const n = queue.shift();
    tree.push(n);
    for (const c of byPpid.get(n.pid) || []) queue.push(c);
  }
  const sumKb = (pred) => tree.filter(pred).reduce((s, r) => s + r.rss, 0);
  const renderers = tree.filter((r) => r.cmd.includes("Helper (Renderer)"));
  return {
    totalMb: +(sumKb(() => true) / 1024).toFixed(1),
    rendererSumMb: +(
      sumKb((r) => r.cmd.includes("Helper (Renderer)")) / 1024
    ).toFixed(1),
    rendererMaxMb: +(Math.max(0, ...renderers.map((r) => r.rss)) / 1024).toFixed(
      1,
    ),
    gpuMb: +(sumKb((r) => r.cmd.includes("Helper (GPU)")) / 1024).toFixed(1),
    processes: tree.length,
  };
}
