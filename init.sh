#!/usr/bin/env bash
# One command: install if needed, type-check, build, print sizes. Exit non-zero on any failure.
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --no-audit --no-fund
npx astro check
npm run build
echo "--- sizes"
du -sh public/projects dist 2>/dev/null || true
if compgen -G "dist/_astro/*.js" > /dev/null; then
  echo "client js gz bytes: $(cat dist/_astro/*.js | gzip -c | wc -c)"
fi
echo "init.sh OK"
