const fs = require('fs');
const path = require('path');

// Generic upload store for one media category (voice, pic, …). Owns a gitignored
// uploads/<subdir>/ dir: file CRUD + an assignments.json map. Vanilla fs only — no
// multipart/parsing deps (the repo stays ws-only). `events` is the set of valid
// assignment slots (voice: waiting/completed/failed; F14 pic would pass its own).
function makeUploadStore({ subdir, allowExt, maxBytes, events = [] }) {
  const dir = path.join(__dirname, '..', '..', 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const assignPath = path.join(dir, 'assignments.json');

  const extOf = (name) => path.extname(String(name)).toLowerCase().replace(/^\./, '');

  // Reject anything that isn't a bare, allowed-extension filename.
  function safeName(name) {
    const s = String(name || '');
    // Reject separators in the raw input before basename stripping can hide them.
    if (s.includes('/') || s.includes('\\')) throw new Error('invalid name');
    const base = path.basename(s);
    if (!base || base === '.' || base === '..') {
      throw new Error('invalid name');
    }
    if (!allowExt.includes(extOf(base))) throw new Error('extension not allowed');
    return base;
  }

  function save(name, buf) {
    const fn = safeName(name);
    if (buf.length > maxBytes) throw new Error('file too large');
    fs.writeFileSync(path.join(dir, fn), buf);
    return { name: fn, size: buf.length };
  }

  function list() {
    return fs.readdirSync(dir)
      .filter((f) => f !== 'assignments.json' && allowExt.includes(extOf(f)))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, mtime: st.mtimeMs };
      });
  }

  function readAssignments() {
    try { return JSON.parse(fs.readFileSync(assignPath, 'utf8')); }
    catch { return {}; }
  }

  function writeAssignments(map) {
    fs.writeFileSync(assignPath, JSON.stringify(map, null, 2));
    return map;
  }

  function remove(name) {
    const fn = safeName(name);
    const p = path.join(dir, fn);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    const a = readAssignments();
    let changed = false;
    for (const k of Object.keys(a)) if (a[k] === fn) { a[k] = null; changed = true; }
    if (changed) writeAssignments(a);
  }

  function filePath(name) {
    return path.join(dir, safeName(name));
  }

  function assign(event, name) {
    if (!events.includes(event)) throw new Error('invalid event');
    const val = name == null ? null : safeName(name);
    if (val !== null && !list().some((f) => f.name === val)) throw new Error('file not found');
    const a = readAssignments();
    a[event] = val;
    return writeAssignments(a);
  }

  return { dir, save, list, remove, filePath, assign, readAssignments, writeAssignments, safeName };
}

module.exports = { makeUploadStore };
