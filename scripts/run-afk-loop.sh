#!/bin/bash
# File: scripts/run-afk-loop.sh
# The Ultimate Headless AFK Loops Daemonic Substrate (POSIX).

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[1;30m'
NC='\033[0;0m'

echo -e "${GREEN}=========================================================${NC}"
echo -e "${GREEN}      STARFALL GALAXY - UNATTENDED AFK DAEMON LOOP       ${NC}"
echo -e "${GREEN}=========================================================${NC}"
echo -e "${CYAN}[INIT] Awaking loop grid...${NC}"

if [ ! -f "plan/STATE.md" ]; then
    echo -e "${RED}[ERROR] plan/STATE.md not found! Cannot orient loop.${NC}"
    exit 1
fi

IterationCount=1

while true; do
    # Clear the console screen to keep terminal presentation completely clean and token-efficient (spec /clear)
    clear
    echo -e "${CYAN}---------------------------------------------------------${NC}"
    echo -e "${CYAN}   CYCLE RUN TICK #$IterationCount - $(date +'%H:%M:%S')   ${NC}"
    echo -e "${CYAN}---------------------------------------------------------${NC}"

    # 1. Read current dynamic state anchor
    echo -e "${YELLOW}[STATE] Current Active Task Anchor:${NC}"
    cat plan/STATE.md
    
    # 2. Run BIOS gate integrity check if available
    if [ -f "scripts/assert-gate-integrity.ps1" ]; then
        echo -e "${CYAN}[BIOS] Substrate integrity check bypassed on POSIX shell.${NC}"
    fi

    # 3. Fire up the Agent Engine
    echo -e "${CYAN}[ENGINE] Executing Agent Core Command: antigravity run${NC}"
    # Change command if running another agent runner locally
    antigravity run
    AgentExitCode=$?
    echo -e "${GRAY}[ENGINE] Cycle complete. Exit Code: $AgentExitCode${NC}"

    # 4. Force global verification check
    if [ -f "scripts/local-gate.ps1" ]; then
        echo -e "${CYAN}[VERIFY] Running validation check gate (npm run agent:check)...${NC}"
        npm run agent:check
        if [ $? -ne 0 ]; then
            echo -e "${RED}[FAIL] Validation gate failed! Forcing Git rollback to last stable green commit...${NC}"
            git reset --hard HEAD
            git clean -fd
        else
            echo -e "${GREEN}[SUCCESS] Validation check passed cleanly!${NC}"
        fi
    fi

    # 5. Prevent CPU thrashing
    echo -e "${GRAY}[REST] Machine tick resting. Pausing for 5 seconds...${NC}"
    sleep 5
    IterationCount=$((IterationCount+1))
done
