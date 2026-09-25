import test from 'node:test';
import assert from 'node:assert/strict';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { pets,ownerId,care } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest,ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
const {assertStoredPublicationUnavailable}=await import('../../tests/helpers/unsupported-stored-publication.mjs');
const {certifiedHistoryRead}=await import('../../tests/helpers/certified-history-read.mjs');
const storedFixture=(rows,subjects=owned)=>({scope:{authorizedPetIds:subjects.map(p=>p.id)},petNames:Object.fromEntries(subjects.map(p=>[p.id,p.name])),represented:rows.map(r=>({sourceId:'care:'+r.id,sourceType:'care_update',petId:r.pet_profile_id,text:r.note,occurredAt:r.occurred_at,createdAt:r.created_at}))});
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
test('uncertified calculation history remains source-free and limited',async()=>{
 const e=storedFixture([care('calc',owned[0].id,'2024-03-15','exercise','Aster had 31 minutes activity and 4 minutes separate rest.')],[owned[0]]);
 e.interpretation={request:{mode:'read',evidenceBasis:'saved_history',quantity:'duration'}};
 const r=await assertStoredPublicationUnavailable(e);
 assert.doesNotMatch(JSON.stringify(r.answer),/31 minutes|4 minutes/);
});

test('ten-pet CSV projection cannot publish uncertified converted values',async()=>{
 const cohort=Array.from({length:10},(_,i)=>({...pets[0],id:'export'+i,name:'Pet'+i}));
 const rows=cohort.map((p,i)=>care('export'+i,p.id,'2024-04-07','weight',p.name+' body weight was '+(i+1)+' kg without equipment.'));
 const e=storedFixture(rows,cohort);e.interpretation={request:{mode:'read',evidenceBasis:'saved_history',outputFormat:'csv',projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}}};
 const r=await assertStoredPublicationUnavailable(e);assert.doesNotMatch(JSON.stringify(r.answer),/10000|Pet9,/);
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
for(const format of ['csv','table']) test('projection metadata cannot authorize converted comparison facts: '+format,async()=>{
 const cohort=owned.slice(0,2),rows=cohort.map((p,i)=>care('projection-day'+i,p.id,'2024-04-07','general',p.name+' body weight was '+(i+1)+' kg without equipment.'));
 const e=storedFixture(rows,cohort);e.interpretation={request:{mode:'read',evidenceBasis:'saved_history',outputFormat:format,projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}}};
 await assertStoredPublicationUnavailable(e);
});

for(const question of ['Compare weights on April 7 2024 versus April 8 2024.','Compare weights as of April 7 2024.','Compare weights on April 7 2024 with previous weights.']) test('projection metadata cannot erase another temporal obligation: '+question,()=>{
 const result=validateAskRequest(proposal({operation:'comparison',quantity:'measurement',from:'2024-04-07',to:'2024-04-08',outputFormat:'csv',
 projection:{nameHeader:'pet',valueHeader:'grams',quantity:'body_mass',unit:'g',order:'name_ascending'}}),
 {owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],conversationTurns:[],currentMessage:question});
 assert.equal(result.history.from,null);
});
test('companion punctuation preserves quotations and code before factual review',async()=>{
 const {normalizeCompanionProse}=await import('../../app/lib/furvise-voice.ts');
 assert.equal(normalizeCompanionProse('Aster ate normally — the notes do not say why.'),'Aster ate normally, the notes do not say why.');
 for(const text of ['The note says "ate — then rested".', 'The note says “ate — then rested”.', '```json\n{"note":"ate — then rested"}\n```']) assert.equal(normalizeCompanionProse(text),text);
});
test('certified historical notes retain exact owner wording without narrative review',async()=>{
 const note='Aster ate normally. The cause of the earlier appetite change was not recorded.';
 const r=await certifiedHistoryRead(storedFixture([care('voice',owned[0].id,'2024-04-07','general',note)],[owned[0]]));
 assert.equal(r.response.labsList.records[0].body,note);
 assert.equal(r.validation.assessment.outcome,'complete');
});

test('uncertified summary cannot publish notes or invented replacement prose',async()=>{
 const note='Aster did not eat breakfast ? the reason was not recorded.';
 const r=await assertStoredPublicationUnavailable(storedFixture([care('limited-voice',owned[0].id,'2024-04-07','general',note)],[owned[0]]));
 assert.doesNotMatch(JSON.stringify(r.answer),/Aster ate normally|did not eat breakfast/);
});

test('uncertified history has no factual repair or review timeout path',async()=>{
 const r=await assertStoredPublicationUnavailable(storedFixture([care('timeout-voice',owned[0].id,'2024-04-07','general','Aster rested normally.')],[owned[0]]));
 assert.equal(r.relevantContextIds.length,0);
 assert.doesNotMatch(JSON.stringify(r.answer),/rested normally|repair_timeout|review_timeout/);
});
