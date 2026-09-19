import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { care, pets } from './fixtures/ask-lifetime-history.mjs';
const proposal=(q,patch={})=>({version:'ask-request.v2',mode:'read',question:q,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Milo'],operation:'recall',selection:'summary',quantity:'records',topic:'history',terms:[],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[],...patch});
const noWrites=r=>{assert.deepEqual(r.result.acceptedCareActions,[]);assert.deepEqual(r.result.acceptedLearnings,[]);assert.deepEqual(r.result.acceptedSemanticEvents,[]);};

test('two explicit dated observations both survive into final evidence',async t=>{
 clock(t);const q='How much longer did Milo play with the violet ball on August 12 than on August 11, 2026?';
 const rows=[care('play11','milo','2026-08-11','general','Milo played with a violet ball for 14 minutes.'),care('play12','milo','2026-08-12','general','Milo played with a violet ball for 17 minutes.')];
 const text='Milo played for 14 minutes on August 11 and 17 minutes on August 12, which was 3 minutes longer.';
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,{operation:'comparison',selection:'comparison',topic:'activity',terms:['play','violet ball']}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:play11','care:play12'],calculations:[]}]}}});
 for(const id of ['care:play11','care:play12'])assert.ok(r.prompt.contextRecords.some(x=>x.id===id),id);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');noWrites(r);
});
test('three coordinated months retain one observation from every named month',async t=>{
 clock(t);const q='Across June, July, and August 2026, what pattern is recorded in Milo’s puzzle-feeder play time?';
 const rows=[care('jun','milo','2026-06-15','activity','Milo had 9 minutes of puzzle-feeder play.'),care('jul','milo','2026-07-15','activity','Milo had 13 minutes of puzzle-feeder play.'),care('aug','milo','2026-08-15','activity','Milo had 17 minutes of puzzle-feeder play.')];
 const text='Milo’s recorded puzzle-feeder play increased from 9 minutes in June to 13 in July and 17 in August 2026.';
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,{selection:'summary',topic:'activity',terms:['puzzle feeder','play'],from:'2026-06-01',to:'2026-09-01'}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:jun','care:jul','care:aug'],calculations:[]}]}}});
 for(const id of ['care:jun','care:jul','care:aug'])assert.ok(r.prompt.contextRecords.some(x=>x.id===id),id);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');noWrites(r);
});

test('explicit owned multi-pet read preserves both pet evidence and no write authority',async t=>{
 clock(t);const luna=pets.find(p=>p.id==='luna')||pets[1];const q='Compare Milo and Luna recorded weights.';
 const rows=[care('milo-w','milo','2026-08-09','general','Milo weighed 3.8 kg.'),care('luna-w',luna.id,'2026-08-15','general',`${luna.name} weighed 14.8 kg.`)];
 const text=`Milo weighed 3.8 kg and ${luna.name} weighed 14.8 kg.`;
 const r=await exercise(q,{history:true,fixturePets:pets,rows,messages:[],interpretationProposal:proposal(q,{operation:'comparison',selection:'comparison',petNames:['Milo',luna.name],topic:'weight',terms:['weight']}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:milo-w','care:luna-w'],calculations:[]}]}}});
 for(const id of ['care:milo-w','care:luna-w'])assert.ok(r.prompt.contextRecords.some(x=>x.id===id),id);
 assert.deepEqual(r.result.reasoning.evidenceContract.scope.authorizedPetIds.sort(),['milo',luna.id].sort());noWrites(r);
});
test('latest semantic obligation pins the newest matching candidate through representation',async t=>{
 clock(t);const q="What is the latest saved note about Milo's appetite and energy?";
 const rows=[
  care('latest-tired','milo','2026-08-16','general','Milo seemed more tired than usual and only ate half breakfast.'),
  care('older-food','milo','2026-08-10','food','Milo ate 83 g of his usual food at breakfast.'),
 ];
 const text='The latest matching note says Milo seemed more tired than usual and ate only half breakfast on August 16, 2026.';
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,{selection:'latest',topic:'appetite and energy',terms:['appetite','energy'],evidenceNeeds:[{quote:q,sourceTurnId:null,petNames:['Milo'],terms:['appetite','energy'],order:'latest'}]}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:latest-tired'],calculations:[]}]}}});
 assert.ok(r.prompt.contextRecords.some(x=>x.id==='care:latest-tired'),'latest matching candidate must be represented');
 assert.ok(!r.result.reasoning.evidenceContract.history?.requiredSourceIds?.includes('care:older-food'),'older match must not replace latest obligation');
 noWrites(r);
});
test('duplicate newest semantic matches cannot let an older candidate replace latest',async t=>{
 clock(t);const q="What is the latest saved note about Milo's appetite and energy?";
 const rows=[
  care('latest-a','milo','2026-08-16','general','Milo seemed more tired than usual and only ate half breakfast.',{occurred_at:'2026-08-16T05:50:26.945Z'}),
  care('latest-b','milo','2026-08-16','general','Milo seemed more tired than usual and only ate half breakfast.',{occurred_at:'2026-08-16T04:29:20.720Z'}),
  care('older-food','milo','2026-08-10','food','On August 10, 2026, Milo ate 83 g of his usual food at breakfast.'),
 ];
 const text='The latest matching note says Milo seemed more tired than usual and ate only half breakfast on August 16, 2026.';
 const r=await exercise(q,{history:true,rows,messages:[],interpretationProposal:proposal(q,{selection:'latest',topic:'appetite and energy',terms:['appetite','energy'],evidenceNeeds:[{quote:q,sourceTurnId:null,petNames:['Milo'],terms:['appetite','energy'],order:'latest'}]}),expectedReviewCalls:1,reviewResponse:{approved:true},providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:latest-a'],calculations:[]}]}}});
 assert.ok(r.prompt.contextRecords.some(x=>x.id==='care:latest-a'),'newest duplicate must survive representation');
 assert.ok(!r.result.reasoning.evidenceContract.history?.requiredSourceIds?.includes('care:older-food'));
 noWrites(r);
});
