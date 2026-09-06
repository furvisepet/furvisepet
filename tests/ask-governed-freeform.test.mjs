import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
test('governed freeform production writer and callback',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-governed-freeform.cases.mjs'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:1_000_000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
