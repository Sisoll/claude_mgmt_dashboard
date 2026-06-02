# Changelog

Release notes（標題為主）。最新在上。

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
