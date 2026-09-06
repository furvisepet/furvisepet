import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('dated correction production callback regressions', () => {
  const run = spawnSync(process.execPath, ['--experimental-transform-types', '--test', 'scripts/audits/ask-late-corrections.cases.mjs'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
