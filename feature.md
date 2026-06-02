# Feature log

> 已完成的功能 / 改善，**最新在上**。每條可直接當 commit message 用。

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
