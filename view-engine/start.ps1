# Enterprise View Engine Service Launcher (PowerShell)
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Enterprise View Engine - Dual Service Launcher" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command python -ErrorAction SilentlyContinue)) {
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $env:Path = "$userPath;$machinePath;$PSScriptRoot\.venv\Scripts;$env:Path"
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js was not found in PATH. Please install Node.js." -ForegroundColor Red
    exit 1
}

$hasPython = (Get-Command python -ErrorAction SilentlyContinue) -or (Test-Path "$PSScriptRoot\.venv\Scripts\python.exe")
if (-not $hasPython) {
    Write-Host "[ERROR] Python was not found in PATH or .venv. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}

Write-Host "[Info] Launching dual services..." -ForegroundColor Green
Write-Host "[Info] Backend:  http://localhost:8000" -ForegroundColor Yellow
Write-Host "[Info] Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host ""

node start.js
