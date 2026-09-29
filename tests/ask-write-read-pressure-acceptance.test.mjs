import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function run(args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, {
    cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000,
  });
}

test('Ask mixed read/write pressure preserves one mutation authority and truthful persistence', () => {
  const runs = [
    run(['--experimental-transform-types','--test','--test-name-pattern=Cedar: one Brain ticket, no write until click, Heart receipt before real Lungs last-two read','tests/ask-route-ordering.test.mjs']),
    run(['--test','--test-name-pattern=exact discussed record binding|care edits, removals|terminal receipts retain','tests/ask-action-capability-target-freshness-expiry.test.mjs']),
    run(['--test','--test-name-pattern=double clicks create|request retries reuse|verified automatic persistence|apply failure leaves','tests/ask-state-suggestion-persistence.test.mjs']),
    run(['--test','--test-name-pattern=admission settlement cannot erase','tests/ask-completion-execution.test.mjs']),
    run(['--test','--test-name-pattern=persistence-stage early response|durable replay still|failed effect stage','tests/furvise-brain-post-review-finalizer.test.mjs']),
    run(['--test','tests/ask-publication-receipt.test.mjs']),
  ];
  for (const result of runs) assert.equal(result.status, 0, result.stdout + result.stderr);
});
