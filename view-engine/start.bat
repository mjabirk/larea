@echo off
title Enterprise View Engine Service Launcher
echo ======================================================
echo   Enterprise View Engine - Dual Service Launcher
echo ======================================================
echo.

:: Check for node and python
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js 20+.
    pause
    exit /b 1
)

where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not found in PATH. Please install Python 3.10+.
    pause
    exit /b 1
)

echo [Info] Starting services via Node orchestrator...
echo [Info] Backend: http://localhost:8000
echo [Info] Frontend: http://localhost:5173
echo.
node start.js
