const fs = require('fs');
const path = require('path');
const os = require('os');

const SIDECAR_DIR = path.join(os.homedir(), '.claude', 'sessions');

function sidecarPath(sid) {
  return path.join(SIDECAR_DIR, `${sid}.dashboard.json`);
}

function read(sid) {
  try {
    const raw = fs.readFileSync(sidecarPath(sid), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function write(sid, data) {
  const file = sidecarPath(sid);
  const merged = { ...read(sid), ...data, updatedAt: Date.now() };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function patch(sid, partial) {
  return write(sid, partial);
}

function migrate(fromSid, toSid) {
  if (!fromSid || !toSid || fromSid === toSid) return false;
  const fromPath = sidecarPath(fromSid);
  if (!fs.existsSync(fromPath)) return false;
  // Don't overwrite an existing toSid sidecar — its own preferences win
  if (fs.existsSync(sidecarPath(toSid))) return false;
  try {
    const data = JSON.parse(fs.readFileSync(fromPath, 'utf8'));
    // Carry forward user preferences. Drop ephemeral fields like manualStatus
    // because the new sid represents a fresh conversation.
    const carry = {};
    if (data.name) carry.name = data.name;
    if (typeof data.collapsed === 'boolean') carry.collapsed = data.collapsed;
    if (Object.keys(carry).length === 0) return false;
    write(toSid, { ...carry, migratedFrom: fromSid });
    return true;
  } catch {
    return false;
  }
}

module.exports = { read, write, patch, migrate, sidecarPath };
