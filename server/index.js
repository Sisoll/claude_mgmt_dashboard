const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const os = require('os');
const { SessionRegistry, isAlive } = require('./lib/sessions');
const { JsonlTailer } = require('./lib/jsonl-tail');
const { SessionState } = require('./lib/parse-state');
const sidecar = require('./lib/sidecar');
const { flashWindowForPid, focusWindowForPid, sendPromptToPid } = require('./lib/win-helpers');
const { getQuotas, readCtxRemainForSession, ctxRemainPctFromTokens } = require('./lib/usage');

const PORT = Number(process.env.PORT || 7878);
const HOST = '127.0.0.1';
const DASHBOARD_HTML = path.resolve(__dirname, '..', 'web', 'dashboard.html');

const registry = new SessionRegistry();
const tailers = new Map();
const states = new Map();
const wsClients = new Set();
const pushTimers = new Map();
const PUSH_DEBOUNCE_MS = 120;

function attach(meta) {
  if (states.has(meta.sid)) return;
  // If this sid replaces a previous one for the same pid (post /clear), migrate
  // the user's preferences (rename, collapsed) so they survive the rotation.
  if (meta.previousSid) {
    sidecar.migrate(meta.previousSid, meta.sid);
  }
  const st = new SessionState(meta);
  states.set(meta.sid, st);

  const tailer = new JsonlTailer(meta.jsonlPath);
  tailer.on('lines', (lines) => {
    st.ingest(lines);
    schedulePush(meta.sid);
  });
  tailer.on('error', () => {});
  tailer.start();
  tailers.set(meta.sid, tailer);

  setTimeout(() => schedulePush(meta.sid), 50);
}

function detach(sid) {
  const tailer = tailers.get(sid);
  if (tailer) {
    tailer.stop();
    tailers.delete(sid);
  }
  states.delete(sid);
  if (pushTimers.has(sid)) {
    clearTimeout(pushTimers.get(sid));
    pushTimers.delete(sid);
  }
  broadcast({ type: 'remove', sid });
}

// "reset 狀態" — clear any manual override and rebuild this session fresh from its
// JSONL (a per-session forceFullRefresh), so a wedged status recomputes from scratch.
// Tears down in place (no 'remove' broadcast) to avoid the card flickering out/in.
function resetSession(sid) {
  sidecar.patch(sid, { manualStatus: null, manualStatusAt: null });
  const meta = registry.alive.get(sid);
  if (!meta) { schedulePush(sid); return; }
  const tailer = tailers.get(sid);
  if (tailer) { tailer.stop(); tailers.delete(sid); }
  states.delete(sid);
  const t = pushTimers.get(sid);
  if (t) { clearTimeout(t); pushTimers.delete(sid); }
  attach(meta); // fresh SessionState + tailer, re-reads JSONL from offset 0, then pushes
}

function snapshotFor(sid) {
  const st = states.get(sid);
  if (!st) return null;
  const snap = st.toSnapshot();
  const meta = sidecar.read(sid);
  if (meta.name) snap.name = meta.name;
  if (typeof meta.collapsed === 'boolean') snap.collapsed = meta.collapsed;
  if (typeof meta.viewedSince === 'number') snap.viewedSince = meta.viewedSince;
  if (meta.aiSummary) snap.aiSummary = meta.aiSummary;
  if (!snap.name) snap.name = deriveAutoName(snap);
  // Ctx-remain %: prefer the statusline tmp value (Claude Code's authoritative
  // context_window.remaining_percentage), fall back to a native estimate derived from
  // JSONL usage tokens when no statusline is installed. Either way the panel hides if
  // both are unavailable (frontend checks typeof === 'number').
  const ctx = readCtxRemainForSession(sid);
  if (ctx) {
    snap.ctxRemainPct = ctx.value;
  } else {
    const nativePct = ctxRemainPctFromTokens(snap.contextTokens, snap.model);
    if (nativePct != null) snap.ctxRemainPct = nativePct;
  }

  // Manual status override (reset / pending / custom / etc.) — valid only while no new JSONL activity has happened since.
  if (meta.manualStatus && meta.manualStatusAt && meta.manualStatusAt > (snap.lastActivity || 0)) {
    snap.computedStatus = snap.status;
    snap.status = meta.manualStatus;
    snap.statusOverridden = true;
    if (meta.manualStatusText) snap.manualStatusText = meta.manualStatusText;
  }
  return snap;
}

// Track last broadcast status per sid so server can fire auto-actions (taskbar flash, etc.) on transitions.
const lastBroadcastStatus = new Map();

// Sweep ~/.claude for orphaned artifacts left by dead Claude sessions:
//   - <pid>.json markers whose pid is no longer alive
//   - statusline_<sid>_{5h,7d,ctx}.tmp files for sids not in the current alive set
//   - <sid>.waiting.flag / <sid>.stop.flag for sids not currently alive
// Intentionally does NOT touch *.dashboard.json (user's rename / collapse state
// is precious and may want to be preserved for sessions that are paused / closed).
function cleanupStaleFiles() {
  const CLAUDE_DIR = path.join(os.homedir(), '.claude');
  const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
  const aliveSids = new Set();
  for (const e of registry.alive.values()) {
    if (e.sid) aliveSids.add(e.sid);
    if (e.markerSid) aliveSids.add(e.markerSid);
  }
  const deleted = [];
  const errors = [];
  const tryDel = (full, label) => {
    try { fs.unlinkSync(full); deleted.push(label); }
    catch (e) { errors.push(label + ': ' + e.message); }
  };

  // statusline_<sid>_(5h|7d|ctx).tmp in ~/.claude
  try {
    for (const f of fs.readdirSync(CLAUDE_DIR)) {
      const m = f.match(/^statusline_(.+?)_(5h|7d|ctx)(_reset)?\.tmp$/);
      if (m && !aliveSids.has(m[1])) tryDel(path.join(CLAUDE_DIR, f), f);
    }
  } catch {}

  // <pid>.json markers + flag files in ~/.claude/sessions
  try {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      // dead-pid marker
      const pm = f.match(/^(\d+)\.json$/);
      if (pm) {
        const pid = Number(pm[1]);
        if (!isAlive(pid)) tryDel(path.join(SESSIONS_DIR, f), f);
        continue;
      }
      // orphan flag files (waiting / stop)
      const ff = f.match(/^(.+?)\.(waiting|stop|permission)\.flag$/);
      if (ff && !aliveSids.has(ff[1])) {
        tryDel(path.join(SESSIONS_DIR, f), f);
      }
    }
  } catch {}

  return { ok: true, deletedCount: deleted.length, deleted, errors };
}

// Hard refresh — drop all in-memory caches (sessions, tailers, host detection,
// JSONL offsets), then re-scan from scratch. Used by the topbar refresh button.
function forceFullRefresh() {
  const before = states.size;
  for (const sid of Array.from(states.keys())) detach(sid);
  registry.alive.clear();
  registry.pidJsonl.clear();
  lastBroadcastStatus.clear();
  registry._scan();
  setTimeout(() => broadcast(fullSnapshot()), 350);
  return { ok: true, sessionsBefore: before, sessionsAfter: states.size };
}

function handleStatusTransition(sid, prev, next) {
  if (prev === undefined) return; // initial observation; skip
  if (prev === next) return;
  if (next === 'waiting') {
    const meta = registry.alive.get(sid);
    if (meta) {
      flashWindowForPid(meta.pid, leafOfCwd(meta.cwd), meta.detectedHost?.pid || 0).catch(() => {});
    }
  }
}

function leafOfCwd(cwd) {
  if (!cwd) return '';
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

function deriveAutoName(snap) {
  const src = snap.firstPrompt?.text || snap.prompt?.text;
  if (src) {
    const t = src.trim().replace(/\s+/g, ' ');
    return t.length > 60 ? t.slice(0, 60) + '…' : t;
  }
  return path.basename(snap.cwd || '') || snap.sid.slice(0, 8);
}

function schedulePush(sid) {
  if (pushTimers.has(sid)) return;
  const timer = setTimeout(() => {
    pushTimers.delete(sid);
    const snap = snapshotFor(sid);
    if (snap) {
      const prev = lastBroadcastStatus.get(sid);
      lastBroadcastStatus.set(sid, snap.status);
      handleStatusTransition(sid, prev, snap.status);
      broadcast({ type: 'update', session: snap });
    }
  }, PUSH_DEBOUNCE_MS);
  pushTimers.set(sid, timer);
}

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === 1) {
      try { ws.send(json); } catch {}
    }
  }
}

function fullSnapshot() {
  return {
    type: 'snapshot',
    sessions: Array.from(states.keys()).map(snapshotFor).filter(Boolean),
  };
}

registry.on('added', (meta) => attach(meta));
registry.on('changed', (meta) => { detach(meta.sid); attach(meta); });
registry.on('removed', (meta) => detach(meta.sid));
// Late-arriving host detection: update the running SessionState's meta in place
// so the next snapshot reflects the new hostLabel (e.g. 'IntelliJ' instead of
// the entrypoint-fallback 'Terminal'), and push immediately.
registry.on('metaUpdated', (meta) => {
  const st = states.get(meta.sid);
  if (!st) return;
  st.meta = meta;
  schedulePush(meta.sid);
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/dashboard')) {
    try {
      const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
      // no-store: the dashboard is a single hand-edited file served locally; without
      // this the browser caches it and CSS/JS edits silently don't show up on refresh.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
    } catch (err) {
      res.writeHead(500); res.end('dashboard html not found: ' + err.message);
    }
    return;
  }

  // Static assets for the modularized UI (ui/styles.css, ui/app.js, …). The dashboard
  // HTML is no longer self-contained — CSS + ES-module JS live under web/ui/. Served
  // with no-store for the same hand-edit-friendly reason as the HTML itself.
  if (req.method === 'GET' && url.pathname.startsWith('/ui/')) {
    const webDir = path.resolve(__dirname, '..', 'web');
    const filePath = path.resolve(webDir, url.pathname.replace(/^\/+/, ''));
    if (filePath !== webDir && !filePath.startsWith(webDir + path.sep)) {
      res.writeHead(403); res.end('forbidden'); return; // path-traversal guard
    }
    try {
      const body = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      const type = ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.svg' ? 'image/svg+xml'
        : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (err) {
      res.writeHead(404); res.end('asset not found: ' + err.message);
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(fullSnapshot()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/usage') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(getQuotas()));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/refresh') {
    const result = forceFullRefresh();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/cleanup') {
    const result = cleanupStaleFiles();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // F12: shut down the whole dashboard server. Respond first, then exit so the
  // response + WS close frames flush. autostart only runs at Windows login, so
  // after this the user must manually re-run start-server.cmd / .vbs.
  if (req.method === 'POST' && url.pathname === '/api/shutdown') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    setTimeout(() => process.exit(0), 150);
    return;
  }

  // F19: restart in place — release the listening port, spawn a detached copy of
  // ourselves (node + same argv), then exit. The new process becomes the server;
  // the dashboard's WS auto-reconnect picks it up. Same chicken-egg as shutdown:
  // this route only exists after the server has been (re)started once.
  if (req.method === 'POST' && url.pathname === '/api/restart') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    let done = false;
    const relaunch = () => {
      if (done) return; done = true;
      try {
        // Prefer the silent VBS launcher (hidden window, same as autostart) so the
        // respawn doesn't flash a console window; fall back to a hidden node spawn.
        const vbs = path.resolve(process.cwd(), '..', 'start-server.vbs');
        if (fs.existsSync(vbs)) {
          spawn('wscript', [vbs], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else {
          spawn(process.execPath, process.argv.slice(1), {
            detached: true, stdio: 'ignore', cwd: process.cwd(), windowsHide: true,
          }).unref();
        }
      } catch (e) {}
      process.exit(0);
    };
    try { server.close(); } catch (e) {}   // release the port; lingering WS die on exit
    setTimeout(relaunch, 300);             // brief grace so the child can re-bind 7878
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/sessions/')) {
    const parts = url.pathname.split('/');
    const sid = parts[3];
    const action = parts[4];
    let body = '';
    req.on('data', (c) => { body += c.toString(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}
      try {
        const result = await handleAction(sid, action, payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

async function handleAction(sid, action, payload) {
  const meta = registry.alive.get(sid);
  if (!meta && action !== 'rename' && action !== 'setCollapsed') {
    throw new Error('session not alive');
  }

  switch (action) {
    case 'rename':
      sidecar.patch(sid, { name: String(payload.name || '').slice(0, 200) });
      schedulePush(sid);
      return { ok: true };
    case 'setCollapsed':
      sidecar.patch(sid, { collapsed: !!payload.collapsed });
      return { ok: true };
    case 'focus':
      if (!meta) throw new Error('session not alive');
      return await focusWindowForPid(meta.pid, leafOfCwd(meta.cwd), meta.detectedHost?.pid || 0);
    case 'flash':
      if (!meta) throw new Error('session not alive');
      return await flashWindowForPid(meta.pid, leafOfCwd(meta.cwd), meta.detectedHost?.pid || 0);
    case 'sendPrompt': {
      if (!meta) throw new Error('session not alive');
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('empty prompt');
      return await sendPromptToPid(meta.pid, text, leafOfCwd(meta.cwd), meta.detectedHost?.pid || 0);
    }
    case 'terminate':
      if (!meta) throw new Error('session not alive');
      try { process.kill(meta.pid, 'SIGTERM'); return { ok: true }; }
      catch (e) { throw new Error('kill failed: ' + e.message); }
    default:
      throw new Error('unknown action: ' + action);
  }
}

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  wsClients.add(ws);
  try { ws.send(JSON.stringify(fullSnapshot())); } catch {}

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'rename' && msg.sid) {
      sidecar.patch(msg.sid, { name: String(msg.name || '').slice(0, 200) });
      schedulePush(msg.sid);
    } else if (msg.type === 'setCollapsed' && msg.sid) {
      sidecar.patch(msg.sid, { collapsed: !!msg.collapsed });
    } else if (msg.type === 'setViewedSince' && msg.sid) {
      sidecar.patch(msg.sid, { viewedSince: Number(msg.viewedSince) || 0 });
      schedulePush(msg.sid);
    } else if (msg.type === 'markStatus' && msg.sid && ['completed','waiting','failed','running','pending','custom'].includes(msg.status)) {
      const patch = { manualStatus: msg.status, manualStatusAt: Date.now() };
      if (msg.status === 'custom') patch.manualStatusText = String(msg.text || '').slice(0, 60);
      sidecar.patch(msg.sid, patch);
      schedulePush(msg.sid);
    } else if (msg.type === 'clearManualStatus' && msg.sid) {
      sidecar.patch(msg.sid, { manualStatus: null, manualStatusAt: null });
      schedulePush(msg.sid);
    } else if (msg.type === 'resetState' && msg.sid) {
      resetSession(msg.sid);
    }
  });

  ws.on('close', () => wsClients.delete(ws));
  ws.on('error', () => wsClients.delete(ws));
});

server.on('listening', () => {
  console.log(`[claude-mgmt] dashboard server listening on http://${HOST}:${PORT}`);
  registry.start();
});
// EADDRINUSE retry — covers the F19 restart handoff where the previous process
// hasn't fully released the port yet. Give up (exit) after ~5s of retries.
let listenRetries = 0;
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && listenRetries < 20) {
    listenRetries++;
    console.warn(`[claude-mgmt] port ${PORT} busy (EADDRINUSE), retry ${listenRetries}/20 in 250ms…`);
    setTimeout(() => server.listen(PORT, HOST), 250);
  } else {
    console.error('[claude-mgmt] listen failed:', err && err.message);
    process.exit(1);
  }
});
server.listen(PORT, HOST);

process.on('SIGINT', () => {
  registry.stop();
  for (const t of tailers.values()) t.stop();
  server.close(() => process.exit(0));
});
