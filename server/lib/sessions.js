const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');
const { detectHostProcessSync } = require('./win-helpers');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const SCAN_INTERVAL_MS = 2000;

function encodeCwd(cwd) {
  return cwd.replace(/[\\:/_.]/g, '-');
}

function isAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// Read just the first JSONL entry's timestamp (a few KB at most) to determine
// when this conversation log started. Used to filter JSONLs that don't belong
// to the current Claude process lifetime.
function readFirstEventTs(jsonlPath) {
  try {
    const fd = fs.openSync(jsonlPath, 'r');
    const buf = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const content = buf.slice(0, bytes).toString('utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        const ts = o.timestamp || o.snapshot?.timestamp;
        if (ts) return Date.parse(ts);
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}

// Find the *currently active* JSONL for an alive Claude process. Claude Code's
// `/clear` rotates to a new sessionId/JSONL but does NOT update the pid marker
// file — so the marker's sessionId can be stale. We scan the project dir for
// JSONLs whose first event happened during this Claude process's lifetime
// (>= claudeStartedAt with a 60s slack) and pick the one with newest mtime.
function findCurrentJsonl(cwd, claudeStartedAt) {
  const projectDir = path.join(PROJECTS_DIR, encodeCwd(cwd));
  let files;
  try {
    files = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }
  const slack = 60_000;
  const eligible = [];
  for (const f of files) {
    const full = path.join(projectDir, f);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    const firstTs = readFirstEventTs(full);
    if (firstTs == null) continue;
    if (firstTs >= claudeStartedAt - slack) {
      eligible.push({ file: full, mtime: stat.mtimeMs, sid: f.replace(/\.jsonl$/, ''), firstTs });
    }
  }
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.mtime - a.mtime);
  return eligible[0];
}

function readMarker(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const obj = JSON.parse(raw);
    if (!obj.sessionId || !obj.pid || !obj.cwd) return null;
    return {
      sid: obj.sessionId,
      pid: obj.pid,
      cwd: obj.cwd,
      startedAt: obj.startedAt || Date.now(),
      kind: obj.kind || 'interactive',
      entrypoint: obj.entrypoint || null,
      version: obj.version,
      markerFile: file,
    };
  } catch {
    return null;
  }
}

function resolveJsonlPath(cwd, sid) {
  const dir = path.join(PROJECTS_DIR, encodeCwd(cwd));
  return path.join(dir, `${sid}.jsonl`);
}

class SessionRegistry extends EventEmitter {
  constructor() {
    super();
    this.alive = new Map();
    // pid → { jsonl, lastMtime, lastSize, firstTs } — tracks each Claude pid's
    // currently active JSONL across scans. Enables /clear migration even when
    // multiple Claudes share the same cwd: when a new JSONL appears, attribute
    // it to the pid whose tracked JSONL went silent closest to the new
    // JSONL's first event timestamp.
    this.pidJsonl = new Map();
    this._timer = null;
  }

  start() {
    this._scan();
    this._timer = setInterval(() => this._scan(), SCAN_INTERVAL_MS);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  list() {
    return Array.from(this.alive.values());
  }

  _scan() {
    let files;
    try {
      files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.dashboard.json'));
    } catch {
      return;
    }

    // Gather alive markers, group by cwd (just for the sharedCwd flag — not for
    // changing logic; stateful tracking handles multi-pid-same-cwd correctly)
    const aliveMarkers = [];
    const cwdCounts = new Map();
    for (const f of files) {
      const marker = readMarker(path.join(SESSIONS_DIR, f));
      if (!marker || !isAlive(marker.pid)) continue;
      aliveMarkers.push(marker);
      cwdCounts.set(marker.cwd, (cwdCounts.get(marker.cwd) || 0) + 1);
    }

    // Drop pidJsonl entries for pids that died
    const aliveSet = new Set(aliveMarkers.map((m) => m.pid));
    for (const pid of Array.from(this.pidJsonl.keys())) {
      if (!aliveSet.has(pid)) this.pidJsonl.delete(pid);
    }

    // Assign each pid an initial JSONL if not yet tracked
    for (const marker of aliveMarkers) {
      if (this.pidJsonl.has(marker.pid)) continue;
      const starting = resolveJsonlPath(marker.cwd, marker.sid);
      let assigned;
      if (fs.existsSync(starting)) {
        const stat = fs.statSync(starting);
        assigned = {
          jsonl: starting,
          lastMtime: stat.mtimeMs,
          lastSize: stat.size,
          firstTs: readFirstEventTs(starting) || marker.startedAt,
        };
      } else {
        // marker's JSONL missing — pick the newest eligible JSONL as a fallback
        const fallback = findCurrentJsonl(marker.cwd, marker.startedAt);
        if (!fallback) continue;
        const stat = fs.statSync(fallback.file);
        assigned = {
          jsonl: fallback.file,
          lastMtime: stat.mtimeMs,
          lastSize: stat.size,
          firstTs: fallback.firstTs,
        };
      }
      this.pidJsonl.set(marker.pid, assigned);
    }

    // For each cwd, detect /clear migrations:
    //   - Find JSONLs in cwd not currently claimed by any alive pid
    //   - Sort by firstTs ASC (chronological) so chained /clears resolve in order
    //   - For each candidate JSONL, attribute it to the pid whose tracked JSONL
    //     went silent at a time closest to (and just before) the candidate's firstTs
    const cwdsToCheck = new Set(aliveMarkers.map((m) => m.cwd));
    for (const cwd of cwdsToCheck) {
      const projectDir = path.join(PROJECTS_DIR, encodeCwd(cwd));
      let dirFiles;
      try {
        dirFiles = fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'));
      } catch { continue; }

      const pidsHere = aliveMarkers.filter((m) => m.cwd === cwd);
      const earliestStartedAt = Math.min(...pidsHere.map((m) => m.startedAt));

      // Set of JSONLs currently claimed
      const claimed = new Set();
      for (const m of pidsHere) {
        const info = this.pidJsonl.get(m.pid);
        if (info) claimed.add(info.jsonl);
      }

      // Build candidate list: unclaimed JSONLs eligible for this cwd
      const candidates = [];
      for (const f of dirFiles) {
        const full = path.join(projectDir, f);
        if (claimed.has(full)) continue;
        let stat;
        try { stat = fs.statSync(full); } catch { continue; }
        const firstTs = readFirstEventTs(full);
        if (firstTs == null) continue;
        if (firstTs < earliestStartedAt - 60_000) continue;
        candidates.push({ file: full, mtime: stat.mtimeMs, firstTs });
      }
      candidates.sort((a, b) => a.firstTs - b.firstTs);

      // Greedy assignment: for each candidate, find best pid (smallest non-negative
      // gap between candidate.firstTs and pid's lastMtime).
      for (const cand of candidates) {
        let bestPid = null;
        let bestGap = Infinity;
        for (const m of pidsHere) {
          if (m.startedAt > cand.firstTs + 60_000) continue; // pid started after this JSONL — impossible
          const info = this.pidJsonl.get(m.pid);
          if (!info) continue;
          const gap = cand.firstTs - info.lastMtime;
          // Want gap to be small (close to zero) and non-negative (clear after activity stops).
          // Allow small negative for clock skew.
          if (gap >= -3000 && gap < bestGap) {
            bestGap = gap;
            bestPid = m.pid;
          }
        }
        if (bestPid !== null) {
          const stat = fs.statSync(cand.file);
          this.pidJsonl.set(bestPid, {
            jsonl: cand.file,
            lastMtime: stat.mtimeMs,
            lastSize: stat.size,
            firstTs: cand.firstTs,
          });
          claimed.add(cand.file);
        }
      }
    }

    // Refresh lastMtime/lastSize for all tracked pids (so next scan's mtime
    // comparisons reflect current activity)
    for (const [pid, info] of this.pidJsonl) {
      try {
        const stat = fs.statSync(info.jsonl);
        info.lastMtime = stat.mtimeMs;
        info.lastSize = stat.size;
      } catch {}
    }

    // Build pid → previous sid (so we can detect /clear migrations for sidecar)
    const prevPidToSid = new Map();
    for (const [sid, e] of this.alive) prevPidToSid.set(e.pid, sid);

    // Build entries for emission
    const newEntries = new Map();
    for (const marker of aliveMarkers) {
      const info = this.pidJsonl.get(marker.pid);
      if (!info) continue;
      const effectiveSid = path.basename(info.jsonl).replace(/\.jsonl$/, '');
      const sharedCwd = (cwdCounts.get(marker.cwd) || 0) > 1;
      const previousSid = prevPidToSid.get(marker.pid);
      newEntries.set(effectiveSid, {
        ...marker,
        sid: effectiveSid,
        markerSid: marker.sid,
        jsonlPath: info.jsonl,
        sharedCwd,
        previousSid: previousSid && previousSid !== effectiveSid ? previousSid : null,
      });
    }

    // Removals (and detect migrations — same pid, different sid)
    const newSids = new Set(newEntries.keys());
    for (const oldSid of Array.from(this.alive.keys())) {
      if (newSids.has(oldSid)) continue;
      const oldEntry = this.alive.get(oldSid);
      this.alive.delete(oldSid);
      // If a new entry shares the pid, this is a /clear migration (not a death)
      const migratedTo = Array.from(newEntries.values()).find((e) => e.pid === oldEntry.pid && e.cwd === oldEntry.cwd);
      if (!migratedTo) {
        this.emit('removed', oldEntry);
      }
    }

    // Preserve detectedHost across /clear migrations (same pid, new sid).
    const detectByPid = new Map();
    for (const e of this.alive.values()) {
      if (e.detectedHost) detectByPid.set(e.pid, e.detectedHost);
    }

    // Additions and changes
    for (const [sid, entry] of newEntries) {
      const prev = this.alive.get(sid);
      if (!prev) {
        const fresh = detectHostProcessSync(entry.pid);
        entry.detectedHost = fresh || detectByPid.get(entry.pid) || null;
        this.alive.set(sid, entry);
        this.emit('added', entry);
      } else if (prev.pid !== entry.pid || prev.jsonlPath !== entry.jsonlPath) {
        const fresh = detectHostProcessSync(entry.pid);
        entry.detectedHost = fresh || prev.detectedHost || null;
        this.alive.set(sid, entry);
        this.emit('changed', entry);
      } else if (!prev.detectedHost) {
        // Earlier detection failed (host process maybe wasn't ready yet) — retry.
        // SessionState's meta was frozen at attach time, so emit metaUpdated to
        // propagate the new detectedHost into the running SessionState and trigger
        // a re-broadcast. Otherwise the dashboard label stays stale forever.
        const fresh = detectHostProcessSync(entry.pid);
        entry.detectedHost = fresh;
        this.alive.set(sid, entry);
        if (fresh) this.emit('metaUpdated', entry);
      } else {
        entry.detectedHost = prev.detectedHost;
        this.alive.set(sid, entry);
      }
    }
  }
}

module.exports = { SessionRegistry, resolveJsonlPath, encodeCwd, isAlive, findCurrentJsonl, readFirstEventTs };
