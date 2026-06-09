const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listDir } = require('../lib/fslist');

test('listDir 列出子目錄（排序、隱藏 dot/$、排除檔案）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fslist-'));
  fs.mkdirSync(path.join(root, 'beta'));
  fs.mkdirSync(path.join(root, 'alpha'));
  fs.mkdirSync(path.join(root, '.hidden'));
  fs.writeFileSync(path.join(root, 'a.txt'), 'x');
  const r = listDir(root);
  assert.deepStrictEqual(r.dirs, ['alpha', 'beta']);
  assert.strictEqual(r.path, path.resolve(root));
  assert.strictEqual(r.parent, path.dirname(path.resolve(root)));
});

test('listDir 空 path → 回磁碟機根 + parent=null', () => {
  const r = listDir('');
  assert.ok(Array.isArray(r.drives));
  assert.strictEqual(r.parent, null);
});

test('listDir 不存在路徑 → throw', () => {
  assert.throws(() => listDir(path.join(os.tmpdir(), 'no-such-dir-xyz123')));
});
