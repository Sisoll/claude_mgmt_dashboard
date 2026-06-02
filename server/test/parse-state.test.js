// Regression tests for status detection (server/lib/parse-state.js).
// Zero deps — Node's built-in runner: `node --test` (from server/).
// Each scenario below corresponds to a bug we fixed; they're here so it stays fixed.
//
// Note: a couple of tests write a throwaway <sid>.waiting.flag into ~/.claude/sessions
// (using clearly-fake __t1-* sids) and delete it again — the dashboard ignores sids
// with no marker, so this can't disturb a running server.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SessionState } = require('../lib/parse-state');

const SESSIONS_DIR = path.join(os.homedir(), '.claude', 'sessions');
const NOW = Date.now();
const OLD = NOW - 60_000;          // >30s ago → trips the stuck-tool heuristic
const iso = (ms) => new Date(ms).toISOString();

function asstText(stopReason, text, ts = NOW, model) {
  const msg = { stop_reason: stopReason, content: text ? [{ type: 'text', text }] : [] };
  if (model) msg.model = model;
  return JSON.stringify({ type: 'assistant', timestamp: iso(ts), message: msg });
}
function asstTools(tools, ts = NOW) {
  return JSON.stringify({
    type: 'assistant', timestamp: iso(ts),
    message: { stop_reason: 'tool_use', content: tools.map((t) => ({ type: 'tool_use', id: t.id, name: t.name, input: t.input || {} })) },
  });
}
function userResult(id, ts = NOW, isError = false) {
  return JSON.stringify({ type: 'user', timestamp: iso(ts), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'ok' }] } });
}
function userPrompt(text, ts = NOW) {
  return JSON.stringify({ type: 'user', timestamp: iso(ts), message: { content: text } });
}
function withFlag(sid, at, fn) {
  const p = path.join(SESSIONS_DIR, `${sid}.waiting.flag`);
  fs.writeFileSync(p, JSON.stringify({ sid, at, source: 'notification' }));
  try { return fn(); } finally { try { fs.unlinkSync(p); } catch {} }
}

test('idle notification does NOT override a clean end_turn 【完成】', () => {
  const sid = '__t1-idle';
  const st = new SessionState({ sid });
  st.ingest([asstText('end_turn', '都好了\n\n【完成】', NOW)]);
  withFlag(sid, NOW + 60_000, () => {           // idle "waiting for input" notif ~60s later
    assert.strictEqual(st.computeStatus(), 'completed');
  });
});

test('permission prompt mid-turn (tool_use) with a newer flag → waiting', () => {
  const sid = '__t1-perm';
  const st = new SessionState({ sid });
  st.ingest([asstTools([{ id: 'a', name: 'Bash', input: { command: 'x' } }], NOW)]);
  withFlag(sid, NOW + 1_000, () => {
    assert.strictEqual(st.computeStatus(), 'waiting');
  });
});

test('out-of-order JSONL (tool_result before tool_use) leaves no phantom open tool', () => {
  const st = new SessionState({ sid: '__t1-order' });
  st.ingest([
    userResult('a', NOW + 1_000),               // result line first...
    asstTools([{ id: 'a', name: 'ToolSearch' }], NOW + 1_100), // ...then its tool_use
    asstText('end_turn', 'done\n\n【完成】', NOW + 2_000),
  ]);
  assert.strictEqual(st.openToolUses.size, 0);
  assert.strictEqual(st.computeStatus(), 'completed');
});

test('a genuinely pending tool (no result) stays open', () => {
  const st = new SessionState({ sid: '__t1-pending' });
  st.ingest([asstTools([{ id: 'b', name: 'Bash' }], NOW)]);
  assert.strictEqual(st.openToolUses.size, 1);
});

test('a clean end_turn is authoritative even with an orphaned open tool', () => {
  const st = new SessionState({ sid: '__t1-authority' });
  st.ingest([
    asstTools([{ id: 'c', name: 'Bash' }], OLD),   // opens, never closed
    asstText('end_turn', '收工\n\n【完成】', NOW),   // later clean end
  ]);
  assert.strictEqual(st.computeStatus(), 'completed');
});

test('multiple running sub-agents (Task/Agent) read as running, not waiting', () => {
  const st = new SessionState({ sid: '__t1-subagents' });
  st.ingest([asstTools([
    { id: 'a', name: 'Task', input: { subagent_type: 'Explore' } },
    { id: 'b', name: 'Agent', input: { subagent_type: 'general' } },
  ], OLD)]);                                       // old, but Task/Agent are excluded from stuck-tool
  assert.strictEqual(st.computeStatus(), 'running');
});

test('a non-Task tool stuck >30s → waiting', () => {
  const st = new SessionState({ sid: '__t1-stuck' });
  st.ingest([asstTools([{ id: 'd', name: 'Bash' }], OLD)]);
  assert.strictEqual(st.computeStatus(), 'waiting');
});

test('model label keeps the dot for 4.8 (and the [1m] variant)', () => {
  const a = new SessionState({ sid: '__t1-m1' });
  a.ingest([asstText('end_turn', 'hi', NOW, 'claude-opus-4-8')]);
  assert.strictEqual(a.toSnapshot().modelLabel, 'Opus 4.8');
  const b = new SessionState({ sid: '__t1-m2' });
  b.ingest([asstText('end_turn', 'hi', NOW, 'claude-opus-4-8[1m]')]);
  assert.strictEqual(b.toSnapshot().modelLabel, 'Opus 4.8');
});

test('runtime/startedAt comes from the JSONL first event, not the marker (/clear)', () => {
  const markerStart = NOW - 72 * 3600 * 1000;     // process started 72h ago
  const st = new SessionState({ sid: '__t1-rt', startedAt: markerStart });
  st.ingest([userPrompt('fresh after clear', NOW)]); // this conversation started "now"
  assert.strictEqual(st.toSnapshot().startedAt, NOW);
});

test('a fresh user prompt with no answer yet reads as running', () => {
  const st = new SessionState({ sid: '__t1-thinking' });
  st.ingest([
    asstText('end_turn', '上一輪\n\n【完成】', NOW - 5_000),
    userPrompt('新問題', NOW),                      // user replied, assistant not yet
  ]);
  assert.strictEqual(st.computeStatus(), 'running');
});

test('an empty / freshly /clear-ed session reads as pending (not running)', () => {
  const st = new SessionState({ sid: '__t1-empty' });   // nothing ingested → no turns, no assistant
  assert.strictEqual(st.computeStatus(), 'pending');
});

test('a pending permission prompt → waiting even after a clean end_turn', () => {
  const sid = '__t1-permflag';
  const st = new SessionState({ sid });
  st.ingest([asstText('end_turn', '上一輪\n\n【完成】', NOW - 5_000)]); // cleanlyEnded = true
  const p = path.join(SESSIONS_DIR, `${sid}.permission.flag`);
  fs.writeFileSync(p, JSON.stringify({ sid, at: NOW, source: 'permission' }));
  try { assert.strictEqual(st.computeStatus(), 'waiting'); }   // permission flag is authoritative
  finally { try { fs.unlinkSync(p); } catch {} }
});
