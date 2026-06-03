# V1.0.0 Plan — HTML + Tauri 並存（Tauri ⊇ HTML 功能對等）

> Status: planning（未動工，等使用者說「開始實作」）
> Created: 2026-06-03
> 對應 todo：見 `todo.md` 的「V1.0.0」指標

## 0. 目標與限制

- **V1.0.0** = 在現有 HTML 版之外新增 **Tauri 桌面版**，兩者**並存**。
- **對等規則（硬性）**：**HTML 有的功能，Tauri 一定都要有**（Tauri ⊇ HTML）。
  - Tauri 可額外有 native-only 能力（tray / 通知按鈕 / 全域熱鍵 / 更快的視窗動作），但**不得缺 HTML 任何功能**。
- 不破壞現有 HTML 版（純瀏覽器使用者照常用）。
- 版本語意：現在 0.1.x 累積功能；當 Tauri 版能與 HTML 對等並出貨時，發 **1.0.0**。

## 1. 核心策略：用「單一 UI + 單一後端」由構造保證對等

整個計畫的關鍵決定 —— 不靠人工紀律維持對等，而是讓兩版**根本是同一份程式**：

- **共用同一份 UI**：`Claude_Sessions_Dashboard.html`（含 CSS/JS）是唯一 UI 來源。
  - HTML 版 = 瀏覽器開 Node server 的頁面（現狀）。
  - Tauri 版 = Tauri webview **載入同一份 HTML**。
  - → 新增任何 UI 功能 = 兩版同時擁有（同一個檔），對等自動成立。
- **共用同一個後端**：現有 Node server（`server/`，含 `parse-state.js`、JsonlTailer、`/api/*`、WS）**不重寫**。
  - Tauri 版把 Node server 當 **sidecar** 啟動，webview 連 `127.0.0.1:<port>`。
  - → 狀態偵測、`/clear` 遷移、quota、sidecar 等邏輯一份，兩版共用，零分岔。

## 2. 對等「不靠紀律」維持：feature-detect host + 漸進增強

UI 同一份，但部分動作在 Tauri 下可走更快/更強的 native 路徑。用 host 偵測 + fallback：

```js
// 同一份 UI 檔內
const host = window.__TAURI__ ? tauriAdapter : browserAdapter;
host.focusWindow(sid);   // Tauri → windows-rs；瀏覽器 → POST /api/.../focus（PowerShell）
host.flash(sid);
host.sendPrompt(sid, t); // Tauri → SendInput；瀏覽器 → 現有 clipboard+SendKeys
host.notify(payload);    // Tauri → 原生 Toast（可帶按鈕）；瀏覽器 → Notification API
```

- Tauri：`#[tauri::command]` 走 windows-rs / native toast / tray / 熱鍵。
- 純瀏覽器：走現有 server→PowerShell + 瀏覽器通知。
- 同一個 UI、兩條路徑、功能都在 → **Tauri 必然 ⊇ HTML**，且 Tauri 拿到 native 加成。
- **鐵律**：UI 共用檔內任何動作都必須有 browser fallback，禁止寫死「只有 Tauri 能跑」的 UI 路徑（否則純瀏覽器版會缺功能）。

## 3. 倉庫結構（新增，不動現有）

```
claude_mgmt/
  server/                          # 現有 Node 後端，不動（兩版共用）
  Claude_Sessions_Dashboard.html   # 現有 UI，不動（兩版共用；加 host adapter 層）
  src-tauri/                       # 新增：Tauri (Rust)
    tauri.conf.json                # webview 指向 sidecar；sidecar = node
    src/
      main.rs                      # 視窗 / tray / 啟動 Node sidecar
      window_actions.rs            # windows-rs: focus/flash/send-input/enum-windows
      notify.rs                    # 原生 Toast（按鈕 → approve/focus/terminate）
      hotkeys.rs                   # 全域熱鍵（跳下一個待決…）
      commands.rs                  # #[tauri::command] 供前端 invoke
    binaries/                      # 打包用的 node sidecar
  PLAN-v1.0.0-tauri.md             # 本檔
```

## 4. 階段里程碑（每階段都可用、可回退）

- **M0 — 對等基準線盤點**：把 HTML 現有全部功能列成清單（見 §6），當 Tauri 必達 checklist + 回歸清單。
- **M0.5 — 零 build 模組化（共用 UI 先整理乾淨，Tauri 動工前）**：把 `Claude_Sessions_Dashboard.html` 用**原生 ES modules + 外部 CSS** 拆檔，**不引入 build step、不上框架**，在它（共用 UI）繼續變大前先模組化。
  - 建議結構：HTML 只留 markup 殼 + `<link rel=stylesheet href="ui/styles.css">` + `<script type="module" src="ui/app.js">`；JS 拆 `ui/{app,ws,render,status,host,actions,notify,settings,util}.js`。
  - 其中 **`ui/host.js` 就是 §2 的 host adapter（`window.__TAURI__` 偵測）集中處** —— 模組化讓 Tauri/瀏覽器雙路徑更乾淨，是 V1 的助力不是阻力。
  - 你現有 `renderCard`/`renderSubagent`/`renderConversation` 已是「component（回傳 HTML 的函式）」，多數情況「拆檔」即可；Web Components（`<session-card>`）列為選配、非必要。
  - ⚠️ 注意：ES modules 要走 **HTTP**（Node server / Tauri 協定），**不可 `file://` 直開**（module CORS 會擋）；Node server 要多服務 `ui/` 靜態檔。一次搬一塊 + 瀏覽器 smoke（目前無 UI 測試）。
  - ⚠️ 同步把 `CLAUDE.md` 的「intentionally one self-contained file」條款改成「**單頁、模組化、仍 no-build**」，避免文件自相矛盾。（本次尚未改 CLAUDE.md，留待 M0.5 實作時一起。）
- **M1 — Tauri 殼跑起來（對等即達成）**：Tauri 載入現有 UI + 啟動 Node sidecar。此刻 Tauri 功能 = HTML 功能（同一份 UI + 同一 server），**對等立即成立**。視窗動作先沿用 server→PowerShell（能動就好）。加 tray 常駐 + autostart。
- **M2 — 原生通知（第一個 native 加成）**：Tauri 把 `pushNotif` / 通知權限那條改走原生 Toast，**帶按鈕**（✅核准 / 切到視窗 / 終止）→ 點按鈕 invoke Rust command 對該 sid 動作。瀏覽器版維持現有通知（仍對等，Tauri 是超集）。
- **M3 — 原生視窗動作**：focus / flash / send-prompt / detect-host 在 Tauri 改走 windows-rs，消滅 PowerShell spawn 延遲。瀏覽器版維持 PowerShell 路徑。
- **M4 — native-only 加成**：全域熱鍵（跳下一個 waiting）、tray 選單顯示待決數、開機自啟整合。
- **M5（可選、最後、最高風險）**：是否把資料層移 Rust。**建議：不要**。讓 Node 永久當 sidecar，CP 值最高、`parse-state.js` 那套 tricky 邏輯（status tag 協定、stuck-tool heuristic、`/clear` pidJsonl 歸屬）零回歸風險。

## 5. 對等的維護機制（避免日後分岔）

- UI / 後端**單一來源** → 預設就對等。
- 「Tauri 專屬」程式碼只准放 native adapter / Rust 端；UI 共用檔一律 feature-detect + fallback。
- M0 功能 checklist 當「對等驗收清單」，每次發版兩版各對一次。
- 加 smoke test：純瀏覽器開頁面，確認所有按鈕在沒有 `window.__TAURI__` 時仍可用（fallback 沒斷）。

## 6. 功能對等 checklist（HTML 現有 → Tauri 必達）

- 即時 session 卡片（狀態 / runtime / ctx remain / tokens / sub-agents / conversation history）
- 狀態偵測（notification flag → stuck-tool → status tag → question heuristic）+ `/clear` 遷移
- 手動標記狀態（completed/pending/running/failed）+ custom + reset
- 視窗動作：focus / 開啟對應 IDE、flash 工作列、send-prompt（複製+聚焦+貼上，不自動 Enter）
- terminate（SIGTERM）
- 提醒：OS 通知 + 音效 chime + favicon/title flash + orbit-marquee 動畫
- 設定：啟用通知開關（齒輪）、sound 開關
- topbar：refresh（/api/refresh）、cleanup、new session
- quota 面板（5h / 7d）、ctx remain bar
- filter chips、rename、collapse、hide-history（/clear 起點）

全部因「同一份 UI + 同一 server」自動帶過去；M2/M3 只是把通知 / 視窗動作「升級」成 native，不減功能。

## 7. 風險與待決

- **Node sidecar 打包**：打包 node binary（pkg / node SEA）進 Tauri，還是要求系統有 node？→ 待決。
- **port 衝突**：兩版都連 7878。Tauri sidecar 改用隨機 port 並注入給 webview。→ 待決。
- **視窗動作**：Tauri 要「完全取代」PowerShell，還是 PowerShell 留作 fallback？→ 待決（建議留 fallback）。
- **資料層 Rust 化（M5）**：要不要做？→ 建議否，Node 永久 sidecar。
- **autostart**：由 Tauri 接管，還是沿用現有 VBS / Startup 捷徑？→ 待決。
- **既有 PowerShell 視窗匹配邏輯**（IntelliJ 多視窗 EnumWindows+title 匹配）移到 windows-rs 時要原樣搬，別退化。

## 8. 下一步

- ⚠️ **開工前置 gate（使用者 2026-06-03 指定）**：todo 的 **F18（可攜性 / 降低個人依賴）必須先在 v0.3.x 完成**，才開始 V1.0.0 / Tauri —— 不能在隱性個人依賴（statusline quota、全域 hooks）的地基上蓋散佈版。重點：ctx remain 改成從原生 JSONL 自算、quota 走文件 / setup-prompt + 缺檔優雅降級。
- 之後等使用者說「開始實作 M1」再動工。M1 完成即達成「HTML + Tauri 並存且對等」的最小可出貨狀態。
