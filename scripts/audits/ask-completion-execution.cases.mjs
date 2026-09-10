import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { pets,ownerId,care } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest,ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
const owned=pets.slice(0,3).map((p,i)=>({...p,name:['Aster','Birch','Cedar'][i]}));
const proposal=patch=>({version:ASK_REQUEST_VERSION,mode:'read',question:'Read the requested facts.',requirements:[],referenceTurnIds:[],scope:'named',petNames:['Aster'],
 operation:'recall',selection:'summary',quantity:'duration',topic:'activity',terms:['activity'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,
 evidenceBasis:'saved_history',premiseQuotes:[],...patch});
const turns=[{id:'u1',role:'user',text:'Give Aster activity for March 2024.'},{id:'a1',role:'furvise',text:'Cedar did 900 minutes.'},
 {id:'u2',role:'user',text:'And Birch for that same month?'}];
for(const verb of ['rank','order','sort','compare','list']) for(const subject of ['those two pets','both','their active times'])
test('plural scope invariant: '+verb+' '+subject,()=>{
 const p=validateAskRequest(proposal(),{owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],conversationTurns:turns,
 currentMessage:'Can you '+verb+' '+subject+' for that month?'});
 assert.deepEqual(p.petIds,[owned[0].id,owned[1].id]);assert.equal(p.history.from,'2024-03-01T00:00:00.000Z');
 assert.doesNotMatch(p.request.question,/900/);
});
test('explicit narrowing and a topic reset do not preserve irrelevant pets',()=>{
 const context={owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],conversationTurns:turns,currentMessage:'For that month, give only Birch activity.'};
 assert.deepEqual(validateAskRequest(proposal({petNames:['Birch']}),context).petIds,[owned[1].id]);
 context.conversationTurns=[...turns,{id:'u3',role:'user',text:'Explain cloud storage.'}];context.currentMessage='Explain that further.';
 const p=validateAskRequest(proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),context);
 assert.equal(p.conversationOnly,true);
});
test('unreviewed excerpt fallback remains safe but reports unmet final completion',async t=>{
 clock(t);
 const r=await exercise('Give Aster March 2024 active minutes, rest and total.',{fixturePets:owned,history:true,expectedReviewCalls:1,
 rows:[care('calc',owned[0].id,'2024-03-15','exercise','Aster had 31 minutes activity and 4 minutes separate rest.')],
 interpretationProposal:proposal({from:'2024-03-01',to:'2024-04-01'}),
 providerOverrides:{answer:'Activity was recorded.',historyNarrative:null}});
 assert.equal(r.result.answerValidation.valid,true);
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.equal(r.result.answerValidation.assessment.checks.taskCompletion,'failed');
 assert.ok(r.result.answerValidation.completion.every(c=>c.status==='missing'));
});

test('ten-pet CSV bypasses narrative generation but requires independent review and survives reload',async t=>{
 clock(t);
 const cohort=Array.from({length:10},(_,i)=>({...pets[0],id:'export'+i,name:'Pet'+i}));
 const rows=cohort.map((p,i)=>care('export'+i,p.id,'2024-04-07','weight',p.name+' body weight was '+(i+1)+' kg without equipment.'));
 const r=await exercise('Give all ten pets body weights on April 7 2024 as CSV in grams, alphabetically.',{
  fixturePets:cohort,petId:cohort[0].id,rows,history:true,expectedProviderCalls:0,expectedReviewCalls:1,reviewResponse:{approved:true},
  interpretationProposal:proposal({scope:'account',petNames:[],quantity:'measurement',topic:'weight',terms:['weight'],from:'2024-04-07',to:'2024-04-08',outputFormat:'csv',
   projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}})});
 assert.equal(r.publication.failure,null);
 assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.equal(r.result.reasoning.answer.summary.split('\n').length,11);
 assert.match(r.result.reasoning.answer.summary,/Pet9,10000/);
});
test('deterministic generation can still enter one repair and independent re-review within existing call cap',async t=>{
 clock(t);
 const {runAdmittedAiOperation}=await import('../../app/lib/ai/usage-guard/admission.ts');
 const {MemoryAiGuardTestStore}=await import('../../app/lib/ai/usage-guard/memory-test-store.ts');
 const {OPENAI_ANALYSIS_MODEL}=await import('../../app/lib/ai/config.ts');
 const {executeAdmittedProviderCall}=await import('../../app/lib/ai/usage-guard/provider-call-budget.ts');
 const call=purpose=>executeAdmittedProviderCall({purpose,model:OPENAI_ANALYSIS_MODEL,providerInput:'test',maxOutputTokens:10,invoke:async()=>({usage:{input_tokens:1,output_tokens:1}})});
 await runAdmittedAiOperation({store:new MemoryAiGuardTestStore(),feature:'ask',intendedModel:OPENAI_ANALYSIS_MODEL,env:{NODE_ENV:'test'},payload:{},userId:ownerId,requestId:'deterministic-phases'},async()=>{
  await call();await call('history_review');await assert.rejects(call('history_rereview'));
  await call('history_repair');await call('history_rereview');await assert.rejects(call('history_repair'));
 });
});

for (const mode of ['read','conversation','clarify']) test('trusted dated USER scope recovers unknown model reference: '+mode,()=>{
 const c={owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],conversationTurns:turns,currentMessage:'Rank those two pets for that month.'};
 const result=validateAskRequest(proposal({mode,referenceTurnIds:['invented','a1']}),c);
 assert.deepEqual(result.petIds,[owned[0].id,owned[1].id]);
 assert.deepEqual(result.request.referenceTurnIds,['a1','u1','u2']);
 assert.equal(result.history.from,'2024-03-01T00:00:00.000Z');
 assert.doesNotMatch(result.request.question,/900/);
 for(const patch of [{mode:'update'},{mode:'mixed'},{evidenceBasis:'supplied_context'}]) assert.throws(()=>validateAskRequest(proposal({...patch,referenceTurnIds:['invented']}),c));
 assert.throws(()=>validateAskRequest(proposal({referenceTurnIds:['invented']}),{...c,conversationTurns:[]}));
});
for(const format of ['csv','table']) test('exact-day typed projection survives redundant comparison operation: '+format,async t=>{
 clock(t);
 const cohort=owned.slice(0,2),rows=cohort.map((p,i)=>care('projection-day'+i,p.id,'2024-04-07','general',p.name+' body weight was '+(i+1)+' kg without equipment.'));
 const r=await exercise('Compare all pets body weights on April 7 2024 as '+format+' in grams, alphabetically.',{
 fixturePets:cohort,petId:cohort[0].id,rows,history:true,expectedProviderCalls:0,expectedReviewCalls:1,reviewResponse:{approved:true},
 interpretationProposal:proposal({operation:'comparison',scope:'account',petNames:[],quantity:'measurement',topic:'weight',terms:['weight'],from:'2024-04-07',to:'2024-04-08',outputFormat:format,
 projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}})});
 assert.equal(r.publication.failure,null);assert.equal(r.result.answerValidation.assessment.outcome,'complete');
});
for(const question of ['Compare weights on April 7 2024 versus April 8 2024.','Compare weights as of April 7 2024.','Compare weights on April 7 2024 with previous weights.']) test('projection metadata cannot erase another temporal obligation: '+question,()=>{
 const result=validateAskRequest(proposal({operation:'comparison',quantity:'measurement',from:'2024-04-07',to:'2024-04-08',outputFormat:'csv',
 projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}}),
 {owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],conversationTurns:[],currentMessage:question});
 assert.equal(result.history.from,null);
});