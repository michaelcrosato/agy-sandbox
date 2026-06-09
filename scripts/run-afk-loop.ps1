# File: scripts/run-afk-loop.ps1
<#
.SYNOPSIS
    Windows unattended AFK loop.
.DESCRIPTION
    Runs autonomous ticks, prints the canonical live queue anchor, verifies the
    cross-platform substrate check, runs the full gate, and preserves failed
    attempts for inspection instead of destructively cleaning the workspace.
#>
param (
    [string]$AgentCommand = "agy"
)

$ErrorActionPreference = 'Stop'

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "      STARFALL GALAXY - UNATTENDED AFK DAEMON LOOP       " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green

if (-not (Test-Path "plan/PROGRESS.md")) {
    Write-Host "[ERROR] plan/PROGRESS.md not found. Cannot orient loop." -ForegroundColor Red
    exit 1
}

# Create lock file indicating loop is active
New-Item -Path "plan/loop_active.lock" -ItemType File -Force | Out-Null

$RunStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogDir = "night-queue/logs"
if (-not (Test-Path $LogDir)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

$IterationCount = 1

try {
    while ($true) {
        Clear-Host
        Write-Host "---------------------------------------------------------" -ForegroundColor DarkCyan
        Write-Host "   CYCLE RUN TICK #$IterationCount - $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
        Write-Host "---------------------------------------------------------" -ForegroundColor DarkCyan

        Write-Host "[STATE] Live Queue Anchor:" -ForegroundColor Yellow
        Get-Content "plan/PROGRESS.md" -TotalCount 35 | ForEach-Object { Write-Host $_ -ForegroundColor Gray }

        Write-Host "[BIOS] Verifying substrate integrity..." -ForegroundColor Blue
        npm run --silent agent:verify-substrate
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[HALT] Substrate integrity failed. Stopping loop." -ForegroundColor Red
            exit $LASTEXITCODE
        }

        $LogFile = Join-Path $LogDir "run-afk-cycle-$IterationCount-$RunStamp.log"

        Write-Host "[ENGINE] Executing Agent Core Command: $AgentCommand" -ForegroundColor Magenta
        cmd.exe /c $AgentCommand 2>&1 | Tee-Object -FilePath $LogFile
        $AgentExitCode = $LASTEXITCODE
        Write-Host "[ENGINE] Cycle complete. Exit Code: $AgentExitCode" -ForegroundColor Gray

        Write-Host "[VERIFY] Running full validation gate: npm run agent:check" -ForegroundColor Blue
        npm run agent:check 2>&1 | Tee-Object -FilePath $LogFile -Append
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[FAIL] Validation gate failed. Preserving workspace for inspection." -ForegroundColor Red
            Write-Host "[NEXT] Archive/log the failed attempt, then manually recover to the last green baseline." -ForegroundColor Yellow
            exit $LASTEXITCODE
        }

        Write-Host "[SUCCESS] Full validation gate passed." -ForegroundColor Green
        Write-Host "[REST] Machine tick resting. Pausing for 5 seconds..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 5
        $IterationCount++
    }
} finally {
    Remove-Item -Path "plan/loop_active.lock" -ErrorAction SilentlyContinue
}
