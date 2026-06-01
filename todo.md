# Dashboard TODO

> **運作方式**：新需求先進此檔。Claude 不主動實作，等明確說「開始實作 / 做 <ID>」才動手。
> **讀取規則**：平常只讀下方「Title list」即可，**不要讀全份**；要動某項時再讀該項 Details。
> **完成後**：把該項從本檔移除，寫進 `bugfix.md`（修 bug）或 `feature.md`（新功能/改善），當歷程 / commit message 素材。
> **標記**：`[BUG]` = 修錯行為；`[FEAT]` = 新功能或改善。

## Title list
- B1 `[BUG]` limit bar 顏色沒出來
- F1 `[FEAT]` limit bar 顯示「quota 補滿時間」（非資料刷新時間）
- F2 `[FEAT]` 卡片「標記完成」按鈕改成「reset 狀態」

---

## Details

### B1 `[BUG]` limit bar 顏色沒出來
- **已做過的修（顯然不夠）**：移除 `.quota-bar .fill` 寫死的 `background: var(--accent)`，想讓 `.fill.health-*` 生效。
- **仍無色，需用瀏覽器實測（不能只靠讀 source）**：
  - (a) 瀏覽器是否硬重新整理（Ctrl+Shift+R）載到新 CSS？先排除。
  - (b) DevTools 看 quota 的 `.fill` 實際有沒有套上 `health-good/warn/crit`、computed background 是什麼。
  - (c) 是否有更高特異度規則 / inline style / 其他 `.fill` 規則蓋掉。
  - (d) fill 寬度是否太小（pct 低）導致看不出顏色——若是，考慮改成「填滿底色＝剩餘、用量另一色」之類更明顯的呈現。

### F1 `[FEAT]` limit bar 顯示「quota 補滿時間」（非資料刷新時間）
- **現況（要改掉）**：`quotaItem` 後面加的 `ago` 是 statusline 資料被抓取的新鮮度（"5s ago"）= 「我何時刷新百分比」，語意錯。
- **需求**：要顯示 **token 額度的 refresh / 補滿時間**（5h 限額、週限額何時重置回滿）。
- **待查 / 待辦**：
  - 確認 `server/lib/usage.js` 讀的 `~/.claude/statusline_*_5h.tmp` / `_7d.tmp` 內是否含 reset / 補滿時間欄位；`/api/usage` 是否已回傳。
  - 沒有的話從來源補（解析 statusline tmp 的 reset 字段）。
  - 把 quota bar 後面的字改成補滿時間（例：`resets in 2h13m` 或絕對時刻），取代目前的 `ago`。

### F2 `[FEAT]` 卡片「標記完成」按鈕改成「reset 狀態」
- **現況**：卡片 `data-action="markDone"` 按鈕（`✓ 標記完成`）把 `manualStatus` 設成 `completed`。對應 server WS `markStatus` → sidecar `manualStatus`。
- **需求**：改成「reset 狀態」。
- **待釐清（實作前確認 reset 行為）**：
  - (a) 清掉 manual override 並強制從 JSONL 重新重算（≈ per-session refresh）？
  - (b) 只清 manual override（= 現有 `clearManualStatus`）？
  - (c) 重新 tail 該 session 的 JSONL（丟 offset 重讀）？
- **牽涉**：HTML 按鈕文字/icon + `data-action`；可能新增 server per-session reset action 或重用 `clearManualStatus` / `forceFullRefresh`。
