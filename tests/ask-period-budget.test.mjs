import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('broad history transport preserves evidence within the fixed prompt budget',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-period-budget.cases.mjs'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:1000000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
