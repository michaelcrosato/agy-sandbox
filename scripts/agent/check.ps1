# Full local validation gate. This delegates to package.json so the PowerShell
# wrapper, npm script, and CI cannot drift apart.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

npm run agent:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[check] ALL GREEN - safe to commit'
