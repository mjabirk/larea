# Enterprise View Engine Service Launcher (PowerShell)
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Enterprise View Engine - Dual Service Launcher" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js was not found in PATH. Please install Node.js." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python was not found in PATH. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}

Write-Host "[Info] Launching dual services..." -ForegroundColor Green
Write-Host "[Info] Backend:  http://localhost:8000" -ForegroundColor Yellow
Write-Host "[Info] Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host ""

node start.js
