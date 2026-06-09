const fs = require('fs');
const path = require('path');

// List immediate subdirectories of `p`. Empty `p` → Windows drive roots.
// Returns { path, parent, drives, dirs }. Throws on missing / non-directory path.
function listDir(p) {
  if (!p) return { path: '', parent: null, drives: driveRoots(), dirs: [] };
  const abs = path.resolve(p);
  const st = fs.statSync(abs);                 // throws if missing
  if (!st.isDirectory()) throw new Error('not a directory');
  const dirs = fs.readdirSync(abs, { withFileTypes: true })
    .filter((e) => { try { return e.isDirectory(); } catch { return false; } })
    .map((e) => e.name)
    .filter((n) => !n.startsWith('.') && !n.startsWith('$'))   // hide dotfiles / $Recycle.Bin
    .sort((a, b) => a.localeCompare(b));
  const parent = path.dirname(abs);
  return { path: abs, parent: parent === abs ? null : parent, drives: [], dirs };
}

function driveRoots() {
  const out = [];
  for (let c = 67; c <= 90; c++) {              // C: .. Z:
    const d = String.fromCharCode(c) + ':\\';
    try { if (fs.existsSync(d)) out.push(d); } catch {}
  }
  return out;
}

module.exports = { listDir, driveRoots };
