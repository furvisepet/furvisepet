import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('episode counts and durable references through actual generation and validation',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-episode-history.cases.mjs'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:10_000_000});
  assert.match(r.stdout,/tests [1-9]/);assert.equal(r.status,0,r.stdout+r.stderr);
});
