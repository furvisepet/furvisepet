
import * as C from './helpers/calculation-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {clock,exercise} from '../scripts/audits/helpers/lifetime-harness.mjs';
import {stressProposal} from '../scripts/audits/helpers/current-stress-harness.mjs';
import {pets as templates,ownerId} from '../scripts/audits/fixtures/ask-lifetime-history.mjs';
const pet={...templates[0],id:'quartz',name:'Quartz'};
const row=(id,at,note)=>({...C.row(id,note),user_id:ownerId,pet_profile_id:pet.id,occurred_at:at});
const rows=[row('prior','2014-07-09T00:00:00Z','Recorded amount 3 ml.'),row('later','2026-08-01T00:00:00Z','Exact owner attribution, preserved without language routing.')];
const domain={from:'2014-07-01T00:00:00Z',to:'2014-08-01T00:00:00Z',conceptKey:null};
for(const [name,target,limited,extra]of [
 ['matching interval',{kind:'scope',...domain},true,{}],
 ['different year',{kind:'scope',from:'2015-01-01T00:00:00Z',to:'2016-01-01T00:00:00Z',conceptKey:null},false,{}],
 ['unknown target',{kind:'target_unknown'},true,{}],
 ['exact source',{kind:'source',id:'prior'},true,{sourceSemanticsTargets:[{kind:'source',id:'prior',ownerId,petId:pet.id,occurredAt:rows[0].occurred_at,conceptKey:null}]}],
 ['exact disjoint source',{kind:'source',id:'other'},false,{sourceSemanticsTargets:[{kind:'source',id:'other',ownerId,petId:pet.id,occurredAt:'2015-01-01T00:00:00Z',conceptKey:null}]}],
 ['exact claim',{kind:'claim',id:'claim-prior'},true,{sourceSemanticsTargets:[{kind:'claim',id:'claim-prior',ownerId,petId:pet.id,occurredAt:rows[0].occurred_at,conceptKey:'amount'}]}],
 ['foreign exact target',{kind:'source',id:'prior'},true,{sourceSemanticsTargets:[{kind:'source',id:'prior',ownerId:'foreign',petId:pet.id,occurredAt:rows[0].occurred_at,conceptKey:null}]}],
])test('one Brain to Labs typed attribution: '+name,async t=>{
 clock(t);const p=stressProposal({authority:'effective_fact',petNames:[pet.name],from:'2014-07-01',to:'2014-08-01'});
 const r=await exercise('Read the requested saved observations.',{fixturePets:[pet],petId:pet.id,conversationPetId:pet.id,
 rows,messages:[],history:true,interpretationProposal:p,expectedProviderCalls:0,expectedReviewCalls:0,
 graph:{sourceSemantics:{later:{classification:'attributed_correction',target}},...extra}});
 assert.equal(r.interpretationRequests.length,1);assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.deepEqual(r.result.acceptedSemanticEvents,[]);assert.deepEqual(r.result.acceptedCareActions,[]);
 assert.equal(r.result.answerValidation.assessment.outcome,limited?'limited':'complete');
 if(limited)assert.deepEqual(r.result.reasoning.relevantContextIds,[]);
 else assert.deepEqual(r.result.reasoning.labsList.records.map(x=>x.id),['prior']);
});
