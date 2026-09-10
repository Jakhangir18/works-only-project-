// Media pipeline: converts the selected images from the owner's converted
// library (../in/my_work_experience/_web/<slug>/) into public/projects/<slug>/.
//   cover.webp  1600 wide    thumb.webp 480x300 (16:10, cover crop)
//   gallery/NN.webp 1200 wide
// Prints one JSON line per output (paste width/height into the content entry).
// Refuses to finish if public/projects would exceed 15 MB.
//
// Usage: node scripts/media.mjs [slug ...]   (default: every slug in SELECTION)

import sharp from "sharp";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const IN = resolve("../in/my_work_experience/_web");
const OUT = resolve("public/projects");
const QUALITY = 82;
const BUDGET = 15 * 1024 * 1024;

// Selection per docs/plans/2026-09-09-minimal-redesign.md (Task 9).
// `crop` = sharp.extract region applied before resizing, as fractions of the source.
const SELECTION = {
  touchpoint: {
    cover: { file: "touchpoint-13.webp" },
    gallery: ["touchpoint-21.webp", "touchpoint-23.webp", "touchpoint-02.webp", "touchpoint-11.webp", "touchpoint-20.webp", "touchpoint-09.webp"],
  },
  spoot: {
    cover: { file: "spoot-03.webp", crop: { left: 0, top: 0, width: 0.72, height: 1 } },
    gallery: ["spoot-02.webp", "spoot-01.webp"],
  },
  "remote-lab-vision": {
    cover: { file: "remote-lab-vision-11.webp" },
    gallery: ["remote-lab-vision-03.webp", "remote-lab-vision-02.webp", "remote-lab-vision-12-poster.webp", "remote-lab-vision-07.webp", "remote-lab-vision-13.webp"],
  },
  // AMS sources were already in the repo as JPGs (public/projects/ams/images), converted in place.
  "ams-tablet": {
    src: resolve("../in/ams-jpg"),
    cover: { file: "hero-tablet.jpg" },
    gallery: ["cover.jpg", "dashboard-mobile.jpg", "deploy-manufacturing.jpg", "deploy-construction.jpg", "deploy-industrial.jpg", "deploy-akimat.jpg", "deploy-police.jpg", "certification.jpg", "patent.jpg"],
  },
};

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

// Rotate (EXIF) into a buffer first so crop fractions apply to the oriented image.
async function base(src, crop) {
  const oriented = await sharp(src).rotate().toBuffer();
  let img = sharp(oriented);
  if (crop) {
    const m = await img.metadata();
    img = img.extract({
      left: Math.round(m.width * crop.left),
      top: Math.round(m.height * crop.top),
      width: Math.round(m.width * crop.width),
      height: Math.round(m.height * crop.height),
    });
  }
  return img;
}

async function write(img, out, opts) {
  const info = await img.resize(opts).webp({ quality: QUALITY }).toFile(out);
  console.log(JSON.stringify({ file: out.replace(OUT, "/projects"), width: info.width, height: info.height, kb: Math.round(info.size / 1024) }));
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SELECTION);
for (const slug of slugs) {
  const sel = SELECTION[slug];
  if (!sel) throw new Error(`no selection for ${slug}`);
  const src = sel.src ?? join(IN, slug);
  const dst = join(OUT, slug);
  await mkdir(join(dst, "gallery"), { recursive: true });

  const coverSrc = join(src, sel.cover.file);
  await write(await base(coverSrc, sel.cover.crop), join(dst, "cover.webp"), { width: 1600, withoutEnlargement: true });
  await write(await base(coverSrc, sel.cover.crop), join(dst, "thumb.webp"), { width: 480, height: 300, fit: "cover", position: "attention" });

  let n = 0;
  for (const file of sel.gallery) {
    n += 1;
    await write(await base(join(src, file)), join(dst, "gallery", `${String(n).padStart(2, "0")}.webp`), { width: 1200, withoutEnlargement: true });
  }
}

const total = await dirSize(OUT);
console.log(JSON.stringify({ totalMB: +(total / 1024 / 1024).toFixed(2), budgetMB: 15 }));
if (total > BUDGET) {
  console.error(`public/projects is ${(total / 1024 / 1024).toFixed(1)} MB, over the 15 MB budget`);
  process.exit(1);
}
