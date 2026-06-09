#!/usr/bin/env bash
# File: scripts/run-afk-loop.sh
# POSIX unattended AFK loop. Keeps orientation small, verifies the full gate,
# and preserves failed attempts for inspection instead of destructive cleanup.
set -u

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[1;30m'
NC='\033[0;0m'

AGENT_COMMAND="${AGENT_COMMAND:-agy}"
ITERATION_COUNT=1

echo -e "${GREEN}=========================================================${NC}"
echo -e "${GREEN}      STARFALL GALAXY - UNATTENDED AFK DAEMON LOOP       ${NC}"
echo -e "${GREEN}=========================================================${NC}"

if [ ! -f "plan/PROGRESS.md" ]; then
  echo -e "${RED}[ERROR] plan/PROGRESS.md not found. Cannot orient loop.${NC}"
  exit 1
fi

# Create lock file indicating loop is active
touch plan/loop_active.lock
trap 'rm -f plan/loop_active.lock' EXIT

while true; do
  clear
  echo -e "${CYAN}---------------------------------------------------------${NC}"
  echo -e "${CYAN}   CYCLE RUN TICK #${ITERATION_COUNT} - $(date +'%H:%M:%S')   ${NC}"
  echo -e "${CYAN}---------------------------------------------------------${NC}"

  echo -e "${YELLOW}[STATE] Live Queue Anchor:${NC}"
  sed -n '1,35p' plan/PROGRESS.md

  echo -e "${CYAN}[BIOS] Verifying substrate integrity...${NC}"
  npm run --silent agent:verify-substrate
  if [ $? -ne 0 ]; then
    echo -e "${RED}[HALT] Substrate integrity failed. Stopping loop.${NC}"
    exit 1
  fi

  echo -e "${CYAN}[ENGINE] Executing Agent Core Command: ${AGENT_COMMAND}${NC}"
  ${AGENT_COMMAND}
  AGENT_EXIT_CODE=$?
  echo -e "${GRAY}[ENGINE] Cycle complete. Exit Code: ${AGENT_EXIT_CODE}${NC}"

  echo -e "${CYAN}[VERIFY] Running full validation gate: npm run agent:check${NC}"
  npm run agent:check
  GATE_EXIT_CODE=$?
  if [ ${GATE_EXIT_CODE} -ne 0 ]; then
    echo -e "${RED}[FAIL] Validation gate failed. Preserving workspace for inspection.${NC}"
    echo -e "${YELLOW}[NEXT] Archive/log the failed attempt, then manually recover to the last green baseline.${NC}"
    exit ${GATE_EXIT_CODE}
  fi

  echo -e "${GREEN}[SUCCESS] Full validation gate passed.${NC}"
  echo -e "${GRAY}[REST] Machine tick resting. Pausing for 5 seconds...${NC}"
  sleep 5
  ITERATION_COUNT=$((ITERATION_COUNT + 1))
done
