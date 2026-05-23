#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Unattended overnight Claude Code coder.

.DESCRIPTION
  Loops a local JSON task queue and, for each pending task, runs Claude Code in
  headless mode (`claude -p ... --dangerously-skip-permissions`) to perform the
  full explore -> plan -> code -> test -> commit cycle on a dedicated branch.

  After each task it independently re-verifies with `npm run lint` and `npm test`
  and only keeps the work if BOTH pass AND a new commit was made. Otherwise it
  rolls the branch back to the pre-task commit and marks the task failed.

  It NEVER pushes and NEVER merges. All work stays on the working branch for you
  to review in the morning (`git log <branch>`, `git diff main..<branch>`).

  Survives closing the terminal it was launched from? No process does on its own
  on Windows if the machine sleeps -- keep the laptop awake and the window open,
  or launch it from a terminal you leave running.

.PARAMETER QueueFile
  Path to the task queue JSON. Default: night-queue/tasks.json (relative to repo root).

.PARAMETER Branch
  Git branch to work on. Default: current branch (a fresh overnight/auto-<stamp>
  branch is created if you are on main/master). Refuses to run on main/master.

.PARAMETER Model
  Claude model alias passed to `claude --model`. Default: opus.
  Tip: pass -Model sonnet to spend fewer tokens overnight.

.PARAMETER TaskTimeoutMinutes
  Hard cap per task; the claude process is killed if exceeded. Default: 25.

.PARAMETER MaxConsecutiveFailures
  Abort the whole run after this many task failures in a row. Default: 3.

.EXAMPLE
  pwsh -File scripts/claude-night.ps1
  pwsh -File scripts/claude-night.ps1 -Model sonnet -TaskTimeoutMinutes 20
#>
[CmdletBinding()]
param(
  [string]$QueueFile = "night-queue/tasks.json",
  [string]$Branch,
  [string]$Model = "opus",
  [int]$TaskTimeoutMinutes = 25,
  [int]$MaxConsecutiveFailures = 3
)

$ErrorActionPreference = "Stop"

# --- Resolve repo root (this script lives in <repo>/scripts) ---
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$QueuePath = if ([System.IO.Path]::IsPathRooted($QueueFile)) { $QueueFile } else { Join-Path $RepoRoot $QueueFile }
if (-not (Test-Path $QueuePath)) { throw "Queue file not found: $QueuePath (copy night-queue/tasks.example.json to get started)." }

$LogDir = Join-Path (Split-Path $QueuePath -Parent) "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$RunStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$RunLog = Join-Path $LogDir "run-$RunStamp.log"

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $RunLog -Value $line
}

# --- Locate the claude CLI ---
$ClaudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if (-not $ClaudeCmd) { throw "The 'claude' CLI was not found on PATH. Open a terminal where 'claude --version' works, then re-run." }
$ClaudePath = $ClaudeCmd.Source

# --- Git helpers ---
function Get-Head { (& git rev-parse HEAD).Trim() }
function Test-Dirty { return [bool]((& git status --porcelain | Out-String).Trim()) }

# --- Ensure a safe working branch (never main/master) ---
$current = (& git rev-parse --abbrev-ref HEAD).Trim()
if (-not $Branch) {
  if ($current -in @("main", "master")) { $Branch = "overnight/auto-$RunStamp" }
  else { $Branch = $current }
}
if ($Branch -in @("main", "master")) { throw "Refusing to run on '$Branch'. Pass -Branch <name> or check out a feature branch first." }
if ($current -ne $Branch) {
  if (& git branch --list $Branch) { & git checkout $Branch | Out-Null }
  else { & git checkout -b $Branch | Out-Null }
}
Write-Log "Working branch: $Branch  |  model: $Model  |  per-task timeout: ${TaskTimeoutMinutes}m"

# Require a clean tree so rollbacks are safe (night-queue/ is gitignored).
if (Test-Dirty) { throw "Working tree is dirty. Commit or stash your changes before running the overnight coder." }

# --- Load AGENT_RULES.md to feed the agent its operating contract ---
$RulesPath = Join-Path $RepoRoot ".github/AGENT_RULES.md"
$AgentRules = if (Test-Path $RulesPath) { Get-Content $RulesPath -Raw } else { "(no AGENT_RULES.md found)" }

# --- Queue load/save ---
function Read-Queue { Get-Content $QueuePath -Raw | ConvertFrom-Json }
function Write-Queue { param($Q) ($Q | ConvertTo-Json -Depth 20) | Set-Content -Path $QueuePath -Encoding UTF8 }

# Recover any task left 'in_progress' by a previously interrupted run.
$queue = Read-Queue
foreach ($t in $queue.tasks) { if ($t.status -eq "in_progress") { $t.status = "pending" } }
Write-Queue $queue

$consecFail = 0

while ($true) {
  if ($consecFail -ge $MaxConsecutiveFailures) {
    Write-Log "Hit $MaxConsecutiveFailures consecutive failures. Stopping for safety so we don't burn the night on a broken state."
    break
  }

  $queue = Read-Queue
  $task = $queue.tasks | Where-Object { $_.status -eq "pending" } | Select-Object -First 1
  if (-not $task) { Write-Log "No pending tasks remain."; break }

  $task.status = "in_progress"
  Write-Queue $queue
  Write-Log "=== Task '$($task.id)': $($task.title) ==="

  $preHead = Get-Head

  # Build the headless prompt: the operating rules + a git-workflow override + the task.
  $prompt = @"
You are running UNATTENDED in headless mode as an autonomous coder on git branch '$Branch' of the agy-sandbox repo. No human is available to answer questions, so make reasonable decisions and keep going.

Operating rules (from .github/AGENT_RULES.md):
$AgentRules

GIT WORKFLOW OVERRIDE -- these take precedence over the Git section of the rules above:
- Work ONLY on the current branch ('$Branch'). Do NOT create or switch branches.
- Commit ONLY when both ``npm run lint`` and ``npm test`` pass. End every commit message with this exact trailer line:
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- DO NOT push. DO NOT open pull requests. DO NOT merge. Everything stays local for human review in the morning.
- If you cannot get tests green or the task is unsafe/ambiguous, make NO commit, explain why, and stop.

YOUR SINGLE TASK FOR THIS RUN:
Title: $($task.title)
Details: $($task.prompt)

Approach: explore the relevant files, plan briefly, implement, write or adjust Jest tests to match the conventions already in src/engine/*.test.js, run ``npm test`` and ``npm run lint`` until green, then commit. Do exactly this one task, then stop.
"@

  $promptFile = Join-Path $LogDir "task-$($task.id)-$RunStamp.prompt.txt"
  $taskLog = Join-Path $LogDir "task-$($task.id)-$RunStamp.log"
  $taskErr = Join-Path $LogDir "task-$($task.id)-$RunStamp.err.log"
  Set-Content -Path $promptFile -Value $prompt -Encoding UTF8

  Write-Log "Launching claude. Output -> $taskLog"

  # Headless: prompt is fed on stdin; --dangerously-skip-permissions is required
  # for unattended runs (no one to approve tool calls).
  $proc = Start-Process -FilePath $ClaudePath `
    -ArgumentList @("-p", "--model", $Model, "--dangerously-skip-permissions") `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardInput $promptFile `
    -RedirectStandardOutput $taskLog `
    -RedirectStandardError $taskErr `
    -NoNewWindow -PassThru

  $timedOut = $false
  if (-not $proc.WaitForExit($TaskTimeoutMinutes * 60 * 1000)) {
    $timedOut = $true
    try { $proc.Kill($true) } catch { }
    Write-Log "Task '$($task.id)' TIMED OUT after ${TaskTimeoutMinutes}m; process killed."
  }

  # --- Independent verification gate ---
  Write-Log "Verifying: npm run lint && npm test"
  & npm run lint *>> $taskLog
  $lintOk = ($LASTEXITCODE -eq 0)
  & npm test *>> $taskLog
  $testOk = ($LASTEXITCODE -eq 0)

  $postHead = Get-Head
  $committed = ($postHead -ne $preHead)
  $dirty = Test-Dirty

  # Re-read queue (script may have been edited) and find this task by id.
  $queue = Read-Queue
  $task = $queue.tasks | Where-Object { $_.id -eq $task.id } | Select-Object -First 1

  if ($lintOk -and $testOk -and $committed) {
    # Keep the commit; tidy any trailing uncommitted noise the agent left behind.
    if ($dirty) {
      & git reset --hard HEAD *>> $taskLog
      & git clean -fd *>> $taskLog
    }
    $task.status = "done"
    $task | Add-Member -NotePropertyName commit -NotePropertyValue $postHead -Force
    $consecFail = 0
    Write-Log "Task '$($task.id)' SUCCESS -> $postHead"
  }
  else {
    # Discard everything since preHead so the next task starts from a clean, green base.
    & git reset --hard $preHead *>> $taskLog
    & git clean -fd *>> $taskLog
    $task.status = "failed"
    $task | Add-Member -NotePropertyName failReason -NotePropertyValue "lint=$lintOk test=$testOk committed=$committed dirty=$dirty timedOut=$timedOut" -Force
    $consecFail++
    Write-Log "Task '$($task.id)' FAILED (lint=$lintOk test=$testOk committed=$committed dirty=$dirty timedOut=$timedOut). Rolled back to $preHead."
  }
  Write-Queue $queue
}

# --- Summary ---
Write-Log "Overnight run complete."
$queue = Read-Queue
foreach ($t in $queue.tasks) { Write-Log ("  [{0,-9}] {1} - {2}" -f $t.status, $t.id, $t.title) }
Write-Log "Review the night's work:  git log $Branch   |   git diff main..$Branch"
