// Runs every suite and exits non-zero if any check failed.
//
//   npm run build && npm run preview -- --port 4347   (or serve dist/ any way)
//   SITE=http://127.0.0.1:4347 node tests/run.mjs
//
// Playwright is deliberately not a dependency of this site. Point
// PLAYWRIGHT_HOME at a node_modules that carries chromium, webkit and
// firefox; the runner links it in so ESM can resolve the bare specifier
// (NODE_PATH does not apply to ESM imports).
//
//   PLAYWRIGHT_HOME=~/work/Personal-Website/repo/audit/node_modules npm test
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, symlinkSync, lstatSync, unlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PW = join(homedir(), 'work/Personal-Website/repo/audit/node_modules');
const pwHome = process.env.PLAYWRIGHT_HOME || DEFAULT_PW;
const link = join(here, 'node_modules');

if (!existsSync(join(pwHome, 'playwright'))) {
  console.error(`No playwright at ${pwHome}. Set PLAYWRIGHT_HOME to a node_modules that has chromium, webkit and firefox.`);
  process.exit(2);
}
try {
  if (existsSync(link) && realpathSync(link) !== realpathSync(pwHome)) unlinkSync(link);
} catch {
  try { unlinkSync(link); } catch {}
}
if (!existsSync(link)) symlinkSync(pwHome, link, 'dir');
if (!lstatSync(link).isSymbolicLink() && !existsSync(join(link, 'playwright'))) {
  console.error(`${link} exists and is not a usable playwright link.`);
  process.exit(2);
}
const SUITES = ['t-routes', 't-a11y', 't-hero', 't-work', 't-dive', 't-timeline', 't-rocket', 't-journey'];

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
