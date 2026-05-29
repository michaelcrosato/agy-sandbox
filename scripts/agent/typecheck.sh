#!/usr/bin/env bash
# Type-check if the project ever adopts TypeScript; a graceful skip today.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -f tsconfig.json ]; then
  npx tsc --noEmit
else
  echo "[typecheck] no tsconfig.json — project is plain JS (ESM + JSDoc); nothing to type-check (skipped)"
fi
