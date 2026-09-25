import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('1000-question Ask readiness matrix', () => {
  const env={...process.env}; delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test','tests/ask-readiness-1000.case.mjs'],{
    cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:30000000
  });
  process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||'');
  assert.equal(r.status,0,r.stdout+r.stderr);
});
