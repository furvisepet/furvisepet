import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
test('Ask recoverable planning, conversational routing and temporal safety',()=>{
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-plan-recovery.cases.mjs'],{env:{...process.env,NODE_TEST_CONTEXT:undefined},encoding:'utf8',timeout:120000});
  assert.match(r.stdout,/tests [1-9]/,'child audit must actually execute cases');
 assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
