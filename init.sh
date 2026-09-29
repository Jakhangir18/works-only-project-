#!/usr/bin/env bash
# init.sh -- one command at the start of every session: install, build, run the suite, print status.
# Heavy steps go through `heavy` (one build or browser at a time on this host).
set -uo pipefail
cd "$(dirname "$0")"
echo "branch: $(git branch --show-current)  head: $(git log --oneline -1)  main: $(git rev-parse --short main)"
[ -d node_modules ] || heavy npm ci
heavy npm run build > /tmp/works-only-build.log 2>&1 || { echo "BUILD FAILED"; tail -20 /tmp/works-only-build.log; exit 1; }
grep -E "page\(s\) built" /tmp/works-only-build.log
PORT=${PORT:-4399}
PLAYWRIGHT_HOME=${PLAYWRIGHT_HOME:-/home/ubuntu/work/landing-page/repo/node_modules} \
  heavy bash /home/ubuntu/work/works-only/docs/night-2026-09-30/with-preview.sh "$PORT" npm test 2>&1 | tail -13
echo "pending features:"; python3 -c "import json;[print(' ',f['id'],f['title']) for f in json.load(open('features.json')) if not f.get('passes')]"
tail -5 claude-progress.txt
