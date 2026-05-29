#!/usr/bin/env bash
# Full validation gate — mirrors CI (.github/workflows/ci.yml) exactly:
# prettier --check, then eslint, then the Jest suite. Run this before committing;
# the substrate scripts/local-gate.ps1 only checks for a clean tree, so this is
# the script that actually catches format/lint/test regressions locally.
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "[check] 1/3 format (prettier --check)..."
npm run --silent format:check

echo "[check] 2/3 lint (eslint)..."
npm run --silent lint

echo "[check] 3/3 test (jest)..."
npm test

echo "[check] ALL GREEN — safe to commit"
