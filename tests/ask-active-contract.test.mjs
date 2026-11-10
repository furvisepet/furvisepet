import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('active request, review, evidence and lifetime regressions use the production contract',()=>{
 const r=spawnSync(process.execPath,['scripts/run-tests.mjs','--test-reporter=tap','scripts/audits/ask-active-contract.cases.mjs'],{env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',timeout:360000,maxBuffer:2_000_000});
 assert.ifError(r.error);
 assert.equal(r.signal,null,'nested suite must exit normally');
 assert.equal(r.status,0,r.stdout+r.stderr);
});
