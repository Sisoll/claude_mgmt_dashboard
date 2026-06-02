# Bugfix log

> 已修的 bug，**最新在上**。每條可直接當 commit message 用。

- quota limit bar 顏色不出來：真因是 quota 的 fill 是 inline `<span>`（被忽略 width/height、沒有方塊可上色）→ 加 `display:block`；另外 server 沒送 `Cache-Control` 導致瀏覽器吃舊頁 → 加 `no-store` (`Claude_Sessions_Dashboard.html`, `server/index.js`)
- quota %/顏色反向：statusline 寫進 tmp 的是「剩餘%」(`100 - used`)，但 usage.js 當成 used、dashboard 又 `100-X` 上色 → 雙重反向。usage.js 改輸出 `*RemainPct`、dashboard 顯示「X% remain」(`server/lib/usage.js`, `Claude_Sessions_Dashboard.html`)
- 多 sub-agent 在跑時整張卡被誤判成「需要決定」：stuck-tool 判定排除 Task/Agent（sub-agent 本就會跑很久，不是權限提示）(`server/lib/parse-state.js`)
- `/clear` 後 runtime 黏在 ~72h：runtime 改用目前 JSONL 的首事件 `firstEventTs`，而非 marker 的 `startedAt`（後者是整個行程壽命）(`server/lib/parse-state.js`)
- 模型 Opus 4.8 顯示成「4 8」（少了小數點）：`shortenModel` 補 `claude-opus-4-8` mapping（含 `[1m]` 變體），fallback 也改成保留版本小數點 (`server/lib/parse-state.js`)
- 已完成（`【完成】`）的 session ~60s 後變「需要決定」：
  1. idle「等待輸入」通知會寫 waiting flag 蓋掉 tag → flag 改 gate on `!cleanlyEnded`
  2. JSONL 事件順序顛倒（tool_result 行在 tool_use 行之前）留下幽靈 open tool → tool 開關改成順序無關配對
  3. 乾淨 `end_turn` 視為權威，跳過 stuck-tool 判定 (`server/lib/parse-state.js`)
- 狀態卡片不即時更新（回覆後不跳「執行中」）：`JsonlTailer` 加 1s stat polling fallback，補 Windows `fs.watch` 漏事件 / 掛載失敗 (`server/lib/jsonl-tail.js`)
