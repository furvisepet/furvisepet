import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('Interpreter fixtures forbid network access');};
const { interpretAskQuestion }=await import('../app/lib/intelligence/interpret-ask.ts');
const { validateAskRequest }=await import('../app/lib/intelligence/ask-request-contract.ts');
const { buildAskBrainTurn }=await import('../app/lib/furvise-brain/ask-runtime.ts');
const { retrieveFurviseMemory }=await import('../app/lib/furvise-brain/memory-organ.ts');
const { createAskEvidenceContract, askEvidenceScope }=await import('../app/lib/intelligence/ask-evidence.ts');
const { generateContextAwareAskResponse }=await import('../app/lib/ai/ask-reasoning.ts');
const { reviewHistoricalAnswer }=await import('../app/lib/intelligence/review-history-narrative.ts');
const { validateGeneratedAnswer }=await import('../app/lib/intelligence/validation/validate-answer.ts');
const pet={id:'dune',name:'Dune',user_id:'owner',species:'cat',avoid_ingredients:[]};
const question='What is Dune’s earliest recorded weight and the date?';
const ticket={operation:'read',temporal:{from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['weighed','weight']}],outputs:{completeness:'exhaustive',ordering:'asc',limit:1}};
const proposal={version:'ask-request.v2',readTicket:ticket,mode:'read',question,requirements:[],referenceTurnIds:[],scope:'named',petNames:['Dune'],operation:'recall',selection:'earliest',quantity:'records',topic:'body mass',terms:['weight'],from:null,to:null,episodeTopic:null,ordinal:null,frame:null,evidenceBasis:'saved_history',premiseQuotes:[]};
const context=()=>({owner:{userId:'owner'},pet,eligiblePets:[pet],currentMessage:question,conversationTurns:[],timeZone:'UTC',currentTurn:{id:'user',role:'user',text:question},careEntries:[],selectedCareEntries:[],memories:[]});
const oldest={id:'9f53b55b-4c32-4d9d-b055-020f29179d94',user_id:'owner',pet_profile_id:'dune',category:'general',title:null,
 note:'Dune weighed 4.81 kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.',
 occurred_at:'2016-10-15T12:00:00+00:00',created_at:'2026-09-18T04:42:15Z',updated_at:'2026-09-18T04:42:15Z',deleted_at:null};
const rows=[oldest,...Array.from({length:119},(_,i)=>({...oldest,id:'later-'+i,occurred_at:'2025-01-15T12:00:00Z',note:'Dune weighed 5.11 kg.'}))];
function db() {return {from(table){assert.equal(table,'pet_care_entries');let offset=0,limit=64;
 const q={select(){return q;},eq(){return q;},is(){return q;},gte(){return q;},lt(){return q;},order(){return q;},range(a,b){offset=a;limit=b-a+1;return q;},abortSignal(){return q;},returns(){return Promise.resolve({data:rows.slice(offset,offset+limit),error:null});}};return q;},
 rpc(name,args){assert.equal(name,'read_ask_history_correction_page');return {abortSignal:async()=>({data:{claims:[],relations:[],lineage:[],sources:rows.filter(r=>args.p_care_ids.includes(r.id)),truncated:false},error:null})};}};}

test('two fresh Dune fixtures use one interpreter call each and return the same dated source',async()=>{
 const results=[];
 for(const id of ['fresh-a','fresh-b']){
  let calls=0;const initial=context();initial.currentTurn.id=id;
  const interpretation=await interpretAskQuestion({context:initial,model:'fixture',client:{responses:{create:async()=>{calls++;return {output_text:JSON.stringify(proposal)};}}}});
  const planned={...initial,askInterpretation:interpretation};
  const brain=buildAskBrainTurn({context:planned,logicalTurnId:id,authoritativePetIds:[pet.id]});
  const read=await retrieveFurviseMemory(planned,db(),brain);
  assert.deepEqual(read.askHistory.entries.map(r=>r.id),[oldest.id]);
  // Frozen Lungs treats an output limit as partial; this branch must not forge complete.
  assert.equal(read.askHistory.coverage.ticketCoverage.status,'partial');
  const neverGenerate={responses:{create:async()=>{throw Error('No narrative or repair model call allowed');}}};
  const result=await generateContextAwareAskResponse({evidenceContract:createAskEvidenceContract(read,[pet.id]),profiles:[pet],careEntries:read.askHistory.entries,
   memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question,requestId:id,locale:'en-CA',client:neverGenerate});
  assert.equal(await reviewHistoricalAnswer({result,client:neverGenerate}),true);
  const validated=validateGeneratedAnswer(result,read,'routine',[pet.id]);
  assert.equal(validated.valid,true);assert.equal(validated.assessment.outcome,'limited');
  assert.match(validated.response.answer.summary,/2016-10-15.*4\.81 kg/);
  assert.equal(calls,1);assert.equal(result.applicationActions.length,0);
  results.push({body:validated.response.answer.summary,ids:result.relevantContextIds});
 }
 assert.deepEqual(results[0],results[1]);
});
test('read ticket alone controls temporal bounds and order despite conflicting legacy hints or words',()=>{
 for(const currentMessage of ['ever','all history in 2025','last two weights','dental','from 2020 to 2024']){
  const result=validateAskRequest({...proposal,from:'2025-01-01',to:'2025-12-31',selection:'latest'}, {...context(),currentMessage});
  assert.deepEqual(result.request.readTicket.temporal,ticket.temporal);
  assert.equal(result.selection,'earliest');assert.deepEqual(result.history,{from:null,to:null,terms:[],interpretation:'period'});
  const unplanned=askEvidenceScope(currentMessage,[pet.id]);
  assert.equal(unplanned.readOnlyRecall,false);assert.equal(unplanned.requestedPeriod.kind,'unspecified');
 }
});
test('foreign subjects and read tickets carrying writes fail before any organ',()=>{
 for(const patch of [{petNames:['Other owner']},{scope:'selected',petNames:['Other owner']},{mutationIntent:'correct_record'},{frame:{}},{task:{intent:'save'}}])
  assert.throws(()=>validateAskRequest({...proposal,...patch},context()),/ASK_REQUEST_INVALID/);
});
test('missing Brain or missing read ticket never invokes text-based memory fallback',async()=>{
 const initial=context();const interpretation=validateAskRequest(proposal,initial);
 const brain=buildAskBrainTurn({context:{...initial,askInterpretation:interpretation},logicalTurnId:'turn',authoritativePetIds:[pet.id]});
 const forbidden={from(){throw Error('No database calls permitted');}};
 await assert.rejects(retrieveFurviseMemory(initial,forbidden,brain),/ASK_MEMORY_BRAIN_REQUIRED/);
 await assert.rejects(retrieveFurviseMemory({...initial,askInterpretation:{...interpretation,request:{...interpretation.request,readTicket:null}}},forbidden,brain),/ASK_MEMORY_READ_TICKET_REQUIRED/);
});
test('invalid planner output fails once without a repair pass or mutation authority',async()=>{
 for(const output of [{...proposal,readTicket:null},{...proposal,mode:'update',readTicket:null,writeJob:{}}]){
  let calls=0;
  await assert.rejects(interpretAskQuestion({context:context(),model:'fixture',client:{responses:{create:async()=>{calls++;return {output_text:JSON.stringify(output)};}}}}));
  assert.equal(calls,1);
 }
});

test('ticket binding retains grounded read obligations without deriving windows from their English',()=>{
 const currentMessage='Compare Dune in April 2024 with the current record.';
 const c={...context(),currentMessage};
 const planned={...proposal,operation:'comparison',readTicket:{...ticket,operation:'compare'},quantity:'measurement',
  temporalScope:'historical_and_current',profileFields:['weight'],requirements:['Compare both dated records'],
  projection:{nameHeader:'Pet',valueHeader:'Weight',quantity:'body_mass',unit:'kg',order:'scope'},
  evidenceNeeds:[{quote:currentMessage,sourceTurnId:null,terms:['weighed'],petNames:['Dune'],order:'context'}]};
 const result=validateAskRequest(planned,c);
 assert.deepEqual(result.request.readTicket.temporal,ticket.temporal);
 assert.equal(result.request.evidenceNeeds[0].window,undefined);
 assert.deepEqual(result.request.evidenceNeeds[0].petIds,['dune']);
 assert.deepEqual(result.request.profileFields,['weight']);
 assert.equal(result.request.temporalScope,'historical_and_current');
 assert.deepEqual(result.request.projection,planned.projection);
 assert.deepEqual(result.request.requirements,planned.requirements);
 assert.equal(result.request.mode,'read');assert.equal(result.request.writeJob,null);
 const evidence=createAskEvidenceContract({...c,askInterpretation:result},['dune']);
 assert.equal(evidence.needCoverage[0].pets[0].state,'not_queried');
 assert.equal(evidence.needCoverage[0].semanticSupport,'unverified');
 assert.notEqual(evidence.completeness.retrieval,'complete');
 for(const patch of [{quote:'invented diagnosis'},{petNames:['Foreign']},{sourceTurnId:'assistant'}]) {
  const rejected=validateAskRequest({...planned,evidenceNeeds:[{...planned.evidenceNeeds[0],...patch}]},c);
  assert.equal(rejected.request.evidenceNeeds,undefined);
  assert.equal(rejected.request.evidenceNeedIssues.length,1);
  assert.deepEqual(rejected.petIds,['dune']);
 }
});

test('a redundant account label cannot widen the ticket named subset or include excluded pets',()=>{
 const c={...context(),eligiblePets:[pet,{...pet,id:'cedar',name:'Cedar'},{...pet,id:'foreign',name:'Foreign',user_id:'other'}]};
 assert.deepEqual(validateAskRequest({...proposal,scope:'account'},c).request.readTicket.subjects.petIds,['dune']);
 assert.deepEqual(validateAskRequest({...proposal,scope:'account',petNames:[],excludedPetNames:['Dune']},c).petIds,['cedar']);
 assert.throws(()=>validateAskRequest({...proposal,scope:'account',petNames:['Foreign']},c),/ownership/);
 assert.throws(()=>validateAskRequest({...proposal,scope:'selected',excludedPetNames:['Dune']},c),/excluded_subject/);
});

test('impossible typed dates and malformed projection metadata cannot be silently normalized or dropped',()=>{
 assert.throws(()=>validateAskRequest({...proposal,readTicket:{...ticket,temporal:{from:'2026-02-30T00:00:00Z',to:null,anchor:null}}},context()),/dates/);
 assert.throws(()=>validateAskRequest({...proposal,projection:{quantity:'invented'}},context()),/projection/);
 assert.throws(()=>validateAskRequest({...proposal,recordSelection:{scope:'all_active',quote:'invented'}},context()),/record_selection/);
});
