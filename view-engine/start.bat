@echo off
title Enterprise View Engine Service Launcher
echo ======================================================
echo   Enterprise View Engine - Dual Service Launcher
echo ======================================================
echo.

:: Refresh PATH if node or python is missing from the active session
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "PATH=%%b;%~dp0.venv\Scripts;%PATH%"
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js 20+.
    pause
    exit /b 1
)

set HAS_PYTHON=0
where python >nul 2>nul
if %ERRORLEVEL% equ 0 set HAS_PYTHON=1
if exist "%~dp0.venv\Scripts\python.exe" set HAS_PYTHON=1

if %HAS_PYTHON% equ 0 (
    echo [ERROR] Python is not found in PATH or .venv. Please install Python 3.10+.
    pause
    exit /b 1
)

echo [Info] Starting services via Node orchestrator...
echo [Info] Backend: http://localhost:8000
echo [Info] Frontend: http://localhost:5173
echo.
node start.js
