// The zyp.co hero sequence, resized for the Zyp case page.
//
//   heavy node scripts/zyp-frames.mjs [--src=<dir>] [--width=1280] [--quality=50]
//
// Reads frame_0001.webp ... frame_NNNN.webp from the zyp.co repository's
// public/frames/ (1920x1080, the frames the live hero scrubs) and writes the
// same names at --width into public/projects/zyp/frames/, plus frames.json
// ({ count, width, height }). The page reads frames.json at build time for
// the frame count, the ruler and the poster's declared size, so the files and
// the page cannot drift apart: on zyp.co a count written in two places once
// read 120 in one and 90 in the other, and the sequence silently stopped
// short. Re-running replaces every file; frames beyond the new count are
// removed. Run it through `heavy`: sharp at full tilt makes the host swap.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const src = arg("src", "/home/ubuntu/work/landing-page/repo/public/frames");
const width = Number(arg("width", 1280));
// 50: the sources are already WebP q30 at 1920, so a high setting only adds
// bytes: at 78 the 1280 frames weighed more than the 1920 originals (69 KB
// a frame against 66 KB); at 50 they weigh 47 KB, with no difference
// visible at 1:1.
const quality = Number(arg("quality", 50));

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const out = join(root, "public/projects/zyp/frames");
const NAME = /^frame_(\d{4})\.webp$/;

if (!existsSync(src)) {
  console.error(`No frames at ${src}. Pass --src=<dir> with frame_0001.webp ... in it.`);
  process.exit(2);
}

// The count is what is on disk, and it has to be a run from 1 with no gaps:
// a hole would show as a frame held twice in the scrub.
const names = readdirSync(src).filter((f) => NAME.test(f)).sort();
const count = names.length;
const gap = names.findIndex((f, i) => Number(f.match(NAME)[1]) !== i + 1);
if (!count || gap !== -1) {
  console.error(`Expected frame_0001.webp ... in ${src} with no gaps; ${count ? `the run breaks at ${names[gap]}` : "found none"}.`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (NAME.test(f) && Number(f.match(NAME)[1]) > count) rmSync(join(out, f));

let bytes = 0;
let size = null;
// Four at a time: enough to keep the cores busy, few enough to stay light.
for (let i = 0; i < count; i += 4) {
  const batch = names.slice(i, i + 4).map(async (name) => {
    const info = await sharp(join(src, name)).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(join(out, name));
    bytes += info.size;
    size ??= { width: info.width, height: info.height };
    if (info.width !== size.width || info.height !== size.height) throw new Error(`${name} is ${info.width}x${info.height}, the rest ${size.width}x${size.height}`);
  });
  await Promise.all(batch);
}

writeFileSync(join(out, "frames.json"), JSON.stringify({ count, ...size }, null, 2) + "\n");
console.log(`${count} frames, ${size.width}x${size.height}, ${Math.round(bytes / 1024)} KB (${Math.round(bytes / count / 1024)} KB each) -> ${out}`);
