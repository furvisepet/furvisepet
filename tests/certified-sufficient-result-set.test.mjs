import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {bindTypedReadTicket}=await import('../app/lib/furvise-brain/typed-read-ticket.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {buildLabsList,serializeLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {derivePublicationAuthority}=await import('../app/lib/intelligence/publication-authority.ts');
const {resultSetSnapshotMatches}=await import('../app/lib/intelligence/result-set-publication.ts');
const {generateContextAwareAskResponse}=await import('../app/lib/ai/ask-reasoning.ts');
const {reviewHistoricalAnswer}=await import('../app/lib/intelligence/review-history-narrative.ts');
const {validateGeneratedAnswer}=await import('../app/lib/intelligence/validation/validate-answer.ts');
const {logLabsEligibility,logPublicationDispatch}=await import('../app/lib/intelligence/publication-authority-diagnostics.ts');
let providerCalls=0;
const client={responses:{create:async()=>{providerCalls++;throw Error('FACTUAL_PROVIDER_FORBIDDEN');}}};
test.afterEach(()=>assert.equal(providerCalls,0));
async function fixture({bodies=['Body weight: 10 kg.'],terms=['weight','weighed','weighing'],closed=true,seeds=true,operation='read',anchor=null}={}){
 const pet={id:'owned-a',user_id:'owner',name:'Subject A',species:'dog',avoid_ingredients:[]};
 const rows=bodies.map((note,i)=>({id:'source-'+i,user_id:'owner',pet_profile_id:pet.id,note,title:null,category:'general',deleted_at:null,
  occurred_at:'2026-09-01T12:'+String(i).padStart(2,'0')+':00Z',created_at:'2026-09-01T12:00:00Z',updated_at:'2026-09-01T12:00:00Z'}));
 const ticket=bindTypedReadTicket({operation,subjectScope:'named',needs:[],episode:null,
  temporal:{from:anchor?null:'2026-09-01T00:00:00Z',to:anchor?null:'2026-09-02T00:00:00Z',anchor,calendar:null},
  predicates:terms.length?[{kind:'text_any',terms}]:[],outputs:{completeness:'sufficient',ordering:'asc',limit:null}},[pet.id]);
 const read=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:[pet.id],from:'2020-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',asOf:'2026-09-24T00:00:00Z'},{
  page:async q=>rows.filter(r=>r.pet_profile_id===q.petId&&r.occurred_at>=q.from&&r.occurred_at<q.to).slice(q.offset,q.offset+q.limit),
  effective:async records=>({records,reliable:true}),
  effectiveWindow:async({rows})=>({records:rows,lineageClosed:closed,replacementSeedsExhausted:seeds,sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
 const evidence={version:'ask-evidence.v1',petNames:{[pet.id]:pet.name},scope:{authorizedPetIds:[pet.id],requestText:'Recall the recorded observation.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
  interpretation:{operation:'recall',readOperation:'recall',petIds:[pet.id],readOnly:true,request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',
   readTicket:ticket,requirements:[],referenceTurnIds:[],profileFields:[],outputFormat:'prose'}},
  history:{ticketCoverage:read.coverage,provenance:[],candidateIds:read.records.map(r=>'care:'+r.id),eventCandidateIds:read.records.map(r=>'care:'+r.id),needs:[],reasons:read.coverage.reasons},
  sources:[],represented:[],losses:[],verifiedFacts:[],completeness:{retrieval:read.coverage.status,corrections:closed?'complete':'unknown',extraction:'unknown',grouping:'unknown'}};
 const context={pet,eligiblePets:[pet],currentMessage:evidence.scope.requestText,memories:[],careEntries:read.records,askInterpretation:evidence.interpretation,askHistory:{entries:read.records,coverage:{ticketCoverage:read.coverage}}};
 return {pet,rows,read,ticket,evidence,context};
}
const labs=f=>buildLabsList(f.evidence,f.read.records);
async function generate(f){return generateContextAwareAskResponse({evidenceContract:f.evidence,profiles:[f.pet],careEntries:f.read.records,
 memories:[],productFeedback:[],conversationTurns:[],recentUpdates:[],question:f.context.currentMessage,client});}
async function accepted(f){
 assert.equal(f.ticket.selection,undefined);assert.equal(f.ticket.outputs.completeness,'sufficient');
 assert.equal(f.read.coverage.resultSet.certified,true);
 assert.equal(resultSetSnapshotMatches(f.ticket,f.read.coverage,f.read.records.map(r=>({id:r.id,petId:r.pet_profile_id}))),true);
 const l=labs(f);assert.ok(l);assert.deepEqual(l.records.map(r=>r.body),f.read.records.map(r=>r.note));
 assert.deepEqual(l.records.map(r=>r.sourceId),f.read.records.map(r=>'care:'+r.id));
 const a=derivePublicationAuthority(f.evidence,l.records);assert.equal(a.transportValid,true);
 assert.deepEqual(a.authorizedSourceIds,l.records.map(r=>r.sourceId));
 const result=await generate(f);assert.equal(result.model,'server-labs-list');assert.equal(result.answer.summary,serializeLabsList(l));
 assert.deepEqual(result.relevantContextIds,l.records.map(r=>r.sourceId));assert.deepEqual(result.careActions,[]);
 assert.equal(await reviewHistoricalAnswer({result,client}),true);
 const v=validateGeneratedAnswer(result,f.context,'routine',[f.pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'complete');
 return result;
}
async function unavailable(f){
 assert.equal(labs(f),null);const r=await generate(f);assert.equal(r.model,'server-history-unavailable');assert.deepEqual(r.relevantContextIds,[]);
 assert.equal(await reviewHistoricalAnswer({result:r,client}),true);
 assert.equal(validateGeneratedAnswer(r,f.context,'routine',[f.pet.id]).assessment.outcome,'limited');
 assert.match(r.answer.summary,/does not establish that matching records are absent/);
}
test('sufficient measurement result set publishes exact dated source through deterministic review and validation',async()=>{await accepted(await fixture());});
test('same authority publishes a different measurement domain without interpreting its body',async()=>{const f=await fixture({bodies:['Measured temperature: 38.2 C.'],terms:['temperature']});const r=await accepted(f);assert.match(r.answer.summary,/38.2 C/);});
test('same authority publishes non-measurement record content',async()=>{const f=await fixture({bodies:['Travel observation: rested throughout.'],terms:['travel']});f.evidence.interpretation.request.quantity='records';await accepted(f);});
test('multiple certified matches survive a singular-looking question without first or last selection',async()=>{const f=await fixture({bodies:['Body weight: 10 kg.','Body weight: 11 kg.']});f.evidence.scope.requestText="What was this pet's recorded weight?";const r=await accepted(f);assert.equal(r.labsList.records.length,2);assert.match(r.answer.summary,/10 kg/);assert.match(r.answer.summary,/11 kg/);});
test('missing certificate cannot use sufficient completeness as authority',async()=>{const f=await fixture();delete f.read.coverage.resultSet;await unavailable(f);});
test('unclosed lineage prevents matching-set certification',async()=>{const f=await fixture({closed:false});assert.equal(f.read.coverage.resultSet.matchingSetComplete,false);await unavailable(f);});
test('unexhausted replacement seeds prevent certification',async()=>{await unavailable(await fixture({seeds:false}));});
test('omitted oversized body prevents complete representation despite exhaustive matching proof',async()=>{const f=await fixture({bodies:['Body weight: 10 kg.','Body weight: '+'x'.repeat(19000)]});assert.equal(f.read.coverage.resultSet.matchingSetComplete,true);assert.equal(f.read.coverage.resultSet.representationComplete,false);assert.deepEqual(f.read.coverage.resultSet.omittedIds,['source-1']);await unavailable(f);});
test('partial coverage cannot publish a complete result even with copied certificate bits',async()=>{const f=await fixture();f.read.coverage.status='partial';await unavailable(f);});
for(const field of ['certified','matchingSetComplete','representationComplete'])test('altered '+field+' receipt fails exact snapshot validation',async()=>{const f=await fixture();f.read.coverage.resultSet[field]=false;assert.throws(()=>labs(f),/ASK_LABS_RESULT_SET_SNAPSHOT/);});
test('omitted IDs or missing returned row fail exact transport validation',async()=>{const f=await fixture();assert.throws(()=>buildLabsList(f.evidence,[]),/ASK_LABS_LIST_COVERAGE_SHAPE/);f.read.coverage.resultSet.omittedIds=['source-0'];assert.throws(()=>labs(f),/ASK_LABS_RESULT_SET_SNAPSHOT/);});
test('two returned rows cannot lose one at publication',async()=>{const f=await fixture({bodies:['Body weight: 10 kg.','Body weight: 11 kg.']});assert.throws(()=>buildLabsList(f.evidence,f.read.records.slice(1)),/ASK_LABS_RESULT_SET_SNAPSHOT/);});
test('certified empty effective stream retains valid negative-result semantics',async()=>{const f=await fixture({bodies:[]});const r=await accepted(f);assert.match(r.answer.summary,/No matching notes were found/);});
test('lexical empty matching set with other effective history remains a limitation',async()=>{const f=await fixture({bodies:['Rested quietly.']});assert.equal(f.read.coverage.resultSet.certified,true);await unavailable(f);});
test('unfiltered certified empty result remains valid',async()=>{await accepted(await fixture({bodies:[],terms:[]}));});
test('missing anchor stays unavailable, never absence',async()=>{const f=await fixture({operation:'read_since_event',anchor:{concept:'clinic visit',relation:'after'}});assert.equal(f.read.coverage.status,'anchor_missing');await unavailable(f);});
for(const [name,patch,interpretation] of [
 ['count',{quantity:'count'},{readOperation:'counting'}],['compare',{}, {readOperation:'comparison'}],
 ['aggregate',{}, {readOperation:'aggregation'}],['navigation',{}, {readOperation:'navigation'}],
 ['task',{task:{intent:'task'}},{}],['projection',{projection:{quantity:'body_mass'}},{}],
 ['evidence needs',{evidenceNeeds:[{id:'independent'}]},{}],
 ['calculation',{calculatePlan:{}},{}],['profile',{evidenceBasis:'saved_profile',profileFields:['species']},{}],
 ['stored read',{storedRead:{domain:'memory'}},{}],['record selection',{recordSelection:{}},{}],
 ['write',{writeJob:{}},{}],['append',{appendJob:{}},{}],['remove',{removeJob:{}},{}],
 ['field mutation',{fieldMutationJob:{}},{}],['state mutation',{stateTransitionJob:{}},{}],
 ['lifecycle mutation',{lifecyclePlan:{}},{}],['mixed',{mode:'mixed'},{}],['mutation intent',{mutationIntent:'append'},{}]
])test(name+' obligation cannot borrow ordinary result-set authority',async()=>{const f=await fixture();Object.assign(f.evidence.interpretation.request,{requirements:['Additional user-facing work']},patch);Object.assign(f.evidence.interpretation,interpretation);assert.equal(labs(f),null);});
test('episode ticket remains outside ordinary result-set serialization',async()=>{const f=await fixture();f.evidence.interpretation.request.readTicket={...f.ticket,episode:{operation:'count'}};assert.equal(labs(f),null);});
test('explicit unique selection requirement cannot borrow a plain result set',async()=>{const f=await fixture();f.evidence.interpretation.request.readTicket={...f.ticket,outputs:{...f.ticket.outputs,limit:1}};assert.equal(labs(f),null);});
test('cross-pet row retains source scope exception',async()=>{const f=await fixture();assert.throws(()=>buildLabsList(f.evidence,[{...f.read.records[0],pet_profile_id:'foreign-pet'}]),/ASK_LABS_LIST_SOURCE_SCOPE/);});
test('foreign ticket subject is denied',async()=>{const f=await fixture();f.evidence.scope.authorizedPetIds=[];assert.equal(labs(f),null);});
test('changed window and altered lineage cannot reuse receipt',async()=>{for(const mutate of [f=>f.evidence.interpretation.request.readTicket={...f.ticket,temporal:{...f.ticket.temporal,from:'2026-08-01T00:00:00Z'}},f=>f.read.coverage.effectiveStream[0].lineageClosed=false]){const f=await fixture();mutate(f);assert.throws(()=>labs(f),/ASK_LABS_RESULT_SET_SNAPSHOT/);}});
test('diagnostics observe certified result-set admission and its bound source IDs',async()=>{
 const f=await fixture(),before=JSON.stringify(f),logs=[],original=console.info;
 console.info=(label,json)=>{if(label==='[Ask publication authority]')logs.push(JSON.parse(json));};
 try{const rows=f.read.records.map(r=>({id:r.id,petId:r.pet_profile_id}));logLabsEligibility(f.evidence,rows);logPublicationDispatch(f.evidence,rows,'labs','normal');}
 finally{console.info=original;}
 assert.equal(logs[0].eligible,true);assert.deepEqual(logs[0].rejectedBy,[]);
 assert.equal(logs[1].sentToModelGeneration,false);assert.equal(logs[1].obligations[0].resultSetComponentCertified,true);
 assert.deepEqual(logs[1].obligations[0].certificateAuthorizedSourceIds,['care:source-0']);assert.equal(JSON.stringify(f),before);
});
test('diagnostic failure cannot prevent certified admission',async()=>{const f=await fixture(),original=console.info;console.info=(label)=>{if(label==='[Ask publication authority]')throw Error('observer unavailable');};try{assert.ok(labs(f));}finally{console.info=original;}});

const {labsTaskComplete,labsFactualComponentComplete,labsListReviewFailure}=await import('../app/lib/intelligence/labs-list.ts');
const {buildHistoryObligations,historyTaskCompleted}=await import('../app/lib/intelligence/history-obligations.ts');
const {bindPublicationObligations}=await import('../app/lib/intelligence/publication-authority.ts');
const {reviewTaskCompletion}=await import('../app/lib/intelligence/review-task-completion.ts');
const {assessTaskExecution}=await import('../app/lib/intelligence/task-execution-contract.ts');
for(const residual of ['Some residual obligation.','Also include the other pet.','Compare these measurements.','Add the measurements together.','Explain the clinical diagnosis.','Render a table instead.','Repeat the typed lookup.'])test('residual publishes exact certified component but limits task: '+residual,async()=>{
 const f=await fixture({bodies:['Observed distance: 7 m.'],terms:['distance']});f.evidence.interpretation.request.requirements=[residual];
 const l=labs(f);assert.ok(l);assert.equal(labsFactualComponentComplete(l),true);assert.equal(labsTaskComplete(l),false);
 const authority=derivePublicationAuthority(f.evidence,l.records);assert.deepEqual(authority.authorizedSourceIds,['care:source-0']);
 const obligations=buildHistoryObligations(f.evidence),bound=bindPublicationObligations(f.evidence,obligations);
 const separate=bound.obligations.filter(o=>o.kind==='residual_requirement');assert.equal(separate.length,1);assert.deepEqual(separate[0].representedSourceIds,[]);assert.equal(bound.bindings.has(separate[0].index),false);
 const result=await generate(f);assert.equal(result.model,'server-labs-list');assert.equal(result.answer.summary,serializeLabsList(l));assert.deepEqual(result.relevantContextIds,['care:source-0']);
 assert.equal(await reviewHistoricalAnswer({result,client}),true);const v=validateGeneratedAnswer(result,f.context,'routine',[f.pet.id]);assert.equal(v.valid,true);assert.equal(v.assessment.outcome,'limited');assert.ok(v.assessment.reasons.includes('residual_requirements_unfulfilled'));assert.equal(v.assessment.checks.evidenceSupport,'passed');
 assert.equal(await reviewTaskCompletion({validation:v,context:f.context,requestId:'offline',validate:()=>{throw Error('unexpected repair');},client}),v);
 const execution=assessTaskExecution({assessment:v.assessment,completion:[],responseMode:result.responseMode,actions:[],careWriteRequired:false,careReceipt:{status:'not_requested',careEntryIds:[]}});
 assert.equal(execution.taskOutcome,'limited');assert.equal(execution.creditDisposition,'release');assert.equal(execution.mutationOutcome,'not_requested');
 result.evidenceContract.interpretation.request.requirements=[];assert.equal(labsListReviewFailure(result),'labs_ticket_or_coverage_changed');
});
test('residual limitation is not silently promoted by whole-question history completion',()=>{assert.equal(historyTaskCompleted([{index:0,status:'answered',sourceIds:[],sentenceIndexes:[0]},{index:1,kind:'residual_requirement',status:'limited',sourceIds:[],sentenceIndexes:[]}]),false);});
for(const domain of ['current_state','operation_receipt'])test('residual cannot authorize stored domain '+domain,async()=>{const f=await fixture();Object.assign(f.evidence.interpretation.request,{requirements:['Do all work'],storedRead:{domain}});assert.equal(labs(f),null);});
test('residual cannot repair an unresolved scope or absent result certificate',async()=>{for(const mutate of [f=>f.evidence.scope.status='ambiguous',f=>delete f.read.coverage.resultSet]){const f=await fixture();f.evidence.interpretation.request.requirements=['Complete this task'];mutate(f);assert.equal(labs(f),null);}});
