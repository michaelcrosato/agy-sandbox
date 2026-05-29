# Type-check if the project ever adopts TypeScript; a graceful skip today.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
if (Test-Path tsconfig.json) {
  npx tsc --noEmit
  exit $LASTEXITCODE
} else {
  Write-Host '[typecheck] no tsconfig.json - project is plain JS (ESM + JSDoc); nothing to type-check (skipped)'
}
