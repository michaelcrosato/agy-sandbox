# File: scripts/run-afk-loop.ps1
<#
.SYNOPSIS
    The Ultimate Headless AFK Loops Daemonic Substrate.
.DESCRIPTION
    Runs indefinitely on Windows, executing local validation gates, running
    autonomous agent ticks, and keeping the filesystem-based state clean and compact.
#>
param (
    [string]$AgentCommand = "antigravity run"
)

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "      STARFALL GALAXY — UNATTENDED AFK DAEMON LOOP       " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "[INIT] Awaking loop grid..." -ForegroundColor Cyan

if (-Not (Test-Path "plan/STATE.md")) {
    Write-Host "[ERROR] plan/STATE.md not found! Cannot orient loop." -ForegroundColor Red
    exit 1
}

$IterationCount = 1

while ($true) {
    # Clear the host console to keep terminal presentation completely clean and token-efficient (spec /clear)
    Clear-Host
    Write-Host "---------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host "   CYCLE RUN TICK #$IterationCount — $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "---------------------------------------------------------" -ForegroundColor DarkCyan

    # 1. Read current dynamic state anchor
    $State = Get-Content "plan/STATE.md" -Raw
    Write-Host "[STATE] Current Active Task Anchor:" -ForegroundColor Yellow
    Write-Host $State -ForegroundColor Gray

    # 2. Run BIOS gate integrity check
    if (Test-Path "scripts/assert-gate-integrity.ps1") {
        Write-Host "[BIOS] Asserting substrate integrity..." -ForegroundColor Blue
        powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/assert-gate-integrity.ps1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[HALT] Substrate integrity check failed! Stopping loop." -ForegroundColor Red
            break
        }
    }

    # 3. Fire up the Agent Engine
    Write-Host "[ENGINE] Executing Agent Core Command: $AgentCommand" -ForegroundColor Magenta
    cmd.exe /c $AgentCommand
    $AgentExitCode = $LASTEXITCODE
    Write-Host "[ENGINE] Cycle complete. Exit Code: $AgentExitCode" -ForegroundColor Gray

    # 4. Force global verification check
    if (Test-Path "scripts/local-gate.ps1") {
        Write-Host "[VERIFY] Running validation check gate..." -ForegroundColor Blue
        powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/local-gate.ps1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[FAIL] Validation gate failed! Forcing Git rollback to last stable green commit..." -ForegroundColor Red
            git reset --hard HEAD
            git clean -fd
        } else {
            Write-Host "[SUCCESS] Validation check passed cleanly!" -ForegroundColor Green
        }
    }

    # 5. Prevent CPU thrashing, rest briefly between cycles
    Write-Host "[REST] Machine tick resting. Pausing for 5 seconds..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
    $IterationCount++
}
