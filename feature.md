# Feature log

> 已完成的功能 / 改善，**最新在上**。每條可直接當 commit message 用。

- limit bar 的 used 後面加上資料刷新時間（`5s ago`）(`Claude_Sessions_Dashboard.html`)。註：語意要改成 quota 補滿時間，後續見 todo F1
- session 卡片 token / ctx bar 改健康漸層（綠/琥珀/紅，依剩餘量）＋ 加粗加陰影 (`Claude_Sessions_Dashboard.html`)。註：頂部 quota bar 的色彩仍未生效，見 todo B1
- Tokens used 移除無意義分母（固定 200000 上限），只留累計數字 (`Claude_Sessions_Dashboard.html`)
- 專案名稱 tab（`.folder-label`）放大 ~1.5×、卡片間距與上緣留白加大 (`Claude_Sessions_Dashboard.html`)
