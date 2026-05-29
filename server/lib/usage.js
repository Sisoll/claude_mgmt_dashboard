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
  const fiveH  = readLatestTmpValue('5h');
  const sevenD = readLatestTmpValue('7d');
  const newest = [fiveH, sevenD].filter(Boolean).reduce((m, x) => Math.max(m, x.mtime), 0);
  if (newest === 0) {
    return { available: false };
  }
  return {
    available: true,
    fiveHUsedPct:  fiveH  ? fiveH.value  : null,
    sevenDUsedPct: sevenD ? sevenD.value : null,
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
