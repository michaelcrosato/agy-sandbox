#!/usr/bin/env bash
# Lint only (eslint over src + scripts).
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run lint
