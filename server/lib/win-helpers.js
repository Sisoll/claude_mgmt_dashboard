const cp = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

// PowerShell cold-start + two Get-CimInstance Win32_Process calls measure ~4-5s
// on this box. The previous 3000ms timeout was killing every call, so
// detection silently returned null forever and the dashboard fell back to the
// entrypoint label 'Terminal' for every IntelliJ session. 8s gives slow
// machines headroom; failed attempts are cached below to avoid blocking the
// 2s scan loop with repeated 8s waits.
const DETECT_TIMEOUT_MS = 8000;

// pid -> { result, at }. Successful detection is cached forever (host doesn't
// change for the life of a Claude pid). Failed detection is cached briefly so
// the next few scans don't pile up 8s blocking calls; eventually we retry.
const FAILED_RETRY_AFTER_MS = 60_000;
const detectCache = new Map();

function detectHostProcessSync(pid) {
  const cached = detectCache.get(pid);
  if (cached) {
    if (cached.result) return cached.result;
    if (Date.now() - cached.at < FAILED_RETRY_AFTER_MS) return null;
  }
  let result = null;
  try {
    const out = cp.execFileSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(SCRIPTS_DIR, 'detect-host.ps1'), '-ProcessId', String(pid)],
      { encoding: 'utf8', timeout: DETECT_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    ).trim();
    if (out.startsWith('FOUND|')) {
      const parts = out.split('|');
      result = {
        name: parts[1] || null,
        pid: Number(parts[2]) || null,
        hWnd: parts[3] || null,
        shell: parts[4] || null,
      };
    }
  } catch (e) {}
  detectCache.set(pid, { result, at: Date.now() });
  return result;
}

// pid -> Promise; dedupe concurrent async detections for the same pid.
const inFlight = new Map();

// B5: async, NON-BLOCKING host detection (spawn). Same cache semantics as the sync version
// (success cached forever, failure throttled by FAILED_RETRY_AFTER_MS). Returns the host
// descriptor or null. Use this on the scan hot path so detection never freezes the event loop.
function detectHostProcess(pid) {
  const cached = detectCache.get(pid);
  if (cached) {
    if (cached.result) return Promise.resolve(cached.result);
    if (Date.now() - cached.at < FAILED_RETRY_AFTER_MS) return Promise.resolve(null);
  }
  if (inFlight.has(pid)) return inFlight.get(pid);
  const p = new Promise((resolve) => {
    let stdout = '', done = false;
    const child = cp.spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(SCRIPTS_DIR, 'detect-host.ps1'), '-ProcessId', String(pid)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const finish = (out) => {
      if (done) return; done = true;
      clearTimeout(timer);
      let result = null;
      if (out && out.startsWith('FOUND|')) {
        const parts = out.split('|');
        result = { name: parts[1] || null, pid: Number(parts[2]) || null, hWnd: parts[3] || null, shell: parts[4] || null };
      }
      detectCache.set(pid, { result, at: Date.now() });
      inFlight.delete(pid);
      resolve(result);
    };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish(''); }, DETECT_TIMEOUT_MS);
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.on('close', () => finish(stdout.trim()));
    child.on('error', () => finish(''));
  });
  inFlight.set(pid, p);
  return p;
}

// Sync read of a cached *successful* detection (null if unknown/failed). Safe on the hot path.
function getCachedHost(pid) {
  const c = detectCache.get(pid);
  return c && c.result ? c.result : null;
}

// Should we (re)spawn detection now? false if cached-success, throttled-failure, or in-flight.
function shouldDetect(pid) {
  if (inFlight.has(pid)) return false;
  const c = detectCache.get(pid);
  if (!c) return true;
  if (c.result) return false;
  return Date.now() - c.at >= FAILED_RETRY_AFTER_MS;
}

function runPs(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    const child = cp.spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      ...args,
    ], { windowsHide: true });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (b) => { stdout += b.toString(); });
    child.stderr.on('data', (b) => { stderr += b.toString(); });
    child.on('close', (code) => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', (err) => {
      resolve({ code: -1, stdout: '', stderr: err.message });
    });
  });
}

async function flashWindowForPid(pid, cwdLeaf = '', hostPid = 0) {
  const args = ['-ProcessId', String(pid)];
  if (cwdLeaf) args.push('-CwdLeaf', cwdLeaf);
  if (hostPid) args.push('-HostPid', String(hostPid));
  return runPs('flash-window.ps1', args);
}

async function focusWindowForPid(pid, cwdLeaf = '', hostPid = 0) {
  const args = ['-ProcessId', String(pid)];
  if (cwdLeaf) args.push('-CwdLeaf', cwdLeaf);
  if (hostPid) args.push('-HostPid', String(hostPid));
  return runPs('focus-window.ps1', args);
}

// F4: copy the prompt to the clipboard, focus the session's window, then paste it
// (Ctrl+V). We deliberately do NOT auto-send (no Enter) — the user reviews & hits
// Enter. Clipboard + focus always happen, so even if paste is blocked the user can
// paste manually. Reuses the same window-finding as focus (incl. HostPid fast-path).
async function sendPromptToPid(pid, text, cwdLeaf = '', hostPid = 0) {
  const args = ['-ProcessId', String(pid), '-Text', String(text)];
  if (cwdLeaf) args.push('-CwdLeaf', cwdLeaf);
  if (hostPid) args.push('-HostPid', String(hostPid));
  return runPs('send-prompt.ps1', args);
}

module.exports = { flashWindowForPid, focusWindowForPid, sendPromptToPid, detectHostProcessSync, detectHostProcess, getCachedHost, shouldDetect };
