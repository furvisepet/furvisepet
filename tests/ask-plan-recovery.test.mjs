import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
test('Ask recoverable planning, conversational routing and temporal safety',()=>{
  const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-plan-recovery.cases.mjs'],{encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,r.stdout+'\n'+r.stderr);
});
