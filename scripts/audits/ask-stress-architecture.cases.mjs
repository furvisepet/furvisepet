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
test('mixed history review preserves a requested record-edit confirmation without creating an observation',async t=>{
 clock(t);
 const question='Correct Aster’s June 4, 2026 walking note to 19 minutes, keeping the same date.';
 let reviewedAction;
 const r=await exercise(question,{fixturePets:owned,messages:[],history:true,
  rows:[care('11000000-0000-4000-8000-000000000101','milo','2026-06-04','general','Aster walked for 18 minutes.')],
  interpretationProposal:proposal({mode:'mixed',mutationIntent:'correct_record',from:'2026-06-04',to:'2026-06-05',frame:null}),
  providerOverrides:{answer:'Review the proposed correction below.',relevantContextIds:['care:11000000-0000-4000-8000-000000000101'],semanticEvents:[],
    historyNarrative:{sentences:[{text:'The proposed correction is 19 minutes; review it below.',sourceIds:['care:11000000-0000-4000-8000-000000000101','request:current'],calculations:[]}]},
    applicationActions:[{kind:'care_history.edit',explicitIntent:true,evidence:question,input:{field:null,value:null,title:null,detail:'Aster walked for 19 minutes.',category:'general',target:'specified'}}]},
  expectedReviewCalls:1,reviewProviderResponse:async request=>{
    const input=JSON.parse(request.input);reviewedAction=input.actions[0];
    assert.equal(input.sources.find(s=>s.sourceId==='request:current').sourceType,'current_request');
    assert.equal(reviewedAction.kind,'care_history.edit');
    assert.equal(reviewedAction.executionDisposition,'requires_confirmation');
    return {status:'completed',output_text:JSON.stringify({approved:true,retainedSentenceIndexes:[0],rejectionReason:null,
      obligations:input.obligations.map(o=>({index:o.index,status:'action_ready',sentenceIndexes:[0],actionIndexes:[0]}))}),usage:{input_tokens:500,output_tokens:100}};
  }});
 assert.ok(reviewedAction);
 assert.equal(r.result.acceptedSemanticEvents.length,0);
 assert.equal(r.result.reasoning.applicationActions[0].kind,'care_history.edit');
 assert.ok(r.result.reasoning.referencedRecords.some(record=>record.id==='care:11000000-0000-4000-8000-000000000101'));
 const {prepareFurviseApplicationActions,resolveFurviseActionTargetBindings}=await import('../../app/lib/application-actions/planner.ts');
 const actions=prepareFurviseApplicationActions({proposals:r.result.reasoning.applicationActions,petId:owned[0].id,petName:'Aster',requestId:'test',sourceMessage:question});
 assert.deepEqual(resolveFurviseActionTargetBindings({actions,referencedRecords:r.result.reasoning.referencedRecords}),{'test:1':'11000000-0000-4000-8000-000000000101'});
});
test('receipt records retain per-record dates through generation and shared eligibility',async t=>{
 clock(t);
 const {eligibleAnswerSources}=await import('../../app/lib/intelligence/ask-evidence.ts');
 const {historyNarrativeAnchorsSupported}=await import('../../app/lib/intelligence/history-narrative-facts.ts');
 const prior='Save the feeding observation.';
 const note='Aster ate 71 g of food.';
 const r=await exercise('Which dated record is linked to the prior request?',{fixturePets:owned,rows:[],messages:[],
  prepareContext(ctx){ctx.conversationTurns=[{id:'receipt-turn',role:'user',text:prior,createdAt:'2026-09-03T00:00:00.000Z',operationReceipt:{
   sourceMessageId:'receipt-turn',petId:owned[0].id,requestText:prior,answerPersisted:true,
   records:[{id:'receipt-record',note,occurredAt:'2026-09-02T00:00:00.000Z'}],
  }},{id:'current-turn',role:'user',text:ctx.currentMessage,createdAt:'2026-09-04T00:00:00.000Z'}];}});
 const source=r.prompt.contextRecords.find(s=>s.id==='operation:receipt-turn:record:receipt-record');
 assert.ok(source);assert.equal(source.occurredAt,'2026-09-02T00:00:00.000Z');assert.ok(source.value.includes(note));
 const evidence=r.prompt.evidenceContract;
 const eligible=eligibleAnswerSources(evidence);
 const dated=eligible.find(s=>s.sourceId===source.id);assert.ok(dated);
 assert.equal(historyNarrativeAnchorsSupported('September 2, 2026: "Aster ate 71 g of food."',[dated],'',[],false),true);
 assert.equal(historyNarrativeAnchorsSupported('September 3, 2026: "Aster ate 71 g of food."',[dated],'',[],false),false);
 const forged=structuredClone(evidence);forged.represented.find(s=>s.sourceId===source.id).text='Aster ate 700 g.';
 assert.equal(eligibleAnswerSources(forged).some(s=>s.sourceId===source.id),false);
 const removed=structuredClone(evidence);removed.operationReceipts[0].records=[];
 assert.equal(eligibleAnswerSources(removed).some(s=>s.sourceId===source.id),false);
});
test('general explanation cannot erase a declared owned navigation destination',()=>{
 const result=validateAskRequest(proposal({operation:'navigate',evidenceBasis:'general',terms:['vomiting'],from:'2024-01-01',to:'2025-01-01'}),
  {...context,currentMessage:'Open Aster’s history and explain how notes differ from episodes.'});
 assert.deepEqual(result.petIds,[owned[0].id]);
 assert.equal(result.request.evidenceBasis,null);assert.equal(result.history,null);assert.equal(result.readOnly,true);
 assert.equal(result.conversationOnly,undefined);
 const general=validateAskRequest(proposal({operation:'general',mode:'conversation',scope:'none',petNames:[],evidenceBasis:'general'}),
  {...context,currentMessage:'Explain how notes differ from episodes.'});
 assert.deepEqual(general.petIds,[]);assert.equal(general.history,null);
});
test('invalid planner references get one repair while repeated invalid references still fail closed',async()=>{
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 for(const repeatInvalid of [false,true]) {
  const calls=[];
  const client={responses:{create:async request=>{calls.push(request);return {status:'completed',output_text:JSON.stringify(proposal({referenceTurnIds:calls.length===1||repeatInvalid?['invented-turn']:[]})),usage:{input_tokens:10,output_tokens:10}};}}};
  const invoke=()=>interpretAskQuestion({context,model:'gpt-5.4-mini',client});
  if(repeatInvalid) { const limited=await invoke(); assert.deepEqual(limited.petIds,[]); assert.equal(limited.history,null); assert.equal(limited.request,undefined); }
  else assert.deepEqual((await invoke()).request.referenceTurnIds,[]);
  assert.equal(calls.length,2);
  assert.match(calls[1].instructions,/ASK_REQUEST_CONTRACT_REFERENCE/);
 }
});
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
 eligiblePets:Array.from({length:11},(_,i)=>({...owned[0],id:'owned-'+i,name:'Pet'+i})),
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
 taskReviewResponse:true,providerOverrides:{answer:text}});
 assert.equal(r.publication.failure,null);
 assert.match(r.result.reasoning.answer.summary,/No\.|cannot disclose/);
});

import { explicitHistoryDays } from '../../app/lib/intelligence/history-dates.ts';
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
 taskReviewResponse:true,providerOverrides:{answer:'I can help you with that.'}});
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
 const r=await exercise("Open Aster's profile and tell me what the latest rest note says.",{fixturePets:owned,messages:[],history:true,
 rows:[care('rest','milo','2026-06-04','general','Aster rested normally.')],interpretationProposal:proposal(),
 onProviderEvent:event=>events.push(event),
 providerOverrides:{applicationActions:[{kind:'navigation.open_pet_profile',explicitIntent:true,evidence:"Open Aster's profile",input:{field:null,value:null,title:null,detail:null,category:null,target:'selected'}}],historyNarrative:{sentences:[{text:'{"observation":"Aster rested normally."}',sourceIds:['care:rest'],calculations:[]}]}},
 expectedReviewCalls:3,reviewProviderResponse:async request=>{
 const input=JSON.parse(request.input);
 const payload=request.text.format.name==='furvise_history_repair'?{navigationActions:null,readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:rest'],
 historyNarrative:{sentences:[{text:'Aster rested normally.',sourceIds:['care:rest'],calculations:[]}]}}:
 {approved:true,retainedSentenceIndexes:[0],obligations:input.obligations.map(({index})=>({index,status:'answered',sentenceIndexes:[0],actionIndexes:[0]})),rejectionReason:null};
 return {status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}};
 }});
 assert.equal(events.filter(e=>e.outcome==='started').length,5);
 assert.equal(events.filter(e=>e.stage==='repair'&&e.outcome==='succeeded').length,1);
 assert.equal(r.result.reasoning.applicationActions[0]?.kind,'navigation.open_pet_profile');
 assert.equal(JSON.parse(r.reviewRequests.at(-1).input).actions[0]?.href,`/pets/${owned[0].id}`);
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

import { readReviewedHistoryAnswer } from '../../app/lib/intelligence/history-review-state.ts';
test('two differently dated facts retain separate retrieval coverage and completion receipts',async t=>{
 clock(t);const question='Give Aster rest in April 2023 and Birch rest in May 2024.';
 const r=await exercise(question,{fixturePets:owned,messages:[],history:true,
 rows:[care('aster-rest','milo','2023-04-07','general','Aster rested on a blue mat.'),
 care('birch-rest','luna','2024-05-08','general','Birch rested in a wicker bed.'),
 ...irrelevant('milo',80),...irrelevant('luna',80)],
 interpretationProposal:proposal({scope:'named',petNames:['Aster','Birch'],operation:'comparison',selection:'comparison',
 evidenceNeeds:[{quote:'Aster rest in April 2023',sourceTurnId:null,terms:['rest'],petNames:['Aster'],order:'context'},
 {quote:'Birch rest in May 2024',sourceTurnId:null,terms:['rest'],petNames:['Birch'],order:'context'}]}),
 providerOverrides:{historyNarrative:{sentences:[
 {text:'Aster rested on a blue mat.',sourceIds:['care:aster-rest'],calculations:[]},
 {text:'Birch rested in a wicker bed.',sourceIds:['care:birch-rest'],calculations:[]}]}},
 expectedReviewCalls:1,reviewResponse:{approved:true}});
 assert.deepEqual(r.prompt.evidenceContract.needCoverage.map(n=>n.pets[0].representedSourceIds),[['care:aster-rest'],['care:birch-rest']]);
 const completion=r.result.answerValidation.completion;
 assert.ok(completion);assert.deepEqual(completion.slice(1).map(c=>[c.petId,c.status,c.sourceIds]),
 [['milo','answered',['care:aster-rest']],['luna','answered',['care:birch-rest']]]);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/need:|completion|representedSourceIds/);
 assert.equal(r.publication.failure,null);
});

test('review approval cannot use one pet as evidence for another requested pet',async t=>{
 clock(t);const question='Give Aster and Birch rest observations.';
 const r=await exercise(question,{fixturePets:owned,messages:[],history:true,
 rows:[care('only-aster','milo','2026-06-04','general','Aster rested normally.')],
 interpretationProposal:proposal({petNames:['Aster','Birch'],
 evidenceNeeds:[{quote:question,sourceTurnId:null,terms:['rest'],petNames:[],order:'context'}]}),
 providerOverrides:{historyNarrative:{sentences:[{text:'Aster rested normally.',sourceIds:['care:only-aster'],calculations:[]}]}},
 expectedReviewCalls:2,reviewProviderResponse:async request=>{
 if(request.text.format.name==='furvise_history_repair'){
  assert.match(JSON.parse(request.input).rejectionReason,/obligation_evidence_scope/);
  return {status:'completed',output_text:'{}',usage:{input_tokens:500,output_tokens:10}};
 }
 const input=JSON.parse(request.input);
 return {status:'completed',output_text:JSON.stringify({approved:true,retainedSentenceIndexes:[0],
 obligations:input.obligations.map(o=>({index:o.index,status:'answered',sentenceIndexes:[0]})),rejectionReason:null}),
 usage:{input_tokens:500,output_tokens:100}};
 }});
 assert.equal(readReviewedHistoryAnswer(r.result.reasoning),null);
});

test('ten-pet read keeps every pet represented and batches correction seeds within database limits',async t=>{
 clock(t);
 const cohort=Array.from({length:10},(_,i)=>({...owned[0],id:'cohort-'+i,name:'Companion'+i}));
 const rows=cohort.flatMap(p=>[care('rest-'+p.id,p.id,'2024-04-07','general',p.name+' rested on a mat.'),...irrelevant(p.id,12)]);
 const question='Give all my pets rest observations in April 2024 as a table.';
 const r=await exercise(question,{fixturePets:cohort,petId:cohort[0].id,conversationPetId:cohort[0].id,messages:[],rows,history:true,
 interpretationProposal:proposal({scope:'account',petNames:[],from:'2024-04-01',to:'2024-05-01',terms:['rest'],outputFormat:'table',
 evidenceNeeds:[{quote:'rest observations in April 2024',sourceTurnId:null,terms:['rest'],petNames:[],order:'context'}]}),
 providerResponse:async()=>({status:'completed',output_text:JSON.stringify({readVersion:'history-answer.v1',layout:'table',json:null,historyNarrative:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:cohort.map(p=>'care:rest-'+p.id),
 table:{headers:['Pet','Observation'],rows:cohort.map(p=>({cells:[p.name,'Rested on a mat.'],sourceIds:['care:rest-'+p.id],calculations:[]}))}}),
 usage:{input_tokens:1000,output_tokens:500}}),reviewResponse:{approved:true},expectedReviewCalls:null});
 assert.equal(r.reviewRequests.length,1,JSON.stringify(r.reviewRequests.map(q=>({name:q.text.format.name,hints:JSON.parse(q.input).deterministicAnchorHints,failures:JSON.parse(q.input).deterministicPublicationFailures,rejection:JSON.parse(q.input).rejectionReason}))));
 assert.equal(r.context.askHistory.coverage.perPet.length,10);
 assert.ok(r.context.askHistory.coverage.perPet.reduce((n,p)=>n+p.pages,0)<=20);
 assert.ok(r.context.askHistory.entries.length<=32);assert.ok(r.context.askHistory.originals.length<=64);
 const seeds=r.queries.filter(q=>q.table==='read_ask_history_correction_page').map(q=>q.args.p_seed_pet_ids);
 assert.ok(seeds.every(ids=>ids.length<=3));assert.deepEqual([...new Set(seeds.flat())].sort(),cohort.map(p=>p.id).sort());
 assert.deepEqual(new Set(r.prompt.contextRecords.filter(s=>s.id.startsWith('care:rest-')).map(s=>s.petId)),new Set(cohort.map(p=>p.id)));
 assert.equal(r.result.answerValidation.completion.length,11);
 assert.equal(r.publication.failure,null);
});

const { eligibleAnswerSources, evidenceSource } = await import('../../app/lib/intelligence/ask-evidence.ts');
const { boundedEpisodePlan } = await import('../../app/lib/intelligence/history-access.ts');
const { verifiedCalculationQuantities } = await import('../../app/lib/intelligence/history-calculation.ts');
const { buildGovernedAskExecutionPlan, assertGovernedAskExecutionPlan } = await import('../../app/lib/intelligence/run-intelligence.ts');
const { AskTurnLifecycle } = await import('../../app/lib/ai/ask-turn-model.ts');
const { safeStructuredValidationReason } = await import('../../app/lib/ai/ask-provider.ts');
const { parseTaskHistoryReview } = await import('../../app/lib/intelligence/history-review-selection.ts');

test('all represented profile fields share eligibility while scope, load failure and loss still deny evidence',()=>{
 const fields=['age','breed','weight','species','sex','pronouns'];
 const represented=fields.map(field=>({sourceId:'profile:pet:'+field,petId:'pet',sourceType:'profile',field:'value',start:0,end:5,text:'value'}));
 const evidence={scope:{authorizedPetIds:['pet']},sources:[evidenceSource('pet','profile',['pet'])],represented,losses:[]};
 assert.deepEqual(eligibleAnswerSources(evidence).map(s=>s.sourceId),represented.map(s=>s.sourceId));
 for(const patch of [{scope:{authorizedPetIds:['other']}},{sources:[{...evidence.sources[0],status:'unavailable'}]},
 {losses:represented.map(s=>({sourceId:s.sourceId,reason:'prompt_budget'}))}]) assert.equal(eligibleAnswerSources({...evidence,...patch}).length,0);
});
for(const quantity of ['records','duration','measurement'])test('episode identity survives '+quantity+' projection',()=>{
 const question='Show the evidence for Aster’s second vomiting episode.';
 const result=validateAskRequest(proposal({operation:'episode',selection:'reference',ordinal:'second',quantity,episodeTopic:'vomiting'}),{...context,currentMessage:question});
 assert.equal(result.referenceTarget.kind,'episode'); assert.equal(result.referenceTarget.ordinal,'second');
 assert.equal(result.readOperation??result.operation,'recall');
});
test('explicit month exports and counts cannot be narrowed to a prior save receipt',()=>{
 for (const question of ['How many saved care-history entries does Aster have in September 2026? Count database notes, not the events described inside a note.', 'Return CSV only, with columns date,note, for Aster’s saved care-history entries in September 2026. Quote the saved note exactly. Do not save anything.']) {
  const result=validateAskRequest(proposal({quantity:'records',from:'2026-09-01',to:'2026-09-10',referenceTurnIds:['prior']}),{...context,currentMessage:question,conversationTurns:[{id:'prior',role:'user',text:'Save these four dated notes for Aster.'}]});
  assert.deepEqual(result.request.referenceTurnIds,[]);
  assert.equal(result.history.from,'2026-09-01T00:00:00.000Z');assert.equal(result.history.to,'2026-10-01T00:00:00.000Z');
  assert.equal(result.request.question,question);
 }
});
test('scoped episode selectors require user-grounded bounds and keep conversation references pinned',()=>{
 const question='Show Aster’s second documented vomiting episode in 2014.';
 const input=proposal({operation:'episode',selection:'reference',ordinal:'second',quantity:'records',episodeTopic:'vomiting',from:'2014-01-01',to:'2015-01-01'});
 const scoped=validateAskRequest(input,{...context,currentMessage:question});
 assert.equal(scoped.referenceTarget.basis,'scoped_register');
 for(const q of ['Show Aster’s second documented vomiting episode.', 'Show Aster’s second documented vomiting episode since 2014.']) {
  assert.equal(validateAskRequest(input,{...context,currentMessage:q}).referenceTarget.basis,'displayed_list');
 }
 const month=validateAskRequest(input,{...context,currentMessage:'Show Aster’s second documented vomiting episode in May 2014.'});
 assert.equal(month.referenceTarget.basis,'scoped_register'); assert.equal(month.history.from,'2014-05-01T00:00:00.000Z');
 const referenced=validateAskRequest({...input,referenceTurnIds:['prior']},{...context,currentMessage:question,conversationTurns:[{id:'prior',role:'user',text:'List Aster vomiting episodes in 2014.'}]});
 assert.equal(referenced.referenceTarget.basis,'scoped_register');
 assert.deepEqual(referenced.request.referenceTurnIds,[]);
 const pinned=validateAskRequest({...input,referenceTurnIds:['prior']},{...context,currentMessage:'Show Aster’s second documented vomiting episode in that displayed 2014 list.',conversationTurns:[{id:'prior',role:'user',text:'List Aster vomiting episodes in 2014.'}]});
 assert.equal(pinned.referenceTarget.basis,'displayed_list');
 const invented=validateAskRequest(input,{...context,currentMessage:'Show Aster’s documented vomiting history in 2014.'});
 assert.equal(invented.referenceTarget,undefined);
});
for(const layout of ['csv','table']) for(const size of [0,11,32])test(layout+' uses record bounds for '+size+' rows and keeps row provenance',()=>{
 const rows=Array.from({length:size},(_,i)=>({cells:['Aster','Rested.'],sourceIds:['care:'+i],calculations:[]}));
 const result=canonicalHistoricalRead({readVersion:'history-answer.v1',layout,historyNarrative:null,json:null,
 limitation:size?null:'No matching records were available.',safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:[],table:{headers:['Pet','Note'],rows}});
 assert.equal(result.historicalResult.items.length,size);
 rows.forEach((row,i)=>assert.deepEqual(result.historicalResult.items[i].sourceIds,row.sourceIds));
 if(!size) {
  assert.equal(result.historicalResult.limitation,'No matching records were available.');
  assert.equal(result.answer,layout==='csv'?'Pet,Note':'| Pet | Note |\n| --- | --- |');
 }
});
test('record counts reject duplicate operands, missing records, wrong counts and episode units',()=>{
 const sources=[{sourceId:'care:a',text:'Observed rest.'},{sourceId:'care:b',text:'Observed rest.'}];
 const count={operation:'count_records',operands:sources.map(s=>({sourceId:s.sourceId,field:'text',literal:s.sourceId})),value:2,unit:'notes',rounding:0,expression:null};
 assert.ok(verifiedCalculationQuantities([count],sources));
 for(const patch of [{value:3},{unit:'episodes'},{operands:[count.operands[0],count.operands[0]]}]) assert.equal(verifiedCalculationQuantities([{...count,...patch}],sources),null);
 assert.equal(verifiedCalculationQuantities([count],sources.slice(0,1)),null);
});
test('empty export completion requires an exhausted owned need query, never an unavailable or missing lookup',async()=>{
 const {completedEmptyEvidenceNeeds}=await import('../../app/lib/intelligence/evidence-need-coverage.ts');
 const {reviewObligationCompletion}=await import('../../app/lib/intelligence/history-obligations.ts');
 const query={petId:'pet',needId:'need',candidateIds:[],exhausted:true,status:'unknown'};
 const evidence={scope:{authorizedPetIds:['pet']},interpretation:{request:{evidenceNeeds:[{id:'need',quote:'vaccinations',terms:['vaccination']}] }},
  history:{needs:[query],provenance:[]},represented:[],sources:[],losses:[]};
 const keys=completedEmptyEvidenceNeeds(evidence);assert.deepEqual(keys,[JSON.stringify(['need','pet'])]);
 assert.deepEqual(completedEmptyEvidenceNeeds({...evidence,losses:[{sourceId:'profile:unrelated:breed',reason:'prompt_budget'}]}),keys);
 assert.deepEqual(completedEmptyEvidenceNeeds({...evidence,losses:[{sourceId:'care:matching',reason:'prompt_budget'}],history:{...evidence.history,needs:[{...query,candidateIds:['care:matching']}]}}),[]);
 const obligation={index:0,text:'vaccinations',needId:'need',petId:'pet',availability:'no_candidate_match'};
 const review={index:0,status:'answered',sentenceIndexes:[0]};
 assert.deepEqual(reviewObligationCompletion([obligation],[review],[{sourceIds:[]}],[],keys).failures,[]);
 assert.equal(reviewObligationCompletion([obligation],[review],[{sourceIds:[]}],[]).failures.length,1);
 for(const patch of [{exhausted:false},{status:'unavailable'},{status:'partial'},{candidateIds:['care:missing']},{reason:'need_query_budget'}])
  assert.deepEqual(completedEmptyEvidenceNeeds({...evidence,history:{...evidence.history,needs:[{...query,...patch}]}}),[]);
 assert.deepEqual(completedEmptyEvidenceNeeds({...evidence,history:{needs:[]}}),[]);
});
test('governed execution authority is tied to the issued plan and exact reviewed content',()=>{
 const action={action:'create_entry',category:'general',title:'Rest',details:'Aster rested.',severity:'routine',confidence:1,relatedRecordId:null};
 const input={sourceMessageId:'turn-a',petId:'pet-a',careActions:[action],semanticEvents:[],learnings:[]};
 const plan=buildGovernedAskExecutionPlan(input);assert.doesNotThrow(()=>assertGovernedAskExecutionPlan(plan));
 input.careActions[0].details='Changed outside plan';assert.equal(plan.careActions[0].details,'Aster rested.');
 assert.throws(()=>assertGovernedAskExecutionPlan(structuredClone(plan)),/ASK_EXECUTION_PLAN_CHANGED/);
 plan.careActions[0].details='Changed after review';assert.throws(()=>assertGovernedAskExecutionPlan(plan),/ASK_EXECUTION_PLAN_CHANGED/);
});
test('paired episode intervals preserve unbounded scope and fill only missing supported-domain bounds',()=>{
 assert.deepEqual(boundedEpisodePlan({from:null,to:null}),{from:null,to:null});
 const upper=boundedEpisodePlan({from:null,to:'2024-06-01T00:00:00.000Z'});assert.match(upper.from,/^1900-/);assert.match(upper.to,/^2024-06/);
 const lower=boundedEpisodePlan({from:'2024-06-01T00:00:00.000Z',to:null});assert.match(lower.to,/^2100-/);assert.match(lower.from,/^2024-06/);
});
for(const status of ['refused','needs_information'])test(status+' is deliverable only with a visible explanation',()=>{
 const review={approved:true,retainedSentenceIndexes:[0],obligations:[{index:0,status,sentenceIndexes:[0],actionIndexes:[]}]};
 assert.equal(parseTaskHistoryReview(review,1,1).obligations[0].status,status);
 assert.throws(()=>parseTaskHistoryReview({...review,obligations:[{...review.obligations[0],sentenceIndexes:[]}]},1,1));
});
test('delivery cannot certify a failed or pending requested mutation',()=>{
 for(const mutation of ['failed','pending','applied']){
  const turn=new AskTurnLifecycle('logical','attempt');turn.outcomes('complete',mutation).transition('COMPLETED');
  assert.equal(turn.snapshot().taskOutcome,mutation==='failed'?'failed':mutation==='pending'?'limited':'complete');
 }
});
test('structured diagnostics retain safe contract codes without leaking parser input',()=>{
 assert.equal(safeStructuredValidationReason(new Error('INVALID_READ_TABLE')),'INVALID_READ_TABLE');
 assert.equal(safeStructuredValidationReason(new SyntaxError('Private note and secret token')),'JSON_SYNTAX');
 assert.equal(safeStructuredValidationReason(new Error('Private note and secret token')),'STRUCTURED_CONTRACT_INVALID');
});

test('approved history receipt survives validation without granting authority to clones or changed drafts',async t=>{
 clock(t);const r=await exercise('What did Aster do in April 2024?',{fixturePets:owned,messages:[],history:true,
 rows:[care('verified-rest','milo','2024-04-07','general','Aster rested on a blue mat.')],
 interpretationProposal:proposal({from:'2024-04-01',to:'2024-05-01',terms:['rest']}),
 providerOverrides:{historyNarrative:{sentences:[{text:'Aster rested on a blue mat.',sourceIds:['care:verified-rest'],calculations:[]}]}},
 reviewResponse:{approved:true},expectedReviewCalls:1});
 assert.ok(readReviewedHistoryAnswer(r.result.reasoning));
 assert.equal(readReviewedHistoryAnswer(structuredClone(r.result.reasoning)),null);
 r.result.reasoning.historyNarrative.sentences[0].text='Aster has a diagnosis.';
 assert.equal(readReviewedHistoryAnswer(r.result.reasoning),null);
});
test('only a fully reviewed ready task plus an applied receipt completes a pending write',()=>{
 for(const [mutation,ready,expected] of [['applied',true,'complete'],['applied',false,'limited'],['pending',true,'limited'],['failed',true,'failed']]){
  const turn=new AskTurnLifecycle('logical','attempt');turn.outcomes('limited',mutation,ready);
  assert.equal(turn.snapshot().taskOutcome,expected);
 }
});

for (const inventedDate of [false,true]) test(`CSV quotes are cell delimiters; row dates remain grounded (invented=${inventedDate})`,async t=>{
 clock(t); const rows=[care('first','milo','2026-06-03','general','Aster rested, then slept.'),care('second','milo','2026-06-04','general','Aster ate, then rested.')];
 const payload={readVersion:'history-answer.v1',layout:'csv',historyNarrative:null,json:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:rows.map(r=>'care:'+r.id),
 table:{headers:['date','event'],rows:rows.map((r,i)=>({cells:[inventedDate&&i===1?'2026-06-05':r.occurred_at.slice(0,10),r.note],sourceIds:['care:'+r.id],calculations:[]}))}};
 const r=await exercise('Give Aster saved rest notes as CSV only, columns date and event.',{fixturePets:owned,messages:[],history:true,rows,
 interpretationProposal:proposal({outputFormat:'csv',terms:['rest']}),
 providerResponse:async()=>({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}}),
 reviewResponse:{approved:true},expectedReviewCalls:null});
 if(inventedDate) assert.equal(readReviewedHistoryAnswer(r.result.reasoning),null);
 else {assert.equal(r.publication.failure,null);assert.equal(r.reviewRequests.length,1);assert.match(r.result.reasoning.answer.summary,/2026-06-04,"Aster ate, then rested\."/);}
});

test('explicit dated note batches preserve each date and exact note without clinical inference', async()=>{
 const {parseDatedNoteBatch,noteBatchReviewActions}=await import('../../app/lib/intelligence/dated-note-batch.ts');
 const {isExplicitCareHistorySaveRequest}=await import('../../app/lib/intelligence/care-history-policy.ts');
 const text='Save these four separate care notes for Aster: September 1, 2026: started vomiting. September 3, 2026: stopped vomiting completely. September 7, 2026: started a new, separate vomiting episode. September 9, 2026: stopped vomiting completely.';
 assert.equal(isExplicitCareHistorySaveRequest(text),true);
 const notes=parseDatedNoteBatch(text);
 assert.equal(notes.length,4);
 assert.deepEqual(notes.map(n=>n.occurredAt.slice(0,10)),['2026-09-01','2026-09-03','2026-09-07','2026-09-09']);
 assert.equal(notes[0].note,'September 1, 2026: started vomiting.');
 assert.equal(noteBatchReviewActions(notes).length,4);
 assert.deepEqual(parseDatedNoteBatch('Hypothetical only: '+text),[]);
 assert.deepEqual(parseDatedNoteBatch('Do not '+text),[]);
});
test('explicit month-scoped episode target survives stale planner reference hints',()=>{
 const p=validateAskRequest(proposal({operation:'episode',selection:'reference',episodeTopic:'vomiting',ordinal:'second',from:null,to:null}),
  {...context,currentMessage:'For Aster’s second recorded vomiting episode in September 2026, give its dates. If not established, say so.'});
 assert.equal(p.referenceTarget.basis,'scoped_register');
 assert.equal(p.history.from,'2026-09-01T00:00:00.000Z');
 assert.equal(p.history.to,'2026-10-01T00:00:00.000Z');
});
