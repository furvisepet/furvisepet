import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Stage 1 actual loading/generation/validation evidence regressions', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--experimental-transform-types', '--test', 'scripts/audits/ask-evidence-contract.cases.mjs'],
    { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.match(result.stdout, /tests [1-9]/, 'child must actually execute tests');
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
