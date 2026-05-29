# Install dependencies for a fresh checkout. Idempotent; safe to re-run.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host '[bootstrap] node not found - install Node.js 20+'; exit 1 }
if (-not (Get-Command npm  -ErrorAction SilentlyContinue)) { Write-Host '[bootstrap] npm not found'; exit 1 }
Write-Host "[bootstrap] node $(node --version) / npm $(npm --version)"

if (Test-Path package-lock.json) {
  Write-Host '[bootstrap] lockfile present -> npm ci'
  npm ci
} else {
  Write-Host '[bootstrap] no lockfile -> npm install'
  npm install
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[bootstrap] done - try: npm run agent:check'
