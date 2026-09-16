import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('context recovery uses fresh owned lineage and enforces receipt access',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-context-lineage.cases.mjs'],{cwd:new URL('..',import.meta.url),env,encoding:'utf8',maxBuffer:1000000});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
