# Bugfix log

> 已修的 bug，**最新在上**。每條可直接當 commit message 用。

- #11 auto-approve-build hook：`./mvnw`（Maven wrapper）未在主指令白名單 → 補上，讓 `./mvnw …` 被自動核准 (`hooks/auto-approve-build.sh`)
- #12 auto-approve-build hook：`-cp` / `-classpath` 旗標值被誤判為路徑參數而 deny → 修正誤擋 (`hooks/auto-approve-build.sh`)
- #13 auto-approve-build hook：指令分段未考慮引號 → 引號內的 `;` / `|` 被誤當命令分隔 → 改 quote-aware 分段；+8 回歸測試 (`hooks/auto-approve-build.sh`, `server/test/hook-auto-approve-build.test.js`)
- #9 auto-approve-build API：`POST /api/auto-approve-build` 回傳補 `hookInstalled`，FE `setAab` 移除設定後多餘的第二次 GET（省一次 round-trip）(`server/index.js`, `web/ui/app.js`)
- F16 hook 安全強化（發版前 code review）：① deny 補 `<` → 擋 input-redirect 與 process-substitution `<(...)`；② 無害尾管只允許純 stdin 過濾（grep/head/tail/wc/echo）並擋路徑參數／遞迴旗標 → 擋 `| cat ~/.ssh/id_rsa`、`| grep -r secret`；③ 移除裸 `yarn` 分支 → 擋 `yarn exec/dlx/add`；④ deny 補 inline URL 與絕對／家目錄／上層路徑參數 → 擋 `jest --globalSetup=/tmp/evil.js`、`pytest /abs`、`make -f`、`npm --registry http://evil`；標註「便利非安全邊界」+21 條回歸測試 (`hooks/auto-approve-build.sh`, `server/test/hook-auto-approve-build.test.js`)
- F16 旗標 crash 序：`setState('off'/'session')` 先刪 enabled 後刪 persist → 兩步間崩潰留 persist 殘留 → `reconcileOnStartup` 復活「永久」（使用者已關卻復活）。改成先刪 persist 再動 enabled（crash-safe 退回 off）+ 順序回歸測試 (`server/lib/auto-approve-build.js`, `server/test/auto-approve-build.test.js`)
- F16 `install-hooks.ps1` 寫 `settings.json` 帶 UTF-8 BOM → 無效 JSON：改無 BOM 寫法 (`install-hooks.ps1`)
- F15 mic 切換卡點擊靜默失敗：`stopMic()` 只在 async `onend` 清 `micRec` → 緊接的 `startMic()` 看到 `micRec` 仍非 null 而 early return。改 `stopMic()` 即時清 `micRec`/`micBtnActive` 並重置按鈕，`onend` 加守衛避免清掉剛啟動的新 rec (`web/ui/app.js`)
- F21 終端啟動修正：Bash 選項誤開 PowerShell（`wt` 的 `;` 被當分頁分隔 + WSL bash 混淆）→ 改 `git-bash.exe --cd=<dir>`；並移除多餘開頭 `bash` 引數（被當 script operand）(`server/index.js`)
- B5 host 偵測同步阻塞 server（多 session 冷啟動 ~60s→~4s）：`sessions.js` scan（startup + 每 2s poll）對每個 session 同步 `spawn detect-host.ps1` 阻塞 event loop；改 async 偵測（測到再 emit `metaUpdated` 推送）+ 失敗重試節流（60s）(`server/lib/sessions.js`, `server/lib/win-helpers.js`, `server/test/win-helpers.test.js`)
- detect-host 一直彈 PowerShell 視窗：`win-helpers.js` 的 `execFileSync` 漏 `windowsHide` → 補上；重構成可 mock + 加回歸測試（14 tests）(`server/lib/win-helpers.js`, `server/test/win-helpers.test.js`)
- 「待定」≠「自訂」：custom 原被併入 pending 計數/篩選 → 自訂自成一類（獨立 chip + 計數 + filter）；待定/自訂卡片給專屬配色（灰/紫，原本跟 running 一樣白；自訂用新 `--custom` 紫，與分支 terracotta 區分）(`Claude_Sessions_Dashboard.html`)
- reset 鈕「閃一下就消失」：runtime ticker 每秒覆寫整個 `.runtime`（含 reset 鈕）→ ticker 改只更新 `.runtime-time`，reset 搬到「標記狀態」下拉旁 (`Claude_Sessions_Dashboard.html`)
- `/clear` 後 session 卡在 running：空對話 / 剛清空 = idle → 改判 **pending**（`server/lib/parse-state.js`）
- 工具權限提示（Bash 等）不論等多久都不變「需要決定」：根因是待批准時 tool_use 還沒進 JSONL。加全域 `Notification[permission_prompt]` hook 即時寫 `<sid>.permission.flag`，server 視為權威 waiting（不受 cleanlyEnded gate）(`~/.claude` hook〔repo 外〕, `server/lib/parse-state.js`, `server/index.js`)
- F8 後續：自訂狀態改下拉選單、顯示輸入文字、歸類為「待定」、加「待定」filter chip、reset 移到 RUNTIME 上方（原三顆直排難看）(`Claude_Sessions_Dashboard.html`)

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
