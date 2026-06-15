# F13 自訂通知鈴聲 — 設計 spec

> **Status**: 設計核准（2026-06-15 brainstorming），待寫 implementation plan
> **目標版本**: v0.2.3（與 F14 + 已修 BF 同發）
> **前置**: brainstorming 已逐題核准（見下方「已核准決策」）

## 1. 目標與範圍

讓使用者上傳自訂音檔，指派給三個通知事件（waiting / completed / failed），補強目前的 Web Audio 合成音。未指派的事件 **fallback 回現有合成音**。順手把「檔案上傳基礎設施」建好，F14（自訂 orbit icon 圖庫）沿用同一套（`uploads/pic/`）。

- **範圍內**：voice 上傳 / 音庫管理（列出、試聽、刪除）/ 三事件指派 / 播放整合 / `soundOn` 持久化 / 共通上傳後端。
- **範圍外（非目標 / YAGNI）**：F14 picture 本身（只共用基礎設施，不實作 pic UI）；per-session 鈴聲（只做全域）；音量 / 淡入淡出 / 波形編輯；格式轉換；雲端同步。

## 2. 現況（程式碼錨點）

- 合成音：`web/ui/app.js:66-97` —— `audioCtx` / `soundOn`（**未持久化**，預設 `true`）/ `playTones()` / `chime()`（waiting）/ `chimeCompletion()` / `chimeFailure()`。
- 觸發點：狀態轉移區 `app.js:~760-775`，依新狀態呼叫 `chime()` / `chimeCompletion()` / `chimeFailure()`。
- 全域 mute 鈕：`#sound-toggle`（`app.js:166-171` + `dashboard.html:38-40`）—— 切 `soundOn`，**未存 localStorage**。
- 持久化範式：`notifyOn` 用 localStorage（`app.js:69, 216-224`）。
- Modal 範式：`#fs-modal`（`dashboard.html:126-154` + `app.js:1253+`）—— sidebar + 主區 + foot，最適合仿。
- Server 路由範式：vanilla `http.createServer`（`server/index.js:246+`），每端點一個 `if (method && pathname)` 區塊、回 JSON；靜態 `/ui/` 服務含 path-traversal guard（`:265-281`）。**全 repo 只依賴 `ws`，不得加 multipart 套件。**

## 3. 已核准決策（brainstorming 2026-06-15）

1. **粒度**：三事件各一槽 + fallback。waiting / completed / failed 各可指派一個音檔；未指派沿用合成音。
2. **容器 / 入口**：topbar 新增 🔔 鈴聲鈕（`#sound-settings-btn`，SVG icon 與既有 🔊 mute 鈕**視覺區分**）→ 開獨立 `#sound-modal`（仿 `fs-modal`，**只管 voice**）。
3. **voice 與 pic 分立**：各自獨立 modal + 各自 topbar 鈕（F14 之後加 🖼 鈕 + pic modal）；但**上傳 / 列表 / 刪除 / 檔案服務後端抽共通**，F14 沿用。
4. **儲存位置**：server 端，repo 根 `uploads/voice/`（**gitignored**）。⚠️ 這是對 CLAUDE.md「所有路徑走 `~/.claude/`」慣例的**刻意、範圍性例外**：使用者上傳內容（非 session 狀態檔）跟著 app 走、自成一區、免被 `cleanupStaleFiles` 掃到。
5. **格式 + 大小**：接受 `mp3 / wav / ogg`，單檔上限 **2 MB**。
6. **上傳機制**：**raw-body POST**（不用 `multipart/form-data`，避免加套件）—— 檔名走 query param，body 是原始位元組。
7. **指派儲存**：server JSON `uploads/voice/assignments.json`（`{waiting, completed, failed}` → 檔名或 `null`），跨瀏覽器保留。
8. **播放**：`new Audio(url)` 指向 server URL；沒指派 fallback 合成音。
9. **試聽**：音庫每項一個 ▶ 鈕。
10. **soundOn 持久化**：順手存 localStorage（與 `notifyOn` 對稱）。

## 4. 架構與元件

### 4.1 共通上傳後端 — `server/lib/uploads.js`（新檔）

單一職責：管理一個「媒體類別」目錄（voice / 之後 pic）的 CRUD。匯出工廠：

```
makeUploadStore({ subdir, allowExt, maxBytes }) → {
  save(name, buf),        // 驗證副檔名/大小 → 寫檔（同名覆寫＝更新）
  list(),                 // [{ name, size, mtime }]
  remove(name),           // 刪檔
  filePath(name),         // 解析絕對路徑（給檔案服務端點）
  readAssignments(),      // { ... }，缺檔回 {}
  writeAssignments(map),  // 寫 <dir>/assignments.json
}
```

- 根目錄：`path.join(__dirname, '..', '..', 'uploads', subdir)`，模組載入時 `fs.mkdirSync(recursive:true)`。
- 檔名 sanitize：`path.basename(name)`，拒含 `/ \ ..`、拒非 `allowExt` 副檔名。
- `save` 驗證 `buf.length ≤ maxBytes`。

### 4.2 Server 端點 — `server/index.js`（新增區塊，仿既有 POST 範式）

| Method | Path | 行為 |
| ------ | ---- | ---- |
| GET  | `/api/voice/list` | `{ files:[{name,size,mtime}], assignments:{waiting,completed,failed} }` |
| POST | `/api/voice/upload?name=<fn>` | raw body → 驗副檔名/大小 → `save` → `{ ok, file }`；違規 400 |
| POST | `/api/voice/delete` | body `{name}` → `remove` + 若被指派則清該指派 → `{ ok, assignments }` |
| POST | `/api/voice/assign` | body `{event, name\|null}` → 驗 `event ∈ {waiting,completed,failed}`、name 存在或 null → 寫 assignments → `{ ok, assignments }` |
| GET  | `/uploads/voice/<fn>` | 服務音檔（`audio/mpeg\|wav\|ogg`），path-traversal guard 仿 `/ui/` |

> 以上 voice 專屬端點是共通 store 的**薄包**；F14 複製成 `/api/pic/*` + `/uploads/pic/`。

### 4.3 FE — `web/ui/app.js` + `web/dashboard.html` + `web/ui/styles.css`

- **topbar**：`#sound-settings-btn`（🔔，放 `#sound-toggle` 旁；SVG 與喇叭明顯不同）。
- **`#sound-modal`**（仿 fs-modal markup）：標題「鈴聲設定」；主體＝
  - **音庫區**：list（fetch `/api/voice/list`）+ 上傳鈕 + 每項 `▶`（試聽）/ `🗑`（刪除）。
  - **指派區**：waiting / completed / failed 三個 `<select>`，選項＝音庫檔名 + 「（預設合成音）」。
- **狀態**：模組變數 `voiceAssignments`（fetch 載入；upload/delete/assign 後重抓）。
- **播放整合**：新增 `playEventSound(event)` —— `soundOn` 為真時，若 `voiceAssignments[event]` 有值 → `new Audio('/uploads/voice/'+name).play()`，否則 fallback 對應 `chime*()`。把 `app.js:~760-775` 三處呼叫換成 `playEventSound('waiting'|'completed'|'failed')`。
- **上傳**：`<input type=file accept=".mp3,.wav,.ogg">` → `fetch('/api/voice/upload?name='+encodeURIComponent(file.name), {method:'POST', body:file})`（raw）。FE 先擋 >2 MB / 非允許副檔名（後端再擋一次）。
- **試聽**：每項 ▶ → `new Audio('/uploads/voice/'+name).play()`。
- **soundOn 持久化**：載入時 `localStorage.getItem('soundOn')`，toggle 時寫回（`app.js:68, 166-171`）。

## 5. 資料流

- **上傳**：FE file input → POST raw → `uploads.save` → 寫檔 → FE 重抓 list。
- **指派**：FE `<select>` change → POST assign → 寫 `assignments.json` → FE 更新 `voiceAssignments`。
- **播放**：WS 狀態轉移 → `playEventSound(event)` → 有指派播 `<audio>`(server URL) / 否則合成音。

## 6. 資料格式

- 檔案：`uploads/voice/<sanitized 原檔名>`。
- 指派：`uploads/voice/assignments.json` = `{"waiting":"ding.mp3","completed":null,"failed":"alert.wav"}`。
- soundOn：localStorage key `'soundOn'`（`'true'` / `'false'`）。

## 7. 邊界與錯誤處理

- **指派指向已刪檔**：delete 連帶清指派，理論上不留 dangling；FE 播放若 404 → catch → fallback 合成音（保險）。
- **上傳同名**：覆寫（視為更新）。
- **空音庫**：指派下拉只有「（預設合成音）」。
- **後端不可寫（權限）**：端點回 500 + FE toast。
- **音檔解碼失敗 / `play()` 被瀏覽器擋（autoplay 政策）**：catch，靜默或 fallback；既有合成音也受同樣 autoplay 限制，行為一致。

## 8. 安全

- 綁 127.0.0.1（既有）。
- 檔名 sanitize（basename + 拒分隔符 / `..`）、副檔名 allowlist、大小上限 → 防 path traversal / 塞爆磁碟。
- 服務音檔走與 `/ui/` 相同 traversal guard。
- 不執行、不解析上傳內容（只當 static 餵 `<audio>`）。

## 9. 測試策略

**自動（node:test，仿 `server/test/*.test.js`）** —— 針對共通 store + 端點：

- `save`：合法副檔名寫入成功；非法副檔名 / 超過 2 MB → 拒。
- 檔名 sanitize：`../x.mp3`、`a/b.mp3` → 拒或 basename 化。
- `list`：回傳含已存檔 + assignments。
- `assign`：合法 event 寫入；非法 event / 指向不存在檔 → 拒。
- `delete`：移除檔 + 連帶清該指派。
- 檔案服務：`/uploads/voice/x.mp3` 回正確 Content-Type；`../` traversal → 403。

**人工（FE 難自動測，明列 —— 見 memory `feedback-bugfix-needs-test`）**：

1. 開 🔔 modal → 上傳一個 mp3 → 出現在音庫。
2. 指派給「completed」→ 觸發一個 session 完成 → 聽到自訂音。
3. 某事件不指派 → 觸發 → 聽到原合成音（fallback）。
4. ▶ 試聽可播；🗑 刪除後從音庫 + 指派消失。
5. 關 🔊 mute → 不播任何音。
6. reload dashboard → soundOn 狀態 + 指派都保留。
7. 上傳 >2 MB / `.txt` → 被擋 + 提示。

## 10. 對 F14 的交接

共通 store（`makeUploadStore`）+ `/uploads/<sub>/` 服務 + raw POST 範式，F14 以 `subdir:'pic'`、`allowExt:[png,jpg,gif,webp,svg,apng]` 複用；pic 的「選用記憶」對應 voice 的 `assignments.json`（單槽：`selectedId`）。

## 11. 實作注意

- `uploads/` 建立後**必須加進 `.gitignore`**（`/uploads/`）—— 上傳內容不進 git。
- 不破壞既有 `#sound-toggle`（全域 mute）；新鈕只開 modal，不取代 mute。
