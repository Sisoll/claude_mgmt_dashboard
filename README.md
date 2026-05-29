# claude_mgmt

本機（Windows）用的 Claude Code session 監控 dashboard。同時開多個 Claude Code session 時，集中看哪個在跑、哪個在等你決定、哪個完成或失敗，並在「等決定」時跳工作列、播音、發桌面通知。

只跑在 `127.0.0.1:7878`，無 auth，**單機自用**。

---

## Quick start

```bash
# 1. 裝 dep（只有一個：ws）
cd server && npm install

# 2. 啟動
node index.js
# 或開發模式（自動 reload）
node --watch index.js
```

打開 `http://127.0.0.1:7878/`。

開機自動啟動：

```powershell
# 在 repo root
powershell -ExecutionPolicy Bypass -File install-autostart.ps1
# 移除
powershell -ExecutionPolicy Bypass -File uninstall-autostart.ps1
```

裝完後重開機（或執行 `wscript start-server.vbs`）即可。

---

## 它在看什麼

不打 Claude API、不 hook process。純粹讀 `~/.claude/` 底下的檔案：

| 來源 | 用途 |
| --- | --- |
| `~/.claude/sessions/<pid>.json` | 活著的 session marker（pid / sid / cwd / startedAt / entrypoint）|
| `~/.claude/projects/<encoded-cwd>/<sid>.jsonl` | 對話本體（user / assistant / tool_use / tool_result）|
| `~/.claude/statusline_<sid>_*.tmp` | 5h / 7d 用量、context 剩餘 %（由 statusline hook 寫入）|
| `~/.claude/sessions/<sid>.waiting.flag` | Notification hook 寫的「等決定」訊號 |
| `~/.claude/sessions/<sid>.dashboard.json` | sidecar：使用者自訂名稱、收合狀態、AI 摘要 cache |

Marker file 偵測：每 2 秒 scan 一次，用 `process.kill(pid, 0)` 過濾死 PID。JSONL：`fs.watch` + tail（增量讀新行）。

---

## 狀態判定（deterministic 優先）

1. **Notification 旗標**：`<sid>.waiting.flag` 比最後 JSONL 事件新 → `waiting`（抓 OS 級權限提示）
2. **Stuck tool**：tool_use 開超過 30 秒沒回 `tool_result` → `waiting`（抓行內 permission prompt）
3. **狀態 tag**：assistant 訊息結尾掃 `【完成】` / `【待決】` / `【失敗】`（或 `[DONE]` / `[WAIT]` / `[FAIL]`）→ 對應 `completed` / `waiting` / `failed`
4. **問句啟發式**：fallback，掃 `?` / `要不要` / `please choose` 之類

使用者可以在 dashboard 手動覆蓋（mark done / waiting / failed）；任何新的 JSONL 活動會自動讓覆蓋失效。

---

## /clear 處理

Claude Code 的 `/clear` 會換新 sessionId 與新 JSONL，但 `<pid>.json` marker 不更新。`server/lib/sessions.js` 用 pid 為 key 追每個 Claude 當前活躍的 JSONL：marker 標的 JSONL 不再被寫入後，目錄裡出現的新 JSONL 會 attribute 給 mtime gap 最近的那個 pid。sidecar 的使用者偏好（自訂名稱、收合狀態）會自動 migrate 到新 sid。

---

## 檔案結構

```
claude_mgmt/
├── Claude_Sessions_Dashboard.html   單一檔的前端（warm cream + terracotta）
├── server/
│   ├── index.js                     HTTP + WebSocket + 動作 dispatcher
│   ├── lib/
│   │   ├── sessions.js              SessionRegistry：marker scan + /clear migration
│   │   ├── jsonl-tail.js            fs.watch 增量讀 JSONL
│   │   ├── parse-state.js           JSONL 事件 → SessionState 快照
│   │   ├── sidecar.js               <sid>.dashboard.json 讀寫
│   │   ├── usage.js                 statusline_*.tmp 解析（quota / ctx）
│   │   └── win-helpers.js           PowerShell helper 包裝
│   └── scripts/
│       ├── detect-host.ps1          走 process tree 找 host（IDE / 終端機）
│       ├── flash-window.ps1         工作列閃橘
│       └── focus-window.ps1         跳到對應視窗（IntelliJ 多視窗用 EnumWindows + title）
├── start-server.cmd                 手動啟動（visible console）
├── start-server.vbs                 靜默啟動（給 autostart 用）
└── install-autostart.ps1            建 Windows Startup shortcut
```

---

## 操作

Dashboard 卡片上的動作（全走 `POST /api/sessions/<sid>/<action>`）：

- **rename** — 改卡片標題（存 sidecar）
- **setCollapsed** — 收合 / 展開
- **focus** — 把對應的 IDE / 終端機 window 提到前景
- **flash** — 工作列閃橘
- **terminate** — `SIGTERM` 對應 pid

頂端 `Refresh` 鈕：`POST /api/refresh`，清空所有 in-memory cache 重新 scan（state 走鐘時用）。
`Cleanup` 鈕：`POST /api/cleanup`，掃 dead-pid marker、orphan `statusline_*.tmp`、orphan `*.waiting.flag`，但 **不碰** `.dashboard.json`（使用者偏好不能掉）。

---

## 約束 / 邊界

- **Windows only**。`detect-host.ps1` / `flash-window.ps1` / `focus-window.ps1` 都是 PowerShell + Win32 API。
- **無 auth**。只 bind `127.0.0.1`，網路其他人連不到。
- **無 build / 無 lint / 無 test**。前端就是一個 self-contained HTML，後端 plain CommonJS。Node ≥ 20。
- **runtime 依賴**：只有 `ws`。
- **路徑全部用 `~/.claude/`**（`os.homedir()`），不吃環境變數。

---

## 開發備忘

詳細架構 / 設計取捨見 `CLAUDE.md`（給 Claude Code 看的，也適合人讀）。

回覆狀態 tag 協定（`【完成】` / `【待決】` / `【失敗】`）定義在使用者全域 `~/.claude/CLAUDE.md`。Dashboard 的狀態偵測直接依賴這份協定 —— 改 dashboard 邏輯時請順手確認協定還對得上。
