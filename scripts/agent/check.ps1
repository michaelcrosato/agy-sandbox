# Full validation gate — mirrors CI (.github/workflows/ci.yml) exactly:
# prettier --check, then eslint, then the Jest suite. Run before committing;
# the substrate scripts/local-gate.ps1 only checks for a clean tree, so this is
# the script that actually catches format/lint/test regressions locally.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host '[check] 1/4 format (prettier --check)...'
npm run --silent format:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[check] 2/4 lint (eslint)...'
npm run --silent lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[check] 3/4 typecheck (tsc --noEmit)...'
npm run --silent typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[check] 4/4 test (jest)...'
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[check] ALL GREEN - safe to commit'
