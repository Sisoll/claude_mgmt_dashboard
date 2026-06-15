const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { makeUploadStore } = require('../lib/uploads');

const SUB = '__test_voice__';
const DIR = path.join(__dirname, '..', '..', 'uploads', SUB);

function fresh() {
  fs.rmSync(DIR, { recursive: true, force: true });
  return makeUploadStore({
    subdir: SUB,
    allowExt: ['mp3', 'wav', 'ogg'],
    maxBytes: 2 * 1024 * 1024,
    events: ['waiting', 'completed', 'failed'],
  });
}
test.after(() => fs.rmSync(DIR, { recursive: true, force: true }));

test('save writes an allowed file; list returns it', () => {
  const s = fresh();
  const r = s.save('ding.mp3', Buffer.from('abc'));
  assert.equal(r.name, 'ding.mp3');
  assert.equal(r.size, 3);
  const files = s.list();
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'ding.mp3');
  assert.equal(files[0].size, 3);
});

test('save rejects disallowed extension', () => {
  const s = fresh();
  assert.throws(() => s.save('evil.txt', Buffer.from('x')), /extension/);
});

test('save rejects file over maxBytes', () => {
  const s = fresh();
  assert.throws(() => s.save('big.mp3', Buffer.alloc(2 * 1024 * 1024 + 1)), /too large/);
});

test('safeName rejects path traversal', () => {
  const s = fresh();
  assert.throws(() => s.safeName('../x.mp3'), /invalid name/);
  assert.throws(() => s.safeName('a/b.mp3'), /invalid name/);
  assert.throws(() => s.safeName('a\\b.mp3'), /invalid name/);
});

test('remove deletes the file and clears its assignment', () => {
  const s = fresh();
  s.save('ding.mp3', Buffer.from('abc'));
  s.assign('waiting', 'ding.mp3');
  s.remove('ding.mp3');
  assert.equal(s.list().length, 0);
  assert.equal(s.readAssignments().waiting, null);
});

test('assign validates event and file existence', () => {
  const s = fresh();
  s.save('ding.mp3', Buffer.from('abc'));
  assert.throws(() => s.assign('bogus', 'ding.mp3'), /invalid event/);
  assert.throws(() => s.assign('waiting', 'missing.mp3'), /file not found/);
  const a = s.assign('completed', 'ding.mp3');
  assert.equal(a.completed, 'ding.mp3');
  assert.equal(s.assign('completed', null).completed, null);
});

test('readAssignments returns {} when missing; round-trips after write', () => {
  const s = fresh();
  assert.deepEqual(s.readAssignments(), {});
  s.writeAssignments({ waiting: 'ding.mp3', completed: null, failed: null });
  assert.deepEqual(s.readAssignments(), { waiting: 'ding.mp3', completed: null, failed: null });
});

test('list ignores assignments.json', () => {
  const s = fresh();
  s.writeAssignments({ waiting: null });
  assert.equal(s.list().length, 0);
});
