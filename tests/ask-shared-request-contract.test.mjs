import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
test('shared Ask request contract and real pipeline boundaries', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['scripts/run-tests.mjs', '--test-reporter=tap', 'scripts/audits/ask-shared-request-contract.cases.mjs'],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', timeout: 360000, maxBuffer: 10_000_000 });
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'nested suite must exit normally');
  assert.match(result.stdout, /tests [1-9]/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
