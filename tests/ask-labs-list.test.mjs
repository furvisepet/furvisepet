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
const { rememberValidatedEvidencePresentation, restoreAskEvidencePresentation } = await import('../app/lib/intelligence/ask-evidence-presentation.ts');
const { buildAskConversationResponse } = await import('../app/lib/ask.mjs');
const noProvider = {responses:{create:async()=>{throw Error('List serialization/review must not call a model');}}};
const dates=['2025-06-15','2025-07-15','2025-08-15','2025-09-15','2025-10-15','2025-11-15','2026-01-15','2026-03-15','2026-04-15','2026-06-15','2026-07-15','2026-09-15'];
function fixture(status='complete', count=12) {
 const pet={id:'bramble',user_id:'owner',name:'Bramble',species:'cat',avoid_ingredients:[]};
 const rows=Array.from({length:count},(_,i)=>({id:'event-'+i,user_id:'owner',pet_profile_id:pet.id,category:'general',title:null,
  note:i===0?'Dental cleaning. Eating returned to the turkey wet-food routine.':`Food note ${i}: no appetite change.`,
  occurred_at:(dates[i]||'2026-09-16')+'T12:00:00Z',created_at:'2026-09-19T12:00:00Z',updated_at:'2026-09-19T12:00:00Z',deleted_at:null}));
 const ticket={operation:'read_since_event',subjects:{petIds:[pet.id]},temporal:{from:null,to:null,anchor:{concept:'dental visit',relation:'from'}},
  predicates:[{kind:'text_any',terms:['food','eating']}],outputs:{completeness:'exhaustive',ordering:'asc',limit:null}};
 const coverage={status,reasons:[],matchSemantics:'ticket_text_predicates',asOf:'2026-09-19T12:00:00Z',
  anchors:[{petId:pet.id,eventId:'event-0',eventAt:rows[0]?.occurred_at}],windows:[],continuation:status==='partial'?[{petId:pet.id,offset:256}]:[]};
 const evidence={version:'ask-evidence.v1',scope:{authorizedPetIds:[pet.id],requestText:'Starting from the dental visit, list food notes oldest first.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{petIds:[pet.id],readOnly:true,request:{readTicket:ticket,mode:'read',quantity:'records',evidenceBasis:'saved_history',requirements:[],referenceTurnIds:[]}},
  history:{ticketCoverage:coverage,provenance:[],candidateIds:rows.map(r=>'care:'+r.id),eventCandidateIds:rows.map(r=>'care:'+r.id),reasons:[],needs:[]},
  sources:[],represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'unknown',grouping:'unknown'}};
 const labs=buildLabsList(evidence,rows);
 const result={labsList:labs,evidenceContract:evidence,answer:{title:'Furvise',summary:serializeLabsList(labs),sections:[],safetyNote:null},
  relevantContextIds:labs.records.map(r=>r.sourceId),applicationActions:[],careActions:[],semanticEvents:[],learnings:[],
  proposedHistoryUpdate:{shouldOffer:false},safetyLevel:'normal',responseMode:'practical_guidance',suggestedFollowUps:[]};
 const context={currentMessage:evidence.scope.requestText,pet,eligiblePets:[pet],memories:[],careEntries:rows,askHistory:{entries:rows,coverage:{ticketCoverage:coverage}}};
 return {result,context,rows,pet,evidence};
}
test('Bramble twelve returned notes survive review, validation and final presentation in full',async()=>{
 const {result,context}=fixture();
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
 const {result}=fixture();result.answer.summary=result.answer.summary.split('\n\n').slice(0,8).join('\n\n');
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),false);
 assert.equal(readReviewedHistoryAnswer(result),null);
});
test('foreign id, altered date, quote, order, coverage and whole-tail removal cannot change the source snapshot',async()=>{
 for(const change of [r=>r.labsList.records[0].id='foreign',r=>r.labsList.records[0].event_at='2016-01-01',
  r=>r.labsList.records[0].body='Invented shot',r=>r.labsList.records.reverse(),r=>r.labsList.coverage.status='partial',r=>r.labsList.records.splice(8)]){
  const {result}=fixture();change(result);result.answer.summary=serializeLabsList(result.labsList);
  result.relevantContextIds=result.labsList.records.map(r=>r.sourceId);
  assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),false);
 }
});
test('missing review, post-review mutation, and foreign authoritative scope fail validation',async()=>{
 const {result,context}=fixture();assert.equal(validateGeneratedAnswer(result,context,'routine',['bramble']).valid,false);
 await reviewHistoricalAnswer({result,client:noProvider});
 assert.equal(validateGeneratedAnswer(result,context,'routine',['other']).valid,false);
 result.answer.summary+='\n2016-01-01 — invented';
 assert.equal(validateGeneratedAnswer(result,context,'routine',['bramble']).valid,false);
});
test('all returned partial records and continuation survive; no complete claim',async()=>{
 const {result,context}=fixture('partial');
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 const validation=validateGeneratedAnswer(result,context,'routine',['bramble']);
 assert.equal(validation.assessment.outcome,'limited');assert.match(validation.response.answer.summary,/partial results/);
 assert.equal(validation.response.labsList.records.length,12);assert.deepEqual(validation.response.labsList.coverage.continuation,[{petId:'bramble',offset:256}]);
});
test('no serializer chunk cap: all 32 organ-bounded records survive',async()=>{
 const {result}=fixture('complete',32);
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 assert.equal(result.answer.summary.split('\n\n').length,32);
});
test('mixed/write/compare/measurement tickets never enter list serialization; legacy narrative cap stays eight',()=>{
 for(const mutate of [e=>e.interpretation.request.mode='mixed',e=>e.interpretation.request.writeJob={},
  e=>e.interpretation.request.readTicket.operation='compare',e=>e.interpretation.request.quantity='measurement']){
  const {evidence,rows}=fixture();mutate(evidence);assert.equal(buildLabsList(evidence,rows),null);
 }
 assert.equal(historyNarrativeSchema.properties.sentences.maxItems,8);
 assert.equal(parseHistoryNarrative({sentences:Array.from({length:12},()=>({text:'Food note.',sourceIds:['care:e']}))}),undefined);
});
test('real generator uses full labs with zero narrative provider calls',async()=>{
 const {evidence,rows,pet,context}=fixture();
 const result=await generateContextAwareAskResponse({evidenceContract:evidence,profiles:[pet],careEntries:rows,memories:[],productFeedback:[],
  conversationTurns:[],recentUpdates:[],question:context.currentMessage,requestId:'list-test',locale:'en-CA',client:noProvider});
 assert.equal(result.model,'server-labs-list');assert.equal(result.labsList.records.length,12);
 assert.equal(await reviewHistoricalAnswer({result,client:noProvider}),true);
 assert.equal(validateGeneratedAnswer(result,context,'routine',['bramble']).assessment.outcome,'complete');
});
