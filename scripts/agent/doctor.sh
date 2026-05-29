#!/usr/bin/env bash
# Diagnose the dev environment. Runs every check, then exits non-zero only when a
# hard blocker (no node/npm) is present. Warnings/skips do not fail.
set -uo pipefail
cd "$(dirname "$0")/../.."
hard_fail=0

if command -v node >/dev/null 2>&1; then echo "[ok]   node $(node --version)"; else echo "[FAIL] node not found (need Node.js 20+)"; hard_fail=1; fi
if command -v npm  >/dev/null 2>&1; then echo "[ok]   npm  $(npm --version)";  else echo "[FAIL] npm not found"; hard_fail=1; fi
if command -v git  >/dev/null 2>&1; then echo "[ok]   git  $(git --version | awk '{print $3}')"; else echo "[warn] git not found"; fi

if [ -d node_modules ]; then echo "[ok]   node_modules present"; else echo "[warn] node_modules missing -> run scripts/agent/bootstrap.sh"; fi
if [ -f .env ]; then echo "[ok]   .env present"; else echo "[skip] no .env (optional — copy .env.example if you need GitHub/Gemini/persistence config)"; fi
if [ -f tsconfig.json ]; then echo "[ok]   tsconfig.json present"; else echo "[skip] no tsconfig.json (project is plain JS — no type-check stage)"; fi

if [ "$hard_fail" -ne 0 ]; then echo "[doctor] HARD FAILURES present — fix the [FAIL] lines above"; exit 1; fi
echo "[doctor] environment OK"
