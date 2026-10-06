#!/usr/bin/env bash
# v7 session start: state, then the quick checks. Run from the repo root.
set -u
cd "$(dirname "$0")/../../.." || exit 1
echo "== branch"; git branch --show-current; git log --oneline -3
echo "== progress"; tail -n 5 .claude/memory/v7/claude-progress.txt 2>/dev/null
echo "== features"; node -e 'const f=require("./.claude/memory/v7/features.json");for(const x of f)console.log((x.passes?"[x] ":"[ ] ")+x.id+" "+x.title)'
echo "== preview :4400"; curl -s -o /dev/null -w '%{http_code}\n' http://100.122.188.86:4400/ || true
echo "== dist"; stat -c '%y' dist/index.html 2>/dev/null || echo "no dist"
