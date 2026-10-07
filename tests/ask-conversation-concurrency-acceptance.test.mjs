import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask conversation concurrency keeps newest UI state and single mutation authority', () => {
  const expectedNames = [
    'last conversation selection wins', 'leaving a conversation during loading',
    'Ask marks request activity', 'in-progress responses retain',
    'double clicks preserve capability identity', 'conversation loading reconciles only exact durable canonical receipts',
    'STALE_CARE_EDIT_NEVER_OVERWRITES_NEWER_STATE',
    'CORRECTION_UI_REFLECTS_AUTHORITATIVE_CAPABILITY_TERMINAL_STATE',
    'terminal receipts retain stable replay', 'reloaded first turn recovers',
    'completed replay and already-canonical',
  ];
  const pattern=expectedNames.join('|');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const files = [
    'tests/ask-first20-reliability.test.mjs', 'tests/ask-inflight-navigation.test.mjs',
    'tests/ask-state-suggestion-persistence.test.mjs',
    'tests/ask-action-capability-security-regressions.test.mjs',
    'tests/ask-action-capability-target-freshness-expiry.test.mjs',
    'tests/ask-restored-retry.test.mjs',
  ];
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, ...files], {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000,
  });
  for(const name of expectedNames) assert.ok(result.stdout.split('\n').some(line=>line.startsWith('ok ')&&line.includes(name)),name);
  assert.match(result.stdout, /# tests 11/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
