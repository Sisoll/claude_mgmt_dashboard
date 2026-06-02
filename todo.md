# Dashboard TODO

> **運作方式**：新需求先進此檔。Claude **不主動實作**，等明確說「開始實作 / 做 <ID>」才動手。
> **讀取規則**：平常只讀下方「Title list」即可，**不要讀全份**；要動某項時再讀該項 Details。
> **完成後**：發版時把該項從本檔移除，寫進 `bugfix.md` / `feature.md`（見 `release` skill）。
> **標記**：`[BUG]` = 修錯行為；`[FEAT]` = 新功能或改善。
> **目標版本**：下批發 **v0.1.3**。

## Title list
- F11 `[FEAT]` 每個 prompt 的 token 消耗「小眼睛」指示（W 單位、依量上色）
- B4  `[BUG]` ⛔ 需 repro — 偶發狀態回歸（completed/waiting 之類，狀況不明）

---

## Details

### F11 `[FEAT]` 每個 prompt 的 token 消耗「小眼睛」
- 需求：每個 prompt（turn）顯示該輪 token 消耗，放在「時間」與「prompt 本體」之間，用 👁 小眼睛。單位 **W（萬，/10000）**，例 32000→`3.2W`。
- 顏色：**白＝還沒處理完**；綠 <10000；青 10000–25000；黃 25000–50000；橙 50000–100000；紅 >100000。subagent 也類似（顯示各自用量）。
- 實作：`parse-state.js` 目前 `_absorbUsage` 只累加總量 → 要**按 turn 記 token**（assistant 訊息 `usage` 歸到當前 turn、多訊息相加；指標傾向該 turn 總 token）；snapshot history 每筆帶 `tokens`；前端 turn 渲染插 👁＋依 tier 上色；subagent token 需確認主 JSONL 是否有 sub-agent 內部用量，拿不到先只做主 prompt。

### B4 `[BUG]` 狀態偵測偶發回歸（狀況不明）
- 現象：某個已修的狀態判斷在某些情況又出現，無穩定 repro。
- ⛔ **需 repro 才能修**：下次發生時記錄〔哪張卡 / 顯示 vs 預期 / 別動那 session〕→ 即時看該 sid 的 JSONL + `~/.claude/sessions/<sid>.*.flag` 抓觸發條件，補一條對應測試（與 T1 綁）。
