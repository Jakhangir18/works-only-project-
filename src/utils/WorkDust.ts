/**
 * WORK's wall dissolving into stars (the owner, 2026-10-03: "стена
 * рассыпается в звёзды"), on the anime home only.
 *
 * After the last card's hold, WORK's timeline runs one more segment, and
 * this module draws it from that segment's progress `d` alone:
 *   - specks appear over the wall's letters, sampled from the glyphs where
 *     they stand on screen, while the letters themselves fade;
 *   - most specks drift outward and fade; one per star of the descent's
 *     star field (helpers/_stars.scss) drifts onto that star instead;
 *   - at the end the stylesheet's star layer fades in under those specks,
 *     on the same pixels, and the canvas clears. The descent's stage, which
 *     paints the same field, scrolls up behind it.
 *
 * Nothing moves on its own: a frame is drawn only when `d` changed, from
 * WorkSection's tick on the GSAP ticker, on a canvas of its own layer
 * (invariant 13). The glyphs are sampled once per layout, the first time
 * the segment starts: one rect read per ghost letter, then an offscreen
 * canvas at half resolution. Sizing the canvas resets its context, and its
 * state is set again in the same function (invariant 8).
 */

/* The star field's two tiles, as in helpers/_stars.scss: offset, size,
   colour and alpha. A star sits at the centre of each tile. */
const TILES = [
  { x: 17, y: 23, w: 137, h: 149, rgb: "255, 255, 255", a: 0.7, size: 1.8 },
  { x: 89, y: 61, w: 211, h: 173, rgb: "255, 217, 168", a: 0.55, size: 2.2 },
] as const;
const DUST = "255, 242, 237";
const WIDE_COUNT = 3200;
const NARROW_COUNT = 1300;
const NARROW_BELOW = 640;
/* The offscreen copy of the wall is drawn at half size. */
const SAMPLE_SCALE = 0.5;
const BANDS = 4;
/* In the segment's progress. The drifting dust holds as a dense field
   until DUST_OUT, then thins to the descent's sparse one. */
const LETTERS_OUT = [0.02, 0.2] as const;
const DUST_IN = [0, 0.1] as const;
const MOVE_FROM = 0.06;
const MOVE_SPAN = 0.5;
const MAX_DELAY = 0.36;
const STARS_IN = [0.86, 0.98] as const;
const DUST_OUT = [0.7, 0.96] as const;

type Speck = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
  size0: number;
  size1: number;
  /* -1 for dust that fades, else the tile whose star it lands on. */
  tile: number;
};

export type Glyph = { el: HTMLElement; letter: string };

function ramp(p: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (p - from) / (to - from)));
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class WorkDust {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  scene: HTMLElement;
  stars: HTMLElement;
  glyphs: () => Glyph[];
  family: string;
  W = 0;
  H = 0;
  dpr = 1;
  specks: Speck[] = [];
  sampled = false;
  blank = true;
  last = -1;
  sceneOpacity = "";
  starsOpacity = "";

  constructor(canvas: HTMLCanvasElement, scene: HTMLElement, stars: HTMLElement, glyphs: () => Glyph[]) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.scene = scene;
    this.stars = stars;
    this.glyphs = glyphs;
    this.family =
      getComputedStyle(document.documentElement).getPropertyValue("--font-family-bigger").trim() || "sans-serif";
  }

  /** The canvas at the stage's size; the glyphs are sampled again next time. */
  resize(w: number, h: number): void {
    this.W = w;
    this.H = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx = this.canvas.getContext("2d");
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.blank = true;
    this.forget();
  }

  /** The wall was rebuilt: its letters stand somewhere else now. */
  forget(): void {
    this.sampled = false;
    this.specks = [];
    this.last = -1;
  }

  /* Star centres on the stage, per tile. */
  starCentres(): { x: number; y: number; tile: number }[] {
    const out: { x: number; y: number; tile: number }[] = [];
    TILES.forEach((t, tile) => {
      const cx = (t.x + t.w / 2) % t.w;
      const cy = (t.y + t.h / 2) % t.h;
      for (let x = cx; x < this.W; x += t.w) {
        for (let y = cy; y < this.H; y += t.h) out.push({ x, y, tile });
      }
    });
    return out;
  }

  sample(): void {
    this.sampled = true;
    const { W, H } = this;
    if (!W || !H) return;
    // One read per ghost, before anything here writes.
    const boxes = this.glyphs()
      .map((g) => ({ letter: g.letter, r: g.el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > 0 && r.left < W && r.bottom > 0 && r.top < H);
    const off = document.createElement("canvas");
    off.width = Math.ceil(W * SAMPLE_SCALE);
    off.height = Math.ceil(H * SAMPLE_SCALE);
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return;
    const BASE = 100;
    o.font = `700 ${BASE}px ${this.family}`;
    o.textAlign = "center";
    o.textBaseline = "alphabetic";
    o.fillStyle = "#fff";
    for (const { letter, r } of boxes) {
      const m = o.measureText(letter);
      const ascent = m.fontBoundingBoxAscent ?? BASE * 0.8;
      const descent = m.fontBoundingBoxDescent ?? BASE * 0.2;
      // The ghost's box is its glyph's advance by a 0.85 line; its content
      // area is centred on the line, as in the DOM.
      const sx = r.width / Math.max(1, m.width);
      const sy = r.height / (0.85 * BASE);
      o.setTransform(
        sx * SAMPLE_SCALE,
        0,
        0,
        sy * SAMPLE_SCALE,
        (r.left + r.width / 2) * SAMPLE_SCALE,
        (r.top + r.height / 2) * SAMPLE_SCALE,
      );
      o.fillText(letter, 0, (ascent - descent) / 2);
    }
    const data = o.getImageData(0, 0, off.width, off.height).data;
    const inside: [number, number][] = [];
    for (let y = 0; y < off.height; y += 2) {
      for (let x = 0; x < off.width; x += 2) {
        if (data[(y * off.width + x) * 4 + 3] > 140) inside.push([x / SAMPLE_SCALE, y / SAMPLE_SCALE]);
      }
    }
    // iOS caps the memory all canvases may hold: give this one's back now.
    off.width = 0;
    off.height = 0;
    if (!inside.length) return;

    const r = rng(20261004);
    for (let i = inside.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [inside[i], inside[j]] = [inside[j], inside[i]];
    }
    const count = Math.min(inside.length, W < NARROW_BELOW ? NARROW_COUNT : WIDE_COUNT);
    const size0 = W < NARROW_BELOW ? 1.8 : 2.2;
    const specks: Speck[] = [];

    // One speck per star, from the nearest of a few glyph points, so each
    // drifts a short way onto its star.
    for (const star of this.starCentres()) {
      let best = inside[Math.floor(r() * inside.length)];
      let bestD = Infinity;
      for (let k = 0; k < 24; k++) {
        const p = inside[Math.floor(r() * inside.length)];
        const d = (p[0] - star.x) ** 2 + (p[1] - star.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      specks.push({
        x0: best[0],
        y0: best[1],
        x1: star.x,
        y1: star.y,
        delay: r() * MAX_DELAY,
        size0,
        size1: TILES[star.tile].size,
        tile: star.tile,
      });
    }

    // The rest drift outward from the middle of the screen and fade.
    const cx = W / 2;
    const cy = H / 2;
    for (let i = 0; i < count; i++) {
      const [x, y] = inside[i];
      const k = 0.25 + r() * 0.6;
      const jitter = 0.06 * Math.hypot(W, H);
      specks.push({
        x0: x,
        y0: y,
        x1: x + (x - cx) * k + (r() - 0.5) * jitter,
        y1: y + (y - cy) * k + (r() - 0.5) * jitter - r() * 0.05 * H,
        delay: r() * MAX_DELAY,
        size0,
        size1: size0 * 0.6,
        tile: -1,
      });
    }
    this.specks = specks;
  }

  /** The segment's progress, from WorkSection's tick. Draws only on change. */
  update(d: number): void {
    const rd = Math.round(d * 10000) / 10000;
    if (rd === this.last) return;
    this.last = rd;

    this.write(this.scene, "sceneOpacity", (1 - ramp(rd, LETTERS_OUT[0], LETTERS_OUT[1])).toFixed(3));
    this.write(this.stars, "starsOpacity", ramp(rd, STARS_IN[0], STARS_IN[1]).toFixed(3));

    const ctx = this.ctx;
    if (!ctx) return;
    const nothing = rd <= 0 || rd >= 1;
    if (nothing && this.blank) return;
    if (!nothing && !this.sampled) this.sample();
    ctx.clearRect(0, 0, this.W, this.H);
    this.blank = true;
    if (nothing || !this.specks.length) return;
    this.blank = false;

    const dustIn = ramp(rd, DUST_IN[0], DUST_IN[1]);
    const dustOut = 1 - ramp(rd, DUST_OUT[0], DUST_OUT[1]);
    const starsIn = ramp(rd, STARS_IN[0], STARS_IN[1]);
    // Per colour, a path per brightness band.
    const colours = [DUST, ...TILES.map((t) => t.rgb)];
    const bands: number[][][] = colours.map(() => Array.from({ length: BANDS }, () => []));
    for (const s of this.specks) {
      const t = easeInOut(ramp(rd, MOVE_FROM + s.delay, MOVE_FROM + s.delay + MOVE_SPAN));
      let a: number;
      let colour: number;
      if (s.tile < 0) {
        a = dustIn * (1 - 0.45 * t) * dustOut;
        colour = 0;
      } else {
        const tile = TILES[s.tile];
        a = dustIn * (1 + (tile.a - 1) * t) * (1 - starsIn);
        // Dust while it travels, the star's own colour once it is close.
        colour = t < 0.6 ? 0 : 1 + s.tile;
      }
      if (a <= 0.02) continue;
      const x = s.x0 + (s.x1 - s.x0) * t;
      const y = s.y0 + (s.y1 - s.y0) * t;
      const size = s.size0 + (s.size1 - s.size0) * t;
      bands[colour][Math.min(BANDS - 1, Math.floor(a * BANDS))].push(x - size / 2, y - size / 2, size);
    }
    for (let c = 0; c < colours.length; c++) {
      ctx.fillStyle = `rgb(${colours[c]})`;
      for (let b = 0; b < BANDS; b++) {
        const list = bands[c][b];
        if (!list.length) continue;
        ctx.globalAlpha = (b + 1) / BANDS;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 3) ctx.rect(list[i], list[i + 1], list[i + 2], list[i + 2]);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  write(el: HTMLElement, key: "sceneOpacity" | "starsOpacity", value: string): void {
    if (this[key] === value) return;
    this[key] = value;
    el.style.opacity = value;
  }
}
