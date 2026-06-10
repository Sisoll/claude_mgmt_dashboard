const fs = require('fs');
const path = require('path');
const os = require('os');

// F16 flag files under ~/.claude:
//   auto-approve-build.enabled  → the hook reads this (presence = active)
//   auto-approve-build.persist  → "permanent" marker (survives dashboard restart)
// States: off (neither) / session (enabled only) / permanent (enabled + persist).
function claudeDir(home)     { return path.join(home || os.homedir(), '.claude'); }
function enabledPath(home)   { return path.join(claudeDir(home), 'auto-approve-build.enabled'); }
function persistPath(home)   { return path.join(claudeDir(home), 'auto-approve-build.persist'); }
function installedHook(home) { return path.join(claudeDir(home), 'hooks', 'auto-approve-build.sh'); }

function readState(home) {
  const en = fs.existsSync(enabledPath(home));
  const pe = fs.existsSync(persistPath(home));
  if (en && pe) return 'permanent';
  if (en) return 'session';
  return 'off';
}

function setState(home, state) {
  fs.mkdirSync(claudeDir(home), { recursive: true });
  // Crash-safety: for off/session, remove `persist` BEFORE touching/removing `enabled`.
  // If the process dies between the two fs ops, the worst residual state is enabled-without-
  // persist (reconcileOnStartup reads that as a stray → clears it → off). The reverse order
  // could leave persist-without-enabled, which reconcile reads as "permanent" and resurrects
  // a state the user just disabled.
  if (state === 'off')            { rm(persistPath(home)); rm(enabledPath(home)); }
  else if (state === 'session')   { rm(persistPath(home)); touch(enabledPath(home)); }
  else if (state === 'permanent') { touch(enabledPath(home)); touch(persistPath(home)); }
  else throw new Error('invalid state: ' + state);
  return readState(home);
}

// dashboard startup: persist → ensure enabled; else clear stray enabled (default off, crash-safe)
function reconcileOnStartup(home) {
  if (fs.existsSync(persistPath(home))) touch(enabledPath(home));
  else rm(enabledPath(home));
  return readState(home);
}

// dashboard shutdown: drop session-scoped enabled (permanent keeps it via persist)
function clearOnShutdown(home) {
  if (!fs.existsSync(persistPath(home))) rm(enabledPath(home));
}

function hookInstalled(home) { return fs.existsSync(installedHook(home)); }

function touch(p) { try { fs.writeFileSync(p, ''); } catch {} }
function rm(p)    { try { fs.rmSync(p, { force: true }); } catch {} }

module.exports = { readState, setState, reconcileOnStartup, clearOnShutdown, hookInstalled, enabledPath, persistPath };
