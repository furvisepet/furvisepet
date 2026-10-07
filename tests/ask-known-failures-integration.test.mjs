import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('known failures through production callback',()=>{
 const run=spawnSync(process.execPath,['--experimental-transform-types','--test','--test-reporter=tap','--test-concurrency=1','scripts/audits/ask-known-failures.cases.mjs','scripts/audits/ask-known-failures-unit.cases.mjs'],{encoding:'utf8',timeout:120000,env:{...process.env,NODE_TEST_CONTEXT:undefined}});
 assert.equal(run.status,0,run.stdout+run.stderr);
});
