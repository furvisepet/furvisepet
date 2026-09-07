import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask source-preserving presentation', () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, ['--experimental-transform-types', '--test', 'scripts/audits/ask-presentation.cases.mjs'], { env, encoding: 'utf8', maxBuffer: 2_000_000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
