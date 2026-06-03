# Dashboard TODO

> **運作方式**：新需求先進此檔。Claude **不主動實作**，等明確說「開始實作 / 做 <ID>」才動手。
> **讀取規則**：平常只讀下方「Roadmap」即可，**不要讀全份**；要動某項時再讀該項 Details。
> **完成後**：發版時把該項從本檔移除，寫進 `bugfix.md` / `feature.md`（見 `release` skill）。
> **標記**：`[BUG]` = 修錯行為；`[FEAT]` = 新功能或改善。
> **目標版本**：下批發 **v0.1.4**（結構整理；v0.1.3 已發）。
> **大版規劃**：**V1.0.0 = HTML + Tauri 並存且功能對等（Tauri ⊇ HTML）** → 詳見 [`PLAN-v1.0.0-tauri.md`](PLAN-v1.0.0-tauri.md)（未動工）。

## Roadmap（依版本分配）

> 原則：每版聚焦一主題、約 2–4 項，不包山包海。`✅`＝已完成待 commit/release。
> `[BUG]` 基本歸「當下版本」修；`[FEAT]` 分散到後續版本。詳情看下方 Details。

### v0.1.4 — 結構整理 + HTML 模組化（chore，獨立版；待確認）
- C1 `[CHORE]` repo 重構：root 精簡 + 依用途切 `web/` `server/` `scripts/` `docs/`；連帶修所有路徑引用 + README/CLAUDE.md/release skill → 見 Details
- M0.5 `[CHORE]` HTML 拆 no-build ES modules（從 V1 計畫提前到此版；搬進 `web/` 時順手拆）→ 見 PLAN §M0.5
- 做法：**先 commit v0.1.3** → 再做本版，**內部分兩 commit**（① C1 純搬移 ② M0.5 模組化），保 git rename 追蹤 + 可 bisect。M0.5 較高風險、無前端自動測 → 靠 browser smoke。

### v0.2.x — 個人客製化 / 設定（提高使用者黏著度）
> 主軸：讓 dashboard 變「你的」—— 客製化鈴聲 / icon、個人開關設定，黏著度↑。

#### v0.2.1 — 提醒客製化
- F13 `[FEAT]` 自訂通知鈴聲（上傳音檔）
- F14 `[FEAT]` orbit icon + 圖庫（多張/挑選/刪除/記住上次/只在「亮」時/支援動圖）

#### v0.2.2 — 互動 / 個人設定
- F15 `[FEAT]` 送 prompt 語音輸入（speech-to-text）
- F16 `[FEAT]` 自動核准「編譯/測試/安裝」開關（預設關）

#### v0.2.3 — 資訊密度
- F11 `[FEAT]` 每個 prompt 的 token 消耗「小眼睛」

### v0.3.x — 可攜性 / 上手（降低對個人環境的隱性依賴）
> 主軸：把 dashboard 偷偷依賴的 user-level 設定講清楚／文件化，讓「不是你」也能裝起來、或讓未來的 Claude session 能自動建置。是邁向 V1.0.0 散佈的前置。
- F18 `[FEAT]` 前置作業文件化（user-level hooks + statusline + status-tag 協定）＋ 缺依賴時優雅降級

### 未定版（floating）
- B4  `[BUG]` ⛔ 偶發狀態回歸 —— 需 repro，重現才排進版本

### V1.0.0 — HTML + Tauri 並存且對等（大版，獨立 track）
→ 詳見 [`PLAN-v1.0.0-tauri.md`](PLAN-v1.0.0-tauri.md)
- M0   對等基準線盤點（HTML 功能 checklist）
- M0.5 零 build 模組化（HTML → 拆 ES modules + CSS；含同步改 CLAUDE.md 單檔條款）
- M1   Tauri 殼 + Node sidecar（對等即達成）+ tray
- M2   原生 Toast 通知（帶按鈕）
- M3   windows-rs 視窗動作（消滅 PowerShell spawn）
- M4   全域熱鍵 / tray 待決數
- M5   （建議不做）資料層 Rust 化

---

## Details

### F11 `[FEAT]` 每個 prompt 的 token 消耗「小眼睛」
- 需求：每個 prompt（turn）顯示該輪 token 消耗，放在「時間」與「prompt 本體」之間，用 👁 小眼睛。單位 **W（萬，/10000）**，例 32000→`3.2W`。
- 顏色：**白＝還沒處理完**；綠 <10000；青 10000–25000；黃 25000–50000；橙 50000–100000；紅 >100000。subagent 也類似（顯示各自用量）。
- 實作：`parse-state.js` 目前 `_absorbUsage` 只累加總量 → 要**按 turn 記 token**（assistant 訊息 `usage` 歸到當前 turn、多訊息相加；指標傾向該 turn 總 token）；snapshot history 每筆帶 `tokens`；前端 turn 渲染插 👁＋依 tier 上色；subagent token 需確認主 JSONL 是否有 sub-agent 內部用量，拿不到先只做主 prompt。

### F13 `[FEAT]` 自訂通知鈴聲（可上傳音檔）
- 需求：通知音效改成可上傳自訂音檔。目前 waiting / completion / failure 三種事件用 Web Audio 合成 oscillator 音（`chime` / `chimeCompletion` / `chimeFailure`，`HTML:1396-1398`），完全沒讀音檔。
- 實作：加上傳 UI（file input，接受 mp3/wav/ogg）；三事件各自可指定音檔（或先做單一全域音）；持久化建議 localStorage base64（單人、檔案小）或 POST 存 `~/.claude` 下；播放改用 `<audio>` 或 `decodeAudioData → AudioBufferSourceNode`；沒上傳就 fallback 回現有合成音。沿用現有 `soundOn` 開關（`HTML:1451`）。
- 可行性：✅ 直接做得到。

### F14 `[FEAT]` orbit-marquee 改成可上傳 icon（沿框繞圈、上大下小）+ icon 圖庫管理
- 需求：把目前繞著卡片邊框跑的那顆「點點」(orbit-marquee 光點) 換成可上傳的 icon。icon 沿框外圈跑，**上半部最大（約等於專案名稱字級），右 / 下 / 左縮小**。
- **圖庫管理（使用者後續補充）**：
  - icon 可**上傳多個**，建一個 icon 圖庫。
  - 可從**之前上傳過的** icon 裡挑選。
  - 可**刪除**已上傳的 icon。
  - **記住使用者上次選用的 icon**（持久化目前選擇，重開 dashboard 維持）。
- **顯示時機（使用者補充）**：icon 跟著「亮」走 —— **沒有「亮」（非 needs-attention、orbit 沒在跑）時，icon 也不顯示**。即 icon 只在繞圈動畫進行時出現，平常完全隱藏。（這把先前「needs-attention 還是 running 中顯示」的待決問題定案：**只在 needs-attention/亮 的時候**。）
- **格式（使用者補充）**：要支援**動圖**。⚠️ 使用者寫「jpg」但 JPG 是靜態格式不會動 —— 動圖請用 **GIF / APNG / WebP**（靜態仍接受 PNG/JPG/SVG）。技術上沒問題：因為已改用真的 `<img>`，GIF/WebP 放進 `<img>` 會自然播放，搭配 `offset-path` 沿框跑也不影響動畫。
- 現況卡點：那顆「點點」其實是純 CSS `conic-gradient` + `@property --orbit-angle` 掃光（`HTML:254-299`），**不是真的 DOM 元素**，沒辦法直接塞 `<img>`。且它目前只在 `needs-attention`（running→completed/waiting/failed 未確認）時出現，**不是** running 中。已內建變速（上慢→快 / 右加速 / 下等速最快 / 左減速）。
- 實作：
  - orbit 機制重寫成一個真的 `<img>`/element 沿 perimeter 跑 —— CSS `offset-path`(rect/inset path) + `offset-distance` 0→100% 動畫，或 JS rAF 算 x/y；size 隨角度 / 位置變（上大下小）用 keyframe 動 scale 或 JS。可保留原 conic glow 當尾巴、icon 疊在上面，或完全取代。
  - 圖庫：多張 icon + 「上次選用」都要持久化（localStorage base64 圖庫陣列 + selectedId；或 server 存檔）。UI 要有：上傳、縮圖列表挑選、刪除、目前選用標示。
- 待實作時決定：icon 取代 glow 還是疊加？要不要依狀態上色（raster 難套，SVG / CSS filter 才行）？「上次選用」是全域一張、還是每個 status / 每個 session 各自記？（觸發時機已定案：只在「亮」時顯示。）
- 可行性：✅ 做得到，但比鈴聲複雜（要重寫 orbit 機制 + 做圖庫 CRUD）。

### F15 `[FEAT]` 送 prompt 支援語音輸入（speech-to-text）
- 需求：送 prompt 時可用語音輸入，講話轉文字填進卡片的 send-prompt textarea（`HTML:1837`），再由使用者檢查後手動送出。
- 實作：瀏覽器原生 Web Speech API（`webkitSpeechRecognition`），`lang='zh-TW'`；在 send-prompt textarea 旁加 🎤 鈕，按下開始/停止辨識，`interimResults` 即時上字，結果填入 textarea。沿用現有「不自動 Enter、使用者檢查後送出」流程（與 `send-prompt.ps1` 一致）。
- 卡點 / 注意：
  - Web Speech API 在 Chrome (`webkitSpeechRecognition`) 可用，但**音訊會送 Google 伺服器**辨識（需連網 + 隱私考量）；Firefox 支援差、Safari 限制多。
  - dashboard 跑在 `127.0.0.1` = secure context，麥克風 `getUserMedia` / SpeechRecognition 權限 OK。
  - 想完全本機 / 離線 → 要接後端 STT（如 Whisper local），重很多，單人用通常不值得。
- 待實作時決定：只做 send-prompt 一處，還是 rename / 自訂 status 文字也要？是否要語言切換鈕（zh-TW / en）？
- 可行性：✅ 做得到（Chrome 下 Web Speech API 最省事）；想離線就要後端，成本高。

### F16 `[FEAT]` 自動核准「編譯/測試/安裝/抓取」類權限的開關（預設關）
- 需求：dashboard 加一個開關；開啟後，當 session 跳「要不要跑 mvn test / mvn compile / pnpm install / 抓檔案 / 跑測試」這類權限詢問，直接幫使用者 pass（auto-approve）。**預設關**。
- 已有基礎（重要）：PreToolUse hook 已存在 `~/.claude/hooks/auto-approve.sh`（settings.json 已掛 matcher `Bash|Write|Edit|MultiEdit`）。機制完整：
  - master kill-switch：`~/.claude/auto-approve.enabled` 存在才啟用。
  - 硬 deny veto：chaining `[>|;&\`]`、`$()`、`rm/mv/cp/sudo/chmod/kill/...`、git 寫入、interpreter、network 一律不放行。
  - 保守 allow-list：read-only 工具（Read/Glob/Grep/...）+ Write 建新檔 + Bash 唯讀（cat/ls/git status/...）。
  - audit log：`~/.claude/auto-approve.log`。
  - ⚠️ 目前**刻意 DENY install**（deny 正則含 `(npm|pnpm|yarn|pip|...)+(install|i|add|get|...)`），build/test 也沒進 allow-list → 正是 F16 要補的。
- 實作（輕量）：
  - hook：在 auto-approve.sh 加「第二層 tier」—— 若 `~/.claude/auto-approve-build.enabled` 存在，對「乾淨單一指令」放行 build/test/install/fetch 類；**仍保留硬 deny**（chaining/redirect/subshell/破壞性動詞）→ 只放單純一條 build/test/install，不放組合技。
  - FE：dashboard 加開關（topbar 或 settings），預設關，狀態要持久（讀 flag 是否存在）。
  - server：開關透過 Node server 寫/刪 `~/.claude/auto-approve-build.enabled`（FE 不能直接碰 fs）→ 加 `/api/*` endpoint（沿用現有風格）。
- 指令清單（使用者只列部分，已補完，分風險）：
  - 編譯/build（低）：`mvn compile/test-compile/verify`、`gradle build/assemble`、`./gradlew build`、`tsc`、`npm/pnpm/yarn run build`、`vite build`、`go build/vet`、`cargo build/check`、`make`、`cmake --build`、`dotnet build`
  - 測試（低）：`mvn test`、`gradle test`、`npm/pnpm/yarn test`、`jest/vitest/mocha/playwright/cypress`、`go test`、`cargo test`、`pytest`/`python -m pytest`/`tox`、`phpunit`、`rspec`、`dotnet test`
  - lint/format/typecheck（低、唯讀型）：`eslint`、`prettier --check`、`tsc --noEmit`、`ruff check`、`mypy`、`golangci-lint`、`gofmt -l`、`black --check`
  - 安裝/抓相依（⚠️ 中：install 會跑 postinstall script＝任意程式碼）：`npm install/ci`、`pnpm install`、`yarn`、`bun install`、`pip/pip3 install`、`poetry/pipenv install`、`uv pip install`、`mvn dependency:resolve/go-offline`、`go mod download/tidy`、`go get`、`cargo fetch`、`bundle install`、`composer install`、`dotnet restore`
  - 抓檔案/網路（⚠️ 需確認）：`git fetch`、`git pull`（動 working tree）、`git clone`、`curl/wget` 下載 —— 「抓檔案」語意不明，預設先不納，等使用者定。
- 安全注意：install 本質會執行 script；務必只放行「單一、無 chaining/redirect/subshell」指令；保留 audit log；預設關。
- ⚠️ **實務發現（2026-06-03，使用者實測）**：Claude 常把 compile/test 包成**複合指令**，例如 `mvn -q compile 2>&1 | tail -6; echo "COMPILE_EXIT=${PIPESTATUS[0]}"; ls -1 target/...`。現有硬 deny 會擋任何 `|`/`;`/`>`/`&` → 這類**即使 F16 做好也不會自動過**（F16 只放單一乾淨指令如 `mvn -q compile`）。→ F16 要決定：(a) 維持只放單一乾淨指令（安全但實用性打折，多數實際 prompt 仍會跳）；或 (b) 特例放行「build/test 主指令 + 純讀取尾管（`| tail`/`| head`/`| grep`）+ `; echo`/`; ls` 這類無害收尾」的安全組合 pattern。這是 F16 實用度的關鍵設計點。
- 待實作時決定：開關全域（一個 flag、所有 session）還是 per-session（hook 有 session_id 可比對）？「抓檔案」要含 git pull/curl 嗎？沿用 `auto-approve.enabled` 還是獨立 `auto-approve-build.enabled`（建議獨立，風險分層）。

### F18 `[FEAT]` 前置作業 / 依賴文件化（給「別人 / 未來的 Claude」上手用）
- 需求：dashboard 隱性依賴一堆 repo 外的 user-level 設定，別人沒有就會壞或靜默無作用。要補文件（README 補段 + 一份獨立 SETUP/prereq .md，**主要給 Claude 照著建置**）。
- 建議形式：**獨立 `SETUP.md`（或 `.claude/SETUP.md`）放完整前置作業**（份量大、含 hook 腳本內容），README 只加一段「Prerequisites」指過去（保持 README 精簡）。文件「主要針對 Claude」→ 寫成 Claude 可照著執行的 checklist／可附 setup 腳本，讓未來 Claude 在新機器上自動建置 `~/.claude/` 環境。
- 要文件化 / 處理的外部依賴（本 session 盤到的）：
  1. 全域 hooks（`~/.claude/settings.json` + `~/.claude/scripts/`）：`dashboard-notification.sh`（Notification→`<sid>.waiting.flag`）、`dashboard-stop.sh`（Stop→`.stop.flag`）、`dashboard-permission.sh`（permission_prompt→`.permission.flag`）。
  2. **statusline hook（關鍵）**：quota 面板（5h/7d）+ ctx remain 讀 `~/.claude/statusline_*_5h.tmp`/`_7d.tmp`/`statusline_<sid>_ctx.tmp`，由使用者自訂 statusline 寫出。**別人沒有 → 這些功能靜默無資料**。要文件化「怎麼裝這個 statusline」＋ 缺檔時 dashboard **優雅降級**（隱藏面板而非顯示壞掉）。
  3. status-tag 協定（`【完成】/【待決】/【失敗】`，在 user 全域 CLAUDE.md）：狀態偵測優先吃 tag，沒有退 heuristic（可動但變差）。要說明。
  4. `~/.claude/sessions/<pid>.json` pid markers 來源（確認 CC 原生還是 hook 寫的）。
  5. 本專案 SessionStart todo hook（`.claude/settings.json` + `show-todo.sh`，目前 gitignored、local）。
- 子項（偏 code，非純文件）：**缺依賴時優雅降級** —— statusline tmp 不存在就隱藏 quota/ctx，別顯示空白／壞掉。
- **做法（使用者提三選一 → 建議 hybrid，2026-06-03）**：
  1. （文件）SETUP.md + README 段。
  2. （setup prompt）給 Claude 可照著問使用者 / 建置的互動 prompt。
  3. （native-derive）⭐ 改 code 直接從原生內容取得 → 徹底消除依賴，最理想。
  - 建議優先序：**能 native-derive 就 derive（消依賴）→ 不能的優雅降級 → 真的消不掉才用 setup-prompt + 文件**。
- **可行性盤查（2026-06-03 實查）**：
  - **ctx remain %**：✅ **可 native 自算** —— JSONL 每則 assistant `usage` 帶 `cache_read_input_tokens`(+input+cache_creation) ≈ 當前 context tokens，除以該 model context window 即得 %。→ 可直接砍掉 `statusline_<sid>_ctx.tmp` 依賴。
  - **status flags（waiting/permission）**：◐ 大致 native —— 已有 stuck-tool heuristic + status-tag；hook 只是加速 / 補抓 OS permission prompt。沒 hook → 優雅降級。
  - **5h/7d quota**：❌ **JSONL 沒有** —— 來自使用者自訂 `~/.claude/statusline-command.sh`（從別處取，非 JSONL）。**消不掉**：找原生 quota 來源、或保留 statusline + 文件化 + 缺檔隱藏面板。
- 版本：放 **v0.3.x**，且**列為 V1.0.0「開工前」gate**（使用者修正 2026-06-03：要在「1.0 **開始之前**」就處理好，不是結尾前）—— 即 **v0.3.x 必須完成才開始 V1.0.0 / Tauri**（不能在隱性個人依賴的地基上蓋散佈版）。內容：ctx 改 native、quota 走文件 / setup-prompt + 優雅降級、status 降級。可選：v0.1.3 先補一句 README caveat 讓 repo 現在就誠實。

### C1 `[CHORE]` 倉庫結構整理（root 精簡 + 依用途分資料夾）
- 需求：root 盡量乾淨；其餘依功能/目的/類型切資料夾。調整後同步修 README / CLAUDE.md 等。
- 提案 layout：root 只留 `README.md` / `CLAUDE.md` / `.gitignore` + 資料夾 `web/` `server/` `scripts/` `docs/` `.claude/`
  - `web/dashboard.html`（← `Claude_Sessions_Dashboard.html`，順便改名）
  - `server/`（不動內部；**PS helpers 留 `server/scripts/`** 省路徑改動）
  - `scripts/`（`start-server.cmd` / `.vbs`、`open-dashboard.cmd`、`install`/`uninstall-autostart.ps1`）
  - `docs/`（`todo.md`、`CHANGELOG.md`、`bugfix.md`、`feature.md`、`PLAN-v1.0.0-tauri.md`）
- 連帶要改的路徑引用：
  - `server/index.js` 服務 HTML 的路徑 → `../web/dashboard.html`
  - `scripts/start-server.cmd` / `.vbs` 的 `%~dp0` / projectDir 計算
  - `scripts/install-autostart.ps1` 的 shortcut target（已裝捷徑會失效 → 需重跑 install）
  - `.claude/scripts/show-todo.sh` 的 `todo.md` 路徑 → `docs/todo.md`
  - `release` skill 內 changelog/bugfix/feature 路徑 → `docs/`
  - `README.md` / `CLAUDE.md` 的檔案結構與路徑說明
  - PS helpers 留 `server/` → `win-helpers.js` 路徑**不動**（刻意）
- ⚠️ `CLAUDE.md` 必須留 root（CC 自動讀 `<repo>/CLAUDE.md`）。
- 版本：**獨立 v0.1.4**（chore，pure-move commit），**先 commit v0.1.3 再做**，別跟功能 commit 混。alt：`v0.2.0`（想用 minor 凸顯）。
- ⚠️ 待確認：layout（PS helpers 去留、changelog 收 docs/）+ 是否走 v0.1.4 + 先 commit v0.1.3。

### B4 `[BUG]` 狀態偵測偶發回歸（狀況不明）
- 現象：某個已修的狀態判斷在某些情況又出現，無穩定 repro。
- ⛔ **需 repro 才能修**：下次發生時記錄〔哪張卡 / 顯示 vs 預期 / 別動那 session〕→ 即時看該 sid 的 JSONL + `~/.claude/sessions/<sid>.*.flag` 抓觸發條件，補一條對應測試（與 T1 綁）。
