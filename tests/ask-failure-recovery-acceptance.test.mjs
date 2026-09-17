import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function run(args) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, args, { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 12_000_000 });
}

test('Ask failure and recovery acceptance stays bounded and truthful across history, provider, and replay paths', () => {
  const history = run(['--experimental-transform-types','--test','scripts/audits/ask-failure-recovery-multi-pet.cases.mjs']);
  assert.match(history.stdout, /tests 4/); assert.equal(history.status, 0, history.stdout + history.stderr);
  const provider = run(['--test','--test-name-pattern=token-based 429|requests-based 429|invalid structured output alone','tests/ask-context-reasoning.test.mjs']);
  assert.match(provider.stdout, /tests 3/); assert.equal(provider.status, 0, provider.stdout + provider.stderr);
  const rpc = run(['--test','tests/ask-idempotent-rpc-recovery.test.mjs']);
  assert.match(rpc.stdout, /tests 3/); assert.equal(rpc.status, 0, rpc.stdout + rpc.stderr);
  const restored = run(['--test','tests/ask-restored-retry.test.mjs']);
  assert.match(restored.stdout, /tests 5/); assert.equal(restored.status, 0, restored.stdout + restored.stderr);
});
