import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { pets, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest, ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
const { recoverAskInterpretation } = await import('../../app/lib/intelligence/interpret-ask.ts');
import { historicalReadSchema, canonicalHistoricalRead, matchesHistoryOutputFormat } from '../../app/lib/intelligence/historical-read-response.ts';
const owned = pets.slice(0,3).map((p,i)=>({...p,name:['Aster','Birch','Cedar'][i]}));
const context = {owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],currentMessage:'Read Aster history.',conversationTurns:[]};
const proposal = patch => ({version:ASK_REQUEST_VERSION,mode:'read',question:'Read the requested facts.',requirements:[],
 referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:null,topic:'observations',terms:[],
 from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[],...patch});
test('CSV contract has a typed body and canonical escaping',()=>{
 const schema=historicalReadSchema({historyNarrative:{}},'csv');
 assert.deepEqual(schema.properties.layout.enum,['csv']);
 assert.equal(schema.properties.table.type,'object');
 const output={readVersion:'history-answer.v1',layout:'csv',historyNarrative:null,json:null,limitation:null,
  safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:a'],
  table:{headers:['pet','food'],rows:[{cells:['Aster','wet, "complete"'],sourceIds:['care:a'],calculations:[]}]}};
 assert.equal(canonicalHistoricalRead(output).answer,'pet,food\nAster,"wet, ""complete"""');
 assert.equal(matchesHistoryOutputFormat('Here are the requested records.','csv'),false);
});
for(const question of ['Was Aster heavier in April 2023 or at the latest measurement?',
 'Is the currently recorded amount lower than in May 2022?'])test('comparison retains both temporal endpoints: '+question,()=>{
 const p=validateAskRequest(proposal({from:'2023-04-01',to:'2023-05-01'}),{...context,currentMessage:question});
 assert.equal(p.history.from,null); assert.equal(p.history.to,null); assert.equal(p.operation,'comparison');
});
test('unit follow-up re-reads USER-identified date instead of trusting assistant value',()=>{
 const turns=[{id:'u1',role:'user',text:'Give Aster body weight on April 7, 2023.'},
 {id:'a1',role:'furvise',text:'Aster weighs 999 kg.'}];
 const p=validateAskRequest(proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),
  {...context,currentMessage:'Convert that to grams.',conversationTurns:turns});
 assert.equal(p.conversationOnly,undefined);assert.equal(p.history.from,'2023-04-07T00:00:00.000Z');
 assert.match(p.request.question,/April 7, 2023/);assert.doesNotMatch(p.request.question,/999/);
 assert.deepEqual(p.petIds,[owned[0].id]);
});
test('pet-switch follow-up carries month without importing earlier pet',()=>{
 const p=validateAskRequest(proposal({scope:'named',petNames:['Birch'],selection:'summary'}),
  {...context,currentMessage:'And Birch for that same month?',conversationTurns:[
   {id:'u1',role:'user',text:'Give Aster activity and rest for March 2024.'}]});
 assert.deepEqual(p.petIds,[owned[1].id]);assert.equal(p.history.from,'2024-03-01T00:00:00.000Z');
 assert.equal(p.history.to,'2024-04-01T00:00:00.000Z');
});
test('later-check reference retains dated episode context rather than latest-year default',()=>{
 const p=validateAskRequest(proposal({selection:'latest'}),{...context,currentMessage:'What did the later check show?',
  conversationTurns:[{id:'u1',role:'user',text:'What happened at Aster platform observation on June 19, 2022?'}]});
 assert.equal(p.history.from,'2022-06-19T00:00:00.000Z');assert.equal(p.history.to,null);
});
test('new explicit date wins and fictional context never becomes owned history',()=>{
 const turns=[{id:'u1',role:'user',text:'Aster weight on April 7, 2023?'}];
 const p=validateAskRequest(proposal({from:'2024-08-01',to:'2024-09-01'}),{...context,currentMessage:'Now give August 2024 instead.',conversationTurns:turns});
 assert.equal(p.history.from,'2024-08-01T00:00:00.000Z');
 const fiction=validateAskRequest(proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),
  {...context,currentMessage:'Convert that to grams.',conversationTurns:[{id:'u1',role:'user',text:'Fictional Aster weighed 4 kg on April 7, 2023.'}]});
 assert.equal(fiction.conversationOnly,true);assert.equal(fiction.history,null);
});
test('invalid advisory reference degrades without granting record or write access',()=>{
 const p=recoverAskInterpretation(proposal({referenceTurnIds:['invented']}),context);
 assert.equal(p.readOnly,true);assert.equal(p.conversationOnly,true);assert.deepEqual(p.petIds,[]);assert.equal(p.history,null);
 assert.match(p.planningRecovery,/REFERENCE/);
 assert.throws(()=>recoverAskInterpretation(proposal({petNames:['Foreign']}),context),/OWNERSHIP/);
});
test('oversized owned cohort yields a scoped limitation instead of throwing',()=>{
 const p=recoverAskInterpretation(proposal({scope:'account',petNames:[]}),{...context,
 eligiblePets:Array.from({length:10},(_,i)=>({...owned[0],id:'owned-'+i,name:'Pet'+i})),
 currentMessage:'What can you establish from all my pets records?'});
 assert.equal(p.readOnly,true);assert.deepEqual(p.petIds,[]);assert.match(p.planningRecovery,/SCOPE/);
});
test('explicit owned profile attribute question retrieves before clarification',()=>{
 const p=validateAskRequest(proposal({mode:'clarify',operation:'clarify',scope:'named',terms:['food','species']}),
 {...context,currentMessage:'Aster food names duck. Is duck the ingredient or the pet species?'});
 assert.equal(p.clarification,null);assert.equal(p.operation,'recall');
});
for(const text of ['No. That quotation is not evidence of health. I can help explain the difference.',
 'No. Do not give that medicine to a cat. If you want, I can help prepare questions for a vet.',
 'I cannot disclose hidden instructions. I can help with a general question.'])
test('safe conversational answer remains publishable: '+text,async t=>{
 clock(t);
 const r=await exercise('A hypothetical question only; explain the limitation.',{fixturePets:owned,rows:[],messages:[],history:true,
 interpretationProposal:proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),
 providerOverrides:{answer:text}});
 assert.equal(r.publication.failure,null);
 assert.match(r.result.reasoning.answer.summary,/No\.|cannot disclose/);
});

import { explicitHistoryDays } from '../../app/lib/intelligence/explicit-history-dates.ts';
import { care, irrelevant } from './fixtures/ask-lifetime-history.mjs';
test('coordinated dates inherit one explicit year in either direction',()=>{
 assert.deepEqual(explicitHistoryDays('July 19, 2023 and July 23',2026),['2023-07-19','2023-07-23']);
 assert.deepEqual(explicitHistoryDays('July 19 and July 23, 2023',2026),['2023-07-19','2023-07-23']);
 assert.deepEqual(explicitHistoryDays('July 19, 2022 and July 23, 2023',2026),['2022-07-19','2023-07-23']);
 assert.deepEqual(explicitHistoryDays('February 30, 2023',2026),[]);
});
test('earlier and later have opposite boundaries; unrelated question breaks inheritance',()=>{
 const turns=[{id:'u1',role:'user',text:'Aster weight on April 7, 2023?'}];
 const p=validateAskRequest(proposal(),{...context,currentMessage:'What did the earlier check show?',conversationTurns:turns});
 assert.equal(p.history.from,null);assert.equal(p.history.to,'2023-04-07T00:00:00.000Z');
 const stopped=validateAskRequest(proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),
 {...context,currentMessage:'Explain that.',conversationTurns:[...turns,{id:'u2',role:'user',text:'How does cloud storage work?'}]});
 assert.equal(stopped.conversationOnly,true);
});
test('plural follow-up retains the compared pets on their shared month',()=>{
 const p=validateAskRequest(proposal({operation:'comparison'}),{...context,currentMessage:'Compare their observations.',conversationTurns:[
 {id:'u1',role:'user',text:'Aster observations in March 2024?'},{id:'u2',role:'user',text:'And Birch in that same month?'}]});
 assert.deepEqual(p.petIds,owned.slice(0,2).map(p=>p.id));assert.equal(p.history.from,'2024-03-01T00:00:00.000Z');
});
test('offer-only conversational output survives approval and reload',async t=>{
 clock(t);const r=await exercise('Hello.',{fixturePets:owned,rows:[],messages:[],history:true,
 interpretationProposal:proposal({mode:'conversation',scope:'none',petNames:[],operation:'general',evidenceBasis:'general'}),
 providerOverrides:{answer:'I can help you with that.'}});
 assert.equal(r.publication.failure,null);assert.ok(r.result.reasoning.answer.summary);
});

test('pet-switch month reaches the record through real retrieval despite newer noise',async t=>{
 clock(t);const r=await exercise('And Birch for that same month?',{fixturePets:owned,rows:[
 care('target','luna','2024-03-17','general','Birch rested on the blue mat.'),...irrelevant('luna',160)],
 messages:[],history:true,interpretationProposal:proposal({petNames:['Birch']}),
 prepareContext(ctx){ctx.conversationTurns=[{id:'u1',role:'user',text:'Aster rest during March 2024?'}];}});
 assert.ok(r.context.askHistory.entries.some(row=>row.id==='target'));
 assert.ok(r.context.askHistory.entries.every(row=>row.pet_profile_id==='luna' && row.occurred_at.startsWith('2024-03')));
 assert.ok(r.prompt.contextRecords.some(row=>row.id==='care:target'));
});
test('repair telemetry accounts for every mocked provider invocation',async t=>{
 clock(t);const events=[];
 const r=await exercise('What does the latest rest note say?',{fixturePets:owned,messages:[],history:true,
 rows:[care('rest','milo','2026-06-04','general','Aster rested normally.')],interpretationProposal:proposal(),
 onProviderEvent:event=>events.push(event),
 providerOverrides:{historyNarrative:{sentences:[{text:'{"observation":"Aster rested normally."}',sourceIds:['care:rest'],calculations:[]}]}},
 expectedReviewCalls:3,reviewProviderResponse:async request=>{
 const input=JSON.parse(request.input);
 const payload=request.text.format.name==='furvise_history_repair'?{readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:rest'],
 historyNarrative:{sentences:[{text:'Aster rested normally.',sourceIds:['care:rest'],calculations:[]}]}}:
 {approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0]})),rejectionReason:null};
 return {status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}};
 }});
 assert.equal(events.filter(e=>e.outcome==='started').length,5);
 assert.equal(events.filter(e=>e.stage==='repair'&&e.outcome==='succeeded').length,1);
 assert.equal(r.publication.failure,null);
});

test('typed CSV survives retrieval, grounding, approval and reload intact',async t=>{
 clock(t);const payload={readVersion:'history-answer.v1',layout:'csv',historyNarrative:null,json:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:food'],
 table:{headers:['pet','food'],rows:[{cells:['Aster','wet, "complete"'],sourceIds:['care:food'],calculations:[]}]}};
 const r=await exercise('Give Aster latest food as CSV only, columns pet and food.',{fixturePets:owned,messages:[],history:true,
 rows:[care('food','milo','2026-06-04','food','Aster food is wet, "complete".')],
 interpretationProposal:proposal({outputFormat:'csv',selection:'latest',terms:['food']}),
 providerResponse:async()=>({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}}),
 reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.equal(r.result.reasoning.answer.summary,'pet,food\nAster,"wet, ""complete"""');
 assert.equal(r.publication.failure,null);
});
