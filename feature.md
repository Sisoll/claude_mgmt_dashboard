# Feature log

> 已完成的功能 / 改善，**最新在上**。每條可直接當 commit message 用。

- 「需要決定」狀態由紅改琥珀/橘（紅留給 failed/錯誤）：含卡片邊框/呼吸光/狀態徽章/分頁 favicon 全部一致 (`Claude_Sessions_Dashboard.html`)
- Filter chips 依對應卡片 status 上色（執行中藍/需要決定琥珀/已完成綠/錯誤紅，active 實色），整排放大 (`Claude_Sessions_Dashboard.html`)
- Quota panel 重排：label 當小標在上、bar+數值在下（層次感、避免長日期換行跑版）、面板淡底色、bar 加長、項目置中、`poll in` 釘右上且 30s 一次 (`Claude_Sessions_Dashboard.html`)
- limit bar 顯示「quota 補滿時間」：本地時刻＋相對（`resets 14:00 (2h32m)`，跨日 `resets 6/ 5 12:00 (3d0h)`）；statusline 落地 `resets_at` tmp、usage.js 讀出、reset 文字固定寬避免倒數跳位 (`~/.claude/statusline-command.sh`〔全域〕, `server/lib/usage.js`, `Claude_Sessions_Dashboard.html`)
- 卡片「✓ 標記完成」按鈕改「↻ reset 狀態」：清手動 override ＋ 重讀該 session JSONL 重算狀態 (`server/index.js`, `Claude_Sessions_Dashboard.html`)
- 第一張卡片往下挪，專案名稱 tab 不貼到 filter bar (`Claude_Sessions_Dashboard.html`)
- session 卡片 token / ctx bar 改健康漸層（綠/琥珀/紅，依剩餘量）＋ 加粗加陰影 (`Claude_Sessions_Dashboard.html`)
- Tokens used 移除無意義分母（固定 200000 上限），只留累計數字 (`Claude_Sessions_Dashboard.html`)
- 專案名稱 tab（`.folder-label`）放大 ~1.5×、卡片間距與上緣留白加大 (`Claude_Sessions_Dashboard.html`)
