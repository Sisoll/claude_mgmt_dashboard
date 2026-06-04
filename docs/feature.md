# Feature log

> 已完成的功能 / 改善，**最新在上**。每條可直接當 commit message 用。

- F11 每個 prompt 的 token 消耗「小眼睛」👁：turn-head 在時間與 prompt 間顯示該輪 token（W＝萬），依量級 6 級上色（白＝處理中／綠<1W／青<2.5W／黃<5W／橙<10W／紅≥10W）；指標＝input+cache_creation+output（排除 cache_read）。關鍵：Claude Code 每個 assistant 訊息按 content block 拆多行、每行重複 usage → 新增 `_tokenCountedMsgIds` 以 message id dedupe，per-turn 與 session 總量都只計一次（順帶修正既有 session 總量被多算）。done＝stop_reason≠tool_use (`server/lib/parse-state.js`, `web/ui/app.js`, `web/ui/styles.css`)
- F19 topbar 死按鈕 `+` 改成 ↗（external-link）並接 `window.open('https://claude.ai/new','_blank','noopener')`，另開分頁開新 Claude 網頁（原「new session」語意移交 F21）(`web/dashboard.html`, `web/ui/app.js`)
- F20 「收合所有展開卡片」按鈕：Active sessions 標題列 refreshed 右側加捲簾上收圖示鈕，一鍵把所有展開卡片收合並以既有 `setCollapsed` WS 持久化；刻意保留 needs-attention 脈動（`.section-title` 改用 `.section-actions` flex 容器）(`web/dashboard.html`, `web/ui/app.js`, `web/ui/styles.css`)
- v0.1.5 M0.5 HTML 模組化（no-build）：dashboard.html 拆成 markup 殼 + `web/ui/styles.css` + `web/ui/app.js`（原生 ES module，逐字外移、零邏輯改）；server 加 `/ui/*` 靜態服務（正確 MIME + no-store + path-traversal guard）；CLAUDE.md 單檔條款更新 (`web/dashboard.html`, `web/ui/styles.css`, `web/ui/app.js`, `server/index.js`, `CLAUDE.md`)
- v0.1.5 C1 repo 結構整理：dashboard→`web/dashboard.html`、文件→`docs/`（todo/CHANGELOG/bugfix/feature/PLAN/SETUP），git rename 追蹤；修全部路徑引用（server/index.js、README、CLAUDE.md、本地 show-todo.sh + release skill）；launchers 留 root、PS helpers 留 server/scripts/ (`web/`, `docs/`, `server/index.js`, `README.md`, `CLAUDE.md`)
- F18 ctx remain % 改 native 自算：statusline 為主、JSONL usage（input+cache_read+cache_creation ÷ model context window）估算為 fallback，消除 `statusline_<sid>_ctx.tmp` 硬依賴；附 10 個 node:test (`server/lib/parse-state.js`, `server/lib/usage.js`, `server/index.js`, `server/test/usage.test.js`)
- F18 缺依賴優雅降級：quota 面板缺 statusline 改顯示提示並指向 SETUP.md；status 缺 hook 退 stuck-tool + status-tag heuristic（既有，已文件化）(`Claude_Sessions_Dashboard.html`)
- F18 前置作業文件化：新增 `SETUP.md`（依賴速查表 + 可直接照抄的 3 dashboard hooks + statusline 腳本 + settings.json 掛法 + 驗證 checklist；給「別人 / 未來的 Claude」上手）；README 加「選配增強」段指過去 (`SETUP.md`, `README.md`)

- `start-server.cmd` 啟動後自動開瀏覽器（Chrome→Edge，curl 輪詢等 server 起來）(`start-server.cmd`, `open-dashboard.cmd`)
- topbar「重啟 dashboard」鈕：`POST /api/restart` detached 重啟（VBS 靜默 launcher、windowsHide），前端重用 WS 自動重連；`server.listen` 加 EADDRINUSE retry (`server/index.js`, `Claude_Sessions_Dashboard.html`)
- topbar「關閉 dashboard」鈕：`POST /api/shutdown` 終止 server + 確認框 + overlay/停重連 (`server/index.js`, `Claude_Sessions_Dashboard.html`)
- 齒輪設定面板 +「啟用通知」開關（localStorage 持久化，gate `pushNotif`，預設開）(`Claude_Sessions_Dashboard.html`)
- 卡片狀態手動下拉選單：已完成/待定/執行中/錯誤/自訂文字（reset 回自動）；自訂歸類待定、顯示輸入文字 (`Claude_Sessions_Dashboard.html`, `server/index.js`)
- 從 dashboard 發 prompt：複製到剪貼簿 + 聚焦視窗 + 貼上（無自動 Enter）(`server/scripts/send-prompt.ps1`, `server/lib/win-helpers.js`, `server/index.js`, `Claude_Sessions_Dashboard.html`)
- host pill 旁加「開啟視窗 / 閃工作列」快捷鈕；flash/focus 用已知 hostPid 跳過 CIM tree walk 加速（附 fallback）(`Claude_Sessions_Dashboard.html`, `server/lib/win-helpers.js`, `server/scripts/{focus,flash}-window.ps1`)
- 非破壞性工具自動同意 PreToolUse hook（**預設關**，kill-switch + hard deny-list + 保守 allow-list + audit log）(`~/.claude/hooks/auto-approve.sh`〔repo 外〕, `~/.claude/settings.json`)
- 卡片外框 orbit 動畫各邊不同速度（上慢 → 下最快 → 左減速）(`Claude_Sessions_Dashboard.html`)
- 卡片內「started」固定到第二行（meta 拆兩列）(`Claude_Sessions_Dashboard.html`)
- status 偵測單元測試（`node:test`，零依賴，12 tests，`npm test`）(`server/test/parse-state.test.js`)

- 「需要決定」狀態由紅改琥珀/橘（紅留給 failed/錯誤）：含卡片邊框/呼吸光/狀態徽章/分頁 favicon 全部一致 (`Claude_Sessions_Dashboard.html`)
- Filter chips 依對應卡片 status 上色（執行中藍/需要決定琥珀/已完成綠/錯誤紅，active 實色），整排放大 (`Claude_Sessions_Dashboard.html`)
- Quota panel 重排：label 當小標在上、bar+數值在下（層次感、避免長日期換行跑版）、面板淡底色、bar 加長、項目置中、`poll in` 釘右上且 30s 一次 (`Claude_Sessions_Dashboard.html`)
- limit bar 顯示「quota 補滿時間」：本地時刻＋相對（`resets 14:00 (2h32m)`，跨日 `resets 6/ 5 12:00 (3d0h)`）；statusline 落地 `resets_at` tmp、usage.js 讀出、reset 文字固定寬避免倒數跳位 (`~/.claude/statusline-command.sh`〔全域〕, `server/lib/usage.js`, `Claude_Sessions_Dashboard.html`)
- 卡片「✓ 標記完成」按鈕改「↻ reset 狀態」：清手動 override ＋ 重讀該 session JSONL 重算狀態 (`server/index.js`, `Claude_Sessions_Dashboard.html`)
- 第一張卡片往下挪，專案名稱 tab 不貼到 filter bar (`Claude_Sessions_Dashboard.html`)
- session 卡片 token / ctx bar 改健康漸層（綠/琥珀/紅，依剩餘量）＋ 加粗加陰影 (`Claude_Sessions_Dashboard.html`)
- Tokens used 移除無意義分母（固定 200000 上限），只留累計數字 (`Claude_Sessions_Dashboard.html`)
- 專案名稱 tab（`.folder-label`）放大 ~1.5×、卡片間距與上緣留白加大 (`Claude_Sessions_Dashboard.html`)
