# F13 自訂通知鈴聲 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者上傳自訂音檔、指派給 waiting / completed / failed 三個通知事件，未指派則 fallback 回現有合成音；順手建好共通上傳後端供 F14 沿用。

**Architecture:** 後端新增一個泛用 upload store（`makeUploadStore`，純 `fs`、無 multipart 依賴），voice 端點是它的薄包；檔案存 repo 根 `uploads/voice/`（gitignored），透過 `/uploads/voice/<name>` 服務給 `<audio>` 播放。前端 topbar 加 🔔 鈕開獨立 modal（仿 `fs-modal`，`.hidden` class 切換），管理音庫 + 指派；播放在 `detectTransitionsAndAlert` 的三個觸發點改呼叫 `playEventSound(event)`。

**Tech Stack:** Node ≥20 vanilla `http`/`fs`（只依賴 `ws`）；`node:test`；vanilla ES-module 前端；無 build step。

**Spec:** `docs/superpowers/specs/2026-06-15-f13-custom-sound-design.md`

> ⚠️ **Commit policy（本專案特例）**：handoff 規則「不要 commit，除非使用者明說」——v0.2.3 的所有改動（含已修 BF）一起在 release 時才進 git。**執行本 plan 前先問使用者**：要 (a) 每個 task 本地 commit 當 checkpoint（乾淨歷史），還是 (b) 全程不 commit、最後由 `release` skill 一次提交。下列 commit 步驟是 (a) 的預設；若選 (b) 就略過 commit 步驟、改為「留工作樹」。**絕不 push / 打 tag / bump 版號**（那是 `release` skill 的事）。

> ⚙️ **環境注意**：本機 bash spawn 慢（~20–70s/次）。`node:test` 單檔跑一次 spawn 即可，背景跑 + 輪詢輸出。前端無自動測 → 走「人工驗證」步驟（在實際 dashboard 操作確認），已明列、非略過。

---

## File Structure

| 檔案 | 動作 | 職責 |
| --- | --- | --- |
| `server/lib/uploads.js` | **Create** | 泛用 upload store 工廠：檔案 CRUD + `assignments.json` 讀寫 + 名稱/副檔名/大小校驗 |
| `server/test/uploads.test.js` | **Create** | store 的 `node:test` 單元測試（邏輯主覆蓋層） |
| `server/index.js` | Modify | require store、建 `voiceStore`、加 5 個 voice 端點 + `/uploads/voice/` 服務 |
| `.gitignore` | Modify | 加 `/uploads/` |
| `web/dashboard.html` | Modify | topbar 加 `#sound-settings-btn`；body 加 `#sound-modal` markup |
| `web/ui/styles.css` | Modify | `.sound-modal*` 樣式（新元件，不動既有樣式） |
| `web/ui/app.js` | Modify | `soundOn` 持久化；modal 開關；音庫 UI（list/upload/preview/delete）；指派 select；`playEventSound` 整合三觸發點；啟動載入 assignments |

**Decomposition note：** 所有可測邏輯集中在 `uploads.js`（含「刪檔連帶清指派」「指派校驗」），端點與前端只是薄 glue，因此自動測聚焦 store，端點/前端走人工煙霧測試。

---

## Task 1: 共通 upload store（`makeUploadStore`）

**Files:**
- Create: `server/lib/uploads.js`
- Test: `server/test/uploads.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: gitignore `uploads/`**

在 `.gitignore` 末尾加一行（若尚未存在）：

```
/uploads/
```

- [ ] **Step 2: Write the failing test**

Create `server/test/uploads.test.js`:

```js
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test server/test/uploads.test.js`
Expected: FAIL — `Cannot find module '../lib/uploads'`.

- [ ] **Step 4: Write minimal implementation**

Create `server/lib/uploads.js`:

```js
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
    const base = path.basename(String(name || ''));
    if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test server/test/uploads.test.js`
Expected: PASS — 8 tests pass.

- [ ] **Step 6: Commit** （受上方 Commit policy 約束）

```bash
git add server/lib/uploads.js server/test/uploads.test.js .gitignore
git commit -m "feat(F13): generic upload store (makeUploadStore) + tests"
```

---

## Task 2: Voice API 端點 + 檔案服務

**Files:**
- Modify: `server/index.js`（require + store ＠ `:14` 附近；端點 ＠ `:372` 之後、`:418` 之前）

- [ ] **Step 1: Require store + build voiceStore**

在 `server/index.js:14`（`const aab = require('./lib/auto-approve-build');`）之後加：

```js
const { makeUploadStore } = require('./lib/uploads');
const VOICE_MAX_BYTES = 2 * 1024 * 1024;
const voiceStore = makeUploadStore({
  subdir: 'voice',
  allowExt: ['mp3', 'wav', 'ogg'],
  maxBytes: VOICE_MAX_BYTES,
  events: ['waiting', 'completed', 'failed'],
});
```

- [ ] **Step 2: Add the 5 voice routes**

在 auto-approve-build POST 區塊結束（`server/index.js:372` 的 `}` 之後、shutdown 區塊 `:374` 之前）插入：

```js
  // ============== F13: custom notification sounds (voice) ==============
  if (req.method === 'GET' && url.pathname === '/api/voice/list') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ files: voiceStore.list(), assignments: voiceStore.readAssignments() }));
    return;
  }

  // Raw-body upload (no multipart dep). Filename in ?name=. Bail early on oversize.
  if (req.method === 'POST' && url.pathname === '/api/voice/upload') {
    const name = url.searchParams.get('name') || '';
    const chunks = [];
    let size = 0, aborted = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > VOICE_MAX_BYTES) {
        aborted = true;
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'file too large' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const file = voiceStore.save(name, Buffer.concat(chunks));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, file }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/voice/delete') {
    let body = '';
    req.on('data', (c) => { body += c.toString(); });
    req.on('end', () => {
      try {
        const reqName = String(JSON.parse(body || '{}').name || '');
        voiceStore.remove(reqName); // also clears any assignment pointing at it
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, assignments: voiceStore.readAssignments() }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/voice/assign') {
    let body = '';
    req.on('data', (c) => { body += c.toString(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}');
        const event = String(b.event || '');
        const name = b.name == null ? null : String(b.name);
        const assignments = voiceStore.assign(event, name);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, assignments }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Serve uploaded audio for <audio> playback. filePath() validates name + ext;
  // path.basename inside it neutralizes traversal, mirroring the /ui/ guard intent.
  if (req.method === 'GET' && url.pathname.startsWith('/uploads/voice/')) {
    const name = decodeURIComponent(url.pathname.slice('/uploads/voice/'.length));
    let fp;
    try { fp = voiceStore.filePath(name); }
    catch { res.writeHead(403); res.end('forbidden'); return; }
    try {
      const body = fs.readFileSync(fp);
      const ext = path.extname(fp).toLowerCase();
      const type = ext === '.mp3' ? 'audio/mpeg' : ext === '.wav' ? 'audio/wav'
        : ext === '.ogg' ? 'audio/ogg' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch (err) {
      res.writeHead(404); res.end('sound not found');
    }
    return;
  }
```

- [ ] **Step 3: Smoke-test the endpoints against a running server (manual — HTTP glue not auto-tested; logic covered by Task 1)**

啟動 server（`node server/index.js`，或用 dashboard 的重啟鈕），然後在另一個 shell：

```bash
# upload（raw body）
curl -s -X POST --data-binary @some.mp3 "http://127.0.0.1:7878/api/voice/upload?name=ding.mp3"
# 期望：{"ok":true,"file":{"name":"ding.mp3","size":...}}

# list
curl -s "http://127.0.0.1:7878/api/voice/list"
# 期望：files 含 ding.mp3，assignments {}

# assign
curl -s -X POST -d '{"event":"waiting","name":"ding.mp3"}' "http://127.0.0.1:7878/api/voice/assign"
# 期望：{"ok":true,"assignments":{"waiting":"ding.mp3"}}

# serve
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://127.0.0.1:7878/uploads/voice/ding.mp3"
# 期望：200 audio/mpeg

# traversal guard
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:7878/uploads/voice/..%2f..%2fpackage.json"
# 期望：403

# delete（連帶清 waiting 指派）
curl -s -X POST -d '{"name":"ding.mp3"}' "http://127.0.0.1:7878/api/voice/delete"
# 期望：{"ok":true,"assignments":{"waiting":null}}
```

Expected: 所有回應如註解；`uploads/voice/` 出現/清空對應檔案。

- [ ] **Step 4: Commit** （受 Commit policy 約束）

```bash
git add server/index.js
git commit -m "feat(F13): voice upload/list/delete/assign endpoints + audio serving"
```

---

## Task 3: `soundOn` 持久化（前端）

**Files:**
- Modify: `web/ui/app.js:68`、`web/ui/app.js:166-171`

- [ ] **Step 1: 載入時讀 localStorage**

`web/ui/app.js:68`：

```js
  let soundOn = true;
```

改為：

```js
  let soundOn = (localStorage.getItem('soundOn') ?? 'true') === 'true';
```

- [ ] **Step 2: toggle 時寫回 + 啟動時反映靜音樣式**

`web/ui/app.js:166-171` 目前：

```js
  $('#sound-toggle').addEventListener('click', (e) => {
    soundOn = !soundOn;
    e.currentTarget.style.color = soundOn ? '' : 'var(--text-faint)';
    e.currentTarget.style.background = soundOn ? '' : 'var(--surface-2)';
    if (soundOn) chime();
  });
```

改為（加持久化 + 啟動套用樣式）：

```js
  const soundToggleBtn = $('#sound-toggle');
  function applySoundToggleStyle() {
    soundToggleBtn.style.color = soundOn ? '' : 'var(--text-faint)';
    soundToggleBtn.style.background = soundOn ? '' : 'var(--surface-2)';
  }
  applySoundToggleStyle(); // reflect persisted state on load
  soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    localStorage.setItem('soundOn', soundOn ? 'true' : 'false');
    applySoundToggleStyle();
    if (soundOn) chime();
  });
```

- [ ] **Step 3: 人工驗證**

1. 開 dashboard → 點 🔊 mute 鈕關閉（變灰）。
2. Reload 頁面 → 🔊 鈕**仍是灰的關閉態**（之前不會記憶）。
3. 再點開 → 恢復、聽到 chime。

Expected: soundOn 跨 reload 保留，按鈕樣式同步。

- [ ] **Step 4: Commit** （受 Commit policy 約束）

```bash
git add web/ui/app.js
git commit -m "feat(F13): persist soundOn to localStorage (parity with notifyOn)"
```

---

## Task 4: 🔔 鈴聲鈕 + sound modal（markup + CSS）

**Files:**
- Modify: `web/dashboard.html:40`（topbar 鈕）、`web/dashboard.html:154`（modal markup，`#fs-modal` 結束 `</div>` 之後）
- Modify: `web/ui/styles.css`（檔尾新增）

- [ ] **Step 1: topbar 加鈴聲設定鈕**

`web/dashboard.html:38-40` 的 `#sound-toggle` `</button>` 之後（line 40 後）插入：

```html
      <button class="icon-btn" title="鈴聲設定：上傳自訂音檔、指派給通知事件" id="sound-settings-btn">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5a3 3 0 0 0-3 3v2.6L3.8 10.2h8.4L11 8.1V5.5a3 3 0 0 0-3-3Z"/><path d="M6.6 12.4a1.5 1.5 0 0 0 2.8 0"/><circle cx="12.6" cy="3.8" r="2" fill="currentColor" stroke="none"/></svg>
      </button>
```

（鈴鐺帶一個實心小圓點，和隔壁空心喇叭 🔊 視覺區分。）

- [ ] **Step 2: body 加 `#sound-modal`**

`web/dashboard.html` 的 `#fs-modal` 區塊結束（`:154` 的 `</div>`）之後、`</body>` 之前插入：

```html
  <div class="sound-modal hidden" id="sound-modal">
    <div class="sound-modal-card">
      <div class="sound-modal-head">
        <span class="sound-modal-title">🔔 鈴聲設定</span>
        <button class="icon-btn sound-close" id="sound-close" title="關閉">✕</button>
      </div>
      <div class="sound-body">
        <div class="sound-section-title">音庫</div>
        <div class="sound-lib" id="sound-lib"></div>
        <label class="sound-upload-btn">
          ＋ 上傳音檔（mp3 / wav / ogg，≤2&nbsp;MB）
          <input type="file" id="sound-upload" accept=".mp3,.wav,.ogg" hidden />
        </label>
        <div class="sound-section-title">事件指派</div>
        <div class="sound-assign-row"><span>等待您決定</span><select class="sound-assign" data-event="waiting"></select></div>
        <div class="sound-assign-row"><span>完成</span><select class="sound-assign" data-event="completed"></select></div>
        <div class="sound-assign-row"><span>失敗</span><select class="sound-assign" data-event="failed"></select></div>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: CSS（檔尾新增 — 新元件，不動既有樣式）**

`web/ui/styles.css` 末尾追加：

```css
/* F13: sound settings modal */
.sound-modal { position: fixed; inset: 0; background: rgba(26, 24, 21, .45); display: flex; align-items: center; justify-content: center; z-index: 60; }
.sound-modal.hidden { display: none; }
.sound-modal-card { width: 420px; max-width: calc(100vw - 40px); max-height: 80vh; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, .25); }
.sound-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); }
.sound-modal-title { font-weight: 600; color: var(--text); }
.sound-body { padding: 14px 16px 18px; }
.sound-section-title { font-size: 12px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .04em; margin: 10px 0 8px; }
.sound-lib { display: flex; flex-direction: column; gap: 6px; }
.sound-lib-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--surface-2); border-radius: 8px; }
.sound-lib-row .name { flex: 1; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sound-lib-row button { cursor: pointer; background: none; border: none; color: var(--text-muted); font-size: 14px; padding: 2px 4px; }
.sound-lib-row button:hover { color: var(--text); }
.sound-lib-empty { font-size: 12.5px; color: var(--text-faint); padding: 6px 2px; }
.sound-upload-btn { display: inline-block; cursor: pointer; font-size: 12.5px; color: var(--accent); padding: 8px 0 2px; }
.sound-assign-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
.sound-assign-row span { font-size: 13px; color: var(--text); }
.sound-assign { font-family: inherit; font-size: 12.5px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); max-width: 220px; }
.sound-close { cursor: pointer; }
```

- [ ] **Step 4: open/close 接線（`web/ui/app.js`，緊接在 sound-toggle 區塊之後，約 `:172`）**

```js
  // ============== F13: sound settings modal (open/close) ==============
  const soundModal = $('#sound-modal');
  $('#sound-settings-btn').addEventListener('click', () => {
    soundModal.classList.remove('hidden');
    loadVoiceLib(); // defined in the F13 library task
  });
  $('#sound-close').addEventListener('click', () => soundModal.classList.add('hidden'));
  soundModal.addEventListener('click', (e) => {
    if (e.target === soundModal) soundModal.classList.add('hidden'); // backdrop click
  });
```

> 註：`loadVoiceLib` 在 Task 5 定義；先寫好呼叫，Task 5 補實作後即可用。若想各 task 都可獨立跑，Task 4 暫時放 `function loadVoiceLib() {}` 空殼，Task 5 再填。

- [ ] **Step 5: 人工驗證**

1. Reload dashboard → topbar 在 🔊 旁出現 🔔 鈕（鈴鐺帶點）。
2. 點 🔔 → 跳出「🔔 鈴聲設定」modal（音庫空、三個指派下拉）。
3. 點 ✕ 或點 modal 外暗區 → 關閉。

Expected: 鈕顯示、modal 開關正常、樣式符合暖色主題。

- [ ] **Step 6: Commit** （受 Commit policy 約束）

```bash
git add web/dashboard.html web/ui/styles.css web/ui/app.js
git commit -m "feat(F13): topbar sound-settings button + sound modal shell"
```

---

## Task 5: 音庫 UI（載入 / 上傳 / 試聽 / 刪除）

**Files:**
- Modify: `web/ui/app.js`（新增 F13 音庫區塊；若 Task 4 放了空殼 `loadVoiceLib`，改成實作）

- [ ] **Step 1: 音庫狀態 + 載入 + 渲染**

在 app.js 的 F13 區塊（Task 4 之後）加入。先宣告模組級狀態（放在靠近其他模組狀態處，例如 sound-toggle 區塊上方亦可；此處就近）：

```js
  // ============== F13: voice library state + rendering ==============
  let voiceAssignments = {}; // { waiting, completed, failed } -> filename | null
  let voiceFiles = [];       // [{ name, size, mtime }]
  const VOICE_MAX_BYTES_FE = 2 * 1024 * 1024;
  const VOICE_EXT = ['mp3', 'wav', 'ogg'];

  async function loadVoiceLib() {
    try {
      const res = await fetch('/api/voice/list');
      const data = await res.json();
      voiceFiles = data.files || [];
      voiceAssignments = data.assignments || {};
    } catch { voiceFiles = []; voiceAssignments = {}; }
    renderVoiceLib();
    renderVoiceAssigns();
  }

  function renderVoiceLib() {
    const lib = $('#sound-lib');
    if (!lib) return;
    if (!voiceFiles.length) { lib.innerHTML = '<div class="sound-lib-empty">（音庫是空的，先上傳一個音檔）</div>'; return; }
    lib.innerHTML = '';
    for (const f of voiceFiles) {
      const row = document.createElement('div');
      row.className = 'sound-lib-row';
      row.innerHTML = `<span class="name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>`
        + `<button class="vplay" title="試聽">▶</button>`
        + `<button class="vdel" title="刪除">🗑</button>`;
      row.querySelector('.vplay').onclick = () => {
        new Audio('/uploads/voice/' + encodeURIComponent(f.name)).play().catch(() => {});
      };
      row.querySelector('.vdel').onclick = () => deleteVoice(f.name);
      lib.appendChild(row);
    }
  }

  async function deleteVoice(name) {
    try {
      const res = await fetch('/api/voice/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) { pushToast({ title: '刪除失敗', msg: data.error || '' }); return; }
      voiceAssignments = data.assignments || {};
      await loadVoiceLib();
    } catch (err) { pushToast({ title: '刪除失敗', msg: err.message }); }
  }
```

> 若 Task 4 放了空殼 `function loadVoiceLib() {}`，刪掉那行空殼，改用本 task 的實作。`escapeHtml` 已存在於 app.js（fs-modal 區用過），直接沿用。

- [ ] **Step 2: 上傳接線**

接在上一段之後：

```js
  $('#sound-upload').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting same file later
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!VOICE_EXT.includes(ext)) { pushToast({ title: '格式不支援', msg: '只接受 mp3 / wav / ogg' }); return; }
    if (file.size > VOICE_MAX_BYTES_FE) { pushToast({ title: '檔案太大', msg: '單檔上限 2 MB' }); return; }
    try {
      const res = await fetch('/api/voice/upload?name=' + encodeURIComponent(file.name), {
        method: 'POST', body: file, // raw body
      });
      const data = await res.json();
      if (!res.ok) { pushToast({ title: '上傳失敗', msg: data.error || '' }); return; }
      await loadVoiceLib();
      pushToast({ title: '已上傳', msg: file.name });
    } catch (err) { pushToast({ title: '上傳失敗', msg: err.message }); }
  });
```

- [ ] **Step 3: 人工驗證**

1. 開 🔔 modal → 點「＋ 上傳音檔」→ 選一個 mp3 → toast「已上傳」、音庫出現該檔。
2. 點該列 ▶ → 聽到該音檔。
3. 試上傳 `.txt` 或 >2 MB → 被擋 + 提示。
4. 點 🗑 → 該檔從音庫消失。

Expected: 上傳/試聽/刪除皆正常，前端校驗擋掉非法檔。

- [ ] **Step 4: Commit** （受 Commit policy 約束）

```bash
git add web/ui/app.js
git commit -m "feat(F13): voice library UI — load/upload/preview/delete"
```

---

## Task 6: 事件指派下拉

**Files:**
- Modify: `web/ui/app.js`（F13 區塊續寫）

- [ ] **Step 1: 渲染指派下拉 + change 接線**

接在 Task 5 的程式之後：

```js
  // ============== F13: event assignment selects ==============
  function renderVoiceAssigns() {
    $$('.sound-assign').forEach((sel) => {
      const event = sel.dataset.event;
      const current = voiceAssignments[event] || '';
      let html = '<option value="">（預設合成音）</option>';
      for (const f of voiceFiles) {
        const selected = f.name === current ? ' selected' : '';
        html += `<option value="${escapeHtml(f.name)}"${selected}>${escapeHtml(f.name)}</option>`;
      }
      sel.innerHTML = html;
    });
  }

  $$('.sound-assign').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const event = sel.dataset.event;
      const name = sel.value || null;
      try {
        const res = await fetch('/api/voice/assign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, name }),
        });
        const data = await res.json();
        if (!res.ok) { pushToast({ title: '指派失敗', msg: data.error || '' }); return; }
        voiceAssignments = data.assignments || {};
      } catch (err) { pushToast({ title: '指派失敗', msg: err.message }); }
    });
  });
```

> `renderVoiceAssigns()` 已在 Task 5 的 `loadVoiceLib()` 內被呼叫，故開 modal / 上傳 / 刪除後都會重渲染下拉並保持選取狀態。

- [ ] **Step 2: 人工驗證**

1. 開 🔔 modal，上傳 2 個音檔。
2. 「完成」下拉 → 選其中一個 → 不報錯。
3. 關閉 modal 再重開 → 「完成」下拉**仍記得**剛選的（server 持久化）。
4. 刪除被指派的那個檔 → 重開 modal，該事件下拉回到「（預設合成音）」。

Expected: 指派寫入 server、跨開關 modal / reload 保留、刪檔連帶清指派。

- [ ] **Step 3: Commit** （受 Commit policy 約束）

```bash
git add web/ui/app.js
git commit -m "feat(F13): event-to-sound assignment selects (persisted server-side)"
```

---

## Task 7: 播放整合（`playEventSound`）+ 啟動載入指派

**Files:**
- Modify: `web/ui/app.js`（新增 `playEventSound`/`fallbackChime`；改三觸發點 `:763 :767 :772`；啟動 fetch assignments）

- [ ] **Step 1: 新增 `playEventSound` + `fallbackChime`**

放在 chime 函式群之後（`web/ui/app.js:97` 之後）：

```js
  // F13: play the user-assigned sound for an event, else fall back to the synth chime.
  function fallbackChime(event) {
    if (event === 'waiting') chime();
    else if (event === 'completed') chimeCompletion();
    else if (event === 'failed') chimeFailure();
  }
  function playEventSound(event) {
    if (!soundOn) return;
    const name = voiceAssignments[event];
    if (name) {
      const audio = new Audio('/uploads/voice/' + encodeURIComponent(name));
      audio.play().catch(() => fallbackChime(event)); // 404 / decode / autoplay block → fallback
      return;
    }
    fallbackChime(event);
  }
```

> `voiceAssignments` 是 Task 5 宣告的模組變數；此函式在同一模組作用域內，可直接讀取。

- [ ] **Step 2: 改三個觸發點**

`web/ui/app.js:763`：`chime();` → `playEventSound('waiting');`
`web/ui/app.js:767`：`chimeCompletion();` → `playEventSound('completed');`
`web/ui/app.js:772`：`chimeFailure();` → `playEventSound('failed');`

（保留 `:170` sound-toggle 開啟時的 `chime()` UI 回饋音不變——那不是事件音。）

- [ ] **Step 3: 啟動載入 assignments（不必開 modal 也能播自訂音）**

在 app.js 啟動區（與 fs 預熱 fetch `:1338` 同類，放其附近）加：

```js
  // F13: pull assignments on load so event sounds use custom files before the modal is ever opened.
  fetch('/api/voice/list').then((r) => r.json()).then((d) => {
    voiceFiles = d.files || [];
    voiceAssignments = d.assignments || {};
  }).catch(() => {});
```

> 確認此段在 `voiceFiles`/`voiceAssignments` 宣告（Task 5）之後執行——它們是 `let` 模組變數、在模組頂層 hoist 的函式作用域內，啟動 fetch 寫入即可。

- [ ] **Step 4: 人工驗證（核心 payoff）**

1. 指派一個音檔給「完成」。
2. 讓某個 session 從 running → completed（或手動把卡片狀態切到完成）→ **聽到自訂音**，而非合成音。
3. 「失敗」不指派 → 觸發失敗 → 聽到原本的 `chimeFailure` 合成音（fallback）。
4. Reload dashboard（**不開 modal**）→ 直接觸發完成 → 仍播自訂音（啟動已載入指派）。
5. 關 🔊 mute → 觸發任何事件 → 不出聲。

Expected: 有指派播自訂、沒指派 fallback、mute 全靜音、reload 後不需開 modal 即生效。

- [ ] **Step 5: Commit** （受 Commit policy 約束）

```bash
git add web/ui/app.js
git commit -m "feat(F13): route event sounds through playEventSound (custom-or-fallback)"
```

---

## Task 8: 全量人工驗收（spec §9）

**Files:** 無（驗收）

- [ ] **Step 1: 跑 spec §9 完整人工清單**

1. 開 🔔 modal → 上傳一個 mp3 → 出現在音庫。
2. 指派給「completed」→ 觸發完成 → 聽到自訂音。
3. 某事件不指派 → 觸發 → 聽到原合成音（fallback）。
4. ▶ 試聽可播；🗑 刪除後從音庫 + 指派消失。
5. 關 🔊 mute → 不播任何音。
6. reload dashboard → soundOn 狀態 + 指派都保留。
7. 上傳 >2 MB / `.txt` → 被擋 + 提示。
8. （server）`uploads/voice/` 含上傳檔 + `assignments.json`；`git status` **不**顯示 `uploads/`（已 gitignore）。

- [ ] **Step 2: 跑 store 自動測試確認沒回歸**

Run: `node --test server/test/uploads.test.js`
Expected: PASS（8/8）。

- [ ] **Step 3: 回報 + 更新 handoff/todo**

- 在回覆中明列「自動測試 8/8 PASS」「人工 8 項結果」。
- 若全綠：F13 完成、**留工作樹不發版**（等 F14 一起 v0.2.3）。更新 handoff `> Next` 指向 F14。
- 不 commit / push / tag（除非使用者另行授權 incremental commits；發版走 `release` skill）。

---

## Self-Review（plan 對照 spec）

- **§1 範圍**：voice 上傳(T2,T5)/音庫(T5)/指派(T6)/播放整合(T7)/soundOn 持久化(T3)/共通後端(T1) ✅；非目標（F14 pic / per-session / 音量）未排入 ✅。
- **§3 決策**：三事件各槽+fallback(T7)、topbar 🔔+獨立 modal(T4)、voice/pic 分立但後端抽共通(T1 `events`/`subdir` 參數)、repo 根 `uploads/voice/` gitignored(T1)、mp3/wav/ogg ≤2MB(T1,T5)、raw-body POST(T2,T5)、assignments.json(T1)、`<audio>`+URL(T5,T7)、試聽(T5)、soundOn 持久化(T3) — 全覆蓋 ✅。
- **§4 端點**：list/upload/delete/assign/`/uploads/voice/` 五項皆在 T2 ✅。
- **§7 邊界**：刪檔清指派(T1 `remove`)、播放 404/autoplay→fallback(T7 `.catch`)、空音庫(T5 empty state)、同名覆寫(T1 `save` 直接 write) ✅。
- **§8 安全**：safeName/副檔名/大小/traversal guard(T1,T2) ✅。
- **§9 測試**：自動 store 測(T1,T8)、人工清單(T8) ✅。
- **型別一致**：`makeUploadStore` 回傳 `{save,list,remove,filePath,assign,readAssignments,writeAssignments,safeName}` —— T1 定義、T2 取用一致；FE `voiceFiles`/`voiceAssignments`/`loadVoiceLib`/`renderVoiceLib`/`renderVoiceAssigns`/`playEventSound`/`fallbackChime` 命名跨 T4–T7 一致 ✅。
- **Placeholder 掃描**：無 TBD/TODO；每步含完整 code 或確切指令 ✅。
- **已知 glue 缺口（明示非略過）**：voice 端點 HTTP wiring 與前端走人工煙霧測試（T2 Step3 / T5–T8 人工步驟），因 store 已涵蓋全部邏輯、且 import `index.js` 有重副作用不利單元化。
