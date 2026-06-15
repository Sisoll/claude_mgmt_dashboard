# Dashboard TODO

> **運作方式**：新需求先進此檔。Claude **不主動實作**，等明確說「開始實作 / 做 <ID>」才動手。
> **讀取規則**：平常只讀下方「Roadmap」即可，**不要讀全份**；要動某項時再讀該項 Details。
> **完成後**：發版時把該項從本檔移除，寫進 `bugfix.md` / `feature.md`（見 `release` skill）。
> **標記**：`[BUG]` = 修錯行為；`[FEAT]` = 新功能或改善。
> **目標版本**：v0.2.2（F15 語音輸入 + F16 自動核准 build/test + F21 新 session）已發。後續見下方 **v0.2.x**（個人客製化）。
> **大版規劃**：**V1.0.0 = HTML + Tauri 並存且功能對等（Tauri ⊇ HTML）** → 詳見 [`PLAN-v1.0.0-tauri.md`](PLAN-v1.0.0-tauri.md)（未動工）。

## Roadmap（依版本分配）

> 原則：每版聚焦一主題、約 2–4 項，不包山包海。`✅`＝已完成待 commit/release。
> `[BUG]` 基本歸「當下版本」修；`[FEAT]` 分散到後續版本。詳情看下方 Details。

### v0.2.x — 個人客製化 / 設定（提高使用者黏著度）
> 主軸：讓 dashboard 變「你的」—— 客製化鈴聲 / icon、個人開關設定，黏著度↑。

#### v0.2.3 — 提醒客製化（+ v0.2.2 後 bugfix）
> 使用者 2026-06-11 定：v0.2.3 = **FE（F13/F14）+ BF（已修的 #11/#12/#13/#9）**，bugfix 不另發 patch、與 F13/F14 同發。
- F13 `[FEAT]` 自訂通知鈴聲（上傳音檔）
- F14 `[FEAT]` orbit icon + 圖庫（多張/挑選/刪除/記住上次/只在「亮」時/支援動圖）
- 🩹 BF（已實作待 commit）：#11 `./mvnw` 白名單、#12 `-cp` 誤擋、#13 引號內 `;`/`|` 分段、#9 setAab 雙 GET —— 隨 v0.2.3 一起發

### v0.3 — 可攜性完成 / 安裝器 / 能力偵測（V1.0.0 前置 gate）
> 主軸：把「可勾選安裝 hooks + 沒裝就自動關功能」做成框架，補完 F18 起的可攜性地基。
> 這是 PLAN §8 指定「V1.0.0 開工前必過」的 gate；**同一套能力偵測 V1.0.0 沿用解「native 在不在」**。吸收原 V1.0.0 M0。
> 順序由使用者 2026-06-09 定：**框架先（v0.3）→ Tauri（V1.0.0）**。
- F22 `[FEAT]` 可勾選安裝器（`install-hooks.ps1` 一般化：選擇安裝/設定哪些 dashboard hook / statusline / settings.json 掛法）
- F23 `[FEAT]` 能力偵測 + 自動 gate（feature registry：功能↔依賴；缺依賴→功能變灰/隱藏/提示；F16 專屬 gate 退役改吃這套；吸收 V1.0.0 M0 盤點）
- CR#8  `[BUG]` `launchClaudeSession` 硬寫 `C:\Program Files\Git\…`，Scoop/winget/自訂 Git 會失敗且吞錯 → 改用 `ProgramFiles`/`ProgramW6432` 探測（`server/index.js`）。屬可攜性，與 F22 同場修。
- CR#6  `[BUG]` `server/lib/fslist.js` `computeDrives` 用 `execFileSync`(4s timeout) 阻塞 event loop；FE on-load prefetch 可能搶在 `setImmediate` prewarm 前 → 改 `execFile`(async) + 立即回 `C:\`+cwd fallback。
- CR#10 `[BUG]` `server/index.js` launch 一律回 `{ok:true}`；`wt` 非 0 退出（profile 壞）沒視窗卻顯示成功 → 至少 log，最好回報失敗。

### 未定版（floating）
- B4  `[BUG]` ⛔ 偶發狀態回歸 —— 需 repro，重現才排進版本
- F24 `[FEAT]` 🌙 dark mode（FE UI 深色主題切換）—— 待定版，建議 v0.2.x 外觀客製化；需先 brainstorming（見 Details）
- F25 `[FEAT]` 🔆 亮度 / 調暗 slider（可拉動 bar 調整整體亮度，主要背景，文字同步微暗但仍清晰）—— 獨立 FE，與 F24 同屬外觀客製化；需先 brainstorming（見 Details）
- CR#15 `[CLEANUP]` `web/ui/app.js` `fs.drives` 寫進 localStorage 但從不讀（dead state）；`server/index.js` git-bash 路徑探測 + inline `require` 重複 → 清理。
- CR#14 `[BUG]` `server/test/win-helpers.test.js` B5 用固定 pid + 模組級 `detectCache` 不重置 → `--test --watch` 第二輪 fail；hook 測試缺 bash/jq skip guard → 補重置 + skip guard。
- B5  `[BUG]` 「執行中」卡片缺藍色漸層底 + 外框轉圈動畫（視覺回歸；需確認何時/哪次改動弄丟）—— 2026-06-15 記，先 park 未定版
- F26 `[FEAT]` 手動覆寫/給狀態時記錄當下 session 內容 → 累積「內容↔狀態」動態 map，未來關鍵字判斷「狀態」時參考（heuristic 增強）—— 需先 brainstorming；2026-06-15 記

### V1.0.0 — HTML + Tauri 並存且對等（大版，獨立 track）
→ 詳見 [`PLAN-v1.0.0-tauri.md`](PLAN-v1.0.0-tauri.md)
- M0   ➡️ **移轉 v0.3／F23** —— 對等基準線盤點（HTML 功能 checklist）改由 v0.3 feature registry 一併產出結構化版本，V1.0.0 直接沿用
- M0.5 ✅ 零 build 模組化（v0.1.5 已完成 externalize：`web/ui/{styles.css,app.js}` + 改 CLAUDE.md 單檔條款；細拆 ws/render/status/host/… 待後續增量）
- M1   Tauri 殼 + Node sidecar（對等即達成）+ tray
- M2   原生 Toast 通知（帶按鈕）
- M3   windows-rs 視窗動作（消滅 PowerShell spawn）
- M4   全域熱鍵 / tray 待決數
- M5   （建議不做）資料層 Rust 化

---

## Details

### F13 `[FEAT]` 自訂通知鈴聲（可上傳音檔）
- ✅ **設計已定案 → 見 spec [`superpowers/specs/2026-06-15-f13-custom-sound-design.md`](superpowers/specs/2026-06-15-f13-custom-sound-design.md)**（2026-06-15 brainstorming 核准）。
- 摘要：topbar 新增 🔔 鈴聲鈕 → 獨立 sound modal（仿 `fs-modal`）；三事件（waiting/completed/failed）各可從「音庫」指派一個音檔，未指派 fallback 回現有合成音（`app.js:95-97`）。音檔存 repo 根 `uploads/voice/`（gitignored），上傳走 raw-body POST（不加 multipart 依賴），指派 map 存 server JSON（`assignments.json`）。播放用 `<audio>`+server URL。`soundOn` 順手持久化 localStorage。上傳/列表/刪除/檔案服務後端抽共通（`makeUploadStore`），F14 沿用 `uploads/pic/`。
- 可行性：✅ 直接做得到。下一步：使用者複審 spec → `writing-plans`。

### F14 `[FEAT]` orbit-marquee 改成可上傳 icon（沿框繞圈、上大下小）+ icon 圖庫管理
- 需求：把目前繞著卡片邊框跑的那顆「點點」(orbit-marquee 光點) 換成可上傳的 icon。icon 沿框外圈跑，**上半部最大（約等於專案名稱字級），右 / 下 / 左縮小**。
- **圖庫管理（使用者後續補充）**：
  - icon 可**上傳多個**，建一個 icon 圖庫。
  - 可從**之前上傳過的** icon 裡挑選。
  - 可**刪除**已上傳的 icon。
  - **記住使用者上次選用的 icon**（持久化目前選擇，重開 dashboard 維持）。
- **顯示時機（使用者補充）**：icon 跟著「亮」走 —— **沒有「亮」（非 needs-attention、orbit 沒在跑）時，icon 也不顯示**。即 icon 只在繞圈動畫進行時出現，平常完全隱藏。（這把先前「needs-attention 還是 running 中顯示」的待決問題定案：**只在 needs-attention/亮 的時候**。）
- **格式（使用者補充）**：要支援**動圖**。⚠️ 使用者寫「jpg」但 JPG 是靜態格式不會動 —— 動圖請用 **GIF / APNG / WebP**（靜態仍接受 PNG/JPG/SVG）。技術上沒問題：因為已改用真的 `<img>`，GIF/WebP 放進 `<img>` 會自然播放，搭配 `offset-path` 沿框跑也不影響動畫。
- 現況卡點：那顆「點點」其實是純 CSS `conic-gradient` + `@property --orbit-angle` 掃光（`HTML:254-299`），**不是真的 DOM 元素**，沒辦法直接塞 `<img>`。且它目前只在 `needs-attention`（running→completed/waiting/failed 未確認）時出現，**不是** running 中。已內建變速（上慢→快 / 右加速 / 下等速最快 / 左減速）。
- 實作：
  - orbit 機制重寫成一個真的 `<img>`/element 沿 perimeter 跑 —— CSS `offset-path`(rect/inset path) + `offset-distance` 0→100% 動畫，或 JS rAF 算 x/y；size 隨角度 / 位置變（上大下小）用 keyframe 動 scale 或 JS。可保留原 conic glow 當尾巴、icon 疊在上面，或完全取代。
  - 圖庫：多張 icon + 「上次選用」都要持久化（localStorage base64 圖庫陣列 + selectedId；或 server 存檔）。UI 要有：上傳、縮圖列表挑選、刪除、目前選用標示。
- 待實作時決定：icon 取代 glow 還是疊加？要不要依狀態上色（raster 難套，SVG / CSS filter 才行）？「上次選用」是全域一張、還是每個 status / 每個 session 各自記？（觸發時機已定案：只在「亮」時顯示。）
- 可行性：✅ 做得到，但比鈴聲複雜（要重寫 orbit 機制 + 做圖庫 CRUD）。

### F22 `[FEAT]` 可勾選安裝器（install-hooks.ps1 一般化）
- 需求：一個 installer 讓使用者**勾選**要安裝/設定哪些 dashboard 依賴（3 個 dashboard hooks：Notification / Stop / auto-approve-build；statusline 腳本；settings.json 掛法）。延續 F18 可攜性，補完「clone 回去能自助裝起來」最後一哩。
- 由來：v0.2.2 的 F16 先做了**最小、F16 專屬**的 `install-hooks.ps1`（只裝 auto-approve-build hook）當拋棄式原型；F22 把它一般化成可勾選多項。
- 仿現有 `install-autostart.ps1` 風格（PowerShell installer）。使用者於 2026-06-09 定：放 v0.3，不擠進 v0.2.2。

### F23 `[FEAT]` 能力偵測 + 自動 gate（feature registry）
- 需求：dashboard 維護一份 **feature registry（功能↔依賴對應）**，啟動/執行時**偵測每個功能的依賴是否就緒**（hook 裝了沒、statusline tmp 在不在、flag 可寫否…），缺依賴的功能**自動變灰/隱藏/給提示**，不再讓使用者面對「按了沒反應」。
- 吸收 V1.0.0 **M0**（對等基準線盤點＝HTML 功能 checklist）：那份 checklist 正好是 registry 的種子資料，結構化後同時餵 F22 安裝器與本能力偵測。
- v0.2.2 F16 的 **F16 專屬 gate**（沒裝 hook → disable toggle）是本框架第一個消費者，F23 落地後退役改吃這套。
- 與 V1.0.0 銜接：同一套 capability probe，V1.0.0 只多加「native(Tauri) 可用?」一軸（PLAN §2 host adapter）。順序 **框架先（v0.3）→ Tauri** 由使用者 2026-06-09 定。

### F24 `[FEAT]` dark mode（FE UI 深色主題）
- 需求：dashboard 加深色主題，可切換。
- ⚠️ 設計前置：現有 UI 是手調暖色（cream + terracotta），CLAUDE.md 明訂「未經明確要求不得重構樣式/版面」→ **dark mode 要先走 brainstorming 設計**（配色、對比、切換點、是否跟系統 `prefers-color-scheme`）。
- 技術可行性：`web/ui/styles.css` 已用 CSS 變數（`--accent`/`--text`/`--surface`/`--surface-2`/`--border`/`--text-muted`/`--text-faint`…）→ 深色＝在 `:root[data-theme="dark"]`（或 `@media (prefers-color-scheme: dark)`）覆寫這組變數 + topbar 切換鈕 + localStorage 持久，多數元件不必改 markup。
- 待設計時決定：手動切換 vs 跟系統、深色配色細節、orbit/脈動/狀態色在深色下的可讀性、favicon 是否換。
- 由來：使用者 2026-06-09 於 v0.2.2 實作中插入；先入 todo（floating），未實作。

### F25 `[FEAT]` 亮度 / 調暗 slider（整體亮度可調）
- 需求：給一個可拉動的 bar（slider）調整 dashboard 整體「亮度」，主要影響背景；文字也跟著微暗一點，但仍要清楚可讀。等於在「現在的暖色亮底」與「更暗」之間連續調。
- 與 F24 關係：F24＝離散主題切換（亮/暗），F25＝連續亮度微調（主要背景）。兩者互補、可疊加；設計時要定義交互（亮度作用在當前主題之上？）。使用者 2026-06-09 指明 **F25 是獨立 FE**（不併進 F24）。
- 技術可行性候選（待 brainstorming 定）：
  - (a) slider → CSS 變數：把 `--surface`/`--surface-2`/背景底色依 slider 連續變暗，`--text*` 同步小幅變暗但保持對比（顧 WCAG，不能糊）。較可控、文字可讀性好。
  - (b) wrapper `filter: brightness()`：最簡單但會連文字一起均勻變暗、可能傷可讀性 → 較不推薦或需配合加粗文字。
  - localStorage 持久；topbar 或設定面板放 slider。
- 待設計時決定：作用範圍（純背景 vs 全域）、與 F24 dark mode 疊加邏輯、最暗下限（保證可讀）、是否與系統亮度無關。
- 由來：使用者 2026-06-09 於 v0.2.2 實作中補充（並更正為獨立 FE）；先入 todo（floating），未實作。

### B4 `[BUG]` 狀態偵測偶發回歸（狀況不明）
- 現象：某個已修的狀態判斷在某些情況又出現，無穩定 repro。
- ⛔ **需 repro 才能修**：下次發生時記錄〔哪張卡 / 顯示 vs 預期 / 別動那 session〕→ 即時看該 sid 的 JSONL + `~/.claude/sessions/<sid>.*.flag` 抓觸發條件，補一條對應測試（與 T1 綁）。

### B5 `[BUG]` 「執行中」卡片缺藍色漸層 + 外框轉圈動畫
- 現象：running（執行中）狀態的卡片**應有**藍色漸層底 + 外框轉圈圈（spinner border），目前兩者都沒出現。
- 疑似視覺回歸：某次改動（卡片 render / `styles.css` / orbit 機制）把 running 視覺弄丟。修前先確認預期樣式是否仍在 CSS、以及何時消失（git 比對 running 卡片相關 class）。
- 由來：使用者 2026-06-15 回報，先 park 進 todo（未定版），未實作。

### F26 `[FEAT]` 從手動狀態覆寫學習的動態狀態 map
- 需求：使用者**手動修改 / 指定**某 session 狀態時，記錄「當下該 session 的內容」（對話 / 最後訊息文字），累積成一份「內容 ↔ 狀態」動態 map；未來 heuristic 用關鍵字判斷「狀態」時參考這份 map 提升準確度。
- 定位：屬狀態偵測的 **heuristic 增強**（見 memory `prefer-deterministic-over-fuzzy`：明確協定優先、heuristic 當 fallback）→ 讓 fallback 變聰明，**不取代**既有 tag 協定 / waiting flag 等確定性訊號。
- 待 brainstorming 決定：記什麼（整段 vs 抽關鍵字）、存哪（server JSON）、隱私 / 體積上限、如何餵進 `lib/parse-state.js#computeStatus` 的 fallback、會不會過擬合單一使用者語體、與手動覆寫失效規則（`manualStatusAt > lastActivity`）如何互動。
- 由來：使用者 2026-06-15 提出，先入 todo（floating），未實作。需先設計。
