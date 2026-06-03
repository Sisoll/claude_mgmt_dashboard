// Unit tests for native ctx-remain derivation (server/lib/usage.js).
// Zero deps — Node's built-in runner: `node --test` (from server/).
// These cover F18's "ctx remain % 改 native 自算" so the statusline tmp file is no
// longer a hard dependency: when it's absent we compute remaining % from JSONL usage.

const { test } = require('node:test');
const assert = require('node:assert');
const { ctxRemainPctFromTokens, contextWindowFor } = require('../lib/usage');

test('contextWindowFor: standard Claude models are 200k', () => {
  assert.strictEqual(contextWindowFor('claude-opus-4-8'), 200_000);
  assert.strictEqual(contextWindowFor('claude-sonnet-4-6'), 200_000);
  assert.strictEqual(contextWindowFor('claude-haiku-4-5-20251001'), 200_000);
});

test('contextWindowFor: [1m] variants are 1,000,000', () => {
  assert.strictEqual(contextWindowFor('claude-opus-4-8[1m]'), 1_000_000);
  assert.strictEqual(contextWindowFor('claude-sonnet-4-6-1m'), 1_000_000);
});

test('contextWindowFor: unknown/empty model → null', () => {
  assert.strictEqual(contextWindowFor(''), null);
  assert.strictEqual(contextWindowFor(null), null);
  assert.strictEqual(contextWindowFor(undefined), null);
});

test('ctxRemainPctFromTokens: half a 200k window → 50% remain', () => {
  assert.strictEqual(ctxRemainPctFromTokens(100_000, 'claude-opus-4-8'), 50);
});

test('ctxRemainPctFromTokens: 100k of a 1M window → 90% remain', () => {
  assert.strictEqual(ctxRemainPctFromTokens(100_000, 'claude-opus-4-8[1m]'), 90);
});

test('ctxRemainPctFromTokens: over-full window clamps to 0 (never negative)', () => {
  assert.strictEqual(ctxRemainPctFromTokens(250_000, 'claude-opus-4-8'), 0);
});

test('ctxRemainPctFromTokens: near-empty context → ~100% remain', () => {
  assert.strictEqual(ctxRemainPctFromTokens(2_000, 'claude-opus-4-8'), 99);
});

test('ctxRemainPctFromTokens: null when tokens missing/zero/invalid', () => {
  assert.strictEqual(ctxRemainPctFromTokens(null, 'claude-opus-4-8'), null);
  assert.strictEqual(ctxRemainPctFromTokens(0, 'claude-opus-4-8'), null);
  assert.strictEqual(ctxRemainPctFromTokens(NaN, 'claude-opus-4-8'), null);
});

test('ctxRemainPctFromTokens: null when model unknown (cannot pick a window)', () => {
  assert.strictEqual(ctxRemainPctFromTokens(100_000, ''), null);
  assert.strictEqual(ctxRemainPctFromTokens(100_000, null), null);
});
