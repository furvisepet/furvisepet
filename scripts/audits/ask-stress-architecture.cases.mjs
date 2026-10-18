import {assertSourceFreePublication} from './helpers/publication-call-expectations.mjs';
import {datedSelectionProposal} from './helpers/dated-selection-fixture.mjs';
import {stressProposal} from './helpers/current-stress-harness.mjs';
import * as C from "../../tests/helpers/canonical-calculation-retirement.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { exercise, clock } from './helpers/lifetime-harness.mjs';
import { pets, ownerId } from './fixtures/ask-lifetime-history.mjs';
import { validateAskRequest, ASK_REQUEST_VERSION } from '../../app/lib/intelligence/ask-request-contract.ts';
const { recoverAskInterpretation } = await import('../../app/lib/intelligence/interpret-ask.ts');
import {matchesHistoryOutputFormat} from "../../app/lib/intelligence/history-output-format.ts";
const owned = pets.slice(0,3).map((p,i)=>({...p,name:['Aster','Birch','Cedar'][i]}));
const context = {owner:{userId:ownerId},eligiblePets:owned,pet:owned[0],currentMessage:'Read Aster history.',conversationTurns:[]};
const proposal = patch => ({version:ASK_REQUEST_VERSION,mode:'read',question:'Read the requested facts.',requirements:[],
 referenceTurnIds:[],scope:'named',petNames:['Aster'],operation:'recall',selection:'summary',quantity:null,topic:'observations',terms:[],
 from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[],...patch});
test('an exact note replacement does not authorize an invented JSON container',()=>{
 const input={...context,currentMessage:'Edit the note. Use exactly this text: administrative reminder.'};
 assert.equal(validateAskRequest(proposal({mode:'mixed',mutationIntent:'correct_record',outputFormat:'json'}),input).request.outputFormat,null);
 assert.equal(validateAskRequest(proposal({outputFormat:'json'}),{...input,currentMessage:'Return the saved notes as JSON.'}).request.outputFormat,'json');
});
for(const withNarrative of [true,false])test('retired mixed edit carrier fails before answer or review; narrative='+withNarrative,async t=>{
 clock(t);let calls=0;const question='Correct Aster’s June 4, 2026 walking note to 19 minutes, keeping the same date.';
 await assert.rejects(exercise(question,{fixturePets:owned,messages:[],history:true,rows:[care('old-note','milo','2026-06-04','general','Aster walked for 18 minutes.')],
 interpretationProposal:proposal({mode:'mixed',mutationIntent:'correct_record',from:'2026-06-04',to:'2026-06-05',frame:null}),
 providerOverrides:{historyNarrative:withNarrative?{sentences:[]}:null},providerResponse:async()=>{calls++;throw Error('ANSWER_FORBIDDEN')},reviewProviderResponse:async()=>{calls++;throw Error('REVIEW_FORBIDDEN')}}),/ASK_MEMORY_READ_TICKET_REQUIRED/);
 assert.equal(calls,0);
});
test('missing canonical edit target cannot reach answer review or mutation',async t=>{
 clock(t);let calls=0;
 await assert.rejects(exercise('Edit the note titled Unmatched administrative note.',{fixturePets:owned,messages:[],history:true,rows:[],
 interpretationProposal:proposal({mode:'mixed',mutationIntent:'correct_record'}),providerResponse:async()=>{calls++;throw Error('ANSWER_FORBIDDEN')}}),/ASK_MEMORY_READ_TICKET_REQUIRED/);
 assert.equal(calls,0);
});
test('legacy reconstructed receipts remain ineligible for dated factual publication',async t=>{
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
 const evidence=r.result.reasoning.evidenceContract;
 assert.equal(evidence.operationReceipts,undefined);
 const eligible=eligibleAnswerSources(evidence);
 assert.equal(eligible.some(s=>s.sourceId==='operation:receipt-turn:record:receipt-record'),false);
 assert.equal(evidence.represented.some(s=>s.sourceId.startsWith('operation:')),false);
 assert.doesNotMatch(r.serialized,/Aster ate 71 g|receipt-record/);
 // A reconstructed receipt and an assistant's text cannot supply a canonical dated source.
 assert.equal(historyNarrativeAnchorsSupported('September 2, 2026: "Aster ate 71 g of food."',eligible,'',[],false),false);
 assert.equal(historyNarrativeAnchorsSupported('September 3, 2026: "Aster ate 71 g of food."',eligible,'',[],false),false);
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
test('non-profile invalid references fail after one attempt and never authorize a repair',async()=>{
 const {interpretAskQuestion}=await import('../../app/lib/intelligence/interpret-ask.ts');
 for(const repeatInvalid of [false,true]){
  const calls=[];const client={responses:{create:async request=>{calls.push(request);return {status:'completed',output_text:JSON.stringify(proposal({referenceTurnIds:calls.length===1||repeatInvalid?['invented-turn']:[]})),usage:{input_tokens:12,output_tokens:8}}}}};
  await assert.rejects(interpretAskQuestion({context,model:'gpt-5.4-mini',client}),e=>e.stage==='interpretation_failed'&&e.diagnostics.providerErrorCode==='ASK_REQUEST_CONTRACT_REFERENCE');
  assert.equal(calls.length,1);assert.equal(calls[0].max_output_tokens,8192);assert.deepEqual(calls[0].reasoning,{effort:'medium'});
 }
});
test("CSV presentation remains unsupported without a factual model fallback",async()=>{
 await C.limitedFormat("csv");assert.equal(matchesHistoryOutputFormat("Here are records.","csv"),false);
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
 messages:[],history:true,expectedReviewCalls:1,interpretationProposal:datedSelectionProposal({question:'And Birch for that same month?',petNames:['Birch'],referenceTurnIds:['u1'],requests:[{quote:'March 2024',sourceTurnId:'u1',from:'2024-03-01T00:00:00Z',to:'2024-04-01T00:00:00Z',terms:['rest'] }]}),
 prepareContext(ctx){ctx.conversationTurns=[{id:'u1',role:'user',text:'Aster rest during March 2024?'}];}});
 assert.ok(r.context.askHistory.entries.some(row=>row.id==='target'));
 assert.ok(r.context.askHistory.entries.every(row=>row.pet_profile_id==='luna' && row.occurred_at.startsWith('2024-03')));
 assert.equal(r.result.reasoning.model,'server-labs-list');assert.equal(r.result.reasoning.labsList.records[0].body,'Birch rested on the blue mat.');assert.deepEqual(r.result.reasoning.relevantContextIds,['care:target']);
});
test('ordinary history telemetry counts one Brain attempt and zero factual repair calls',async t=>{
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
 assert.deepEqual(events.map(e=>[e.stage,e.outcome]),[['interpretation','started'],['interpretation','succeeded']]);
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);assert.deepEqual(r.result.reasoning.applicationActions,[]);
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.equal(r.publication.failure,null);
});

test('unsupported CSV cannot publish provider-authored factual rows',async t=>{
 clock(t);const payload={readVersion:'history-answer.v1',layout:'csv',historyNarrative:null,json:null,limitation:null,
 safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:['care:food'],
 table:{headers:['pet','food'],rows:[{cells:['Aster','wet, "complete"'],sourceIds:['care:food'],calculations:[]}]}};
 const r=await exercise('Give Aster latest food as CSV only, columns pet and food.',{fixturePets:owned,messages:[],history:true,
 rows:[care('food','milo','2026-06-04','food','Aster food is wet, "complete".')],
 interpretationProposal:proposal({outputFormat:'csv',selection:'latest',terms:['food']}),
 providerResponse:async()=>({status:'completed',output_text:JSON.stringify(payload),usage:{input_tokens:500,output_tokens:100}}),
 reviewResponse:{approved:true},expectedReviewCalls:1});
 assertSourceFreePublication(r);assert.doesNotMatch(r.result.reasoning.answer.summary,/wet,|pet,food/);
 assert.equal(r.publication.failure,null);
});

import { readReviewedHistoryAnswer } from '../../app/lib/intelligence/history-review-state.ts';
test('two differently dated facts retain separate retrieval coverage and completion receipts',async t=>{
 clock(t);const question='Give Aster rest in April 2023 and Birch rest in May 2024.';
 const r=await exercise(question,{fixturePets:owned,messages:[],history:true,
 rows:[care('aster-rest','milo','2023-04-07','general','Aster rested on a blue mat.'),
 care('birch-rest','luna','2024-05-08','general','Birch rested in a wicker bed.'),
 ...irrelevant('milo',80),...irrelevant('luna',80)],
 interpretationProposal:datedSelectionProposal({question,petNames:['Aster','Birch'],requests:[{quote:'Aster rest in April 2023',petNames:['Aster'],terms:['rest'],from:'2023-04-01T00:00:00Z',to:'2023-05-01T00:00:00Z'},{quote:'Birch rest in May 2024',petNames:['Birch'],terms:['rest'],from:'2024-05-01T00:00:00Z',to:'2024-06-01T00:00:00Z'}]}),
 providerOverrides:{historyNarrative:{sentences:[
 {text:'Aster rested on a blue mat.',sourceIds:['care:aster-rest'],calculations:[]},
 {text:'Birch rested in a wicker bed.',sourceIds:['care:birch-rest'],calculations:[]}]}},
 expectedReviewCalls:1,reviewResponse:{approved:true}});
 assert.equal(r.result.reasoning.model,'server-labs-list');assert.equal(r.result.answerValidation.assessment.outcome,'complete');
 assert.deepEqual(r.result.reasoning.labsList.records.map(x=>[x.petId,x.sourceId,x.body]),[['luna','care:birch-rest','Birch rested in a wicker bed.'],['milo','care:aster-rest','Aster rested on a blue mat.']]);
 assert.equal(r.context.askHistory.coverage.ticketCoverage.status,'complete');
 assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
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
 assertSourceFreePublication(r);assert.doesNotMatch(r.result.reasoning.answer.summary,/Birch rested/);
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
 assertSourceFreePublication(r);
 assert.equal(r.context.askHistory.coverage.perPet.length,10);
 assert.ok(r.context.askHistory.coverage.perPet.reduce((n,p)=>n+p.pages,0)<=20);
 assert.ok(r.context.askHistory.entries.length<=32);assert.ok(r.context.askHistory.originals.length<=64);
 const seeds=r.queries.filter(q=>q.table==='read_ask_history_correction_page').map(q=>q.args.p_seed_pet_ids);
 assert.ok(seeds.every(ids=>ids.length<=3));assert.deepEqual([...new Set(seeds.flat())].sort(),cohort.map(p=>p.id).sort());
 assert.deepEqual(new Set(r.context.askHistory.entries.filter(s=>s.id.startsWith('rest-')).map(s=>s.pet_profile_id)),new Set(cohort.map(p=>p.id)));
 assert.equal(r.result.answerValidation.assessment.outcome,'limited');
 assert.equal(r.publication.failure,null);
});

test('ten-pet correction closure retains traversal reserve after ownership seed batches',async t=>{
 clock(t);
 const cohort=Array.from({length:10},(_,i)=>({...owned[0],id:'deep-'+i,name:'Deep'+i}));
 const rows=cohort.map(p=>care('deep-row-'+p.id,p.id,'2024-04-07','general',p.name+' baseline note.'));
 const baseClaim=(id,operation='assert')=>({id,user_id:ownerId,subject_type:'pet',subject_id:cohort[0].id,claim_kind:'event',operation_type:operation,
  concept_key:'deep-test',canonical_concept_key:'deep-test',concept_resolution_status:'canonical',persistence_destination:'history',
  knowledge_status:'effective',occurred_at:'2024-04-07T12:00:00Z',recorded_at:'2024-04-07T12:01:00Z',
  provenance_classification:'imported_legacy',structured_value:{title:null,note:'Deep correction '+id,severity:null}});
 const claims=Array.from({length:8},(_,i)=>baseClaim('deep-c'+i,i?'correct':'assert'));
 claims[0].structured_value={title:null,note:rows[0].note,severity:null};
 const relation=i=>({id:'deep-e'+i,user_id:ownerId,from_claim_id:claims[i+1].id,to_claim_id:claims[i].id,relation_type:'corrects'});
 const lineage={user_id:ownerId,claim_id:claims[0].id,legacy_row_id:rows[0].id,legacy_table:'pet_care_entries',claim_role:'primary'};
 const graphAtCall=call=>{
  const last=Math.min(7,Math.max(1,call));
  return {claims:claims.slice(0,last+1),relations:Array.from({length:last},(_,i)=>relation(i)),
   lineage:[lineage],sources:[rows[0]]};
 };
 const question='Give one saved note for each of my ten pets in April 2024.';
 const r=await exercise(question,{fixturePets:cohort,petId:cohort[0].id,conversationPetId:cohort[0].id,messages:[],rows,history:true,graphAtCall,
  interpretationProposal:proposal({scope:'account',petNames:[],from:'2024-04-01',to:'2024-05-01',terms:[],outputFormat:'table'}),
  providerResponse:async()=>({status:'completed',output_text:JSON.stringify({readVersion:'history-answer.v1',layout:'prose',json:null,table:null,limitation:null,
   safetyLevel:'normal',responseMode:'practical_guidance',userIntent:'history',relevantContextIds:[],historyNarrative:{sentences:[{text:'The ten-pet history read completed.',sourceIds:[],calculations:[]}]}}),usage:{input_tokens:100,output_tokens:50}}),
  reviewResponse:{approved:true},expectedReviewCalls:null});
 const graphQueries=r.queries.filter(q=>q.table==='read_ask_history_correction_page');
 assert.ok(graphQueries.length>=8,'expected deep traversal, got '+graphQueries.length);
 assert.notEqual(r.context.askHistory.coverage.corrections,'unavailable');
});

const { eligibleAnswerSources, evidenceSource } = await import('../../app/lib/intelligence/ask-evidence.ts');
const { boundedEpisodePlan } = await import('../../app/lib/intelligence/history-access.ts');
const { buildGovernedAskExecutionPlan, assertGovernedAskExecutionPlan } = await import('../../app/lib/intelligence/ask-execution-plan.ts');
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
test('isolated full-algebra count cases retain public-policy separation',async()=>{
 const {spawnSync}=await import('node:child_process');const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const r=spawnSync(process.execPath,['--experimental-transform-types','--test','scripts/audits/ask-count-algebra.cases.mjs'],{env,encoding:'utf8',timeout:60000,maxBuffer:2000000});
 assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/tests 7\b/);assert.match(r.stdout,/fail 0\b/);
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
 r.result.reasoning.answer.summary='Aster has a diagnosis.';
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
 assertSourceFreePublication(r);assert.equal(r.requests.length,0);assert.equal(r.reviewRequests.length,0);
 assert.doesNotMatch(r.result.reasoning.answer.summary,/2026-06-05|Aster ate, then rested/);
});

test('explicit dated note batches preserve each date and exact note without clinical inference', async()=>{
 const {validateAppendJob}=await import('../../app/lib/furvise-brain/append-job.ts');
 const text='Save these four separate care notes for Aster: September 1, 2026: started vomiting. September 3, 2026: stopped vomiting completely. September 7, 2026: started a new, separate vomiting episode. September 9, 2026: stopped vomiting completely.';
 const bodies=['September 1, 2026: started vomiting.','September 3, 2026: stopped vomiting completely.','September 7, 2026: started a new, separate vomiting episode.','September 9, 2026: stopped vomiting completely.'];
 const dates=['September 1, 2026','September 3, 2026','September 7, 2026','September 9, 2026'];
 const days=['2026-09-01','2026-09-03','2026-09-07','2026-09-09'];
 const proposed={operation:'append',petName:'Aster',companionQuote:null,items:bodies.map((bodyQuote,i)=>({bodyQuote,dateQuote:dates[i],occurredAt:days[i]}))};
 const source={id:'source',role:'user',text,createdAt:'2026-09-20T00:00:00Z'};
 const job=validateAppendJob(proposed,source,[{id:'owned',name:'Aster',user_id:'owner'}],'owner');
 assert.equal(job.items.length,4);assert.deepEqual(job.items.map(x=>x.body.text),bodies);
 assert.deepEqual(job.items.map(x=>x.occurredAt.slice(0,10)),days);
 assert.throws(()=>validateAppendJob(proposed,{...source,text:'Do not '+text},[{id:'owned',name:'Aster',user_id:'owner'}],'owner'));
 assert.throws(()=>validateAppendJob(proposed,{...source,role:'furvise'},[{id:'owned',name:'Aster',user_id:'owner'}],'owner'));
});
test('explicit month-scoped episode target survives stale planner reference hints',()=>{
 const p=validateAskRequest(proposal({operation:'episode',selection:'reference',episodeTopic:'vomiting',ordinal:'second',from:null,to:null}),
  {...context,currentMessage:'For Aster’s second recorded vomiting episode in September 2026, give its dates. If not established, say so.'});
 assert.equal(p.referenceTarget.basis,'scoped_register');
 assert.equal(p.history.from,'2026-09-01T00:00:00.000Z');
 assert.equal(p.history.to,'2026-10-01T00:00:00.000Z');
});
