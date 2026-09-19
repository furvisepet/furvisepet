import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
test('digestive recall and count clarification through production callback',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-digestive-recall.cases.mjs'],{env,encoding:'utf8',maxBuffer:1000000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
