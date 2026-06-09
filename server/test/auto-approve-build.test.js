const { test } = require('node:test');
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

test('hookInstalled reflects hook file presence', () => {
  const h = tmpHome();
  assert.strictEqual(m.hookInstalled(h), false);
  fs.mkdirSync(path.join(h, '.claude', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(h, '.claude', 'hooks', 'auto-approve-build.sh'), '');
  assert.strictEqual(m.hookInstalled(h), true);
});
