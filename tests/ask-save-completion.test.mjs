import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('explicit saves and compound completion preserve authority through the real pipeline',()=>{
 const result=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-save-completion.cases.mjs'],{env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',timeout:60000,maxBuffer:2_000_000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
