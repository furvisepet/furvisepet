import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('structured feature provider wire compatibility',()=>{
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/feature-provider-compatibility.cases.mjs'],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stdout+r.stderr);
});
