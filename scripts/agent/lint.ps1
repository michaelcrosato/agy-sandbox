# Lint only (eslint over src + scripts).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
npm run lint
exit $LASTEXITCODE
