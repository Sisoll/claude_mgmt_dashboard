const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');

function readLatestTmpValue(suffix) {
  let dirEntries;
  try {
    dirEntries = fs.readdirSync(CLAUDE_DIR);
  } catch {
    return null;
  }
  const candidates = dirEntries
    .filter((f) => f.startsWith('statusline_') && f.endsWith(`_${suffix}.tmp`))
    .map((f) => {
      const full = path.join(CLAUDE_DIR, f);
      try {
        const stat = fs.statSync(full);
        return { full, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  const top = candidates[0];
  try {
    const raw = fs.readFileSync(top.full, 'utf8').trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return { value: n, mtime: top.mtime, file: path.basename(top.full) };
  } catch {
    return null;
  }
}

function getQuotas() {
  // Account-level only (5h + week). ctx is per-session and surfaced on each card snapshot instead.
  // NOTE: the statusline writes `100 - used` to these tmp files, i.e. the value is the
  // REMAINING percentage, not used. The *_reset.tmp files hold the quota reset epoch (seconds),
  // which the statusline now also persists (Claude Code only feeds resets_at to the statusline).
  const fiveH  = readLatestTmpValue('5h');
  const sevenD = readLatestTmpValue('7d');
  const fiveHReset  = readLatestTmpValue('5h_reset');
  const sevenDReset = readLatestTmpValue('7d_reset');
  const newest = [fiveH, sevenD].filter(Boolean).reduce((m, x) => Math.max(m, x.mtime), 0);
  if (newest === 0) {
    return { available: false };
  }
  return {
    available: true,
    fiveHRemainPct:  fiveH  ? fiveH.value  : null,
    sevenDRemainPct: sevenD ? sevenD.value : null,
    fiveHResetsAt:   fiveHReset  ? fiveHReset.value  : null,  // epoch seconds
    sevenDResetsAt:  sevenDReset ? sevenDReset.value : null,
    refreshedAt: newest,
    age: Date.now() - newest,
  };
}

function readCtxRemainForSession(sid) {
  if (!sid) return null;
  const file = path.join(CLAUDE_DIR, `statusline_${sid}_ctx.tmp`);
  try {
    const stat = fs.statSync(file);
    const v = Number(fs.readFileSync(file, 'utf8').trim());
    if (!Number.isFinite(v)) return null;
    return { value: v, mtime: stat.mtimeMs, age: Date.now() - stat.mtimeMs };
  } catch { return null; }
}

module.exports = { getQuotas, readCtxRemainForSession };
