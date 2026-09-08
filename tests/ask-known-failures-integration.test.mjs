import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('known failures through production callback',()=>{
 const run=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-known-failures.cases.mjs','scripts/audits/ask-known-failures-unit.cases.mjs'],{encoding:'utf8',timeout:30000,env:{...process.env,NODE_TEST_CONTEXT:undefined}});
 assert.match(run.stdout,/tests 22/);assert.equal(run.status,0,run.stdout+run.stderr);
});
