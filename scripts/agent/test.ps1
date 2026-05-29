# Run the Jest suite. Extra args pass through to Jest, e.g.
#   scripts/agent/test.ps1 src/engine/EconomyManager.test.js
#   scripts/agent/test.ps1 -t "normalize"
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
npm test -- @args
exit $LASTEXITCODE
