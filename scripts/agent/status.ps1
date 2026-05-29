# Read-only situational snapshot for an agent starting a loop iteration.
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host '== branch =='
git rev-parse --abbrev-ref HEAD
Write-Host '== working tree =='
git status --short
Write-Host '== ahead/behind upstream (left=upstream, right=local) =='
git rev-list --left-right --count '@{upstream}...HEAD' 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host '(no upstream tracking branch)' }
Write-Host '== recent commits =='
git log --oneline -5
Write-Host '== next =='
Write-Host "read AGENTS.md, then docs/GOAL.md + ROADMAP.md + top open ticket; run 'npm run agent:check' before committing"
