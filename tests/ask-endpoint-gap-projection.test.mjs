import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('endpoint-gap projection regression suite', () => {
  const env={...process.env}; delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test','tests/ask-endpoint-gap-projection.case.mjs'],{
    cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:10000000
  });
  assert.equal(r.status,0,r.stdout+r.stderr);
});
