# Dashboard TODO

> **運作方式**：新需求先進此檔。Claude **不主動實作**，等明確說「開始實作 / 做 <ID>」才動手。
> **讀取規則**：平常只讀下方「Roadmap」即可，**不要讀全份**；要動某項時再讀該項 Details。
> **完成後**：發版時把該項從本檔移除，寫進 `bugfix.md` / `feature.md`（見 `release` skill）。
> **標記**：`[BUG]` = 修錯行為；`[FEAT]` = 新功能或改善。
> **目標版本**：v0.2.3（F13 自訂鈴聲 + BF #11/#12/#13/#9）已發（2026-07-11）。後續見下方 **v0.2.4/v0.2.5**（架構體檢修復）。
> **大版規劃**：**V1.0.0 = HTML + Tauri 並存且功能對等（Tauri ⊇ HTML）** → 詳見 [`PLAN-v1.0.0-tauri.md`](PLAN-v1.0.0-tauri.md)（未動工）。

## Roadmap（依版本分配）

> 原則：每版聚焦一主題、約 2–4 項，不包山包海。`✅`＝已完成待 commit/release。
> `[BUG]` 基本歸「當下版本」修；`[FEAT]` 分散到後續版本。詳情看下方 Details。

### v0.2.x — 個人客製化 / 設定（提高使用者黏著度）
> 主軸：讓 dashboard 變「你的」—— 客製化鈴聲 / icon、個人開關設定，黏著度↑。

#### v0.2.4 — 架構體檢修復 I：資料遺失 / 狀態誤判
> 來源：2026-07-10 四路 sub-agent 全架構分析（見 Details「2026-07-10 架構體檢」）。主軸：會實質遺失資料或誤判狀態的正確性 bug；修 `[BUG]` 一律附回歸測試。
- CR#16 `[BUG]` `/clear` 遷移不 detach 舊 sid → 舊 tailer 永久空轉 + SessionState 洩漏 + 前端殭屍卡片（`sessions.js:283-294` + `index.js`）
- CR#17 `[BUG]` sidecar/uploads 非原子寫 + read 吞所有錯誤 → 一次 EBUSY 就把 prefs/指派整包靜默清空；**sidecar.js 零測試**（全 repo 最大覆蓋缺口）
- CR#18 `[BUG]` FE 全量重繪抹掉輸入中的 send-prompt textarea / 語音辨識結果；每則 update 各觸發一次全量 render（多 session O(n²)）→ rAF 合併 + 輸入保護
- CR#19 `[BUG]` `parseStatusTag` 未錨定最後一行（`stripStatusTag` 有 `$` 錨定，兩者不一致）→ 回覆末段「提到」tag 即誤判 —— **B4 最具體候選成因**
- 📝 DOC `[BUG]` 文件漂移批次修正（CLAUDE.md「非 git repo」與現實相反等，見 Details 清單）——不佔功能位、隨版順修

#### v0.2.5 — 架構體檢修復 II：穩定性 / 防護
> 主軸：server 不被 edge case 打死 + 本機 API 防護。
- CR#20 `[BUG]` `_scan` 多處 `statSync` 無 try/catch + 全 repo 無 `uncaughtException` handler → JSONL 輪替 race 可直接打死 server（VBS 靜默自啟無監督、不會復活）
- CR#21 `[BUG]` JsonlTailer offset 用「重編碼字串 byteLength」回推 → 讀取邊界切在中文字中間時 offset 漂移、漏行錯亂（`jsonl-tail.js:76-98`）→ 改直接記讀取終點
- CR#22 `[BUG]` 所有 state-changing API 無 Origin/Host 檢查 → localhost CSRF（惡意網頁可打 `/api/shutdown`、上傳/刪音檔、send-prompt 注入）→ 非同源 403 + 端點層測試
- CR#23 `[BUG]` `runPs` 無 timeout → focus/flash/send-prompt 的 PowerShell 卡住時 HTTP handler 永久 pending（`win-helpers.js:103-124`）→ 比照 detect 加 kill 兜底

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
- F14 `[FEAT]` orbit icon + 圖庫（多張/挑選/刪除/記住上次/只在「亮」時/支援動圖）—— **2026-07-10 從 v0.2.3 延後、版本待定**；⭐ **plan + spec 已寫好、零佔位**（`docs/superpowers/plans/2026-06-26-f14-orbit-icon.md`、`.../specs/2026-06-16-f14-orbit-icon-design.md`），設計決策全定案，**定版後直接依 plan 做 7 Task**、不需再 brainstorming（詳見下方 Details）
- B4  `[BUG]` ⛔ 偶發狀態回歸 —— 需 repro，重現才排進版本
- F24 `[FEAT]` 🌙 dark mode（FE UI 深色主題切換，**要記住選擇／持久化**）—— 待定版，建議 v0.2.x 外觀客製化；需先 brainstorming（見 Details）
- F25 `[FEAT]` 🔆 亮度 / 調暗 slider（可拉動 bar 調整整體亮度，主要背景，文字同步微暗但仍清晰）—— 獨立 FE，與 F24 同屬外觀客製化；需先 brainstorming（見 Details）
- CR#15 `[CLEANUP]` `web/ui/app.js` `fs.drives` 寫進 localStorage 但從不讀（dead state）；`server/index.js` git-bash 路徑探測 + inline `require` 重複 → 清理。
- CR#14 `[BUG]` `server/test/win-helpers.test.js` B5 用固定 pid + 模組級 `detectCache` 不重置 → `--test --watch` 第二輪 fail；hook 測試缺 bash/jq skip guard → 補重置 + skip guard。
- B5  `[BUG]` 「執行中」卡片缺藍色漸層底 + 外框轉圈動畫（視覺回歸；需確認何時/哪次改動弄丟）—— 2026-06-15 記，先 park 未定版
- F26 `[FEAT]` 手動覆寫/給狀態時記錄當下 session 內容 → 累積「內容↔狀態」動態 map，未來關鍵字判斷「狀態」時參考（heuristic 增強）—— 需先 brainstorming；2026-06-15 記
- F27 `[FEAT]` 🔍 檢視 sub-agent 內容（在 session 卡片上開一個**可關閉的彈窗**，顯示該 session 衍生的 sub-agent／Task 對話內容）—— 待定版，需先 brainstorming（資料來源 `agent-*.jsonl`、觸發點、顯示範圍、即時 vs 快照）；2026-06-26 記
- CR#24 `[PERF]` 每次 push 約 4 次同步讀檔（sidecar/ctx/兩個 flag）+ `_scan` 每 2s 重算全部歷史 JSONL 的 firstTs（不變量卻每輪重讀）→ 快取化；長壽 session 的 `_tokenCountedMsgIds`/`subAgents`/`toolResults` 無上限成長 → 設上限/TTL —— 2026-07-10 體檢
- CR#25 `[BUG]` FE 小項包（2026-07-10 體檢）：`updateAttention` 吃 DOM 而非 data model（切 filter 隱藏 waiting 卡 → title/favicon 警示被關）；手動 override 樂觀更新被 in-flight update 覆蓋閃動；runtime ticker 對已結束 session 仍每秒累加；session remove 不清 `attentionSids`/`turnExpansion`；quota 面板每秒重建 innerHTML 且背景分頁照跑；`dashboard.html:114`「refreshed 4s ago」死文字；audioCtx 首個使用者手勢時 resume（否則首個事件音可能靜默）
- CR#26 `[CLEANUP]` server 結構收斂（2026-07-10 體檢；建議在 M0.5 細拆前做）：`index.js` ~290 行巨型 handler → 抽 `readJsonBody`/`sendJson` + route table + voice/sessions route 模組；registry 開公開介面（index.js 不再摸 `alive`/`pidJsonl`/`_scan`）；收 body 改 `Buffer.concat`（修中文跨 chunk 切壞）+ 大小上限；`leafOfCwd`/`leafPath` 重複 → `lib/paths.js`；`_waitingSource` dead write 決定去留（surface「為何在等」或刪）；tailer error 至少 warn 一次
- CR#27 `[TEST]` 測試補洞（2026-07-10 體檢）：`sidecar.test.js` 全新（最高價值，綁 CR#17）；`usage` 碰檔邏輯（`getQuotas`/`readLatestTmpValue`/`readCtxRemainForSession`）；`parse-state.test.js` 改 mkdtemp（現在直接寫真實 `~/.claude/sessions`，測試崩潰會殘留 flag）；hook 測試 temp HOME 不清理

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

### F14 `[FEAT]` orbit-marquee 改成可上傳 icon（沿框繞圈、上大下小）+ icon 圖庫管理
> **2026-07-10 狀態：延後、版本待定**（原排 v0.2.3，已改為 v0.2.3 = F13+BF 先發）。plan/spec 已寫好、設計定案，**定版後直接進 `superpowers:subagent-driven-development` 依 plan Task 1→7 做**，不需重新設計。
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
- 需求：一個 installer 讓使用者**勾選**要安裝/設定哪些 dashboard 依賴（**4 個** dashboard hooks：Notification / permission / Stop / auto-approve-build；statusline 腳本；settings.json 掛法）。延續 F18 可攜性，補完「clone 回去能自助裝起來」最後一哩。
- 由來：v0.2.2 的 F16 先做了**最小、F16 專屬**的 `install-hooks.ps1`（只裝 auto-approve-build hook）當拋棄式原型；F22 把它一般化成可勾選多項。
- 仿現有 `install-autostart.ps1` 風格（PowerShell installer）。使用者於 2026-06-09 定：放 v0.3，不擠進 v0.2.2。
- ⚠️ **2026-07-10 體檢補充**：現行 `install-hooks.ps1:34` 用 `ConvertFrom-Json`→`ConvertTo-Json` **全量 round-trip 重寫** `~/.claude/settings.json` —— PS 5.1 有空陣列被吃 / `-Depth` 截斷 / 非 ASCII escape 成 `\uXXXX` 等已知副作用，而使用者 settings 掛著 5 個 MCP server + statusLine + 多組 hooks，風險實質 → F22 改成**只 append hook 節點**（或 jq in-place）。且目前**沒有 `uninstall-hooks.ps1`**（移除會殘留 hook 檔 + settings 條目）→ F22 一併補；兩支 installer 取 script 目錄方式也不一致（`$PSScriptRoot` vs `$MyInvocation`），統一 `$PSScriptRoot`。

### F23 `[FEAT]` 能力偵測 + 自動 gate（feature registry）
- 需求：dashboard 維護一份 **feature registry（功能↔依賴對應）**，啟動/執行時**偵測每個功能的依賴是否就緒**（hook 裝了沒、statusline tmp 在不在、flag 可寫否…），缺依賴的功能**自動變灰/隱藏/給提示**，不再讓使用者面對「按了沒反應」。
- 吸收 V1.0.0 **M0**（對等基準線盤點＝HTML 功能 checklist）：那份 checklist 正好是 registry 的種子資料，結構化後同時餵 F22 安裝器與本能力偵測。
- v0.2.2 F16 的 **F16 專屬 gate**（沒裝 hook → disable toggle）是本框架第一個消費者，F23 落地後退役改吃這套。
- 與 V1.0.0 銜接：同一套 capability probe，V1.0.0 只多加「native(Tauri) 可用?」一軸（PLAN §2 host adapter）。順序 **框架先（v0.3）→ Tauri** 由使用者 2026-06-09 定。

### F24 `[FEAT]` dark mode（FE UI 深色主題）
- 需求：dashboard 加深色主題，可切換。
- **要有記憶（硬需求，使用者 2026-06-16 強調）**：使用者選的主題要持久化（localStorage），重開 dashboard 維持上次選擇，不要每次重設回亮色。待設計時定：是否提供「跟隨系統」第三態（system / light / dark），跟系統時也要記住「使用者選了跟隨系統」這個選擇本身。
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
- 🎯 **2026-07-10 體檢找到最具體候選成因：CR#19**（`parseStatusTag` 只掃末 240 字且**無錨定**，回覆末段「引用/提到」`【完成】` 等 tag 即被誤判；`stripStatusTag` 卻有 `$` 錨定，兩者不一致）。次要候選：CR#18 的 override 競態、`sessions.js:223-248` 同 cwd 多 pid 同時 /clear 的貪婪歸因互換。**先修 CR#19 再觀察 B4 是否消失**。

### B5 `[BUG]` 「執行中」卡片缺藍色漸層 + 外框轉圈動畫
- 現象：running（執行中）狀態的卡片**應有**藍色漸層底 + 外框轉圈圈（spinner border），目前兩者都沒出現。
- 疑似視覺回歸：某次改動（卡片 render / `styles.css` / orbit 機制）把 running 視覺弄丟。修前先確認預期樣式是否仍在 CSS、以及何時消失（git 比對 running 卡片相關 class）。
- 🎯 **2026-07-10 體檢確認**：`styles.css:263-305` 有 `is-waiting`/`is-completed`/`is-failed-state`/`is-pending`/`is-custom` 視覺類別，**獨缺 `is-running`** → running 卡片就是純白卡。方向：git 比對何時刪掉 → 補回 is-running 樣式（藍色漸層 + 外框轉圈）。
- 由來：使用者 2026-06-15 回報，先 park 進 todo（未定版），未實作。

### F26 `[FEAT]` 從手動狀態覆寫學習的動態狀態 map
- 需求：使用者**手動修改 / 指定**某 session 狀態時，記錄「當下該 session 的內容」（對話 / 最後訊息文字），累積成一份「內容 ↔ 狀態」動態 map；未來 heuristic 用關鍵字判斷「狀態」時參考這份 map 提升準確度。
- 定位：屬狀態偵測的 **heuristic 增強**（見 memory `prefer-deterministic-over-fuzzy`：明確協定優先、heuristic 當 fallback）→ 讓 fallback 變聰明，**不取代**既有 tag 協定 / waiting flag 等確定性訊號。
- 待 brainstorming 決定：記什麼（整段 vs 抽關鍵字）、存哪（server JSON）、隱私 / 體積上限、如何餵進 `lib/parse-state.js#computeStatus` 的 fallback、會不會過擬合單一使用者語體、與手動覆寫失效規則（`manualStatusAt > lastActivity`）如何互動。
- 由來：使用者 2026-06-15 提出，先入 todo（floating），未實作。需先設計。

### F27 `[FEAT]` 檢視 sub-agent 內容（可關閉彈窗）
- 需求：session 在跑時常會派出 sub-agent（Agent / Task 工具，含 workflow 的 fan-out）。希望能在 dashboard **取得並檢視某個 sub-agent 的對話內容**，以一個**可關閉的彈窗（modal）**呈現。
- 資料來源（待確認）：sub-agent 的 transcript 應落在同一個 project transcript 目錄下的 `agent-<id>.jsonl`（與主 session 的 JSONL 分開）。需要：發現該 session 有哪些 sub-agent、把對應 JSONL tail/讀進來、餵給前端。現有 `JsonlTailer` / `SessionState` 只追主 session 的 JSONL，要擴充。
- UI：仿現有 `fs-modal` / F13 sound modal 風格做一個可關閉彈窗；觸發點（卡片上一顆鈕？只在偵測到 sub-agent 時出現？）待定。
- 待 brainstorming 決定：
  - **資料來源確認**：sub-agent JSONL 的實際命名 / 位置（`agent-*.jsonl`？workflow 的 agent 又長怎樣？），怎麼把它歸到正確的父 session。
  - **顯示範圍**：整段對話 vs 只顯示最終結果/摘要 vs 工具呼叫流程。
  - **即時 vs 快照**：彈窗開著時要不要跟著 sub-agent 進度即時更新（多一條 tail + WS 推送），還是開窗當下讀一次快照。
  - **觸發點 / 多 sub-agent**：一個 session 可能同時有多個 sub-agent（workflow fan-out 可達十幾個），UI 要能列出選哪一個。
  - **內部訊息過濾**：是否沿用 `isInternalUserMessage` 過濾 Claude Code 內部 wrapper。
- 可行性：✅ 技術上做得到（檔案都在本機 `~/.claude/projects/...`），但牽涉 server 端要多追一批 JSONL + 前端新 modal，屬中型 FE+BE。
- 由來：使用者 2026-06-26 提出，先入 todo（floating），未實作。需先 brainstorming。

### 2026-07-10 架構體檢（CR#16–CR#27 + DOC 的來源與細節）
> 由四路 sub-agent 全架構分析產出（server 核心 / 支援模組+測試 / 前端 / scripts+文件）。整體評語：資料流主幹與防禦決策健康（fs.watch 兜底、token 去重、確定性優先、XSS 衛生、delegation 無洩漏），弱點集中在「/clear 與 render 的邊界收尾」「暫時性 IO 失敗無防線」「index.js 過肥」「文件漂移」四類。修 `[BUG]` 一律附回歸測試。

#### CR#16 `/clear` 遷移洩漏（v0.2.4）
- `server/lib/sessions.js:283-294`：移除迴圈對舊 sid 因找到 `migratedTo` 而**刻意不 emit `removed`**，但 `server/index.js` 只對新 sid `attach`、從不 `detach` 舊 sid → 舊 `JsonlTailer` 永久空轉（1s poll + fs.watch handle）、舊 `SessionState` / `lastBroadcastStatus` 永不釋放、前端每次 `/clear` 多一張殭屍卡。頻繁 /clear 的多 session 使用情境會快速累積。
- 修法：registry 偵測 migration 時 emit `migrated {oldSid,newSid}` → index.js detach 舊 sid + 對前端廣播 remove（或 rename 合併訊息避免卡片閃動）。順手：`detach` 內補 `lastBroadcastStatus.delete(sid)`（現在只有 forceFullRefresh 清）。

#### CR#17 sidecar/uploads 資料遺失（v0.2.4）
- `server/lib/sidecar.js:11-24`：`write` 是 read-modify-write，而 `read` 對**所有**錯誤回 `{}`（含 Windows 常見 EBUSY/EPERM 暫時鎖）→ 一次撞鎖，`name`/`collapsed`/`aiSummary` 整包被覆寫成 partial，違反 CLAUDE.md「prefs precious」不變量；`writeFileSync` 非原子，寫半崩潰固化成空檔。
- `server/lib/uploads.js:44-52`（`readAssignments`/`writeAssignments`）同病；`uploads.js:35-42` `list()` 逐檔 statSync 無 try/catch（檔案剛被刪會整個 list 掛掉）。
- 修法：`ENOENT` 才回 `{}`、其他錯誤中止寫入不覆寫；寫 `.tmp` → `renameSync` 原子替換。附 `sidecar.test.js`（migrate 全邊界 + 「read 遇 EBUSY 不得清空 prefs」resilience case）。

#### CR#18 FE render 抹輸入 + 無合併（v0.2.4）
- `web/ui/app.js:827` `innerHTML` 全量重建；每則 WS `update` 各觸發一次 `renderAll`（多 session 下 O(n²) 抖動）。輸入保護只涵蓋 `.session-name`（`:807-810`）→ send-prompt textarea 打字被抹+失焦；F15 mic 的 `rec.onresult` 閉包寫進已 detached 節點，語音辨識結果默默遺失（`:1154-1182`）。
- 修法：`scheduleRender()` 用單一 rAF 合併一個 frame 內的多則 update；保護條件擴到「focus 落在任一卡片內可輸入元素（textarea / 錄音中 mic）」。與 M0.5 拆 `render.js` 可同場落地（FE 模組拆分建議順序：移除 IIFE 殼 → `format.js` 純函式 → `mic`/`quota`/`fspicker`/`sound` 葉模組 → `notify` → `topbar` → 最後 `state`/`render`/`actions`/`ws`）。

#### CR#19 tag 錨定不一致（v0.2.4，B4 候選成因）
- `server/lib/parse-state.js:7-15` `parseStatusTag` 對末 240 字**無錨** test；`:17-23` `stripStatusTag` 卻錨定 `$`。回覆末段「引用/討論」`【完成】`/`【待決】`/`【失敗】`（本 repo session 常態）即被誤判狀態。
- 修法：兩函式共用同一組錨定 regex（取最末非空行比對）+ 補測試。修完觀察 B4 是否消失。

#### 📝 DOC 文件漂移清單（隨 v0.2.4 順修）
1. **CLAUDE.md「No git remote / 不是 git repository」與現實相反**（最高優先）：實際 `.git` 存在、origin=`github.com/Sisoll/claude_mgmt_dashboard`、main 追蹤 origin/main —— 這條會誤導每個 session 跳過 git 同步，且與 `README.md:21` 的 clone URL 正面矛盾。
2. `PLAN-v1.0.0-tauri.md` 通篇舊檔名 `Claude_Sessions_Dashboard.html`（v0.1.5 已 rename 成 `web/dashboard.html`）；M0.5 內「尚未改 CLAUDE.md」註記與 todo 的 M0.5 ✅ 自相矛盾 → 刷新。
3. 「dashboard hooks」枚舉三處不一致：SETUP §0/§2 寫 3 支、本檔 F22 原寫 3 支（漏 permission）、實際落地 **4 支**（Notification / permission / Stop / auto-approve-build）→ 統一（F22 Details 已先改）；SETUP 補 auto-approve-build + `install-hooks.ps1` 一節；README 完全沒提 `install-hooks.ps1`。
4. cleanup 邊界描述漏 `.permission.flag`：`index.js:161` regex 實際含 `(waiting|stop|permission)`，但 README:185、CLAUDE.md「Cleanup boundaries」、`index.js:124` 註解都只列 waiting/stop。
5. hygiene：`settings.local.json:55` 殘留舊檔名 permission（`Claude_Sessions_Dashboard.html`）+ 100+ 條一次性 debug 授權可清。

#### 其他記錄（未開條目、實作相關項時順看）
- `sessions.js:28-47` `readFirstEventTs` 只讀前 4KB，首行超長（大段中文首則 prompt）會誤判 JSONL 不合格 → 擴讀或 fallback birthtime（可併 CR#16/CR#24 同場修）。
- `parse-state.js:211-216,381` token「used」把累加的 input/output 與取 max 的 cacheRead/Create 混加，語意混淆 → 考慮拆「累計生成」與「當前 context 佔用」兩指標。
- `parse-state.js:258,268` `_closeToolUse` 用 `Date.now()` 當 endedAt 而非事件 ts → attach 舊 session 時歷史工具耗時失真。
- send-prompt 焦點鏈風險（`send-prompt.ps1:88-94` SetForegroundWindow 可能被擋 → ^v 貼錯視窗；中文 cwd 資料夾名經 PS 5.1 argv 可能壞掉 → CwdLeaf title 匹配失效退回 windows[0]）—— clipboard-first 已降損，windows-rs（M3）天然解，先記錄不動。
- uploads 低風險項：`safeName` 未擋 Windows 保留名（`NUL.mp3`/`CON.mp3`）與 ADS `:`；音檔回應缺 `X-Content-Type-Options: nosniff`；audit log `auto-approve.log` 無輪替。
- hooks/auto-approve-build.sh：deny 只錨定 arg 開頭的 `../`，`pytest tests/../evil.py`、`./evil.py` 等相對路徑可過白名單 —— 落在自述威脅模型內（best-effort、非 trust boundary），建議在 SECURITY NOTE 明列此殘留即可。
