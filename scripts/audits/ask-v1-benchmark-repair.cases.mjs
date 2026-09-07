import assert from 'node:assert/strict';
import test from 'node:test';
import {exercise,clock} from './helpers/lifetime-harness.mjs';
import {fixturePets,rows} from './fixtures/ask-benchmark-200.mjs';
import {historyNarrativeAnchorsSupported as anchors} from '../../app/lib/intelligence/history-narrative-facts.ts';
import {normalizeHistoricalSearchTerms as terms} from '../../app/lib/intelligence/history-search-terms.ts';
const {recoverAskInterpretation}=await import('../../app/lib/intelligence/interpret-ask.ts');
import {buildRecentSubjectState} from '../../app/lib/intelligence/entities/recent-subject-state.ts';
const emptyFrame={version:'proposed-semantic-frame.v1',mentions:[],references:[],claims:[],discourseActs:[]};
const proposal={operation:'recall',readOperation:'recall',selection:'summary',subject:'explicit',petNames:['Nori'],topic:'food',terms:['food'],from:null,to:null,episodeTopic:null,ordinal:null,frame:emptyFrame};
async function context(t) {clock(t);return (await exercise('Hello',{fixturePets,rows,petId:'nori',expectedProviderCalls:null})).context;}
test('a quotation must be verbatim from its attributed source, never a splice',()=>{
 const sources=[{text:'We moved the tray back. We changed both things together.',occurredAt:'2026-07-10T12:00:00Z'},{text:'She is using the tray normally.',occurredAt:'2026-07-17T12:00:00Z'}];
 assert.equal(anchors('The July 10 note says: “We moved the tray back. She is using the tray normally.”',sources),false);
 assert.equal(anchors('The July 10 note says: “She is using the tray normally.”',sources),false);
 assert.equal(anchors('The July 10 note says: “We moved the tray back.”',sources),true);
});
test('literal search variants retrieve weighed and litter tray records',()=>{
 assert.ok(terms(['weight']).some(term=>'weighed'.includes(term)));
 assert.ok(terms(['litter box']).some(term=>'litter tray'.includes(term)));
 assert.ok(terms(['medication']).some(term=>'medicine'.includes(term)));
 assert.ok(terms(['weight','weighed','litter box','medication','stools','hiding']).length<=6);
});
test('open-ended history range is recoverable without dropping its start',async t=>{
 const c=await context(t);const p=recoverAskInterpretation({...proposal,from:'2026-06-01'}, {...c,currentMessage:'Summarize Nori food changes from June onward.'});
 assert.equal(p.history.from,'2026-06-01T00:00:00.000Z'); assert.equal(p.history.to,'2100-01-01T00:00:00.000Z');
});
test('account-wide question resolves all owned pets with a validated bounded plan',async t=>{
 const c=await context(t); c.eligiblePets=c.eligiblePets.filter(p=>p.user_id===c.owner.userId).slice(0,3); const names=c.eligiblePets.map(p=>p.name);
 const p=recoverAskInterpretation({...proposal,petNames:names}, {...c,currentMessage:'Compare the recorded weights across all my pets.'});
 assert.equal(p.petIds.length,3);assert.equal(p.clarification,null);
 assert.throws(()=>recoverAskInterpretation({...proposal,petNames:['ForeignPet']},{...c,currentMessage:'Compare all my pets.'}));
});
test('asking about the vet does not replace the pet as the conversation subject',()=>{
 const state=buildRecentSubjectState({pets:fixturePets,selectedPetId:'nori',recentConversation:[{role:'user',text:'Let us focus on Juniper litter accidents.'},{role:'user',text:'What did the vet suggest?'}]});
 assert.equal(state.entities.find(e=>e.key===state.currentFocusKey)?.petId,'juniper');
});
test('named conceptual question can stay conversational without reading or writing pet history',async t=>{
 const c=await context(t); const p=recoverAskInterpretation({...proposal,operation:'general',readOperation:'general',subject:'non_pet',petNames:[],terms:[]},{...c,currentMessage:'Does a missing note prove Nori never had symptoms?'});
 assert.equal(p.conversationOnly,true);assert.deepEqual(p.petIds,[]);assert.equal(p.readOnly,true);
});
test('dated recall discovers a relative correction and quotes it without applying a link',async t=>{
 clock(t);
 const r=await exercise('Did Nori really vomit on August 19?',{fixturePets,rows,petId:'nori',history:true,interpretationProposal:{...proposal,topic:'vomiting',terms:['vomit'],from:'2026-08-19',to:'2026-08-20'},expectedProviderCalls:null});
 assert.ok(r.context.askHistory.coverage.reasons.includes('unlinked_correction_uncertain'));
 assert.match(r.result.reasoning.answer.summary,/Taro/);
 assert.match(r.result.reasoning.answer.summary,/link to the original report has not been verified/);
 assert.deepEqual(r.result.acceptedCareActions,[]);
});
test('numeric message sequence remains chronological after nine messages',async t=>{
 clock(t);const ownerId=fixturePets[0].user_id;
 const messages=Array.from({length:12},(_,i)=>({id:'numeric-'+i,user_id:ownerId,conversation_id:'chat',role:'user',user_text:'Earlier question '+i,sequence_number:i+1,created_at:'2026-09-04T12:00:00Z'}));
 const r=await exercise('Hello',{fixturePets,rows,petId:'nori',messages,expectedProviderCalls:null});
 const numbers=r.context.conversationTurns.map(turn=>Number(turn.id.replace('numeric-','')));
 assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));
 assert.equal(numbers.at(-1),11);
});
test('non-pet general comparison stays general; historical comparison retains its read',async t=>{
 const c=await context(t);const common={...proposal,operation:'comparison',readOperation:'general',subject:'non_pet',petNames:[]};
 const general=recoverAskInterpretation(common,{...c,currentMessage:'Can Juniper eat exactly the same food as Nori?'});
 assert.equal(general.conversationOnly,true);assert.deepEqual(general.petIds,[]);
 const historical=recoverAskInterpretation(common,{...c,currentMessage:'Compare Nori and Juniper recorded food history.'});
 assert.notEqual(historical.conversationOnly,true);
});
test('ordinary full notes support a deterministic weight difference through the callback',async t=>{
 clock(t);const petRows=rows.filter(row=>row.pet_profile_id==='nori' && /weighed/.test(row.note));
 const r=await exercise('How much did Nori weight change between June 4 and September 3?',{fixturePets,rows:petRows.map(row=>({...row,title:'Note'})),petId:'nori',history:true,
 interpretationProposal:{...proposal,operation:'comparison',readOperation:'comparison',selection:'comparison',topic:'weight',terms:['weight'],from:'2026-06-04',to:'2026-09-04'},expectedProviderCalls:null});
 assert.match(r.result.reasoning.answer.summary,/0\.6 kg lower/);
 assert.match(r.result.reasoning.answer.summary,/28\.4 kg/);
 assert.deepEqual(r.result.acceptedCareActions,[]);
});

test('an unrelated correction cannot replace a dated food answer',async t=>{
 clock(t);const r=await exercise('Summarize Nori food changes from June onward.',{fixturePets,rows,petId:'nori',history:true,
 interpretationProposal:{...proposal,terms:['food','treat','vomit'],from:'2026-06-01',to:'2100-01-01'},expectedProviderCalls:null});
 assert.doesNotMatch(r.result.reasoning.answer.summary,/^The correction note/);
 assert.match(r.result.reasoning.answer.summary,/food|treat/i);
});

test('old relative days cannot become current narrative claims',()=>{
 const sources=[{text:'He finished the course today.',occurredAt:'2026-06-24T12:00:00Z'}];
 assert.equal(anchors('He finished the course today.',sources),false);
 assert.equal(anchors('He finished the course on June 24.',sources),true);
 assert.equal(anchors('The June 24 note says: "He finished the course today."',sources),true);
});
test('short bullet request retains the requested count',async()=>{
 const {presentReviewedHistory}=await import('../../app/lib/intelligence/history-presentation.ts');
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],'In three short bullets.'),'- First.\n- Second.\n- Third.');
});

test('quantity inside a dated note uses recall, while episodes retain counting',async t=>{
 const c=await context(t);const counted={...proposal,subject:'selected',petNames:[],operation:'count',readOperation:'count',terms:['accident'],from:'2026-07-08',to:'2026-07-09'};
 const p=recoverAskInterpretation(counted,{...c,currentMessage:'How many accidents does the July 8 note describe?'});
 assert.equal(p.readOperation,'recall');assert.equal(p.selection,'reference');
 assert.equal(recoverAskInterpretation(counted,{...c,currentMessage:'How many separate accidents episodes occurred on July 8?'}).readOperation,'count');
});
test('explicit note quantities and medication courses do not become illness counts',async t=>{
 const c=await context(t);const counted={...proposal,subject:'selected',petNames:[],operation:'count',readOperation:'count',terms:['stool'],from:'2026-06-15',to:'2026-06-16'};
 assert.equal(recoverAskInterpretation(counted,{...c,currentMessage:'How many stools were reported on June 15, rather than how many episodes?'}).readOperation,'recall');
 const courses={...counted,terms:['medic'],from:null,to:null};
 assert.equal(recoverAskInterpretation(courses,{...c,currentMessage:'How many medication courses are explicitly described?'}).readOperation,'recall');
 assert.equal(recoverAskInterpretation(courses,{...c,currentMessage:'How many medication courses ever?'}).readOperation,'count');
});
test('a disclaimer-only draft falls back to factual source reports',async t=>{
 clock(t);const text='This covers the matching saved notes I could verify, not necessarily every event in their life.';
 const r=await exercise('Summarize Nori food history.',{fixturePets,rows,petId:'nori',history:true,interpretationProposal:proposal,
 providerOverrides:{historyNarrative:{sentences:[{text,sourceIds:['care:nori-switch']}] }},expectedProviderCalls:null});
 assert.notEqual(r.result.reasoning.answer.summary,text);assert.match(r.result.reasoning.answer.summary,/food|treat/i);
});

test('dated source quotes stay intact while surrounding action claims are removed',async()=>{
 const {enforceVerifiedStateClaims}=await import('../../app/lib/application-actions/state-claims.ts');
 const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
 const quote='Luna\'s 2026-07-10 report: "We moved the tray. We changed both things together."';
 const input=quote+' I saved your profile.';
 const governed=enforceVerifiedStateClaims(input,false);
 assert.ok(governed.includes(quote));assert.doesNotMatch(governed,/I saved/);
 const displayed=presentationOnlyAskResponse({title:'Furvise',summary:governed,sections:[],applicationActions:[]},[]);
 assert.ok(displayed.summary.includes(quote));assert.doesNotMatch(displayed.summary,/I saved/);
 assert.doesNotMatch(enforceVerifiedStateClaims('I saved your profile.',false),/I saved/);
});

test('stored answer presentation preserves tables and bullet line breaks',async()=>{
 const {enforceVerifiedStateClaims}=await import('../../app/lib/application-actions/state-claims.ts');
 const {presentationOnlyAskResponse}=await import('../../app/lib/ask-conversation-server.ts');
 for(const summary of ['- First fact.\n- Second fact.\n- Third fact.','| Date | Weight |\n|---|---:|\n| 2026-06-04 | 28.4 kg |']){
  assert.equal(enforceVerifiedStateClaims(summary,false),summary);
  assert.equal(presentationOnlyAskResponse({title:'Furvise',summary,sections:[],applicationActions:[]},[]).summary,summary);
 }
});

test('repeated factual follow-up survives economy and still receives source review',async t=>{
 clock(t);const {buildAskConversationResponse}=await import('../../app/lib/ask.mjs');
 const answer='Nori finished the food transition on July 10. This covers the matching saved notes I could verify, not necessarily every event in their life.';
 const messages=[{id:'prev-u',user_id:fixturePets[0].user_id,conversation_id:'chat',role:'user',user_text:'Tell me about Nori food.',sequence_number:1},
 {id:'prev-a',user_id:fixturePets[0].user_id,conversation_id:'chat',role:'furvise',response_data:buildAskConversationResponse({title:'Furvise',summary:answer,sections:[],safetyNote:null}),sequence_number:2}];
 const r=await exercise('When did Nori finish the food transition?',{fixturePets,rows,petId:'nori',messages,history:true,interpretationProposal:proposal,
 answer,providerOverrides:{historyNarrative:null},reviewResponse:{approved:true},expectedReviewCalls:1,expectedProviderCalls:1});
 assert.match(r.result.reasoning.answer.summary,/July 10/);
 assert.match(JSON.parse(r.reviewRequests[0].input).draft.sentences[0].text,/food transition/);
});

test('account-wide phrasing resolves authenticated pets without asking for names',async t=>{
 const c=await context(t);c.eligiblePets=c.eligiblePets.filter(p=>p.user_id===c.owner.userId).slice(0,3);
 for(const currentMessage of ['Which pets have weight entries?','What are the uncertainties in these three pets histories?','Summarize each pet.']){
  const p=recoverAskInterpretation({...proposal,petNames:c.eligiblePets.map(p=>p.name)},{...c,currentMessage});
  assert.equal(p.petIds.length,3);assert.equal(p.clarification,null);
 }
});
test('hypothetical urgency stays conditional while current emergencies remain urgent',async t=>{
 const {classifyUserTurn}=await import('../../app/lib/ai/turn-classifier.ts');
 const {planProviderIndependentAskTurn}=await import('../../app/lib/ai/ask-orchestrator.ts');
 for(const message of ['Hypothetically, if a dog cannot breathe, what should the owner do?','If a pet collapsed right now, should someone wait for a history summary?']){
  assert.equal(classifyUserTurn(message).immediateEmergency,false);
  assert.equal(planProviderIndependentAskTurn({message,concerns:[],petName:'Nori'}),null);
 }
 assert.equal(classifyUserTurn('Nori cannot breathe right now.').immediateEmergency,true);
 assert.equal(classifyUserTurn('I think Nori cannot breathe.').immediateEmergency,true);
 const c=await context(t);const p=recoverAskInterpretation({...proposal,operation:'status',readOperation:'status',selection:'latest',terms:['breath']},{...c,currentMessage:'If an old breathing problem returned right now, would that change the urgency?'});
 assert.equal(p.readOperation,'general');assert.equal(p.conversationOnly,true);assert.equal(p.readOnly,true);
});

test('support wording for another persons loss is not a pet lifecycle report',async()=>{
 const {classifyCurrentPetLoss,resolveProviderIndependentLossSubject}=await import('../../app/lib/ai/pet-loss.ts');
 const message='What could I say to a friend whose dog died?';
 assert.equal(classifyCurrentPetLoss(message),'none');
 assert.equal(classifyCurrentPetLoss('Please write a comforting message to a colleague whose cat passed away.'),'none');
 assert.equal(classifyCurrentPetLoss('How can I support someone whose dog died'),'none');
 assert.equal(resolveProviderIndependentLossSubject({message,pets:fixturePets,selectedPetId:'nori'}),null);
 assert.equal(classifyCurrentPetLoss('My dog died today.'),'confirmed_current');
 assert.equal(classifyCurrentPetLoss(message+' Nori died today.'),'confirmed_current');
});

test('multi-pet request fits the actual admission payload including instructions',async t=>{
 clock(t);const {estimateInputTokens}=await import('../../app/lib/ai/usage-guard/cost-estimator.ts');
 const {buildAskProviderRequest}=await import('../../app/lib/ai/ask-reasoning.ts');
 const dense=rows.filter(row=>['nori','pip'].includes(row.pet_profile_id)).map(row=>({...row,note:row.note+' '+('A routine observation was recorded for this date. '.repeat(10))}));
 const r=await exercise('Compare Nori and Pip recorded history.',{fixturePets,rows:dense,petId:'nori',authoritativePetIds:['nori','pip'],history:true,
 interpretationProposal:{...proposal,operation:'comparison',readOperation:'comparison',selection:'comparison',petNames:['Nori','Pip'],terms:[]},expectedProviderCalls:null});
 const request=buildAskProviderRequest(r.prompt);const admitted={input:request.input,instructions:request.instructions};
 assert.ok(estimateInputTokens(admitted)<=20000);assert.ok(JSON.stringify(admitted).length<=80000);
 assert.ok(r.prompt.contextRecords.some(record=>record.petId==='nori'));assert.ok(r.prompt.contextRecords.some(record=>record.petId==='pip'));
 const large={...r.prompt,optionalMetadata:'x'.repeat(40000)};const original=JSON.stringify(large);
 const compact=JSON.parse(buildAskProviderRequest(large).input);
 assert.equal(JSON.stringify(large),original,'transport must not mutate server evidence');
 assert.deepEqual(compact.evidenceContract.represented,large.evidenceContract.represented,'complete source text remains available');
 assert.ok(compact.contextRecords.some(record=>record.valueSource),'large transport avoids duplicated note text');
});
