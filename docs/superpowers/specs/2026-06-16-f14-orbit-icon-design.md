# F14 可上傳 orbit icon + 圖庫 — 設計 spec

> **Status**: 設計核准（2026-06-16 brainstorming），待寫 implementation plan
> **目標版本**: v0.2.3（與 F13 + 已修 BF 同發）
> **前置**: F13（`makeUploadStore` 共通上傳後端）已實作並人工驗收通過（2026-06-16）
> **本 spec 推翻 F13 spec 兩處假設**：見 §11。

## 1. 目標與範圍

把卡片「亮」（needs-attention）時沿框繞圈的純光點，升級成「可選擇上傳 icon 騎在光暈亮頭上一起繞」。icon 走圖庫管理（多張上傳 / 挑選 / 刪除），三狀態（waiting / completed / failed）各可指派一張，**未指派則維持現況純光點（一個 byte 都不動）**。直接複用 F13 建好的 `makeUploadStore`，以 `subdir:'pic'` 開第二個媒體類別。

- **範圍內**：pic 上傳 / 圖庫管理（列出、預覽、刪除）/ 三狀態指派（含「（光點）」預設）/ orbit `<img>` 沿框繞圈動畫（上大下小、貼亮頭、hover 淡出、動圖播放）/ 把 F13 sound modal 合併成單一「提醒設定」modal。
- **範圍外（非目標 / YAGNI）**：per-session icon（只做 per-status 全域）；icon 依狀態 filter 重新上色（raster 難套，狀態色已由 conic 尾巴表達）；拖放排序 / 裁切 / 縮圖快取；雲端同步；改動「沒指派」時的現有 conic 機制。

## 2. 現況（程式碼錨點）

- **orbit 光點**：`web/ui/styles.css:307-351` —— `@property --orbit-angle` + `.card.needs-attention::before`（conic-gradient 假元素，遮罩成周長環）+ `@keyframes orbit-marquee`（0%→100% 驅動 `--orbit-angle` 0→360deg，per-edge 變速）。**沒有真 DOM 元素**，塞不了 `<img>`。
- **狀態色**：`styles.css:315-317` —— `--orbit-color` 預設 `--success`（completed），`.is-waiting`→`--waiting`，`.is-failed-state`→`--error`。
- **「亮」判定**：`app.js:696` —— `attentionSids.has(s.sid) && status !== 'running' ? 'needs-attention' : ''`。加/移除 class 在 `app.js:984-985`（hover 確認後移除）。
- **狀態轉移觸發**：`app.js:~890-905`（next === waiting/completed/failed 時播音 + flash）。
- **hover 淡出**：`styles.css:341` —— `.card.needs-attention:hover::before { opacity:0 }`。
- **F13 上傳後端**：`server/lib/uploads.js`（`makeUploadStore` 工廠，已支援 `subdir`/`allowExt`/`maxBytes`/`events`）。voice 實例 + 路由 `server/index.js:15-22`、`:382-462+`。
- **F13 FE**：sound modal 開關 `app.js:196-205`；音庫 state/render `app.js:206-299`；on-load 預抓 `app.js:1473-1477`；`playEventSound` `app.js:105-110`；markup `#sound-modal`/`#sound-settings-btn`/`#sound-close`（`dashboard.html`）。
- **Server 路由範式**：vanilla `http.createServer`（`server/index.js`），每端點一 `if(method && pathname)` 區塊；`/ui/` 與 `/uploads/voice/` 皆有 path-traversal guard。**全 repo 只依賴 `ws`，不得加套件。**
- **`uploads/` 已 gitignored**（F13 加的 `/uploads/`），`uploads/pic/` 自動涵蓋。

## 3. 已核准決策（brainstorming 2026-06-16）

1. **icon 與光暈關係 = 疊加，保留狀態色**：現有 conic 狀態色尾巴**不變**；有指派 icon 時 `<img>` 疊在亮頭上一起繞。icon 純裝飾、不再背負表達狀態的責任。
2. **記憶層級 = per-status，預設 = 光點**：waiting / completed / failed 各可指派一張 icon（鏡射 F13 三事件指派）；某狀態**未指派 → 維持現況純 conic 光點，機制完全不碰**。
3. **UI = 合併單一「提醒設定」modal，分區塊**：把 F13 `#sound-modal` 升級成「提醒設定」modal，內含「鈴聲」「Orbit icon」兩區上下堆疊；topbar 維持**一顆**鈕。（推翻 F13 spec §3「voice/pic 各自獨立 modal + 各自 topbar 鈕」—— 見 §11。）
4. **orbit 機制 = 方案 B（最少改動）**：conic **永遠不動**（沒圖＝現況）；只有某狀態有指派 icon 時，才在卡片內加一個真的 `<img class="orbit-icon">`，用 CSS `offset-path` 沿圓角矩形周長繞，`offset-distance` 影格**時間對齊** `orbit-marquee` 的節點（0 / 40 / 61.5 / 79 / 100% ↔ 上 / 右 / 下 / 左 邊中點）→ icon 在四個邊中點跟亮頭貼齊，只剩轉角之間極小偏移（裝飾用途可接受）。**放棄方案 A**（重做尾巴成周長漸層）以免「沒圖」也得切到新機制、或兩套尾巴並存。
5. **尺寸隨位置 = 上大下小**：`scale` keyframe 在同節點變化 —— 上最大（≈ 卡片標題字級）、右/左中等、下最小；沿用現有「上慢→下快」變速。
6. **格式 + 大小**：接受 `png / jpg / jpeg / gif / webp / svg`，單檔上限 **2 MB**。動圖：GIF / WebP 進 `<img>` 自然播放，APNG 用 `.png`，SVG 經 `<img>` 不執行 script（單機 localhost 可接受）。
7. **儲存**：server 端 `uploads/pic/`（gitignored）+ `uploads/pic/assignments.json`（`{waiting,completed,failed}` → 檔名或 `null`，`null` = 光點）。

## 4. 架構與元件

### 4.1 資料層 — 複用 `server/lib/uploads.js`（不改）

`makeUploadStore` 已是泛型，直接開第二實例：

```js
const PIC_MAX_BYTES = 2 * 1024 * 1024;
const picStore = makeUploadStore({
  subdir: 'pic',
  allowExt: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
  maxBytes: PIC_MAX_BYTES,
  events: ['waiting', 'completed', 'failed'],
});
```

> `makeUploadStore` 現有 `save/list/remove/filePath/assign/readAssignments/writeAssignments/safeName` 全部沿用；`assign` 已驗 `event ∈ events`、檔案存在或 `null`。**本 spec 不需改 uploads.js**。

### 4.2 Server 端點 — `server/index.js`（新增區塊，鏡射 F13 voice 區）

| Method | Path | 行為 |
| ------ | ---- | ---- |
| GET  | `/api/pic/list` | `{ files:[{name,size,mtime}], assignments:{waiting,completed,failed} }` |
| POST | `/api/pic/upload?name=<fn>` | raw body → 驗副檔名/大小 → `picStore.save` → `{ ok, file }`；違規 400 |
| POST | `/api/pic/delete` | body `{name}` → `remove` + 連帶清指派 → `{ ok, assignments }` |
| POST | `/api/pic/assign` | body `{event, name\|null}` → `picStore.assign` → `{ ok, assignments }` |
| GET  | `/uploads/pic/<fn>` | 服務圖檔（依副檔名給 `image/png\|jpeg\|gif\|webp\|svg+xml`），traversal guard 仿 `/uploads/voice/` |

> 與 voice 區唯一差別：store 實例、Content-Type 對照表（圖片 MIME）。可考慮把 voice/pic 兩組薄包抽成一個 `makeUploadRoutes(store, urlBase, mimeOf)` helper 減重複（實作時若 voice 區搬動風險低再做；否則照抄即可，優先不破壞剛驗收的 F13）。

### 4.3 FE — `web/dashboard.html` + `web/ui/app.js` + `web/ui/styles.css`

**(a) modal 合併（dashboard.html）**
- `#sound-modal` → 改標題「提醒設定」；內容包成兩個 `<section>`：
  - `鈴聲` section = 現有 F13 markup 原封搬入。
  - `Orbit icon` section = 鏡射結構：圖庫列表容器 + 上傳 input + 三狀態指派 `<select>`（選項 = 圖庫檔名 + 「（光點）」）。
- topbar 那顆鈕（`#sound-settings-btn`）保留單顆；icon 可改通用（⚙️ 或保留 🔔，實作時定）。

**(b) 圖庫 state + render（app.js，鏡射 voice 區）**
- 模組變數 `picFiles` / `picAssignments`；`loadPicLib()`（fetch `/api/pic/list`）、`renderPicLib()`（縮圖列表，每項 `<img>` 預覽 + 🗑 刪除 + 目前指派標示）、上傳 handler、三狀態 `<select>` change → POST `/api/pic/assign`。
- on-load 預抓（鏡射 `app.js:1473`）：開 modal 前卡片就能用指派 icon。

**(c) orbit icon 動畫（核心，styles.css + app.js）**
- **markup**：卡片模板加 `<img class="orbit-icon" alt="" hidden>`（放在卡片內、`::before` 同層級之上）。
- **掛載時機（app.js）**：卡片進入 needs-attention（`app.js:984` 附近）時，依當前 status X 取 `picAssignments[X]`：
  - 有值 → `img.src = '/uploads/pic/' + encodeURIComponent(name)`；移除 `hidden`。
  - `null`/無 → 保持 `hidden`（只剩 conic 光點，現況）。
  - 清除 needs-attention（`app.js:985`）時 → 加回 `hidden`、清 src。
- **CSS**：
  - `.card.needs-attention .orbit-icon:not([hidden])` 啟動動畫：`offset-path`（沿 `inset(-3px round calc(var(--radius)+3px))` 之類的圓角矩形周長，實作時 in-browser 微調）、`offset-distance` 0→100% 動畫、`offset-rotate: 0deg`（icon 不隨切線轉，保持正立）。
  - **時間對齊**：`offset-distance` 與 `scale` 的 keyframe 用與 `orbit-marquee` **相同的 %節點與同 2.8s 同 timing-function**，使 icon 在上/右/下/左跟亮頭貼齊。
  - **上大下小**：`scale` keyframe 0%=1.0（上，≈標題字級對應的 base size，如 22px）/ 40%=~0.7（右）/ 61.5%=~0.5（下）/ 79%=~0.7（左）/ 100%=1.0。實際數值實作時調。
  - **hover 淡出**：`.card.needs-attention:hover .orbit-icon { opacity:0 }`（與既有 `::before` 一致）。
  - `pointer-events:none`、`z-index` 高於 `::before`。

## 5. 資料流

- **上傳**：FE file input → POST raw `/api/pic/upload` → `picStore.save` → FE 重抓 list。
- **指派**：FE `<select>` change → POST `/api/pic/assign` → 寫 `assignments.json` → FE 更新 `picAssignments`。
- **顯示**：WS 狀態 → 卡片進 needs-attention → 依 status 設 `orbit-icon` src/hidden → CSS 沿框繞圈（有圖）或純 conic 光點（無圖）。

## 6. 資料格式

- 檔案：`uploads/pic/<sanitized 原檔名>`。
- 指派：`uploads/pic/assignments.json` = e.g. `{"waiting":"bell.gif","completed":null,"failed":"x.png"}`（`null` = 光點）。

## 7. 邊界與錯誤處理

- **指派指向已刪檔**：delete 連帶清指派（`makeUploadStore.remove` 已做）；FE `<img>` 載入失敗 → `onerror` 加回 `hidden`（退回光點），不破版。
- **上傳同名**：覆寫（視為更新）。
- **空圖庫**：指派下拉只有「（光點）」。
- **後端不可寫**：端點 500 + FE toast（鏡射 F13）。
- **動圖很大 / 解碼慢**：2 MB 上限擋；`<img>` 自行處理播放，失敗退 hidden。
- **needs-attention 期間 status 改變**（waiting→failed 等）：重設 src 對應新 status 的指派（掛載邏輯吃當前 status）。

## 8. 安全

- 綁 127.0.0.1（既有）。
- 檔名 sanitize（`makeUploadStore.safeName`：basename + 拒分隔符 / `..`）、副檔名 allowlist、2 MB 上限。
- 服務圖檔走與 `/uploads/voice/` 相同 traversal guard。
- SVG 只經 `<img src>` 載入（非 inline / 非 `<object>`）→ 不執行內嵌 script；單機 localhost 單一使用者，風險可接受。
- 不解析、不執行上傳內容。

## 9. 測試策略

**自動（node:test，仿 `server/test/uploads.test.js`）**：
- pic store 實例：`assign` 三狀態（waiting/completed/failed）寫入成功；非法 event → 拒；指向不存在檔 → 拒；`null` 清空。
- `save`：合法副檔名（png/jpg/gif/webp/svg）成功；非法副檔名 / >2 MB → 拒。
- 檔名 sanitize：`../x.png`、`a/b.png` → 拒。
- `delete`：移檔 + 連帶清該指派。
- 檔案服務：`/uploads/pic/x.png` 回正確 image MIME；`../` traversal → 403。

**人工（動畫/視覺 FE 難自動測，明列 —— 見 memory `feedback-bugfix-needs-test`）**：
1. 開「提醒設定」modal →「鈴聲」「Orbit icon」兩區都在；鈴聲功能未回歸（上傳/試聽/指派照舊）。
2. 上傳一張 png → 出現在圖庫（縮圖）。
3. 指派給 completed → 觸發 session 完成 → icon 沿框繞圈、騎在綠色亮頭上、上大下小、上慢下快。
4. 某狀態不指派 → 觸發 → **只有純 conic 光點（現況），無 icon**。
5. 上傳 GIF/WebP 動圖 → 指派 → 繞圈時動圖有在動。
6. hover 卡片 → icon + 光暈一起淡出。
7. 🗑 刪除 → 從圖庫 + 指派消失；該狀態退回光點。
8. reload dashboard → 指派保留（assignments.json）。
9. 上傳 >2 MB / `.txt` → 被擋 + 提示。
10. （回歸）running 中不顯示 icon（只在「亮」時）。

## 10. 實作順序建議（細節留給 writing-plans）

1. 後端：`picStore` + `/api/pic/*` + `/uploads/pic/` 路由（鏡射 voice），補 store 測試。
2. FE 資料層：`picFiles`/`picAssignments` + load/render/upload/delete/assign + on-load 預抓。
3. modal 合併：`#sound-modal` → 「提醒設定」兩區塊（先確保鈴聲不回歸）。
4. orbit 動畫：`<img class="orbit-icon">` + offset-path/scale CSS + 掛載/卸載邏輯；in-browser 微調貼合與尺寸。
5. 人工驗收清單跑過 → 與 F13 + BF 一起 release v0.2.3。

## 11. 推翻 F13 spec 的假設（記錄）

- **F13 spec §3.2 / §2「voice 與 pic 分立、各自 modal + 各自 topbar 鈕」** → 本 spec 改為**合併單一「提醒設定」modal、單顆 topbar 鈕**（使用者 2026-06-16 決定）。
- **F13 spec §10「pic 用單槽 `selectedId`」** → 本 spec 改為**三狀態 assignments**（與 voice 同模型，`null`=光點），非單槽。

## 12. 實作注意

- `uploads/` 已在 `.gitignore`（F13），`uploads/pic/` 自動涵蓋，無需再加。
- **不破壞剛驗收的 F13**：modal 合併時鈴聲區 markup/handler 原封搬移，先驗鈴聲不回歸再加 icon 區。
- 不碰「沒指派」時的現有 conic 機制（方案 B 的前提）。
- orbit `<img>` 的 `offset-path` 起點 / `offset-rotate` / scale 數值是**視覺參數**，in-browser 調到貼合即可，不必在 plan 寫死。
