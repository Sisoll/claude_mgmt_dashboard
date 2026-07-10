# Changelog

Release notes（標題為主）。最新在上。

## v0.2.3
### Features — 提醒客製化（鈴聲）
- F13 自訂通知鈴聲：可上傳 mp3/wav/ogg 音庫（≤2 MB）、三事件（等待您決定/完成/失敗）各指派音檔、未指派 fallback 回合成音；soundOn 持久化 localStorage；後端泛型 makeUploadStore + 單元測試

### Fixes — auto-approve-build hook + API
- #11 `./mvnw` 補進主指令白名單；#12 `-cp`/`-classpath` 旗標誤擋修正；#13 引號感知（quote-aware）的 `;`/`|` 分段（+8 回歸測試）
- #9 `/api/auto-approve-build` 回傳補 hookInstalled + FE setAab 移除多餘第二次 GET

> 註：F14（orbit icon）原排本版，已延後、版本待定。

## v0.2.2
### Features — 互動 / 操作
- F15 送 prompt 語音輸入（Web Speech API, zh-TW，填入後自行檢查送出）
- F16 自動核准「編譯/測試/安裝」開關（預設關）：獨立 PreToolUse hook + 3-state 旗標 + FE toggle/能力 gate + `install-hooks.ps1`
- F21 topbar「新 session」：雙欄資料夾 picker → 選 PowerShell/Bash → 開新終端自動跑 `claude`

### Fixes
- B5 host 偵測同步阻塞 server（多 session 冷啟動 ~60s→~4s）：偵測改 async + 失敗重試節流
- F16 hook 安全強化：deny 補 `<`／inline URL／絕對·家目錄·上層路徑參數，尾管限純 stdin 過濾，移除裸 `yarn` 分支（+21 回歸測試）
- F16 旗標 crash 序：off/session 先刪 persist 再動 enabled（避免關閉後「永久」復活）
- F16 `install-hooks.ps1` settings.json UTF-8 BOM → 無效 JSON
- F15 mic 切換卡第二張點擊靜默失敗（stopMic 即時清狀態 + onend 守衛）
- F21 Bash 選項誤開 PowerShell（`wt` `;` 分頁分隔 + 多餘 `bash` 引數）→ git-bash.exe

## v0.2.1
### Features — 資訊密度 / 快速操作
- F11 每個 prompt 的 token 消耗「小眼睛」👁：turn 顯示該輪 token（W＝萬）+ 6 級色階；指標＝input+cache_creation+output（不含 cache_read）；以 message id dedupe 修正按 content block 拆行造成的重複計算
- F19 topbar `+` 改 ↗，另開分頁開 claude.ai/new
- F20 「收合所有展開卡片」按鈕（捲簾上收），複用 setCollapsed 持久化、保留 needs-attention 脈動

## v0.1.5
### Chore
- C1 repo 結構整理：dashboard→`web/`、文件→`docs/`（git rename 追蹤）；修全部路徑引用，launchers 留 root、PS helpers 留 server/scripts/
- M0.5 HTML 模組化（no-build）：拆 `web/ui/{styles.css,app.js}`（原生 ES module）+ server `/ui/*` 靜態服務；CLAUDE.md 單檔條款更新

## v0.1.4
### Features
- F18 前置作業文件化：新增 `SETUP.md`（依賴速查表 + 可照抄的 hook/statusline 腳本 + settings.json 掛法 + 驗證 checklist）＋ README「選配增強」段
- ctx remain % 改 native 自算（消 `statusline_<sid>_ctx.tmp` 硬依賴；statusline 為主、JSONL usage 估算為 fallback）；附 10 個 node:test
- 缺依賴優雅降級：quota 面板缺 statusline 顯示提示並指向 SETUP.md；status 缺 hook 退 stuck-tool + status-tag heuristic

## v0.1.3
### Fixes
- reset 鈕「閃一下就消失」（runtime ticker 改只更新 `.runtime-time`；reset 移到「標記狀態」旁）
- 「待定」≠「自訂」：自訂自成一類（獨立 chip / 計數 / filter）；待定/自訂卡片專屬配色（灰 / 紫）
- detect-host 一直彈 PowerShell 視窗（`execFileSync` 補 `windowsHide`）＋ 回歸測試

### Features
- topbar「關閉 dashboard」鈕（`POST /api/shutdown`）
- topbar「重啟 dashboard」鈕（`POST /api/restart`，detached 重啟 + listen retry）
- 齒輪設定面板 +「啟用通知」開關（localStorage 持久化）
- `start-server.cmd` 啟動後自動開瀏覽器（Chrome→Edge）

## v0.1.2
### Fixes
- `/clear` 後卡 running → 空對話改判 pending
- 工具權限提示（Bash 等）現在會即時標「需要決定」（permission_prompt hook + permission flag）
- 自訂/待定狀態顯示與分類修正（下拉選單、自訂文字、待定 chip、版面）

### Features
- 卡片狀態手動下拉：已完成 / 待定 / 執行中 / 錯誤 / 自訂文字
- 從 dashboard 發 prompt（複製 + 聚焦 + 貼上）
- host pill 旁 flash/focus 快捷鈕 ＋ hostPid 加速
- 非破壞性工具自動同意 hook（預設關、多層保護）
- orbit 動畫各邊不同速度；started 固定第二行
- status 偵測單元測試（node:test）

## v0.1.1
### Fixes
- 狀態卡片不即時更新（回覆後不跳「執行中」）：JsonlTailer 加 1s polling fallback（補 Windows fs.watch 漏事件）
- 完成卻顯示「需要決定」：idle 通知 gate、JSONL 事件順序顛倒留幽靈 open tool、end_turn 視為權威
- `/clear` 後 runtime 黏 72h：改用目前 JSONL 首事件
- 多 sub-agent 在跑被誤判待決：stuck-tool 排除 Task/Agent
- 模型顯示 Opus 4.8（少了小數點）
- quota limit bar 顏色不出來（fill 是 inline span → display:block；HTML 加 no-store 修快取）
- quota %/顏色反向（tmp 是剩餘% → 改顯示 remain）

### Features
- limit bar 顯示 quota 補滿時間（本地時刻＋相對，statusline 落地 resets_at）
- 卡片按鈕「標記完成」改「reset 狀態」（清 override ＋ 重讀 JSONL 重算）
- 「需要決定」狀態改琥珀/橘（紅留給 failed）；filter chips 依 status 上色
- Quota panel 重排（小標在上、淡底色、bar 加長、poll 釘右上 30s）＋ reset 固定寬不跳位
- 使用量 bar 依剩餘量上健康色（綠/琥珀/紅）＋ 加粗
- Tokens used 移除無意義分母
- 專案名稱 tab 放大 1.5× ＋ 卡片間距、第一張卡片下移

## v0.0.1
- 初版：本機 Claude Code session 即時監控 dashboard
