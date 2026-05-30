# File: scripts/agent/cleanup-orphans.ps1
param (
    [int[]]$Ports = @(18082, 18083, 18089, 18195)
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "           AUTOMATED PROCESS AND PORT REAPER             " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pid = $conn.OwningProcess
            if ($pid -and $pid -ne $PID) {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "[REAPER] Found orphan process '$($proc.ProcessName)' (PID: $pid) locking port $port! Terminating..." -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

Write-Host "[REAPER] Teardown lifecycle check complete. Environment is clean." -ForegroundColor Green
