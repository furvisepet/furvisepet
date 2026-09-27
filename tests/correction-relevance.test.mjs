import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceSemanticsSnapshot,sourceSemanticsDigest,readAttributedSourceSemantics,attributedCorrectionRelevance,readSourceSemantics} from '../app/lib/intelligence/correction-relevance.ts';
const row={id:'report',user_id:'owner',pet_profile_id:'quartz',note:'Exact attributed report \u03b1.',title:null,
 occurred_at:'2026-09-01T00:00:00Z',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-09-01T00:00:00Z',deleted_at:null};
const domain={ownerId:'owner',petId:'quartz',from:'2014-07-01T00:00:00Z',to:'2014-08-01T00:00:00Z',conceptKey:'body_mass'};
function fixture(target={kind:'target_unknown'},classification='attributed_correction'){
 const payload={version:'source-semantics.v1',source:sourceSemanticsSnapshot(row),classification,target};
 const text=JSON.stringify(payload);
 const claim={source_message_lineage_id:row.id,claim_kind:'assertion',user_id:'owner',subject_type:'pet',subject_id:'quartz',operation_type:'assert',knowledge_status:'unconfirmed',
  modality:'reported',persistence_destination:'none',turn_payload_hash:sourceSemanticsDigest(text),governance_metadata:{sourceSemanticsPayload:text}};
 return {payload,claim};
}
for(const [name,target,expected]of [
 ['matching historical scope',{kind:'scope',from:domain.from,to:domain.to,conceptKey:'body_mass'},'relevant'],
 ['unrelated year',{kind:'scope',from:'2015-01-01T00:00:00Z',to:'2016-01-01T00:00:00Z',conceptKey:null},'disjoint'],
 ['adjacent exclusive interval',{kind:'scope',from:domain.to,to:'2014-09-01T00:00:00Z',conceptKey:null},'disjoint'],
 ['different canonical concept',{kind:'scope',from:domain.from,to:domain.to,conceptKey:'food_intake'},'disjoint'],
 ['unknown target',{kind:'target_unknown'},'unknown'],
 ['partial target',{kind:'scope',from:null,to:null,conceptKey:null},'unknown'],
])test('typed correction relevance: '+name,()=>{
 const {claim}=fixture(target),value=readAttributedSourceSemantics(claim,row,'owner');
 assert.ok(value);assert.equal(attributedCorrectionRelevance(value,domain),expected);
});
test('exact source/claim targets never become scope guesses',()=>{
 for(const kind of ['source','claim']){
  const {claim}=fixture({kind,id:'prior'}),value=readAttributedSourceSemantics(claim,row,'owner');
  const field=kind==='source'?'sourceIds':'claimIds';
  assert.equal(attributedCorrectionRelevance(value,{...domain,[field]:['prior']}),'relevant');
  assert.equal(attributedCorrectionRelevance(value,{...domain,[field]:['other']}),'unknown');
  assert.equal(attributedCorrectionRelevance(value,{...domain,[field]:['other'],exactSetComplete:true}),'disjoint');
 }
});
test('owner and subject are exact and observation classification confers no correction',()=>{
 const {claim}=fixture(),value=readAttributedSourceSemantics(claim,row,'owner');
 assert.equal(attributedCorrectionRelevance(value,{...domain,petId:'nyx'}),'disjoint');
 assert.equal(attributedCorrectionRelevance(value,{...domain,ownerId:'foreign'}),'disjoint');
 const ordinary=fixture(null,'observation');assert.equal(attributedCorrectionRelevance(readAttributedSourceSemantics(ordinary.claim,row,'owner'),domain),'disjoint');
});
for(const [name,change]of [
 ['deleted source',(c,r)=>r.deleted_at='2026-09-02T00:00:00Z'],
 ['foreign source',(c,r)=>r.user_id='foreign'],['wrong subject',(c,r)=>r.pet_profile_id='nyx'],
 ['changed body',(c,r)=>r.note+=' changed'],['changed source version',(c,r)=>r.updated_at='2026-09-02T00:00:00Z'],
 ['changed attribution',(c)=>c.governance_metadata.sourceSemanticsPayload=c.governance_metadata.sourceSemanticsPayload.replace('target_unknown','scope')],
 ['effective claim',(c)=>c.knowledge_status='effective'],['effective operation',(c)=>c.operation_type='correct'],
 ['history destination',(c)=>c.persistence_destination='history'],['foreign claim',(c)=>c.user_id='foreign'],
])test('source-bound attribution fails closed: '+name,()=>{
 const {claim}=fixture(),source={...row};change(claim,source);assert.equal(readAttributedSourceSemantics(claim,source,'owner'),null);
});
test('invalid intervals and added authority fields are rejected',()=>{
 for(const value of [
 {classification:'attributed_correction',target:{kind:'scope',from:domain.to,to:domain.from,conceptKey:null}},
 {classification:'attributed_correction',target:{kind:'scope',from:'2014-07-01',to:domain.to,conceptKey:null}},
 {classification:'observation',target:{kind:'target_unknown'}},
 {classification:'observation',target:null,effective:true},
 ])assert.equal(readSourceSemantics(value),null);
});

for(const kind of ['source','claim'])test('fresh exact '+kind+' target interval is compared without prose',()=>{
 const value=readAttributedSourceSemantics(fixture({kind,id:'prior'}).claim,row,'owner');
 const target={kind,id:'prior',ownerId:'owner',petId:'quartz',occurredAt:'2015-01-01T00:00:00Z',conceptKey:null};
 assert.equal(attributedCorrectionRelevance(value,{...domain,exactTargets:[target]}),'disjoint');
 assert.equal(attributedCorrectionRelevance(value,{...domain,exactTargets:[{...target,occurredAt:domain.from}]}),'relevant');
 assert.equal(attributedCorrectionRelevance(value,{...domain,exactTargets:[{...target,petId:'foreign'}]}),'unknown');
});
