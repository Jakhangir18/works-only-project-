// Owner-only photo and clip picker. scripts/pick-server.mjs injects it into every
// page it serves; it is never part of the production build.
//
// A slot is a page <img> or <video> showing a file the media import wrote:
// /projects/<slug>/media/<id>(-<width>|-thumb|-poster)?.(webp|mp4), where <id> is
// an image or video entry of that project's media.json (slides are not slots).
// Each slot gets a chip; the chip opens a sheet with the project's pool
// (/__pool/pool.json, scripts/pick-pool.mjs). Choosing an item swaps the slot in
// place, a star marks the choice to keep, and on a video "Start here" records
// the current time as playFrom. Choices persist per page in localStorage and
// "Send" posts them to /__picks.
//
// It touches the page only to swap a slot's own attributes (src, srcset, sizes,
// width, height, poster; href and data-srcset on a link to the same file) and to
// append one .pk-root element to <body>.

const SLOT = /^\/projects\/([a-z0-9-]+)\/media\/(.+?)(?:-(?:\d+|thumb|poster))?\.(webp|mp4)$/;
const STORE = `pk:v1:${location.pathname}`;
const STORE_COLLAPSED = "pk:v1:collapsed";
const KEY = /^[a-z0-9-]{1,64}\/[a-z0-9-]{1,64}$/;

/** element -> registration */
const regs = new Map();
/** "<slug>/<id>" -> Set of registrations */
const bySlot = new Map();
/** slug -> Promise<media.json | null> */
const mediaJson = new Map();
let pool = {};
let state = loadState();
let collapsed = readStore(STORE_COLLAPSED) === "1";
let openReg = null;
let raf = 0;

/* ---------- storage ---------- */

function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: choices last until the tab closes */
  }
}

function loadState() {
  try {
    const s = JSON.parse(readStore(STORE) ?? "null");
    if (s && typeof s.picks === "object" && s.picks) return { picks: s.picks };
  } catch {
    /* fall through */
  }
  return { picks: {} };
}

const save = () => writeStore(STORE, JSON.stringify(state));

/* ---------- dom helpers ---------- */

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  if (tag === "button") el.type = "button";
  return el;
}

function setAttr(el, name, value) {
  if (value == null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== String(value)) {
    el.setAttribute(name, String(value));
  }
}

const stripHash = (u) => (u ?? "").split("#")[0];

function clock(t) {
  if (!Number.isFinite(t)) return "0:00.0";
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

/* ---------- ui shell ---------- */

const root = h("div", "pk-root");
const layer = h("div", "pk-layer");
const bar = h("div", "pk-bar pk-glass");
const btnCollapse = h("button", "pk-btn pk-btn--icon", "▾");
btnCollapse.setAttribute("aria-label", "Hide the picker");
const count = h("span", "pk-count", "0 changes");
const btnReset = h("button", "pk-btn", "Reset");
const btnSend = h("button", "pk-btn pk-btn--primary", "Send");
bar.append(btnCollapse, count, btnReset, btnSend);
const fab = h("button", "pk-btn pk-fab pk-glass", "Picks");
fab.setAttribute("aria-label", "Show the picker");

const sheet = h("div", "pk-sheet pk-glass");
sheet.setAttribute("role", "dialog");
sheet.setAttribute("aria-modal", "false");
const headRow = h("div", "pk-row");
const titleBox = h("div", "pk-title");
const title = h("span", "", "");
const sub = h("span", "pk-sub", "");
titleBox.append(title, sub);
const btnStar = h("button", "pk-btn", "☆ Keep");
btnStar.setAttribute("aria-pressed", "false");
const btnClose = h("button", "pk-btn pk-btn--icon", "✕");
btnClose.setAttribute("aria-label", "Close");
headRow.append(titleBox, btnStar, btnClose);
const strip = h("div", "pk-strip");
strip.setAttribute("role", "listbox");
strip.setAttribute("aria-label", "Alternatives");

const videoRow = h("div", "pk-row");
const btnPlay = h("button", "pk-btn pk-btn--icon", "▶︎");
btnPlay.setAttribute("aria-label", "Play or pause");
const btnBack = h("button", "pk-btn pk-btn--icon", "−1");
btnBack.setAttribute("aria-label", "Back one second");
const btnFwd = h("button", "pk-btn pk-btn--icon", "+1");
btnFwd.setAttribute("aria-label", "Forward one second");
const time = h("span", "pk-time", "0:00.0");
videoRow.append(btnPlay, btnBack, btnFwd, time);
const startRow = h("div", "pk-row");
const btnStart = h("button", "pk-btn pk-btn--primary", "Start here");
const startLabel = h("span", "pk-time", "");
const btnClearStart = h("button", "pk-btn pk-btn--icon", "✕");
btnClearStart.setAttribute("aria-label", "Clear the start point");
startRow.append(btnStart, startLabel, btnClearStart);
sheet.append(headRow, strip, videoRow, startRow);

const toastEl = h("div", "pk-toast pk-glass", "");
toastEl.setAttribute("role", "status");
root.append(layer, bar, fab, sheet, toastEl);

let toastTimer = 0;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("pk-is-open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("pk-is-open"), 3200);
}

/* ---------- pool and slots ---------- */

function itemsFor(reg) {
  const want = reg.kind === "image" ? "image" : "video";
  return (pool[reg.slug] ?? []).filter((i) => i.kind === want);
}

function itemOf(reg, id) {
  return itemsFor(reg).find((i) => i.id === id) ?? null;
}

function media(slug) {
  if (!mediaJson.has(slug)) {
    mediaJson.set(slug, fetch(`/projects/${slug}/media/media.json`, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null));
  }
  return mediaJson.get(slug);
}

function slotOf(el) {
  const urls = [];
  if (el.tagName === "IMG") {
    urls.push(el.getAttribute("src"), el.currentSrc);
    for (const part of (el.getAttribute("srcset") ?? "").split(",")) urls.push(part.trim().split(/\s+/)[0]);
  } else if (el.tagName === "VIDEO") {
    urls.push(el.getAttribute("src"));
    for (const s of el.querySelectorAll("source")) urls.push(s.getAttribute("src"));
  } else {
    urls.push(el.getAttribute("href"));
  }
  for (const u of urls) {
    if (!u) continue;
    let path;
    try {
      const url = new URL(u, location.href);
      if (url.origin !== location.origin) continue;
      path = url.pathname;
    } catch {
      continue;
    }
    const m = SLOT.exec(path);
    if (!m) continue;
    if (el.tagName === "VIDEO" && m[3] !== "mp4") continue;
    return { slug: m[1], id: m[2] };
  }
  return null;
}

function snapshot(el, tag) {
  const a = (n) => el.getAttribute(n);
  if (tag === "a") return { href: a("href"), srcset: a("data-srcset"), w: a("data-w"), h: a("data-h") };
  if (tag === "video") return { src: a("src"), poster: a("poster") };
  return { src: a("src"), srcset: a("srcset"), sizes: a("sizes"), width: a("width"), height: a("height") };
}

const pending = new WeakSet();

async function scan() {
  const found = [];
  for (const el of document.querySelectorAll("img, video, a[href]")) {
    if (regs.has(el) || pending.has(el) || root.contains(el)) continue;
    const hit = slotOf(el);
    if (hit) found.push([el, hit]);
  }
  for (const [el, hit] of found) {
    pending.add(el);
    const m = await media(hit.slug);
    pending.delete(el);
    const entry = m?.[hit.id];
    if (!entry || (entry.kind !== "image" && entry.kind !== "video") || regs.has(el)) continue;
    register(el, hit, entry.kind);
  }
  refresh();
}

function register(el, { slug, id }, kind) {
  const tag = el.tagName === "A" ? "a" : el.tagName === "VIDEO" ? "video" : "img";
  const reg = { el, tag, slug, id, key: `${slug}/${id}`, kind, orig: snapshot(el, tag), chip: null, visible: false, swapped: false };
  regs.set(el, reg);
  if (!bySlot.has(reg.key)) bySlot.set(reg.key, new Set());
  bySlot.get(reg.key).add(reg);
  if (tag !== "a") {
    reg.chip = makeChip(reg);
    io.observe(el);
  }
  apply(reg, true);
}

/* Make one element show what the state says for its slot. Idempotent: it
   writes an attribute only when the value differs. A slot left on its
   original is never touched, so the page's own scripts keep it. */
function apply(reg, initial = false) {
  const pick = state.picks[reg.key];
  const item = pick && pick.pool !== "original" ? itemOf(reg, pick.pool) : null;
  const { el, tag, orig } = reg;

  if (tag === "img") {
    if (item) {
      setAttr(el, "srcset", null);
      setAttr(el, "sizes", null);
      setAttr(el, "src", item.kind === "video" ? item.poster : item.full);
      if (orig.width != null) setAttr(el, "width", item.w);
      if (orig.height != null) setAttr(el, "height", item.h);
      reg.swapped = true;
    } else if (reg.swapped) {
      setAttr(el, "src", orig.src);
      setAttr(el, "srcset", orig.srcset);
      setAttr(el, "sizes", orig.sizes);
      setAttr(el, "width", orig.width);
      setAttr(el, "height", orig.height);
      reg.swapped = false;
    }
  } else if (tag === "video") {
    const playing = !el.paused;
    if (item) {
      if (stripHash(el.getAttribute("src")) !== item.full) {
        el.src = initial && pick.playFrom != null ? `${item.full}#t=${pick.playFrom}` : item.full;
        setAttr(el, "poster", item.poster);
        el.load();
        armStart(reg, pick.playFrom ?? 0);
        if (playing) el.play().catch(() => {});
      }
      reg.swapped = true;
    } else if (reg.swapped) {
      reg.startToken = (reg.startToken ?? 0) + 1;
      setAttr(el, "src", orig.src);
      setAttr(el, "poster", orig.poster);
      el.load();
      if (playing) el.play().catch(() => {});
      reg.swapped = false;
    }
  } else if (tag === "a") {
    if (item && item.kind === "image") {
      const fw = Math.min(1280, item.w);
      setAttr(el, "href", item.full);
      if (orig.srcset != null) setAttr(el, "data-srcset", `${item.full} ${fw}w`);
      if (orig.w != null) setAttr(el, "data-w", fw);
      if (orig.h != null) setAttr(el, "data-h", Math.round((fw * item.h) / item.w));
      reg.swapped = true;
    } else if (reg.swapped) {
      setAttr(el, "href", orig.href);
      setAttr(el, "data-srcset", orig.srcset);
      setAttr(el, "data-w", orig.w);
      setAttr(el, "data-h", orig.h);
      reg.swapped = false;
    }
  }
}

/* The case player moves a clip's first play to the original's start point
   (player.ts reads data-from once). A swapped clip starts where its own pick
   says instead; the token voids the move if the slot changes again first. */
function armStart(reg, t) {
  const token = (reg.startToken = (reg.startToken ?? 0) + 1);
  reg.el.addEventListener("play", () => {
    if (reg.startToken === token && reg.swapped) reg.el.currentTime = t;
  }, { once: true });
}

function unregister(reg) {
  regs.delete(reg.el);
  bySlot.get(reg.key)?.delete(reg);
  if (reg.chip) {
    io.unobserve(reg.el);
    reg.chip.remove();
  }
  reg.startToken = (reg.startToken ?? 0) + 1;
  if (openReg === reg) closeSheet();
}

function applySlot(key) {
  for (const reg of bySlot.get(key) ?? []) apply(reg);
}

/* ---------- state changes ---------- */

function tidy(key) {
  const p = state.picks[key];
  if (p && p.pool === "original" && !p.star && p.playFrom == null) delete state.picks[key];
}

function select(key, poolId) {
  const current = state.picks[key]?.pool ?? "original";
  if (current === poolId) return;
  // A star or a start point belonged to the previous choice.
  state.picks[key] = { pool: poolId, star: false };
  tidy(key);
  save();
  applySlot(key);
  refresh();
}

function toggleStar(key) {
  const p = state.picks[key] ?? { pool: "original", star: false };
  p.star = !p.star;
  state.picks[key] = p;
  tidy(key);
  save();
  refresh();
}

function setStart(key, seconds) {
  const p = state.picks[key] ?? { pool: "original", star: false };
  if (seconds == null) delete p.playFrom;
  else p.playFrom = Math.round(seconds * 10) / 10;
  state.picks[key] = p;
  tidy(key);
  save();
  refresh();
}

const changed = () => Object.keys(state.picks).filter((k) => KEY.test(k));

/* ---------- chips ---------- */

function makeChip(reg) {
  const b = h("button", "pk-chip pk-glass", "⇄");
  b.setAttribute("aria-label", `Pick media for ${reg.key}`);
  b.append(h("span", "pk-chip__star", "★"));
  b.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openSheet(reg);
  });
  layer.append(b);
  return b;
}

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const reg = regs.get(e.target);
    if (reg) reg.visible = e.isIntersecting;
  }
  schedule();
}, { threshold: [0, 0.2] });

function schedule() {
  if (!raf) raf = requestAnimationFrame(place);
}

/* Reads every rect first, then writes every chip (CLAUDE.md invariant 3). */
function place() {
  raf = 0;
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const list = [...regs.values()].filter((r) => r.chip);
  const rects = list.map((r) => (r.visible && !collapsed ? r.el.getBoundingClientRect() : null));
  list.forEach((reg, i) => {
    const r = rects[i];
    const show = r && r.width >= 56 && r.height >= 56 && r.bottom > 60 && r.top < vh - 60 && r.right > 60 && r.left < vw - 8;
    reg.chip.classList.toggle("pk-hide", !show);
    if (!show) return;
    const x = Math.min(r.right, vw) - 52;
    const y = Math.min(Math.max(r.top, 0) + 8, r.bottom - 52);
    reg.chip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  });
}

/* ---------- sheet ---------- */

function tile(label, src, on, badge) {
  const b = h("button", `pk-tile${on ? " pk-tile--on" : ""}`);
  b.setAttribute("role", "option");
  b.setAttribute("aria-selected", String(on));
  const img = h("img", "pk-tile__img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  if (src) img.src = src;
  b.append(img, h("span", "pk-tile__label", label));
  if (badge) b.append(h("span", "pk-tile__badge", badge));
  return b;
}

function renderStrip() {
  const reg = openReg;
  strip.textContent = "";
  const pick = state.picks[reg.key];
  const current = pick?.pool ?? "original";
  const origThumb = reg.tag === "video" ? reg.orig.poster : reg.orig.src;
  const o = tile("Original", origThumb, current === "original", null);
  o.dataset.pool = "original";
  strip.append(o);
  for (const it of itemsFor(reg)) {
    const badge = it.kind === "video" ? `▶︎ ${Math.round(it.duration)}s` : null;
    const t = tile(it.id, it.thumb, current === it.id, badge);
    t.dataset.pool = it.id;
    strip.append(t);
  }
}

function renderSheet() {
  const reg = openReg;
  if (!reg) return;
  const pick = state.picks[reg.key];
  const n = itemsFor(reg).length;
  title.textContent = `${reg.slug} / ${reg.id}`;
  sub.textContent = `${reg.kind === "video" ? "clip" : "image"} · ${n} alternative${n === 1 ? "" : "s"}${pick && pick.pool !== "original" ? ` · showing ${pick.pool}` : ""}`;
  const starred = !!pick?.star;
  btnStar.textContent = starred ? "★ Kept" : "☆ Keep";
  btnStar.classList.toggle("pk-btn--on", starred);
  btnStar.setAttribute("aria-pressed", String(starred));
  for (const t of strip.children) {
    const on = t.dataset.pool === (pick?.pool ?? "original");
    t.classList.toggle("pk-tile--on", on);
    t.setAttribute("aria-selected", String(on));
  }
  const isVideo = reg.tag === "video";
  videoRow.classList.toggle("pk-hide", !isVideo);
  startRow.classList.toggle("pk-hide", !isVideo);
  if (isVideo) {
    startLabel.textContent = pick?.playFrom != null ? `starts at ${clock(pick.playFrom)}` : "starts at the beginning";
    btnClearStart.disabled = pick?.playFrom == null;
    drawTime();
  }
}

function drawTime() {
  if (!openReg || openReg.tag !== "video") return;
  const v = openReg.el;
  time.textContent = `${clock(v.currentTime)} / ${clock(v.duration)}`;
  btnPlay.textContent = v.paused ? "▶︎" : "❚❚";
}

const VIDEO_EVENTS = ["timeupdate", "seeked", "play", "pause", "loadedmetadata", "durationchange"];

function openSheet(reg) {
  closeSheet();
  openReg = reg;
  sheet.setAttribute("aria-label", `Pick media for ${reg.key}`);
  renderStrip();
  renderSheet();
  if (reg.tag === "video") for (const ev of VIDEO_EVENTS) reg.el.addEventListener(ev, drawTime);
  sheet.classList.add("pk-is-open");
  bar.classList.add("pk-hide");
  const on = strip.querySelector(".pk-tile--on");
  if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - 8);
}

function closeSheet() {
  if (openReg?.tag === "video") for (const ev of VIDEO_EVENTS) openReg.el.removeEventListener(ev, drawTime);
  openReg = null;
  sheet.classList.remove("pk-is-open");
  bar.classList.toggle("pk-hide", collapsed);
}

function seek(delta) {
  const v = openReg?.el;
  if (!v) return;
  const go = () => {
    const end = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(end, Math.max(0, v.currentTime + delta));
  };
  if (v.readyState >= 1) go();
  else {
    v.preload = "metadata";
    v.addEventListener("loadedmetadata", go, { once: true });
    v.load();
  }
}

strip.addEventListener("click", (e) => {
  const t = e.target.closest(".pk-tile");
  if (t && openReg) select(openReg.key, t.dataset.pool);
});
btnStar.addEventListener("click", () => openReg && toggleStar(openReg.key));
btnClose.addEventListener("click", closeSheet);
btnPlay.addEventListener("click", () => {
  const v = openReg?.el;
  if (!v) return;
  if (v.paused) v.play().catch(() => toast("The browser would not start the clip"));
  else v.pause();
});
btnBack.addEventListener("click", () => seek(-1));
btnFwd.addEventListener("click", () => seek(1));
btnStart.addEventListener("click", () => openReg && setStart(openReg.key, openReg.el.currentTime));
btnClearStart.addEventListener("click", () => openReg && setStart(openReg.key, null));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openReg) closeSheet();
});

/* ---------- bar ---------- */

function refresh() {
  const n = changed().length;
  count.textContent = `${n} change${n === 1 ? "" : "s"}`;
  fab.textContent = n ? `Picks · ${n}` : "Picks";
  btnSend.disabled = n === 0;
  btnReset.disabled = n === 0;
  for (const [key, set] of bySlot) {
    const p = state.picks[key];
    for (const reg of set) {
      if (!reg.chip) continue;
      reg.chip.classList.toggle("pk-chip--changed", !!p && p.pool !== "original");
      reg.chip.classList.toggle("pk-chip--star", !!p?.star);
    }
  }
  renderSheet();
  schedule();
}

function setCollapsed(on) {
  collapsed = on;
  writeStore(STORE_COLLAPSED, on ? "1" : "0");
  if (on) closeSheet();
  bar.classList.toggle("pk-hide", on);
  fab.classList.toggle("pk-hide", !on);
  layer.classList.toggle("pk-hide", on);
  schedule();
}

btnCollapse.addEventListener("click", () => setCollapsed(true));
fab.addEventListener("click", () => setCollapsed(false));

btnReset.addEventListener("click", () => {
  if (!confirm("Reset every pick on this page?")) return;
  const keys = Object.keys(state.picks);
  state.picks = {};
  save();
  for (const k of keys) applySlot(k);
  refresh();
});

btnSend.addEventListener("click", async () => {
  const picks = {};
  let dropped = 0;
  for (const k of changed()) {
    const p = state.picks[k];
    const slug = k.split("/")[0];
    if (p.pool !== "original" && !(pool[slug] ?? []).some((i) => i.id === p.pool)) {
      dropped++;
      continue;
    }
    picks[k] = { pool: p.pool, star: !!p.star, ...(typeof p.playFrom === "number" ? { playFrom: p.playFrom } : {}) };
  }
  const body = JSON.stringify({
    page: location.pathname,
    userAgent: navigator.userAgent.slice(0, 512),
    sentAt: new Date().toISOString(),
    picks,
  });
  btnSend.disabled = true;
  try {
    const r = await fetch("/__picks", { method: "POST", headers: { "Content-Type": "application/json" }, body });
    const text = (await r.text()).trim();
    const n = Object.keys(picks).length;
    if (r.ok) toast(`Sent ${n} pick${n === 1 ? "" : "s"}${dropped ? ` (${dropped} no longer in the pool)` : ""}`);
    else toast(`Not sent: ${r.status} ${text.slice(0, 80)}`);
  } catch {
    toast("Not sent: the server did not answer");
  } finally {
    btnSend.disabled = changed().length === 0;
  }
});

/* ---------- start ---------- */

let scanTimer = 0;
const mo = new MutationObserver((list) => {
  let rescan = false;
  for (const m of list) {
    if (root.contains(m.target)) continue;
    if (m.type === "childList") {
      if (m.addedNodes.length) rescan = true;
      continue;
    }
    const reg = regs.get(m.target);
    if (!reg) {
      rescan = true;
      continue;
    }
    // A pool URL is either this picker's own write or a page script copying
    // a swapped slot (the rocket lightbox): leave it.
    const now = reg.tag === "a" ? reg.el.getAttribute("href") : reg.el.getAttribute("src");
    if (stripHash(now).startsWith("/__pool/")) continue;
    const hit = slotOf(reg.el);
    if (hit && `${hit.slug}/${hit.id}` === reg.key) {
      // A page script set the slot back to its original: show the choice again.
      if (reg.swapped) apply(reg);
    } else {
      // The element now shows another slot (a shared lightbox or preview).
      unregister(reg);
      rescan = true;
    }
  }
  if (rescan) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 250);
  }
});

async function start() {
  document.body.append(root);
  fab.classList.toggle("pk-hide", !collapsed);
  bar.classList.toggle("pk-hide", collapsed);
  layer.classList.toggle("pk-hide", collapsed);
  try {
    const r = await fetch("/__pool/pool.json", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    pool = await r.json();
  } catch {
    toast("No pool: run scripts/pick-pool.mjs");
  }
  await scan();
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset", "href"] });
  addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  // Pinned and animated sections move media without a scroll event.
  setInterval(() => {
    if (!document.hidden && !collapsed) schedule();
  }, 500);
}

if (document.body) start();
else addEventListener("DOMContentLoaded", start, { once: true });
