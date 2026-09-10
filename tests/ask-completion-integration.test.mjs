import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('completion and scope integration runs with provider network disabled',()=>{
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-completion-execution.cases.mjs'],
 {cwd:new URL('..',import.meta.url),env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',timeout:30000,maxBuffer:2_000_000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
