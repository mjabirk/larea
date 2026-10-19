/* global process */
/**
 * Enterprise Service Startup Orchestrator (start.js)
 * Concurrently launches FastAPI Backend (port 8000) and Vite React Frontend (port 5173).
 * Gracefully terminates both processes on SIGINT/SIGTERM.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n======================================================');
console.log('  Enterprise View Engine • Multi-Tenant Core Platform');
console.log('======================================================\n');
console.log('[Startup] Initiating dual service launcher...');

const isWindows = process.platform === 'win32';
let pythonCmd = isWindows ? 'python' : 'python3';

const venvLinuxAlt = path.join(__dirname, '.venv_linux', 'bin', 'python');
const venvLinux = path.join(__dirname, '.venv', 'bin', 'python');
const venvWin = path.join(__dirname, '.venv', 'Scripts', 'python.exe');
if (!isWindows) {
  if (fs.existsSync(venvLinuxAlt)) {
    pythonCmd = venvLinuxAlt;
  } else if (fs.existsSync(venvLinux)) {
    pythonCmd = venvLinux;
  }
} else if (isWindows && fs.existsSync(venvWin)) {
  pythonCmd = venvWin;
}

const npmCmd = isWindows ? 'npm.cmd' : 'npm';

// 1. Launch FastAPI Backend
console.log('[Backend] Starting FastAPI server on http://localhost:8000 ...');
const backendProcess = spawn(
  pythonCmd,
  ['-m', 'uvicorn', 'backend.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
  {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true,
  }
);

backendProcess.on('error', (err) => {
  console.error('[Backend ERROR]', err.message);
});

backendProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`[Backend] Exited with code ${code}`);
  }
});

// 2. Launch Vite Frontend
console.log('[Frontend] Starting Vite dev server on http://localhost:5173 ...');
const frontendProcess = spawn(npmCmd, ['run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

frontendProcess.on('error', (err) => {
  console.error('[Frontend ERROR]', err.message);
});

frontendProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.warn(`[Frontend] Exited with code ${code}`);
  }
});

// Graceful termination handler
function cleanup() {
  console.log('\n[Shutdown] Stopping services cleanly...');
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
