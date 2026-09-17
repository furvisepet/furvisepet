import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask runtime dated measurement follow-up excludes unrelated numeric history', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [
    '--experimental-transform-types', '--test',
    'scripts/audits/ask-runtime-mochi-followup.cases.mjs',
  ], { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 10_000_000, env });
  const output = result.stdout + result.stderr;
  assert.match(output, /tests 1/);
  assert.match(output, /pass 1/);
  assert.equal(result.status, 0, output);
});
