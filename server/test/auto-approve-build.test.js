const { test, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const m = require('../lib/auto-approve-build');

function tmpHome() {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-'));
  fs.mkdirSync(path.join(h, '.claude'), { recursive: true });
  return h;
}

test('default state = off', () => { assert.strictEqual(m.readState(tmpHome()), 'off'); });

test('session = enabled only', () => {
  const h = tmpHome();
  assert.strictEqual(m.setState(h, 'session'), 'session');
  assert.ok(fs.existsSync(m.enabledPath(h)));
  assert.ok(!fs.existsSync(m.persistPath(h)));
});

test('permanent = enabled + persist', () => {
  const h = tmpHome();
  m.setState(h, 'permanent');
  assert.strictEqual(m.readState(h), 'permanent');
  assert.ok(fs.existsSync(m.persistPath(h)));
});

test('off clears both', () => {
  const h = tmpHome(); m.setState(h, 'permanent'); m.setState(h, 'off');
  assert.strictEqual(m.readState(h), 'off');
});

test('startup reconcile: persist re-applies enabled', () => {
  const h = tmpHome(); m.setState(h, 'permanent');
  fs.rmSync(m.enabledPath(h), { force: true });
  assert.strictEqual(m.reconcileOnStartup(h), 'permanent');
  assert.ok(fs.existsSync(m.enabledPath(h)));
});

test('startup reconcile: no persist clears stray enabled (crash-safe → off)', () => {
  const h = tmpHome(); m.setState(h, 'session');
  assert.strictEqual(m.reconcileOnStartup(h), 'off');
});

test('shutdown clears session but keeps permanent', () => {
  const a = tmpHome(); m.setState(a, 'session'); m.clearOnShutdown(a);
  assert.strictEqual(m.readState(a), 'off');
  const b = tmpHome(); m.setState(b, 'permanent'); m.clearOnShutdown(b);
  assert.strictEqual(m.readState(b), 'permanent');
});

// #7 crash-safety: persist must be removed BEFORE enabled is touched/removed, so an
// interrupt between the two fs ops can never leave persist-without-enabled (which
// reconcileOnStartup would read as "permanent" and resurrect a state the user disabled).
function fsMutationOrder(fn) {
  const order = [];
  const rmReal = fs.rmSync, wReal = fs.writeFileSync;
  const t1 = mock.method(fs, 'rmSync', (p, o) => { order.push(['rm', p]); return rmReal.call(fs, p, o); });
  const t2 = mock.method(fs, 'writeFileSync', (p, d) => { order.push(['touch', p]); return wReal.call(fs, p, d); });
  try { fn(); } finally { t1.mock.restore(); t2.mock.restore(); }
  return order;
}

test('#7 setState off removes persist before enabled (crash-safe)', () => {
  const h = tmpHome(); m.setState(h, 'permanent');
  const order = fsMutationOrder(() => m.setState(h, 'off'));
  const idxPersist = order.findIndex(([, p]) => p === m.persistPath(h));
  const idxEnabled = order.findIndex(([, p]) => p === m.enabledPath(h));
  assert.ok(idxPersist >= 0 && idxEnabled >= 0, 'both paths mutated');
  assert.ok(idxPersist < idxEnabled, 'persist must be removed before enabled');
});

test('#7 setState session removes persist before touching enabled (crash-safe)', () => {
  const h = tmpHome(); m.setState(h, 'permanent');
  const order = fsMutationOrder(() => m.setState(h, 'session'));
  const idxPersist = order.findIndex(([op, p]) => op === 'rm' && p === m.persistPath(h));
  const idxEnabled = order.findIndex(([op, p]) => op === 'touch' && p === m.enabledPath(h));
  assert.ok(idxPersist >= 0 && idxEnabled >= 0, 'persist removed and enabled touched');
  assert.ok(idxPersist < idxEnabled, 'persist must be removed before enabled is touched');
});

test('hookInstalled reflects hook file presence', () => {
  const h = tmpHome();
  assert.strictEqual(m.hookInstalled(h), false);
  fs.mkdirSync(path.join(h, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(h, '.claude', 'hooks', 'auto-approve-build.sh'), '');
  assert.strictEqual(m.hookInstalled(h), true);
});
