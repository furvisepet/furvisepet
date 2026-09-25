import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Ask launch owner journey stays coherent across recall, correction, save, reload, and replay', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const pattern = 'owner journey|late food correction|pet switch then pronoun|applied suggestions render a saved confirmation|refresh restores automatic and manually saved canonical state|reloaded first turn recovers its original payload|completed replay and already-canonical claims';
  const result = spawnSync(process.execPath, [
    '--experimental-transform-types', '--test', `--test-name-pattern=${pattern}`,
    'scripts/audits/ask-launch-owner-journey.cases.mjs',
    'tests/ask-state-suggestion-persistence.test.mjs',
    'tests/ask-restored-retry.test.mjs',
  ], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8', maxBuffer: 10_000_000 });
  assert.match(result.stdout, /tests 7/);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
