#!/usr/bin/env bash
# Auto-format the CI-checked file set in place (prettier --write).
set -euo pipefail
cd "$(dirname "$0")/../.."
npm run format
