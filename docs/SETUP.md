# SETUP — 前置作業 / 環境依賴

> dashboard 只讀 `~/.claude/` 底下的檔案，**不打 API、不 hook process**。但其中幾項資料是由
> **使用者層級（repo 外）的 hook / statusline** 寫出來的 —— 別人 clone 這個 repo、或在新機器上
> 重建環境時，沒有這些就會有功能**靜默無作用**（不會 crash，但你會以為它壞了）。
>
> 這份文件就是把那些隱性依賴講清楚，並寫成「**未來的 Claude 可以照著在新機器上重建**」的 checklist。
> 每一段都標了「缺了會怎樣」，沒裝的部分都會**優雅降級**而非顯示壞掉。

---

## 0. 依賴速查表（缺了會怎樣）

| 依賴 | 提供什麼 | 缺了的後果 | 能否 native 取代 |
| --- | --- | --- | --- |
| Claude Code 本體（裝好＋跑過一次） | `~/.claude/sessions/<pid>.json`（marker）、`~/.claude/projects/**/*.jsonl`（對話本體） | **整個 dashboard 空白**（沒資料可讀） | ❌ 必要 |
| 3 支 dashboard hook（Notification / permission / Stop） | OS 級「等決定」訊號落地成 `<sid>.waiting.flag` / `.permission.flag` / `.stop.flag` | 權限提示偵測變慢／偶爾卡在 `running`；狀態仍可用 stuck-tool + status-tag heuristic | ◐ 大致可（降級） |
| statusline command | `statusline_<sid>_5h.tmp` / `_7d.tmp` / `_*_reset.tmp` / `_ctx.tmp` | **5h/7d 配額面板無資料**（顯示提示文字）；ctx 改用 native 估算 | quota ❌ / ctx ✅ |
| status-tag 協定（全域 CLAUDE.md） | assistant 回覆結尾 `【完成】/【待決】/【失敗】`，狀態偵測優先吃它 | 狀態偵測退回問句 heuristic（可動但變不準） | ◐ 可（降級） |
| （選配）專案 SessionStart todo hook | session 啟動帶入 `todo.md` Roadmap | 啟動時不顯示 roadmap（純便利，無影響） | n/a |

**最小可跑**：只要「Claude Code 本體」就能看到卡片與狀態。其餘都是**選配增強**，缺了會降級不會壞。

---

## 1. Claude Code 本體（**必要**）

dashboard 的資料源全部來自這兩個目錄，由 Claude Code **原生**寫出（無需任何 hook）：

- `~/.claude/sessions/<pid>.json` —— 活著的 session marker（pid / sid / cwd / startedAt / entrypoint）
- `~/.claude/projects/<encoded-cwd>/<sid>.jsonl` —— 對話本體

**動作**：裝好 Claude Code、至少在某個專案跑過一次（產生上面的檔案）。沒有就是空白頁面。

---

## 2. Dashboard hooks（選配，加速狀態偵測）

3 支 `/bin/sh` 腳本，把 Claude Code 的 Notification / Stop 事件落地成 flag 檔，讓 dashboard 在
**JSONL 還沒 flush** 時就能抓到「需要決定」。沒有它們時，dashboard 會退回 `parse-state.js` 的
stuck-tool（tool 開超過 30s 沒結果）＋ status-tag heuristic —— 慢一點但不會壞。

### 2.1 建立腳本

放到 `~/.claude/scripts/`（不存在就建目錄）。三支都需要 `jq`（`command -v jq` 確認）。

**`~/.claude/scripts/dashboard-notification.sh`**
```sh
#!/bin/sh
# Hook: Notification — fires when Claude Code shows a notification
# (most commonly: permission prompt for a tool the user must approve).
# Writes <sid>.waiting.flag consumed by the claude_mgmt dashboard.
# Silent, exit 0 unconditionally.

input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$sid" ] && exit 0

flag_dir="$HOME/.claude/sessions"
[ -d "$flag_dir" ] || exit 0

now_ms=$(($(date +%s%N) / 1000000))
printf '{"sid":"%s","at":%s,"source":"notification"}\n' "$sid" "$now_ms" \
  > "$flag_dir/${sid}.waiting.flag" 2>/dev/null
exit 0
```

**`~/.claude/scripts/dashboard-permission.sh`**
```sh
#!/bin/sh
# Hook: Notification[matcher=permission_prompt] — fires the instant a tool permission
# prompt is about to be shown. Writes <sid>.permission.flag so the dashboard immediately
# marks the session "需要決定" (the tool_use line often isn't in the JSONL yet).
# Silent, exit 0 unconditionally.

input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$sid" ] && exit 0

flag_dir="$HOME/.claude/sessions"
[ -d "$flag_dir" ] || exit 0

now_ms=$(($(date +%s%N) / 1000000))
printf '{"sid":"%s","at":%s,"source":"permission"}\n' "$sid" "$now_ms" \
  > "$flag_dir/${sid}.permission.flag" 2>/dev/null
exit 0
```

**`~/.claude/scripts/dashboard-stop.sh`**
```sh
#!/bin/sh
# Hook: Stop — fires when assistant ends a turn (stop_reason == end_turn).
# Secondary/cross-check signal (JSONL already has stop_reason; this is lower-latency).
# Silent, exit 0 unconditionally.

input=$(cat)
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$sid" ] && exit 0

flag_dir="$HOME/.claude/sessions"
[ -d "$flag_dir" ] || exit 0

now_ms=$(($(date +%s%N) / 1000000))
printf '{"sid":"%s","at":%s,"source":"stop"}\n' "$sid" "$now_ms" \
  > "$flag_dir/${sid}.stop.flag" 2>/dev/null
exit 0
```

### 2.2 掛進 `~/.claude/settings.json`

在 `hooks` 物件中加入（已有其他 hook 就 merge，別整段覆蓋）：

```jsonc
{
  "hooks": {
    "Notification": [
      { "matcher": "*",                 "hooks": [{ "type": "command", "command": "bash ~/.claude/scripts/dashboard-notification.sh" }] },
      { "matcher": "permission_prompt", "hooks": [{ "type": "command", "command": "bash ~/.claude/scripts/dashboard-permission.sh" }] }
    ],
    "Stop": [
      { "matcher": "*", "hooks": [{ "type": "command", "command": "bash ~/.claude/scripts/dashboard-stop.sh" }] }
    ]
  }
}
```

> Windows：上面用 `bash ~/.claude/...`，需要環境裡有 `bash`（Git Bash / WSL 皆可）。改完 settings.json 要**重啟 Claude Code session** 才生效。

---

## 3. statusline command（選配，**5h/7d 配額面板唯一來源**）

quota 面板（5h / 7d 用量 + 補滿時間）的數字，Claude Code **只餵給 statusline**（`.rate_limits.*`），
JSONL 裡沒有 → dashboard **無法 native 取得**。所以要靠一支自訂 statusline 把這些值落地成 tmp 檔：

| tmp 檔（`~/.claude/`） | 內容 |
| --- | --- |
| `statusline_<sid>_5h.tmp` / `_7d.tmp` | 各配額的**剩餘** %（statusline 寫 `100 - used`） |
| `statusline_<sid>_5h_reset.tmp` / `_7d_reset.tmp` | 配額補滿時刻（epoch 秒） |
| `statusline_<sid>_ctx.tmp` | context 視窗剩餘 %（**dashboard 現在不再硬依賴它**：缺檔時改用 native 估算，見 §5） |

**缺了的後果**：quota 面板顯示「`—— quota 面板需 statusline hook（見 SETUP.md）——`」並隱藏條圖；其餘功能不受影響。

### 3.1 建立 `~/.claude/statusline-command.sh`

這是本機目前實際使用的版本（會輸出彩色 statusline，同時把上表 tmp 檔落地）：

```sh
#!/bin/sh
input=$(cat)

# ── 讀取資料 ──
model=$(echo "$input" | jq -r '.model.display_name // ""')
ctx_remain=$(echo "$input" | jq -r '.context_window.remaining_percentage // empty')
five_h_used=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_h_resets=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
seven_d_used=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
seven_d_resets=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# ── session key：優先 session_id，fallback TTY ──
_sid=$(echo "$input" | jq -r '.session_id // ""')
if [ -n "$_sid" ]; then _sk="$_sid"; else
  _sk=$(tty 2>/dev/null | tr '/' '_' | sed 's/^_//'); [ -z "$_sk" ] && _sk="default"
fi

PREV_CTX_FILE="${HOME}/.claude/statusline_${_sk}_ctx.tmp"
PREV_5H_FILE="${HOME}/.claude/statusline_${_sk}_5h.tmp"
PREV_7D_FILE="${HOME}/.claude/statusline_${_sk}_7d.tmp"
PREV_5H_RESET_FILE="${HOME}/.claude/statusline_${_sk}_5h_reset.tmp"
PREV_7D_RESET_FILE="${HOME}/.claude/statusline_${_sk}_7d_reset.tmp"

# 新 session 建立時清理 2 天前的舊 tmp
if [ ! -f "$PREV_CTX_FILE" ]; then
  find "${HOME}/.claude" -maxdepth 1 -name 'statusline_*.tmp' -mtime +2 -delete 2>/dev/null
fi

parts=""
[ -n "$model" ] && parts="$model"

# Context 視窗剩餘 → 落地 ctx tmp
if [ -n "$ctx_remain" ]; then
  val=$(printf '%.0f' "$ctx_remain")
  printf '%d' "$val" > "$PREV_CTX_FILE"
  parts="${parts} | ctx ${val}%"
fi

# 5 小時配額 → 落地 5h tmp（剩餘 %）+ reset tmp
if [ -n "$five_h_used" ]; then
  val=$((100 - $(printf '%.0f' "$five_h_used")))
  printf '%d' "$val" > "$PREV_5H_FILE"
  [ -n "$five_h_resets" ] && printf '%s' "$five_h_resets" > "$PREV_5H_RESET_FILE"
  parts="${parts} | 5h-limit ${val}%"
fi

# 7 天配額 → 落地 7d tmp（剩餘 %）+ reset tmp
if [ -n "$seven_d_used" ]; then
  val=$((100 - $(printf '%.0f' "$seven_d_used")))
  printf '%d' "$val" > "$PREV_7D_FILE"
  [ -n "$seven_d_resets" ] && printf '%s' "$seven_d_resets" > "$PREV_7D_RESET_FILE"
  parts="${parts} | week-limit ${val}%"
fi

printf '%s' "$parts"
```

> 上面是**精簡版**（聚焦在 dashboard 需要的 tmp 落地）。本機原版另有彩色 ANSI、進度條、delta 計算、
> 剩餘時間文字、git 分支等 statusline 顯示功能 —— 那些是 statusline 自己好看用的，**dashboard 一律不依賴**，
> 只吃上面那幾個 tmp 檔的數值。要照搬原版亦可，tmp 落地的鍵與格式一致即可。

### 3.2 掛進 `~/.claude/settings.json`

```jsonc
{
  "statusLine": { "type": "command", "command": "bash ~/.claude/statusline-command.sh" }
}
```

statusline 每次 render 都會跑，所以 tmp 檔在 session 活著時是新鮮的。

---

## 4. status-tag 協定（選配，狀態偵測最準的來源）

dashboard 的狀態偵測（`parse-state.js#computeStatus`）依序吃：① Notification flag → ② stuck-tool →
③ **status-tag** → ④ 問句 heuristic。其中 ③ 是讓 assistant 在每則回覆**最後一行**標：

- `【完成】`（或 `[DONE]`）→ `completed`
- `【待決】`（或 `[WAIT]`）→ `waiting`
- `【失敗】`（或 `[FAIL]`）→ `failed`

這份協定定義在使用者**全域** `~/.claude/CLAUDE.md`（「Reply Termination Protocol」段）。沒有它時，
狀態偵測退回問句 heuristic（掃 `?` / `要不要` / `please choose`…）—— 可動但較不準。

**動作**：把 status-tag 協定段落加進 `~/.claude/CLAUDE.md`（讓所有專案的 session 都遵守），
dashboard 即可 100% 信任 tag。完整協定見本 repo `CLAUDE.md` 的「Status tag protocol」段。

---

## 5. ctx remain % —— 已 native 化（v0.1.4 / F18）

context 剩餘 % **不再硬依賴** `statusline_<sid>_ctx.tmp`：

- **有 statusline** → 用它落地的值（Claude Code 原生 `context_window.remaining_percentage`，最準）。
- **沒有 statusline** → server 從 JSONL 最新一則 assistant 的 `usage`（`input + cache_read + cache_creation`）
  ÷ 該 model context window（`[1m]` 變體 100 萬、其餘 20 萬）native 估算（`lib/usage.js#ctxRemainPctFromTokens`）。
- 兩者都拿不到 → ctx 側欄**自動隱藏**（不顯示壞掉）。

所以即使完全沒裝 statusline，ctx 面板仍會有（估算）數字；只有 5h/7d 配額是真的需要 statusline。

---

## 6. （選配）專案 SessionStart todo hook

純便利：session 啟動時把 `todo.md` 的 Roadmap 段顯示出來並注入 context。**本 repo 已內建**
`.claude/scripts/show-todo.sh` + `.claude/settings.json`（但 `.claude/` 被 gitignore，所以 clone 後需自行保留/重建）。
缺了完全不影響 dashboard 功能。

---

## 7. 驗證 checklist

1. `node server/index.js` 起得來，開 `http://127.0.0.1:7878/` 不是空白 → §1 OK。
2. 開著的 Claude session 跳權限提示時，對應卡片**很快**變「需要決定」→ §2 hooks OK（沒裝就靠 30s stuck-tool 慢慢抓）。
3. 頂端 quota 面板有 5h / week 數字（而非「需 statusline hook」提示）→ §3 statusline OK。
4. 卡片右側 `Ctx remain` 有 % → §3 或 §5 native 任一有效。
5. assistant 回覆結尾的 `【完成】/【待決】` 讓卡片狀態精準切換 → §4 status-tag OK。
