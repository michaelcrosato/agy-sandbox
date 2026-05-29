#!/usr/bin/env bash
# Run the Jest suite. Extra args pass through to Jest, e.g.
#   scripts/agent/test.sh src/engine/EconomyManager.test.js
#   scripts/agent/test.sh -t "normalize"
set -euo pipefail
cd "$(dirname "$0")/../.."
npm test -- "$@"
