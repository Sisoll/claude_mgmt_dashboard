# Changelog

Release notes（標題為主）。最新在上。

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
