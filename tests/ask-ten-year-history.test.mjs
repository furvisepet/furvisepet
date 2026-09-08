import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('ten-year history retrieval and answer pipeline with 10,968 synthetic rows',()=>{
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-ten-year-history.cases.mjs'],{env,encoding:'utf8',timeout:120000,maxBuffer:4000000});
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
