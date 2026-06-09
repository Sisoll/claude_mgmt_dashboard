// Regression test for the "PowerShell window keeps popping up" bug (B7):
// every powershell.exe invocation MUST pass windowsHide:true, or each call
// flashes a console window. detectHostProcessSync (execFileSync) had missed it;
// runPs (spawn) already had it. We assert both here so it can't regress.

const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const helpers = require('../lib/win-helpers');

afterEach(() => mock.restoreAll());

test('detectHostProcessSync passes windowsHide:true to powershell.exe', () => {
  let captured = null;
  mock.method(cp, 'execFileSync', (file, args, opts) => {
    captured = { file, args, opts };
    return 'FOUND|WindowsTerminal|1234|0xABCD|bash';
  });
  // a pid unlikely to be in the module's detect cache, so the mock is hit
  const res = helpers.detectHostProcessSync(987654321);
  assert.ok(captured, 'execFileSync should have been called');
  assert.strictEqual(captured.file, 'powershell.exe');
  assert.strictEqual(captured.opts.windowsHide, true,
    'detectHostProcessSync must pass windowsHide:true (else a PS window pops every detect)');
  assert.strictEqual(res.name, 'WindowsTerminal');
});

test('runPs (flashWindowForPid) passes windowsHide:true to powershell.exe', async () => {
  let captured = null;
  mock.method(cp, 'spawn', (file, args, opts) => {
    captured = { file, args, opts };
    return {
      stdout: { on: () => {} },
      stderr: { on: () => {} },
      on: (ev, cb) => { if (ev === 'close') setImmediate(() => cb(0)); },
    };
  });
  await helpers.flashWindowForPid(1234, 'myproj', 5678);
  assert.ok(captured, 'spawn should have been called');
  assert.strictEqual(captured.file, 'powershell.exe');
  assert.strictEqual(captured.opts.windowsHide, true,
    'runPs must pass windowsHide:true (else focus/flash/send-prompt pop a PS window)');
});

// B5: host detection must be async (spawn, non-blocking) so a cold scan with many sessions
// never freezes the event loop. These cover parse+cache, failure throttle, and windowsHide.
test('detectHostProcess (async) parses + caches, passes windowsHide:true', async () => {
  let captured = null;
  mock.method(cp, 'spawn', (file, args, opts) => {
    captured = { file, args, opts };
    return {
      stdout: { on: (ev, cb) => { if (ev === 'data') setImmediate(() => cb(Buffer.from('FOUND|WindowsTerminal|111|0xAB|bash'))); } },
      on: (ev, cb) => { if (ev === 'close') setImmediate(() => setImmediate(() => cb(0))); },
      kill: () => {},
    };
  });
  const pid = 900000001;
  const res = await helpers.detectHostProcess(pid);
  assert.ok(captured, 'spawn should have been called (async, not execFileSync)');
  assert.strictEqual(captured.file, 'powershell.exe');
  assert.strictEqual(captured.opts.windowsHide, true);
  assert.strictEqual(res.name, 'WindowsTerminal');
  assert.deepStrictEqual(helpers.getCachedHost(pid), res, 'success is cached for sync reads');
  assert.strictEqual(helpers.shouldDetect(pid), false, 'cached success → no re-detect');
});

test('detectHostProcess caches failure + throttles retry', async () => {
  mock.method(cp, 'spawn', () => ({
    stdout: { on: () => {} },               // no FOUND output → failure
    on: (ev, cb) => { if (ev === 'close') setImmediate(() => cb(0)); },
    kill: () => {},
  }));
  const pid = 900000002;
  const res = await helpers.detectHostProcess(pid);
  assert.strictEqual(res, null);
  assert.strictEqual(helpers.getCachedHost(pid), null);
  assert.strictEqual(helpers.shouldDetect(pid), false, 'just-failed → throttled, no immediate re-spawn');
});

test('shouldDetect is true for an unknown pid', () => {
  assert.strictEqual(helpers.shouldDetect(900000003), true);
});
