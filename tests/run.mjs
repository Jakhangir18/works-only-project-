// Runs every suite and exits non-zero if any check failed.
//
//   npm run build && npm run preview -- --port 4347   (or serve dist/ any way)
//   SITE=http://127.0.0.1:4347 node tests/run.mjs
//
// Playwright is not a dependency of this project; point NODE_PATH at an
// install that has chromium, webkit and firefox, e.g.
//   NODE_PATH=../../Personal-Website/repo/audit/node_modules node tests/run.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SUITES = ['t-routes', 't-a11y', 't-hero', 't-work', 't-dive', 't-timeline'];

const run = (name) =>
  new Promise((resolve) => {
    let out = '';
    const p = spawn(process.execPath, [join(here, `${name}.mjs`)], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out.slice(out.indexOf('{'))); } catch {}
      resolve({ name, code, parsed });
    });
  });

let failed = 0;
let total = 0;
for (const suite of SUITES) {
  const r = await run(suite);
  const p = r.parsed;
  if (!p) {
    console.log(`${suite.padEnd(12)} could not report (exit ${r.code})`);
    failed += 1;
    continue;
  }
  total += p.total;
  failed += p.failed;
  console.log(`${p.suite.padEnd(12)} ${String(p.total - p.failed).padStart(4)} / ${p.total}`);
  for (const f of p.failures) console.log(`   FAIL ${f.name} — ${f.detail}`);
}
console.log(`\n${total - failed} / ${total} checks passed`);
process.exit(failed ? 1 : 0);
