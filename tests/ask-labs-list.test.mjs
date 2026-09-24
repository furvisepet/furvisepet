import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return s === 'server-only' ? {url:'data:text/javascript,export {};',format:'module',shortCircuit:true} : next(s,c); } });
const { buildLabsList, serializeLabsList } = await import('../app/lib/intelligence/labs-list.ts');
const { reviewHistoricalAnswer } = await import('../app/lib/intelligence/review-history-narrative.ts');
const { validateGeneratedAnswer } = await import('../app/lib/intelligence/validation/validate-answer.ts');
const { readReviewedHistoryAnswer } = await import('../app/lib/intelligence/history-review-state.ts');
const { generateContextAwareAskResponse } = await import('../app/lib/ai/ask-reasoning.ts');
const { historyNarrativeSchema, parseHistoryNarrative } = await import('../app/lib/intelligence/history-narrative.ts');
const { resolveSafetyState } = await import('../app/lib/intelligence/safety-state.ts');
const { rememberValidatedEvidencePresentation, restoreAskEvidencePresentation } = await import('../app/lib/intelligence/ask-evidence-presentation.ts');
const { buildAskConversationResponse } = await import('../app/lib/ask.mjs');
const { bindTypedReadTicket } = await import('../app/lib/furvise-brain/typed-read-ticket.ts');
const { retrieveReadTicket } = await import('../app/lib/furvise-brain/lungs.ts');
const { isOrderedResultSet } = await import('../app/lib/furvise-brain/ordered-result-set.ts');
const { eventOrder } = await import('../app/lib/furvise-brain/read-selection.ts');
let providerCalls=0;
const noProvider = {responses:{create:async()=>{providerCalls++;throw Error('List serialization/review must not call a model');}}};
test.afterEach(()=>assert.equal(providerCalls,0));
const dates=['2025-06-15','2025-07-15','2025-08-15','2025-09-15','2025-10-15','2025-11-15','2026-01-15','2026-03-15','2026-04-15','2026-06-15','2026-07-15','2026-09-15'];
// Only storage/closure IO is mocked. Lungs alone derives the result-set receipt.
async function fixture(status='complete', count=12, {generic=false,lineageClosed=true,replacementSeedsExhausted=true,oversizeIndex=-1}={}) {
 const pet={id:generic?'owned-a':'bramble',user_id:'owner',name:generic?'Subject A':'Bramble',species:'cat',avoid_ingredients:[]};
 const storeRows=Array.from({length:status==='partial'?300:count},(_,i)=>({id:'event-'+i,user_id:'owner',pet_profile_id:pet.id,category:'general',title:null,
  note:i===oversizeIndex?'Observation '+ 'x'.repeat(19000):generic?`Observation ${i} recorded.`:i===0?'Dental cleaning. Eating returned to the turkey wet-food routine.':`Food note ${i}: no appetite change.`,
  occurred_at:(dates[i]||'2026-09-16')+'T12:00:00Z',created_at:'2026-09-19T12:00:00Z',updated_at:'2026-09-19T12:00:00Z',deleted_at:null}));
 const ticket=bindTypedReadTicket({operation:generic?'read':'read_since_event',subjectScope:'named',
  temporal:{from:null,to:null,anchor:generic?null:{concept:'dental cleaning',relation:'from'}},
  predicates:generic?(count===0?[]:[{kind:'text_any',terms:['observation']}]):[{kind:'text_any',terms:['food','eating']}],
  outputs:{completeness:'exhaustive',ordering:'asc',limit:null}},[pet.id]);
 assert.equal(isOrderedResultSet(ticket),true);
 const calls=[];
 const read=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:[pet.id],from:'2010-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-19T12:00:00Z'},{
  page:async q=>{calls.push(q);return storeRows.filter(row=>row.pet_profile_id===q.petId&&!row.deleted_at&&row.occurred_at>=q.from&&row.occurred_at<q.to)
   .sort((a,b)=>q.ordering==='desc'?eventOrder(b,a):eventOrder(a,b)).slice(q.offset,q.offset+q.limit);},
  effective:async rows=>({records:rows,reliable:true}),
  effectiveWindow:async({rows})=>({records:rows,lineageClosed,replacementSeedsExhausted,sourceLineage:[],graphCalls:1,lineageRows:rows.length,
   reasons:lineageClosed&&replacementSeedsExhausted?[]:['correction_closure_unavailable_or_ambiguous']}),
 });
 const rows=read.records,coverage=read.coverage;
 const evidence={version:'ask-evidence.v1',petNames:{[pet.id]:pet.name},scope:{authorizedPetIds:[pet.id],requestText:generic?'List all saved observations.':'Starting from the dental cleaning, list food notes oldest first.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',petIds:[pet.id],readOnly:true,request:{readTicket:ticket,mode:'read',quantity:'records',evidenceBasis:'saved_history',requirements:[],referenceTurnIds:[],outputFormat:'prose'}},
  history:{ticketCoverage:coverage,provenance:[],candidateIds:rows.map(r=>'care:'+r.id),eventCandidateIds:rows.map(r=>'care:'+r.id),reasons:coverage.reasons,needs:[]},
  sources:[],represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:coverage.status,corrections:lineageClosed?'complete':'unknown',extraction:'unknown',grouping:'unknown'}};
 const context={currentMessage:evidence.scope.requestText,pet,eligiblePets:[pet],memories:[],careEntries:rows,askInterpretation:evidence.interpretation,askHistory:{entries:rows,coverage:{ticketCoverage:coverage}}};
 const f={context,rows,pet,evidence,read,ticket,storeRows,calls};
 return {...f,result:await generate(f)};
}
async function generate({evidence,rows,pet,context}) {
 return generateContextAwareAskResponse({evidenceContract:evidence,profiles:[pet],careEntries:rows,memories:[],productFeedback:[],
  conversationTurns:[],recentUpdates:[],question:context.currentMessage,requestId:'list-test',locale:'en-CA',client:noProvider});
}
function assertCertified(f,count) {
 const proof=f.read.coverage.resultSet;
 assert.equal(proof.certified,true);assert.equal(proof.matchingSetComplete,true);assert.equal(proof.representationComplete,true);
 assert.ok(proof.subjects.every(s=>s.exhausted&&s.lineageClosed));assert.deepEqual(f.read.coverage.continuation,[]);
 assert.ok(f.read.coverage.effectiveStream.every(s=>s.lineageClosed&&s.replacementSeedsExhausted));
 assert.equal(f.result.model,'server-labs-list');assert.equal(f.result.labsList.records.length,count);
 assert.deepEqual(f.result.labsList.ticket,f.ticket);assert.deepEqual(f.result.labsList.coverage,f.read.coverage);
 assert.deepEqual(f.result.labsList.records.map(r=>[r.id,r.sourceId,r.petId,r.event_at,r.body]),
  f.rows.map(r=>[r.id,'care:'+r.id,r.pet_profile_id,r.occurred_at,r.note]));
 assert.deepEqual(f.rows.map(r=>r.id),[...f.rows].sort(eventOrder).map(r=>r.id));
}
async function assertUnavailable(f) {
 const {result,context,pet}=f;
 assert.notEqual(f.read.coverage.resultSet?.certified,true);
 assert.equal(result.model,'server-history-unavailable');assert.equal(result.labsList,undefined);
 assert.deepEqual(result.relevantContextIds,[]);assert.equal(result.referencedRecords?.length||0,0);
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 const v=validateGeneratedAnswer(result,context,'routine',[pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');
 assert.match(result.answer.summary,/does not establish that matching records are absent/);
 assert.deepEqual(result.evidenceContract.history.ticketCoverage,f.read.coverage);
 assert.equal(providerCalls,0);
}

test('Bramble twelve returned notes survive review, validation and final presentation in full',async()=>{
 const f=await fixture();assertCertified(f,12);const {result,context}=f;
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 const validation=validateGeneratedAnswer(result,context,'routine',['bramble']);
 assert.equal(validation.assessment.outcome,'complete');assert.equal(validation.valid,true);
 assert.equal(validation.response.answer.summary,result.answer.summary);
 rememberValidatedEvidencePresentation(validation.response.evidenceContract,validation.response.answer);
 const rendered=buildAskConversationResponse(validation.response.answer);
 const published=restoreAskEvidencePresentation(rendered,validation.response.evidenceContract);
 assert.equal(published.summary,result.answer.summary);
 for(const date of dates) assert.ok(published.summary.includes(date));
 assert.ok(readReviewedHistoryAnswer(validation.response));
 assert.equal(readReviewedHistoryAnswer(structuredClone(validation.response)),null);
});
test('eight supported lines out of twelve fail complete-list review',async()=>{
 const {result}=await fixture();result.answer.summary=result.answer.summary.split('\n\n').slice(0,8).join('\n\n');
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),false);
 assert.equal(readReviewedHistoryAnswer(result),null);
});
test('foreign id, altered date, quote, order, coverage and whole-tail removal cannot change the source snapshot',async()=>{
 for(const change of [r=>r.labsList.records[0].id='foreign',r=>r.labsList.records[0].event_at='2016-01-01',
  r=>r.labsList.records[0].body='Invented shot',r=>r.labsList.records.reverse(),r=>r.labsList.coverage.status='partial',r=>r.labsList.records.splice(8)]){
  const {result}=await fixture();change(result);result.answer.summary=serializeLabsList(result.labsList);
  result.relevantContextIds=result.labsList.records.map(r=>r.sourceId);
  assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),false);
 }
});
test('missing review, post-review mutation, and foreign authoritative scope fail validation',async()=>{
 const {result,context}=await fixture();assert.equal(validateGeneratedAnswer(result,context,'routine',['bramble']).valid,false);
 await reviewHistoricalAnswer({result,client:noProvider});
 assert.equal(validateGeneratedAnswer(result,context,'routine',['other']).valid,false);
 result.answer.summary+='\n2016-01-01 — invented';
 assert.equal(validateGeneratedAnswer(result,context,'routine',['bramble']).valid,false);
});
test('partial acquisition keeps continuation internal and publishes no factual list',async()=>{
 const f=await fixture('partial');assert.ok(f.read.coverage.continuation.length);
 assert.equal(f.read.coverage.resultSet,undefined);
 assert.deepEqual(f.rows,[]);assert.ok(f.calls.length);await assertUnavailable(f);
 assert.deepEqual(f.result.evidenceContract.history.ticketCoverage.continuation,f.read.coverage.continuation);
});

test('no serializer chunk cap: all 32 organ-bounded records survive',async()=>{
 const f=await fixture('complete',32);assertCertified(f,32);const {result}=f;
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 assert.equal(result.answer.summary.split('\n\n').length,32);
});
test('mixed/write/compare tickets never enter list serialization; legacy narrative cap stays eight',async()=>{
 for(const mutate of [e=>e.interpretation.request.mode='mixed',e=>e.interpretation.request.writeJob={},
  e=>e.interpretation.request.readTicket.operation='compare']){
  const f=await fixture();const evidence=structuredClone(f.evidence),rows=f.rows;mutate(evidence);assert.equal(buildLabsList(evidence,rows),null);
 }
 assert.equal(historyNarrativeSchema.properties.sentences.maxItems,8);
 assert.equal(parseHistoryNarrative({sentences:Array.from({length:12},()=>({text:'Food note.',sourceIds:['care:e']}))}),undefined);
});
test('certified exhaustive result-set prose preserves all facts independently of presentation defaults',async()=>{
 for(const outputFormat of [null,'prose']) {
  const f=await fixture();f.evidence.interpretation.request.outputFormat=outputFormat;
  f.result=await generate(f);assertCertified(f,12);
  assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
  assert.equal(validateGeneratedAnswer(f.result,f.context,'routine',[f.pet.id]).valid,true);
 }
});
test('certified result-set proof cannot fulfill unsupported formats or nullable quantity',async()=>{
 for(const patch of [...['bullets','table','json','csv','unknown-format'].map(outputFormat=>({outputFormat})),{quantity:null}]) {
  const f=await fixture();Object.assign(f.evidence.interpretation.request,patch);
  const result=await generate(f);assert.equal(f.read.coverage.resultSet.certified,true);
  assert.equal(result.model,'server-history-unavailable');assert.equal(result.labsList,undefined);assert.deepEqual(result.relevantContextIds,[]);
  assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
  const v=validateGeneratedAnswer(result,f.context,'routine',[f.pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');
 }
});

test('real generator uses full labs with zero narrative provider calls',async()=>{
 const f=await fixture();assertCertified(f,12);const {result,context}=f;
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 const v=validateGeneratedAnswer(result,context,'routine',['bramble']);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');
 assert.equal(providerCalls,0);
});

test('Bramble historical list survives the live monitor floor from existing concerns',async()=>{
 const f=await fixture();assertCertified(f,12);const {result,context}=f;
 Object.assign(context,{activeConcerns:[{id:'existing',pet_profile_id:'bramble',status:'active',severity:'important',title:'Existing concern',normalized_key:'appetite'}],recentlyResolvedConcerns:[],activeEpisodes:[],monitoringEpisodes:[]});
 const safety=resolveSafetyState(context);assert.equal(safety.level,'monitor');
 result.safetyLevel=safety.level;
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 assert.equal(validateGeneratedAnswer(result,context,safety.level,['bramble']).assessment.outcome,'complete');
 result.safetyLevel='urgent';
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),false);
});

test('exhausted closed generic result set publishes exact fully represented rows',async()=>{
 const f=await fixture('complete',3,{generic:true});assertCertified(f,3);assert.ok(f.calls.length);
 assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
 const v=validateGeneratedAnswer(f.result,f.context,'routine',[f.pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');
});
test('generic continuation cannot authorize the retained subset as a factual list',async()=>{
 const f=await fixture('partial',3,{generic:true});assert.ok(f.read.coverage.continuation.length);
 assert.equal(f.read.coverage.resultSet.subjects[0].exhausted,false);await assertUnavailable(f);
});
test('unclosed lineage or unexhausted replacement seeds cannot authorize a factual list',async()=>{
 for(const options of [{lineageClosed:false},{replacementSeedsExhausted:false}]){
  const f=await fixture('complete',3,{generic:true,...options});assert.equal(f.read.coverage.resultSet.matchingSetComplete,false);
  await assertUnavailable(f);
 }
});
test('one matching row omitted by organ transport prevents factual result-set publication',async()=>{
 const f=await fixture('complete',3,{generic:true,oversizeIndex:1}),proof=f.read.coverage.resultSet;
 assert.equal(proof.matchingSetComplete,true);assert.equal(proof.representationComplete,false);
 assert.deepEqual(proof.omittedIds,['event-1']);assert.equal(f.rows.length,2);await assertUnavailable(f);
});
test('removing a certified row between Lungs and Labs invalidates the result-set snapshot',async()=>{
 const f=await fixture('complete',3,{generic:true});assertCertified(f,3);
 assert.throws(()=>buildLabsList(f.evidence,f.rows.slice(1)),/ASK_LABS_RESULT_SET_SNAPSHOT/);
});
test('injecting an extra Labs row fails review and final validation',async()=>{
 const f=await fixture('complete',3,{generic:true});assertCertified(f,3);
 f.result.labsList.records.push({...f.result.labsList.records[0],id:'extra',sourceId:'care:extra'});
 f.result.answer.summary=serializeLabsList(f.result.labsList);f.result.relevantContextIds=f.result.labsList.records.map(row=>row.sourceId);
 assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),false);
 assert.equal(validateGeneratedAnswer(f.result,f.context,'routine',[f.pet.id]).valid,false);
});
test('certified complete-empty unfiltered result set remains a valid empty factual result',async()=>{
 const f=await fixture('complete',0,{generic:true});assertCertified(f,0);
 assert.equal(f.read.coverage.status,'complete_empty');assert.deepEqual(f.result.relevantContextIds,[]);
 assert.equal(await reviewHistoricalAnswer({result:f.result,client:noProvider}),true);
 const v=validateGeneratedAnswer(f.result,f.context,'routine',[f.pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');
 assert.match(f.result.answer.summary,/No matching notes were found in the checked history window/);
});
