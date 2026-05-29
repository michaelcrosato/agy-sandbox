#!/usr/bin/env bash
# Read-only situational snapshot for an agent starting a loop iteration.
set -uo pipefail
cd "$(dirname "$0")/../.."

echo "== branch =="
git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(not a git repo)"
echo "== working tree =="
git status --short 2>/dev/null || true
echo "== ahead/behind upstream (left=upstream, right=local) =="
git rev-list --left-right --count '@{upstream}...HEAD' 2>/dev/null || echo "(no upstream tracking branch)"
echo "== recent commits =="
git log --oneline -5 2>/dev/null || true
echo "== next =="
echo "read AGENTS.md, then docs/GOAL.md + ROADMAP.md + top open ticket; run 'npm run agent:check' before committing"
