#!/usr/bin/env bash
# Install dependencies for a fresh checkout. Idempotent; safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/../.."

command -v node >/dev/null 2>&1 || { echo "[bootstrap] node not found — install Node.js 20+"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "[bootstrap] npm not found"; exit 1; }
echo "[bootstrap] node $(node --version) / npm $(npm --version)"

if [ -f package-lock.json ]; then
  echo "[bootstrap] lockfile present -> npm ci"
  npm ci
else
  echo "[bootstrap] no lockfile -> npm install"
  npm install
fi
echo "[bootstrap] done — try: npm run agent:check"
