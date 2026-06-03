# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

Self-hosted, single-user dashboard for monitoring all live Claude Code sessions on this Windows machine. Watches `~/.claude/` (markers, JSONL conversation logs, statusline tmp files), exposes live state via WebSocket, and renders a single-page dashboard. Binds **127.0.0.1 only** — no auth.

## Run / develop

```bash
# Run the server (port 7878 by default)
cd server && node index.js

# Dev mode (auto-restart on changes)
cd server && node --watch index.js

# Override port
PORT=9000 node index.js
```

- Dashboard URL: `http://127.0.0.1:7878/` (serves `web/dashboard.html`)
- WebSocket: same host/port, root path
- `start-server.cmd` — visible console for debugging
- `start-server.vbs` — silent autostart (used by Windows Startup shortcut)
- `install-autostart.ps1` / `uninstall-autostart.ps1` — manage the Startup shortcut
- No tests, no linter, no build step. Node ≥20. Only runtime dep: `ws`.

## Architecture

### Data flow

```
~/.claude/sessions/<pid>.json   ─┐
                                 ├─> SessionRegistry (poll 2s) ──> attach/detach
~/.claude/projects/<cwd>/*.jsonl ┘                                 │
                                                                   ▼
                                                          JsonlTailer (fs.watch)
                                                                   │
                                                                   ▼
                                                          SessionState.ingest
                                                                   │
                                                  schedulePush (120ms debounce)
                                                                   │
                                                                   ▼
                                                  WebSocket broadcast → browser
```

### Critical: `/clear` migration

Claude Code's `/clear` rotates the sessionId/JSONL but does **not** update the pid marker file. `lib/sessions.js` solves this by tracking each pid's currently-active JSONL across scans (`pidJsonl` map), and when a new JSONL appears in a cwd it's attributed to the pid whose tracked JSONL went silent closest to the new JSONL's `firstTs` (first event timestamp). The sid surfaced to the dashboard is the **JSONL filename**, not the marker's `sessionId` — they diverge after `/clear`. On migration, `lib/sidecar.js#migrate` carries forward user prefs (name, collapsed) but drops ephemeral fields like `manualStatus`.

### Status detection (deterministic over heuristic)

`lib/parse-state.js#computeStatus` order:
1. **Notification flag** (`<sid>.waiting.flag` written by user's global Claude Code Notification hook) — highest priority, catches OS-level permission prompts.
2. **Stuck tool heuristic** — open tool >30s without `tool_result` = inline permission prompt → `waiting`.
3. **Status tag protocol** — last assistant message tail scanned for `【完成】` / `【待決】` / `【失敗】` (or `[DONE]/[WAIT]/[FAIL]`). Authoritative when present. See user global `CLAUDE.md` for the tag protocol.
4. **Question heuristic** fallback — only when no tag.

Manual override via `sidecar.manualStatus` is valid only while `manualStatusAt > lastActivity` (any new JSONL event invalidates it).

### Sidecar

`~/.claude/sessions/<sid>.dashboard.json` stores per-session UI state: `name`, `collapsed`, `viewedSince`, `aiSummary`, `manualStatus`. **Never** touched by `cleanupStaleFiles` — user prefs are precious and must survive session death.

### Cleanup boundaries

`cleanupStaleFiles` removes only dead-pid markers, orphan `statusline_*.tmp`, and orphan `*.waiting.flag` / `*.stop.flag`. Sidecar `.dashboard.json` files are explicitly preserved.

### Force refresh

`POST /api/refresh` drops all in-memory state (sessions, tailers, JSONL offsets, host-detection cache) and re-scans. Used by the topbar refresh button when state desyncs.

### Internal user messages

JSONL contains Claude Code's internal wrappers (`<command-name>`, `<local-command-caveat>`, `<bash-input>`, etc.) as `type: 'user'` events. `isInternalUserMessage` in `parse-state.js` filters them so they don't appear as fake user turns.

### Host process detection

`scripts/detect-host.ps1` walks the process tree up from the Claude pid: immediate parent = shell (bash/pwsh/cmd), first ancestor with a visible MainWindowHandle = host (WindowsTerminal/Code/idea64/...). Result cached on the session entry (`detectedHost`) and preserved across `/clear` migrations.

### Window flash/focus

`scripts/flash-window.ps1` (taskbar flash) and `scripts/focus-window.ps1` (foreground). **Important for IntelliJ family**: multiple project windows share `idea64.exe`, so matching must use `EnumWindows` + window title match against the cwd leaf — process tree walk alone is insufficient (see `focus-window.ps1`).

### Quotas / context usage

`lib/usage.js` reads `~/.claude/statusline_*_5h.tmp` / `_7d.tmp` (account-level, surfaced at `/api/usage`) and `statusline_<sid>_ctx.tmp` (per-session context remaining %, surfaced on each session snapshot). These tmp files are written by the user's global statusline hook.

## Conventions

- **No build step**, no transpilation. Plain CommonJS Node, vanilla JS dashboard. Keep it that way.
- **Dashboard HTML is intentionally one self-contained file** (~2100 lines, warm cream + terracotta palette). UI was hand-designed; don't restructure styles or layout without explicit ask. Adding behavior to the embedded `<script>` block is fine.
- **All file paths assume `~/.claude/...`** — use `os.homedir()`, not env hacks.
- **Windows-only**. Don't add cross-platform shims for the PowerShell helpers; future port target is Rust via `windows-rs`, not POSIX.
- **No git remote**: this repo is not a git repository (no `.git`). The global session-startup git-fetch flow does not apply here.

## Status tag protocol (reply termination)

Per user's global `CLAUDE.md`, every reply ends with `【完成】` / `【待決】` / `【失敗】` on its own final line. The dashboard's status detector depends on this — when editing reply text in this repo, follow the protocol so your own session displays correctly on the dashboard you're modifying.
