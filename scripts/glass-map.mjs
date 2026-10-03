// Writes src/assets/glass-map.png: the displacement map behind the liquid
// glass on Chromium (src/components/GlassFilter.astro inlines it).
//
//   node scripts/glass-map.mjs
//
// Red moves pixels along x, green along y; 128 is no move. The middle of the
// control stays flat and only a band along each edge bends the backdrop, the
// way a thick pane does at its rim. One small map serves every control: the
// filter stretches it to the element's box.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const W = 96;
const H = 48;
const RIM = 0.32; // the bending band, as a fraction of the half-size
const px = Buffer.alloc(W * H * 3);
const bend = (t) => {
  // 0 in the flat middle, rising to 1 at the edge, smoothly.
  const a = Math.max(0, (Math.abs(t) - (1 - RIM)) / RIM);
  return Math.sign(t) * a * a * (3 - 2 * a);
};
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = ((x + 0.5) / W) * 2 - 1;
    const v = ((y + 0.5) / H) * 2 - 1;
    const i = (y * W + x) * 3;
    px[i] = Math.round(128 + 127 * bend(u));
    px[i + 1] = Math.round(128 + 127 * bend(v));
    px[i + 2] = 128;
  }
}
mkdirSync("src/assets", { recursive: true });
await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile("src/assets/glass-map.png");
console.log("wrote src/assets/glass-map.png");
