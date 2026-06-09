const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// Folders hidden from the picker: build/dependency/VCS noise (non-dotfolders;
// dotfolders like .git/.venv are already hidden by the dot rule in listDir).
const NOISE = new Set(['node_modules', 'target', 'dist', 'build', 'out', 'venv',
  '__pycache__', 'coverage', 'bin', 'obj']);
// Folders whose name looks like an archive (e.g. an extracted "foo.zip" dir).
const ARCHIVE_RE = /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/i;

// List immediate subdirectories of `p`. Empty `p` → Windows drive roots.
// Returns { path, parent, drives, dirs }. Throws on missing / non-directory path.
function listDir(p) {
  if (!p) return { path: '', parent: null, drives: driveRoots(), dirs: [], home: driveRootOfCwd() };
  const abs = path.resolve(p);
  const st = fs.statSync(abs);                 // throws if missing
  if (!st.isDirectory()) throw new Error('not a directory');
  const dirs = fs.readdirSync(abs, { withFileTypes: true })
    .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
    .map((e) => e.name)
    .filter((n) => !n.startsWith('.') && !n.startsWith('$'))   // hide dotfiles / $Recycle.Bin
    .filter((n) => !NOISE.has(n.toLowerCase()) && !ARCHIVE_RE.test(n))  // hide noise + archive-named dirs
    .sort((a, b) => a.localeCompare(b));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, drives: [], dirs };
}

// Default landing for the picker: the drive root of where the server runs (e.g. "D:\\").
function driveRootOfCwd() {
  try { return path.parse(process.cwd()).root; } catch { return ''; }
}

// Cached, fast, non-blocking drive enumeration. `fsutil fsinfo drives` uses GetLogicalDrives —
// it lists only ASSIGNED letters and never probes/mounts them. The old fs.existsSync sweep of
// C:..Z: blocked ~57s on this machine (each phantom/disconnected letter stalls ~2.5s).
let _drives = null;
function driveRoots() {
  if (!_drives) _drives = computeDrives();
  return _drives;
}
function computeDrives() {
  const fsutil = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'fsutil.exe');
  try {
    const out = cp.execFileSync(fsutil, ['fsinfo', 'drives'], { timeout: 4000, windowsHide: true }).toString('latin1');
    const found = out.match(/[A-Za-z]:\\/g);
    if (found && found.length) return [...new Set(found.map((d) => d.toUpperCase()))];
  } catch {}
  // fallback: NEVER probe uncertain letters with fs.existsSync — a phantom/disconnected drive
  // (E:/F: …) blocks ~30s each. Return only drives we know exist: server's cwd drive + C:.
  const set = new Set(['C:\\']);
  const cwdRoot = driveRootOfCwd();
  if (cwdRoot) set.add(cwdRoot.toUpperCase());
  return [...set];
}

module.exports = { listDir, driveRoots };
