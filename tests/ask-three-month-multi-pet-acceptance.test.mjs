import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('three-pet three-month Ask acceptance runs through the production history pipeline', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--experimental-transform-types', '--test', 'scripts/audits/ask-three-month-multi-pet.cases.mjs',
  ], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.match(result.stdout, /tests 6/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
