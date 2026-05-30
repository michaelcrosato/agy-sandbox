#!/usr/bin/env bash
# Full local validation gate. This delegates to package.json so the shell wrapper,
# npm script, and CI cannot drift apart.
set -euo pipefail
cd "$(dirname "$0")/../.."

npm run agent:check

echo "[check] ALL GREEN — safe to commit"
