# Diagnose the dev environment. Runs every check, then exits non-zero only when a
# hard blocker (no node/npm) is present. Warnings/skips do not fail.
Set-Location (Join-Path $PSScriptRoot '..\..')
$hardFail = 0

if (Get-Command node -ErrorAction SilentlyContinue) { Write-Host "[ok]   node $(node --version)" } else { Write-Host '[FAIL] node not found (need Node.js 20+)'; $hardFail = 1 }
if (Get-Command npm  -ErrorAction SilentlyContinue) { Write-Host "[ok]   npm  $(npm --version)" }  else { Write-Host '[FAIL] npm not found'; $hardFail = 1 }
if (Get-Command git  -ErrorAction SilentlyContinue) { Write-Host "[ok]   git  $((git --version).Split(' ')[2])" } else { Write-Host '[warn] git not found' }

if (Test-Path node_modules) { Write-Host '[ok]   node_modules present' } else { Write-Host '[warn] node_modules missing -> run scripts/agent/bootstrap.ps1' }
if (Test-Path .env) { Write-Host '[ok]   .env present' } else { Write-Host '[skip] no .env (optional - copy .env.example if you need GitHub/Gemini/persistence config)' }
if (Test-Path tsconfig.json) { Write-Host '[ok]   tsconfig.json present' } else { Write-Host '[skip] no tsconfig.json (project is plain JS - no type-check stage)' }

if ($hardFail -ne 0) { Write-Host '[doctor] HARD FAILURES present - fix the [FAIL] lines above'; exit 1 }
Write-Host '[doctor] environment OK'
