// The owner-only photo picker, served over the tailnet.
//
//   node scripts/pick-server.mjs
//   open http://100.122.188.86:4401/ on the iPhone or the Mac
//
// Serves the production build in dist/ (build it first; this never builds) and
// injects the picker (scripts/pick/picker.css, picker.js) into every HTML page
// on the way out; the files in dist/ are not touched, and the build itself never
// contains picker code. Also serves:
//   /__pick/picker.js, /__pick/picker.css   the picker
//   /__pool/...                             ~/work/works-only/in/pick-pool/ (scripts/pick-pool.mjs)
//   POST /__picks                           the owner's choices -> docs/picks/<server time>.json
//
// It binds the tailnet address only, so nothing outside the owner's tailnet can
// reach it, and answers only requests addressed to that host and port (so open
// it by IP, not by the MagicDNS name). Every file path is confined to its root;
// /__pool/ serves only the file names pool.json uses. HTTP Range is supported
// because iPhone Safari will not play an MP4 without it. POST /__picks takes
// only application/json from this server's own origin, at most 256 KB, checks
// the shape and the pool ids, and names the file from the server clock alone.

import { createReadStream, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";

const HOST = "100.122.188.86";
const PORT = 4401;
const HOST_HEADER = `${HOST}:${PORT}`;
const ORIGIN = `http://${HOST_HEADER}`;
const POOL_FILE = /^(pool\.json|[a-z0-9-]+\/[a-z0-9-]+(-thumb\.webp|-1280\.webp|-poster\.webp|\.mp4))$/;
const MAX_BODY = 256 * 1024;

const repo = resolve(dirname(new URL(import.meta.url).pathname), "..");
const DIST = join(repo, "dist");
const POOL = join(homedir(), "work/works-only/in/pick-pool");
const PICKS = join(repo, "docs/picks");
const PICKER = {
  "/__pick/picker.js": join(repo, "scripts/pick/picker.js"),
  "/__pick/picker.css": join(repo, "scripts/pick/picker.css"),
};
const INJECT = '<link rel="stylesheet" href="/__pick/picker.css"><script type="module" src="/__pick/picker.js"></script>';

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
};

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  const buf = Buffer.from(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  });
  res.end(buf);
}

const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj) + "\n", MIME[".json"]);

/* ---------- paths ---------- */

// `rel` is a decoded URL path below a route prefix. Returns an absolute path
// inside `root`, or null. A path that exists must also stay inside `root` once
// symlinks are resolved.
function confined(root, rel) {
  if (rel.startsWith("/") || rel.includes("\\") || rel.includes("\0")) return null;
  if (rel.split("/").some((s) => s === ".." || s === ".")) return null;
  const p = resolve(root, rel);
  if (p !== root && !p.startsWith(root + sep)) return null;
  let real;
  try {
    real = realpathSync(p);
  } catch {
    return p; // missing: the caller answers 404
  }
  const realRoot = realpathSync(root);
  return real === realRoot || real.startsWith(realRoot + sep) ? p : null;
}

function statFile(p) {
  try {
    const s = statSync(p);
    return s;
  } catch {
    return null;
  }
}

/* ---------- static files ---------- */

function parseRange(header, size) {
  // One range only; anything else is served whole, which the spec allows.
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start > end || start >= size) return "unsatisfiable";
  }
  return { start, end };
}

function serveFile(req, res, file, { inject = false, status = 200, cache = "no-cache" } = {}) {
  const st = statFile(file);
  if (!st || !st.isFile()) return notFound(req, res);
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream";
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const lastModified = st.mtime.toUTCString();
  const head = req.method === "HEAD";

  if (inject && type.startsWith("text/html")) {
    const html = readFileSync(file, "utf8");
    const at = html.toLowerCase().lastIndexOf("</body>");
    const out = at < 0 ? html + INJECT : html.slice(0, at) + INJECT + html.slice(at);
    const buf = Buffer.from(out);
    res.writeHead(status, {
      "Content-Type": type,
      "Content-Length": buf.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.end(head ? undefined : buf);
  }

  const base = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": cache,
    "ETag": etag,
    "Last-Modified": lastModified,
    "X-Content-Type-Options": "nosniff",
  };
  if (status === 200 && req.headers["if-none-match"] === etag) {
    res.writeHead(304, base);
    return res.end();
  }

  let range = null;
  const ifRange = req.headers["if-range"];
  if (status === 200 && req.headers.range && (!ifRange || ifRange === etag || ifRange === lastModified)) range = parseRange(req.headers.range, st.size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { ...base, "Content-Range": `bytes */${st.size}`, "Content-Length": 0 });
    return res.end();
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : st.size - 1;
  const headers = { ...base, "Content-Length": st.size === 0 ? 0 : end - start + 1 };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
  res.writeHead(range ? 206 : status, headers);
  if (head || st.size === 0) return res.end();
  const stream = createReadStream(file, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

function notFound(req, res) {
  const page = join(DIST, "404.html");
  if (statFile(page)?.isFile()) return serveFile(req, res, page, { inject: true, status: 404 });
  return send(res, 404, "not found\n");
}

function serveDist(req, res, path, query) {
  const file = confined(DIST, path.slice(1));
  if (file === null) return send(res, 400, "bad path\n");
  if (path.endsWith("/")) return serveFile(req, res, join(file, "index.html"), { inject: true });
  const st = statFile(file);
  if (st?.isDirectory()) {
    res.writeHead(301, { Location: `${path}/${query}`, "Content-Length": 0 });
    return res.end();
  }
  if (st?.isFile()) return serveFile(req, res, file, { inject: true });
  const page = confined(DIST, `${path.slice(1)}.html`);
  if (page && statFile(page)?.isFile()) return serveFile(req, res, page, { inject: true });
  return notFound(req, res);
}

/* ---------- picks ---------- */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const KEY = /^[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}$/;
const POOL_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

let poolCache = { mtime: -1, ids: new Map() };
function poolIds() {
  const file = join(POOL, "pool.json");
  const st = statFile(file);
  if (!st) return new Map();
  if (st.mtimeMs !== poolCache.mtime) {
    const pool = JSON.parse(readFileSync(file, "utf8"));
    const ids = new Map(Object.entries(pool).map(([slug, items]) => [slug, new Set(items.map((i) => i.id))]));
    poolCache = { mtime: st.mtimeMs, ids };
  }
  return poolCache.ids;
}

// Returns a fixed message, never the input.
function invalid(b) {
  if (!isObject(b)) return "body must be an object";
  for (const k of Object.keys(b)) if (!["page", "userAgent", "sentAt", "picks"].includes(k)) return "unknown field";
  if (typeof b.page !== "string" || !/^\/[\x21-\x7e]{0,511}$/.test(b.page)) return "bad page";
  if (typeof b.userAgent !== "string" || b.userAgent.length > 512) return "bad userAgent";
  if (typeof b.sentAt !== "string" || !ISO.test(b.sentAt)) return "bad sentAt";
  if (!isObject(b.picks)) return "bad picks";
  const keys = Object.keys(b.picks);
  if (keys.length > 300) return "too many picks";
  const ids = poolIds();
  for (const k of keys) {
    if (!KEY.test(k)) return "bad pick key";
    const p = b.picks[k];
    if (!isObject(p)) return "bad pick";
    for (const f of Object.keys(p)) if (!["pool", "star", "playFrom"].includes(f)) return "unknown pick field";
    if (typeof p.pool !== "string" || !(p.pool === "original" || POOL_ID.test(p.pool))) return "bad pool";
    if (p.pool !== "original" && !ids.get(k.split("/")[0])?.has(p.pool)) return "pool id not in pool.json";
    if (typeof p.star !== "boolean") return "bad star";
    if (p.playFrom !== undefined && !(typeof p.playFrom === "number" && Number.isFinite(p.playFrom) && p.playFrom >= 0 && p.playFrom <= 36000)) return "bad playFrom";
  }
  return null;
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.pause();
        fail(Object.assign(new Error("too large"), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

async function postPicks(req, res) {
  if (req.headers.origin !== ORIGIN) return send(res, 403, "origin refused\n", undefined, { Connection: "close" });
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return send(res, 415, "application/json only\n", undefined, { Connection: "close" });
  if (Number(req.headers["content-length"] ?? 0) > MAX_BODY) return send(res, 413, "body too large\n", undefined, { Connection: "close" });

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    // Answer, then drop the connection rather than read the rest of the body.
    res.on("finish", () => req.destroy());
    if (!res.headersSent && !res.destroyed) send(res, err.status ?? 400, err.status === 413 ? "body too large\n" : "bad body\n", undefined, { Connection: "close" });
    return;
  }
  let data;
  try {
    data = JSON.parse(body.toString("utf8"));
  } catch {
    return send(res, 400, "bad json\n");
  }
  const why = invalid(data);
  if (why) return send(res, 422, `${why}\n`);

  const picks = {};
  for (const [k, p] of Object.entries(data.picks)) {
    picks[k] = { pool: p.pool, star: p.star, ...(p.playFrom !== undefined ? { playFrom: Math.round(p.playFrom * 100) / 100 } : {}) };
  }
  mkdirSync(PICKS, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date();
    const name = `${now.toISOString().replace(/:/g, "-")}.json`;
    const record = { receivedAt: now.toISOString(), page: data.page, userAgent: data.userAgent, sentAt: data.sentAt, picks };
    try {
      writeFileSync(join(PICKS, name), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    } catch (err) {
      if (err.code === "EEXIST") {
        await new Promise((r) => setTimeout(r, 2));
        continue;
      }
      throw err;
    }
    console.log(`picks: ${Object.keys(picks).length} from ${data.page} -> docs/picks/${name}`);
    return sendJson(res, 201, { ok: true, file: `docs/picks/${name}`, count: Object.keys(picks).length });
  }
  return send(res, 503, "try again\n");
}

/* ---------- routing ---------- */

async function handle(req, res) {
  // A page on another site cannot reach this server by pointing its own
  // domain at the tailnet address (DNS rebinding): the Host must be ours.
  if (req.headers.host !== HOST_HEADER) return send(res, 421, "wrong host: open http://100.122.188.86:4401/\n", undefined, { Connection: "close" });
  const raw = req.url ?? "/";
  if (!raw.startsWith("/")) return send(res, 400, "bad request\n");
  const q = raw.indexOf("?");
  const rawPath = q < 0 ? raw : raw.slice(0, q);
  const query = q < 0 ? "" : raw.slice(q);
  let path;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return send(res, 400, "bad path\n");
  }
  if (path.includes("\0") || path.includes("\\") || path.split("/").some((s) => s === ".." || s === ".")) {
    return send(res, 400, "bad path\n");
  }

  if (path === "/__picks") {
    if (req.method !== "POST") return send(res, 405, "POST only\n", undefined, { Allow: "POST" });
    return postPicks(req, res);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "GET and HEAD only\n", undefined, { Allow: "GET, HEAD" });

  if (path in PICKER) return serveFile(req, res, PICKER[path], { cache: "no-store" });
  if (path.startsWith("/__pool/")) {
    const rel = path.slice("/__pool/".length);
    // Only what pool.json points at: never the SDR masters or the build cache.
    if (!POOL_FILE.test(rel)) return send(res, 404, "not found\n");
    const file = confined(POOL, rel);
    if (file === null) return send(res, 400, "bad path\n");
    return serveFile(req, res, file);
  }
  return serveDist(req, res, path, query);
}

if (!statFile(join(DIST, "index.html"))) {
  console.error(`no build in ${DIST}: run the production build first`);
  process.exit(1);
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) send(res, 500, "server error\n");
    else res.destroy();
  });
});
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.listen(PORT, HOST, () => {
  console.log(`picker on ${ORIGIN}/ (dist: ${DIST}, pool: ${POOL})`);
});
