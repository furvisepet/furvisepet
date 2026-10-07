import * as C from '../../tests/helpers/canonical-calculation-retirement.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {care,pets} from './fixtures/ask-lifetime-history.mjs';
const ticket=({from=null,to=null,terms=[],directions=[]}={})=>({
 authority:'effective_fact',operation:'read',subjectScope:'named',temporal:{from,to,anchor:null},predicates:terms.length?[{kind:'text_any',terms}]:[],
 selection:directions.length?{groupBy:['subject'],union:directions.map(direction=>({orderBy:[{field:'event_at',direction}],take:{count:1,per:'group'}}))}:null,
 outputs:{completeness:directions.length?'sufficient':'exhaustive',ordering:'asc',limit:null}});
const proposal=(q,read,patch={})=>({version:'ask-request.v2',mode:'read',question:q,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Milo'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[],readTicket:read,...patch});
function noWrites(r){
 assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);assert.equal(r.publication.failure,null);
}
function exactRows(r,rows){
 assert.equal(r.result.reasoning.model,'server-labs-list');
 assert.deepEqual(r.result.reasoning.labsList.records.map(x=>[x.sourceId,x.petId,x.body]),rows.map(x=>['care:'+x.id,x.pet_profile_id,x.note]));
}
test('two explicit dated observations survive as source-bound arithmetic operands',async t=>{
 clock(t);const q='How much longer did Milo play with the violet ball on August 12 than on August 11, 2026?';
 const rows=[care('play11','milo','2026-08-11','general','Milo played with a violet ball for 14 minutes.'),care('play12','milo','2026-08-12','general','Milo played with a violet ball for 17 minutes.')];
 const read=ticket({from:'2026-08-11T00:00:00Z',to:'2026-08-13T00:00:00Z',terms:['violet ball'],directions:['asc','desc']});
 const calculatePlan={operation:'calculate',calculations:[C.calculation('difference',[{...C.slot(1,0,'Milo','measurement','min'),role:'target'},{...C.slot(0,0,'Milo','measurement','min'),role:'reference'}],'min')]};
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,read,{quantity:'measurement',calculatePlan})});
 const result=r.result.reasoning.calculationLabs.execution.results[0];
 assert.equal(result.value,3);assert.equal(result.unit,'min');assert.deepEqual(new Set(result.sourceIds),new Set(['care:play11','care:play12']));
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');noWrites(r);
});
test('three named months retain exact observations and disclose unsupported companion pattern analysis',async t=>{
 clock(t);const q='Across June, July, and August 2026, what pattern is recorded in Milo’s puzzle-feeder play time?';
 const rows=[care('jun','milo','2026-06-15','activity','Milo had 9 minutes of puzzle-feeder play.'),care('jul','milo','2026-07-15','activity','Milo had 13 minutes of puzzle-feeder play.'),care('aug','milo','2026-08-15','activity','Milo had 17 minutes of puzzle-feeder play.')];
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,ticket({from:'2026-06-01T00:00:00Z',to:'2026-09-01T00:00:00Z',terms:['puzzle-feeder']}),{requirements:['Explain the recorded play-time pattern across the three months.']})});
 exactRows(r,rows);assert.equal(r.result.answerValidation.assessment.outcome,'limited');noWrites(r);
});
test('explicit owned multi-pet read preserves both pet evidence and no write authority',async t=>{
 clock(t);const luna=pets.find(p=>p.id==='luna');const q='Compare Milo and Luna recorded weights.';
 const rows=[care('milo-w','milo','2026-08-09','general','Milo weighed 3.8 kg.'),care('luna-w',luna.id,'2026-08-15','general',luna.name+' weighed 14.8 kg.')];
 const r=await exercise(q,{history:true,fixturePets:pets,rows,messages:[],interpretationProposal:proposal(q,ticket({terms:['weigh']}),{petNames:['Milo',luna.name]})});
 exactRows(r,rows);assert.deepEqual(r.result.reasoning.evidenceContract.scope.authorizedPetIds.sort(),['milo',luna.id].sort());noWrites(r);
});
for(const duplicate of [false,true])test(duplicate?'duplicate newest semantic matches cannot replace the newest exact record':'explicit semantic search terms preserve the newest matching record',async t=>{
 clock(t);const q="What is the latest saved note about Milo's appetite and energy?";
 const newest=care(duplicate?'latest-a':'latest-tired','milo','2026-08-16','general','Milo seemed more tired than usual and only ate half breakfast.',{occurred_at:'2026-08-16T05:50:26.945Z'});
 const rows=[newest,...(duplicate?[care('latest-b','milo','2026-08-16','general',newest.note,{occurred_at:'2026-08-16T04:29:20.720Z'})]:[]),care('older-food','milo','2026-08-10','food','Milo ate 83 g of his usual food at breakfast.')];
 // Search semantics are an explicit Brain fixture. The harness infers no synonyms.
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,ticket({terms:['tired','breakfast'],directions:['desc']}))});
 exactRows(r,[newest]);assert.deepEqual(r.result.reasoning.relevantContextIds,['care:'+newest.id]);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');noWrites(r);
});
