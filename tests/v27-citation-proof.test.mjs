import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {verifyAskCitationProof,checkedCitationSources,citationBodyHash,issueAskCitationProof} from '../app/lib/ask-citation-proof.ts';
const secret='citation-fixture-key-012345678901234567890123456789';
const body={summary:'Recorded wording.',sections:[]};
const source={id:'row',petId:'pet',text:'Exact — α\ntext.',event:'2025-02-03T10:00:00Z',recorded:'2025-02-04T11:00:00Z'};
function token(p) {
 const raw=Buffer.from(JSON.stringify(p)).toString('base64url');
 return raw+'.'+createHmac('sha256',secret).update('furvise.ask.citations.v1\0'+raw).digest('hex');
}
function fixture(t) {
 const prior=process.env.FURVISE_RATE_LIMIT_HASH_SECRET;
 process.env.FURVISE_RATE_LIMIT_HASH_SECRET=secret;
 t.after(()=>{if(prior===undefined)delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;else process.env.FURVISE_RATE_LIMIT_HASH_SECRET=prior;});
 const proof={v:1,owner:'owner',body:citationBodyHash(body),sources:[{...source,hash:createHash('sha256').update(source.text).digest('hex')}]};
 const row={id:'row',user_id:'owner',pet_profile_id:'pet',note:source.text,title:null,occurred_at:source.event,created_at:source.recorded,deleted_at:null};
 return {proof,row,signed:token(proof)};
}
test('authenticated replay binds exact answer, account and exact source snapshot',t=>{
 const {proof,row,signed}=fixture(t);
 assert.deepEqual(verifyAskCitationProof(signed,'owner',body),proof);
 const sources=checkedCitationSources(proof,[row]);
 assert.equal(sources[0].quote,source.text);
 assert.deepEqual(Object.keys(sources[0]).sort(),['eventAt','label','quote','recordedAt']);
 for(const changed of [{user_id:'other'},{pet_profile_id:'other'},{note:'Changed'},{deleted_at:'2025-03-01'},{occurred_at:source.recorded},{created_at:source.event}])
  assert.equal(checkedCitationSources(proof,[{...row,...changed}]),null);
 assert.equal(checkedCitationSources(proof,[]),null);
 assert.equal(checkedCitationSources(proof,[row,row]),null);
 assert.equal(verifyAskCitationProof(signed,'other',body),null);
 for(const changed of [{title:'Changed'},{safetyNote:'Unverified claim'},{supportingText:'Unverified claim'},{sections:[{heading:'New',items:['claim']}]}])
  assert.equal(verifyAskCitationProof(signed,'owner',{...body,...changed}),null);

 assert.equal(verifyAskCitationProof(signed,'owner',{...body,summary:'Changed'}),null);
 assert.equal(verifyAskCitationProof(signed.slice(0,-1)+'x','owner',body),null);
});
test('arbitrary model or persisted JSON cannot mint source proof',t=>{
 fixture(t);
 assert.equal(issueAskCitationProof(undefined,body,'owner'),null);
 assert.equal(verifyAskCitationProof(JSON.stringify({sources:[{...source,hash:createHash('sha256').update(source.text).digest('hex')}]}),'owner',body),null);
 delete process.env.FURVISE_RATE_LIMIT_HASH_SECRET;
 assert.equal(verifyAskCitationProof('anything','owner',body),null);
});
