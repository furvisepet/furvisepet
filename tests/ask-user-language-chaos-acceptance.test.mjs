import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask user-language chaos preserves subject and mutation authority', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--experimental-transform-types', '--test',
    'scripts/audits/ask-user-language-chaos.cases.mjs',
  ], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.match(result.stdout, /tests 7/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
