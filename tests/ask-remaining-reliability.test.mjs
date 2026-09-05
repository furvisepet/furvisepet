import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('remaining reliability callback cases',()=>{
  const result=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-remaining-reliability.cases.mjs'],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
