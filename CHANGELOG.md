# Changelog

Release notes（標題為主）。最新在上。

## v0.0.2
### Fixes
- 狀態卡片不即時更新：JsonlTailer 加 1s polling fallback（補 Windows fs.watch 漏事件）
- 完成卻顯示「需要決定」：idle 通知 gate、JSONL 事件順序顛倒留幽靈 open tool、end_turn 視為權威
- `/clear` 後 runtime 黏 72h：改用目前 JSONL 首事件
- 多 sub-agent 在跑被誤判待決：stuck-tool 排除 Task/Agent
- 模型顯示 Opus 4.8（少了小數點）

### Features
- 使用量 bar 依剩餘量上健康色（綠/琥珀/紅）＋ 加粗
- Tokens used 移除無意義分母
- 專案名稱 tab 放大 1.5× ＋ 卡片間距加大
- limit bar 顯示資料刷新時間

## v0.0.1
- 初版：本機 Claude Code session 即時監控 dashboard
