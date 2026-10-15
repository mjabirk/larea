#!/usr/bin/env bash
# Enterprise View Engine Service Launcher (Bash / WSL)
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "======================================================"
echo "  Enterprise View Engine - Dual Service Launcher"
echo "======================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    exit 1
fi

# Activate virtual environment if present
if [ -f "$DIR/.venv/bin/activate" ]; then
    echo "[Info] Activating Python virtual environment (.venv)..."
    # shellcheck disable=SC1091
    source "$DIR/.venv/bin/activate"
elif [ -f "$DIR/venv/bin/activate" ]; then
    echo "[Info] Activating Python virtual environment (venv)..."
    # shellcheck disable=SC1091
    source "$DIR/venv/bin/activate"
fi

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
    echo "[ERROR] Python 3 is not installed or not in PATH."
    exit 1
fi

PYTHON_BIN="$(command -v python3 || command -v python)"
echo "[Info] Python environment: $PYTHON_BIN"
echo "[Info] Launching dual services..."
echo "[Info] Backend:  http://localhost:8000"
echo "[Info] Frontend: http://localhost:5173"
echo ""

node start.js

