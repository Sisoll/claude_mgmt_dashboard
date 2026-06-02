const path = require('path');
const fs = require('fs');
const os = require('os');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');

function parseStatusTag(text) {
  if (!text) return null;
  // Scan the tail — tag is supposed to be on the very last line, but allow trailing whitespace/newlines.
  const tail = text.slice(-240);
  if (/【完成】|\[DONE\]/i.test(tail))   return 'completed';
  if (/【待決】|\[WAIT\]/i.test(tail))   return 'waiting';
  if (/【失敗】|\[FAIL\]/i.test(tail))   return 'failed';
  return null;
}

function stripStatusTag(text) {
  if (!text) return '';
  return text
    .replace(/[\s　]*【(完成|待決|失敗)】[\s　]*$/m, '')
    .replace(/[\s　]*\[(DONE|WAIT|FAIL)\][\s　]*$/im, '')
    .trim();
}

// Extract the part of the assistant's reply the user needs to act on.
// For waiting status: usually the last paragraph (where the question lives),
// excluding the tag line and any trailing whitespace.
function extractWaitingPrompt(text) {
  const stripped = stripStatusTag(text);
  if (!stripped) return '';
  const paragraphs = stripped.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const last = paragraphs[paragraphs.length - 1] || stripped;
  return last.length > 600 ? last.slice(0, 600) + '…' : last;
}

function readWaitingFlag(sid) {
  if (!sid) return null;
  try {
    const raw = fs.readFileSync(path.join(SESSIONS_DIR, `${sid}.waiting.flag`), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

// Written by the global Notification[permission_prompt] hook the instant a tool
// permission prompt appears. Unlike the idle waiting flag this is authoritative —
// it means "a decision is needed right now" even before the tool_use message has
// been flushed to the JSONL (which is why permission prompts otherwise stuck on
// "running" forever). Self-clears once newer events arrive (flag.at < lastEventTs).
function readPermissionFlag(sid) {
  if (!sid) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${sid}.permission.flag`), 'utf8'));
  } catch { return null; }
}

// Claude Code emits various internal "user" messages that aren't real user prompts:
//   <local-command-caveat>...   — wrapped reminder around / commands
//   <command-name>/clear ...    — slash-command markers
//   <command-output>...         — output of a previous slash command
//   <bash-input>...             — bash tool input echo
// These should NOT count as conversation turns on the dashboard.
function isInternalUserMessage(text) {
  if (!text) return false;
  const head = text.trimStart().slice(0, 32);
  return head.startsWith('<local-command-caveat>')
      || head.startsWith('<command-name>')
      || head.startsWith('<command-output>')
      || head.startsWith('<command-message>')
      || head.startsWith('<command-args>')
      || head.startsWith('<bash-input>')
      || head.startsWith('<bash-output>')
      || head.startsWith('<bash-stdout>')
      || head.startsWith('<bash-stderr>');
}

const QUESTION_HINTS = [
  '?', '？',
  '要不要', '是否要', '是否需要',
  '嗎？', '嗎?', '呢？', '呢?',
  '請決定', '請選擇', '請確認', '請告訴我',
  'should i', 'do you want', 'shall i', 'would you like', 'please choose', 'please confirm',
];

const MAX_TURNS = 30;
const SNAPSHOT_HISTORY_TURNS = 12;
const TURN_USER_MAX = 600;
const TURN_ASST_MAX = 360;

class SessionState {
  constructor(meta) {
    this.meta = meta;
    this.openToolUses = new Map();
    // tool_use_id → result item, for results that arrive BEFORE their tool_use
    // (JSONL events are sometimes written out of order). Lets _openToolUse know a
    // tool is already resolved so it doesn't linger as a phantom "open" tool.
    this.toolResults = new Map();
    this.subAgents = new Map();
    this.firstUserPrompt = null;
    this.lastUserPrompt = null;
    this.lastAssistant = null;
    this.lastEventTs = null;
    // Earliest event ts in THIS jsonl = start of the current conversation. After
    // /clear a fresh jsonl (new SessionState) is created, so this resets — unlike
    // the pid marker's startedAt, which keeps the whole process lifetime. Runtime
    // is derived from this so a cleared session doesn't show a 72h runtime.
    this.firstEventTs = null;
    this.tokens = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
    this.gitBranch = null;
    this.lastError = null;
    this.turns = [];
    this.permissionMode = null;
    this.model = null;
  }

  ingest(lines) {
    for (const raw of lines) {
      let o;
      try { o = JSON.parse(raw); } catch { continue; }
      this._handle(o);
    }
  }

  _handle(o) {
    const ts = o.timestamp ? Date.parse(o.timestamp) : null;
    if (ts) this.lastEventTs = Math.max(this.lastEventTs || 0, ts);
    if (ts) this.firstEventTs = this.firstEventTs ? Math.min(this.firstEventTs, ts) : ts;
    if (o.gitBranch) this.gitBranch = o.gitBranch;
    if (o.permissionMode) this.permissionMode = o.permissionMode;
    if (o.type === 'permission-mode' && o.permissionMode) this.permissionMode = o.permissionMode;

    if (o.type === 'user') {
      const content = o.message?.content;
      if (typeof content === 'string') {
        // Filter out Claude Code's internal command wrappers (<command-name>/clear, etc.)
        // so they don't show up as fake user turns on the dashboard.
        if (isInternalUserMessage(content)) return;
        this.lastUserPrompt = { text: content, ts };
        if (!this.firstUserPrompt) this.firstUserPrompt = { text: content, ts };
        this.turns.push({ ts, userText: content, assistantSummary: '', tools: [] });
        if (this.turns.length > MAX_TURNS) this.turns = this.turns.slice(-MAX_TURNS);
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'tool_result') {
            this._closeToolUse(item);
          }
        }
      }
    } else if (o.type === 'assistant') {
      const msg = o.message || {};
      const content = Array.isArray(msg.content) ? msg.content : [];
      if (msg.model) this.model = msg.model;
      this.lastAssistant = {
        ts,
        stopReason: msg.stop_reason,
        textParts: content.filter((c) => c.type === 'text').map((c) => c.text),
        thinkingParts: content.filter((c) => c.type === 'thinking').map((c) => c.thinking).filter(Boolean),
        toolUses: content.filter((c) => c.type === 'tool_use'),
      };
      this._absorbUsage(msg.usage);
      for (const tu of this.lastAssistant.toolUses) {
        this._openToolUse(tu, ts);
      }

      const turn = this.turns[this.turns.length - 1];
      if (turn) {
        const text = this.lastAssistant.textParts.join('\n').trim();
        if (text) {
          const condensed = condenseText(text);
          turn.assistantSummary = turn.assistantSummary
            ? (turn.assistantSummary + ' · ' + condensed).slice(0, TURN_ASST_MAX)
            : condensed;
        }
        for (const tu of this.lastAssistant.toolUses) {
          turn.tools.push({
            name: tu.name,
            detail: describeToolInput(tu.name, tu.input || {}),
          });
          if (turn.tools.length > 12) turn.tools = turn.tools.slice(-12);
        }
      }
    }
  }

  _absorbUsage(usage) {
    if (!usage) return;
    this.tokens.input += usage.input_tokens || 0;
    this.tokens.output += usage.output_tokens || 0;
    this.tokens.cacheRead = Math.max(this.tokens.cacheRead, usage.cache_read_input_tokens || 0);
    this.tokens.cacheCreate = Math.max(this.tokens.cacheCreate, usage.cache_creation_input_tokens || 0);
  }

  _openToolUse(tu, ts) {
    // If this tool's result was already seen (out-of-order JSONL), the tool is
    // already done — record it as resolved instead of leaving it "open" forever.
    const earlyResult = this.toolResults.get(tu.id);
    const doneStatus = earlyResult ? (earlyResult.is_error ? 'failed' : 'completed') : 'running';
    if (!earlyResult) {
      this.openToolUses.set(tu.id, {
        id: tu.id,
        name: tu.name,
        input: tu.input || {},
        startedAt: ts,
        status: 'running',
      });
    }
    if (tu.name === 'Task' || tu.name === 'Agent') {
      this.subAgents.set(tu.id, {
        id: tu.id,
        name: tu.input?.subagent_type || 'agent',
        description: tu.input?.description || '',
        status: doneStatus,
        startedAt: ts,
        endedAt: earlyResult ? ts : undefined,
      });
    }
    if (earlyResult) this.toolResults.delete(tu.id);
  }

  _closeToolUse(result) {
    const id = result.tool_use_id;
    const open = this.openToolUses.get(id);
    if (open) {
      open.status = result.is_error ? 'failed' : 'completed';
      open.endedAt = Date.now();
      this.openToolUses.delete(id);
    } else {
      // Result arrived before its tool_use line (out-of-order JSONL) — stash it so
      // the upcoming _openToolUse resolves the tool instead of leaving it open.
      this.toolResults.set(id, result);
    }
    const sub = this.subAgents.get(id);
    if (sub) {
      sub.status = result.is_error ? 'failed' : 'completed';
      sub.endedAt = Date.now();
    }
    if (result.is_error) {
      const text = typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
      this.lastError = text.slice(0, 240);
    }
  }

  computeStatus() {
    const last = this.lastAssistant;
    // A clean end_turn means the model finished its turn. Notifications that arrive
    // *after* that are Claude Code's idle "Claude is waiting for your input" reminder
    // (fires ~60s after the turn ends) — NOT a permission prompt — so they must not
    // override an explicit 【完成】/【待決】/【失敗】 tag. Real permission prompts only
    // fire mid-turn (stop_reason 'tool_use' / an open tool), where the flag below is
    // still authoritative. Without this gate a finished session flips to 待處理 ~60s
    // after it completes.
    const cleanlyEnded = !!last && last.stopReason === 'end_turn';

    // Highest priority: a tool permission prompt is pending RIGHT NOW (B3). Authoritative
    // and NOT gated by cleanlyEnded — the tool_use message may not be in the JSONL yet.
    const permFlag = readPermissionFlag(this.meta.sid);
    if (permFlag && permFlag.at && permFlag.at > (this.lastEventTs || 0)) {
      this._waitingSource = 'permission';
      return 'waiting';
    }

    // Notification hook flag (catches OS-level permission prompts the model can't tag).
    const flag = readWaitingFlag(this.meta.sid);
    if (!cleanlyEnded && flag && flag.at && flag.at > (this.lastEventTs || 0)) {
      this._waitingSource = 'notification';
      return 'waiting';
    }
    this._waitingSource = null;

    // A clean end_turn means no tool can still be pending — any remaining "open"
    // tool is a parse artifact (e.g. an orphaned/out-of-order result), so don't let
    // the stuck-tool heuristic fire. Fall through to the tag/question classification.
    if (!cleanlyEnded && this.openToolUses.size > 0) {
      // Heuristic: if a tool has been "in flight" for more than STUCK_TOOL_MS without a
      // tool_result coming back, Claude is probably stuck on an inline permission prompt
      // (Notification hook only fires for OS-level notifications, not these).
      const STUCK_TOOL_MS = 30_000;
      let oldestStartedAt = Infinity;
      for (const tu of this.openToolUses.values()) {
        // Sub-agents (Task/Agent) legitimately run for minutes — they're work in
        // progress, not a permission prompt. Excluding them stops a session that's
        // busy running sub-agents from being misread as "需要決定".
        if (tu.name === 'Task' || tu.name === 'Agent') continue;
        if (tu.startedAt && tu.startedAt < oldestStartedAt) oldestStartedAt = tu.startedAt;
      }
      if (oldestStartedAt < Infinity && Date.now() - oldestStartedAt > STUCK_TOOL_MS) {
        this._waitingSource = 'stuck-tool';
        return 'waiting';
      }
      return 'running';
    }

    const lastTurn = this.turns[this.turns.length - 1];
    // User just sent a prompt and assistant has not produced an answer yet → assistant is thinking
    if (lastTurn && !lastTurn.assistantSummary && (!last || (last.ts || 0) < (lastTurn.ts || 0))) {
      return 'running';
    }
    // No assistant output at all + no user turn = an empty / freshly /clear'd
    // conversation. It's idle, not running → surface as pending until the first prompt.
    if (!last) return this.turns.length === 0 ? 'pending' : 'running';

    if (last.stopReason === 'end_turn') {
      const text = last.textParts.join('\n');
      // Primary: tag protocol (deterministic)
      const tag = parseStatusTag(text);
      if (tag) return tag;
      // Fallback: question heuristic
      const lower = text.toLowerCase();
      const looksLikeQuestion = QUESTION_HINTS.some((h) => lower.includes(h.toLowerCase()));
      return looksLikeQuestion ? 'waiting' : 'completed';
    }
    if (last.stopReason === 'tool_use') return 'running';
    if (last.stopReason === 'refusal' || last.stopReason === 'max_tokens') return 'failed';
    return 'running';
  }

  buildSummary() {
    const last = this.lastAssistant;
    if (!last) return '';
    const joined = last.textParts.join('\n').trim();
    if (!joined) {
      if (last.thinkingParts.length) {
        return last.thinkingParts[last.thinkingParts.length - 1].slice(0, 200).trim() + '…';
      }
      return '';
    }
    const lines = joined.split('\n').map((s) => s.trim()).filter(Boolean);
    const head = lines.slice(0, 3).join(' ');
    return head.length > 280 ? head.slice(0, 280) + '…' : head;
  }

  buildCurrentTask() {
    const open = Array.from(this.openToolUses.values()).slice(-1)[0];
    if (!open) return null;
    return {
      tool: open.name,
      detail: describeToolInput(open.name, open.input),
    };
  }

  toSnapshot() {
    const now = Date.now();
    // Prefer the current jsonl's first event over the marker's startedAt so runtime
    // reflects THIS conversation (resets on /clear) rather than the whole process.
    const startedAt = this.firstEventTs || this.meta.startedAt;
    const tokensUsed = this.tokens.cacheRead + this.tokens.cacheCreate + this.tokens.input + this.tokens.output;
    const history = this.turns.slice(-SNAPSHOT_HISTORY_TURNS).map((t) => ({
      ts: t.ts,
      user: t.userText.length > TURN_USER_MAX ? t.userText.slice(0, TURN_USER_MAX) + '…' : t.userText,
      assistant: t.assistantSummary || '',
      tools: t.tools.slice(0, 8),
    }));
    const status = this.computeStatus();
    let waitingPrompt = null;
    if (status === 'waiting' && this.lastAssistant) {
      waitingPrompt = extractWaitingPrompt(this.lastAssistant.textParts.join('\n'));
    }
    return {
      sid: this.meta.sid,
      pid: this.meta.pid,
      cwd: this.meta.cwd,
      cwdDisplay: shortenPath(this.meta.cwd),
      cwdLeaf: leafPath(this.meta.cwd),
      branch: this.gitBranch || null,
      entrypoint: this.meta.entrypoint || null,
      entrypointLabel: labelEntrypoint(this.meta.entrypoint),
      hostName: this.meta.detectedHost?.name || null,
      shellName: this.meta.detectedHost?.shell || null,
      hostLabel: labelHost(this.meta.detectedHost?.name, this.meta.detectedHost?.shell) || labelEntrypoint(this.meta.entrypoint),
      sharedCwd: !!this.meta.sharedCwd,
      status,
      waitingPrompt,
      startedAt,
      runtimeMs: now - startedAt,
      lastActivity: this.lastEventTs,
      prompt: this.lastUserPrompt ? { text: this.lastUserPrompt.text, ts: this.lastUserPrompt.ts } : null,
      firstPrompt: this.firstUserPrompt ? { text: this.firstUserPrompt.text } : null,
      summary: { text: this.buildSummary() },
      lastAssistantStatus: this.lastAssistant ? this.lastAssistant.stopReason : null,
      currentTask: this.buildCurrentTask(),
      subAgents: Array.from(this.subAgents.values()),
      tokens: {
        used: tokensUsed,
        breakdown: { ...this.tokens },
      },
      lastError: this.lastError,
      history,
      totalTurns: this.turns.length,
      permissionMode: this.permissionMode,
      model: this.model,
      modelLabel: shortenModel(this.model),
    };
  }
}

function labelEntrypoint(e) {
  if (!e) return null;
  const map = {
    'cli': 'Terminal',
    'claude-vscode': 'VSCode',
    'claude-jetbrains': 'JetBrains',
    'claude-intellij': 'IntelliJ',
  };
  return map[e] || e;
}

function labelHost(hostName, shellName) {
  if (!hostName) return null;
  // IDEs always win — we care about which IDE, not what shell runs inside its terminal
  const ideMap = {
    'Code.exe':       'VSCode',
    'Cursor.exe':     'Cursor',
    'idea64.exe':     'IntelliJ',
    'idea.exe':       'IntelliJ',
    'pycharm64.exe':  'PyCharm',
    'webstorm64.exe': 'WebStorm',
    'phpstorm64.exe': 'PhpStorm',
    'goland64.exe':   'GoLand',
    'rider64.exe':    'Rider',
  };
  if (ideMap[hostName]) return ideMap[hostName];

  // For terminal-style hosts, the shell tells us bash vs PowerShell vs cmd
  const shellMap = {
    'bash.exe':       'Git Bash',
    'mintty.exe':     'Git Bash',
    'powershell.exe': 'PowerShell',
    'pwsh.exe':       'PowerShell 7',
    'cmd.exe':        'cmd',
    'wsl.exe':        'WSL',
    'sh.exe':         'sh',
    'zsh.exe':        'zsh',
  };
  if (shellName && shellMap[shellName]) return shellMap[shellName];

  // Plain host label fallback
  const hostMap = {
    'WindowsTerminal.exe': 'Terminal',
    'powershell.exe':      'PowerShell',
    'pwsh.exe':            'PowerShell 7',
    'cmd.exe':             'cmd',
    'mintty.exe':          'Git Bash',
    'bash.exe':            'bash',
    'wsl.exe':             'WSL',
    'ConEmu.exe':          'ConEmu',
    'ConEmu64.exe':        'ConEmu',
    'Cmder.exe':           'Cmder',
    'alacritty.exe':       'Alacritty',
    'wezterm.exe':         'WezTerm',
    'wezterm-gui.exe':     'WezTerm',
  };
  return hostMap[hostName] || hostName.replace(/\.exe$/i, '');
}

function shortenModel(m) {
  if (!m) return null;
  const map = {
    'claude-opus-4-8': 'Opus 4.8',
    'claude-opus-4-7': 'Opus 4.7',
    'claude-opus-4-6': 'Opus 4.6',
    'claude-sonnet-4-6': 'Sonnet 4.6',
    'claude-sonnet-4-5': 'Sonnet 4.5',
    'claude-haiku-4-5': 'Haiku 4.5',
  };
  for (const [k, v] of Object.entries(map)) if (m.startsWith(k)) return v;
  // Fallback for unmapped models: keep the version dotted (4-8 → 4.8), not "4 8".
  return m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)/, ' $1.$2').replace(/-/g, ' ');
}

function condenseText(text) {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const head = lines.slice(0, 2).join(' ');
  return head.length > TURN_ASST_MAX ? head.slice(0, TURN_ASST_MAX) + '…' : head;
}

function describeToolInput(name, input) {
  switch (name) {
    case 'Read': return input.file_path ? `reading ${path.basename(input.file_path)}` : 'reading file';
    case 'Write': return input.file_path ? `writing ${path.basename(input.file_path)}` : 'writing file';
    case 'Edit': return input.file_path ? `editing ${path.basename(input.file_path)}` : 'editing file';
    case 'Bash': return input.description || (input.command ? input.command.slice(0, 80) : 'running command');
    case 'Glob': return input.pattern ? `glob ${input.pattern}` : 'glob search';
    case 'Grep': return input.pattern ? `grep ${input.pattern}` : 'grep search';
    case 'Task':
    case 'Agent': return `agent: ${input.description || input.subagent_type || ''}`;
    case 'WebFetch': return input.url || 'web fetch';
    case 'WebSearch': return input.query || 'web search';
    default: return input.description || name;
  }
}

function shortenPath(p) {
  if (!p) return '';
  const home = require('os').homedir();
  if (p.startsWith(home)) return '~' + p.slice(home.length).replace(/\\/g, '/');
  return p.replace(/\\/g, '/');
}

function leafPath(p) {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

module.exports = { SessionState };
