# Auto-format the CI-checked file set in place (prettier --write).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
npm run format
exit $LASTEXITCODE
