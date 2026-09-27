import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
import assert from 'node:assert/strict';
const {historyPublicationCapability,supportedHistoryPublication,supportedPlainResultSetRead}=await import('../app/lib/intelligence/publication-authority.ts');
const {bindTypedReadTicket}=await import('../app/lib/furvise-brain/typed-read-ticket.ts');
const {retrieveReadTicket}=await import('../app/lib/furvise-brain/lungs.ts');
const {buildLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {logPublicationDispatch}=await import('../app/lib/intelligence/publication-authority-diagnostics.ts');

async function fixture(){
 const ticket=bindTypedReadTicket({operation:'read',subjectScope:'named',selection:null,needs:[],episode:null,
 temporal:{from:'2026-01-01T00:00:00Z',to:'2026-01-02T00:00:00Z',anchor:null,calendar:null},
 predicates:[{kind:'text_any',terms:['observation']}],searchHints:null,
 outputs:{strategy:null,completeness:'sufficient',ordering:'desc',limit:null}},['owned']);
 const row={id:'source',user_id:'owner',pet_profile_id:'owned',note:'Observation: 7 units.',title:null,deleted_at:null,
 occurred_at:'2026-01-01T12:00:00Z',created_at:'2026-01-01T12:00:00Z'};
 const result=await retrieveReadTicket(ticket,{userId:'owner',ownedPetIds:['owned'],from:'2026-01-01T00:00:00Z',
 to:'2026-01-02T00:00:00Z',asOf:'2026-01-03T00:00:00Z'},{
 page:async q=>[row].slice(q.offset,q.offset+q.limit),effective:async rows=>({records:rows,reliable:true}),
 effectiveWindow:async({rows})=>({records:rows,lineageClosed:true,replacementSeedsExhausted:true,sourceLineage:[],graphCalls:1,lineageRows:rows.length,reasons:[]})});
 return {rows:result.records,evidence:{version:'ask-evidence.v1',
 scope:{authorizedPetIds:['owned'],requestText:'Recall the observation.',status:'resolved',readOnlyRecall:true,requestKind:'record_lookup'},
 interpretation:{operation:'recall',readOperation:'recall',request:{mode:'read',evidenceBasis:'saved_history',
 quantity:'measurement',requirements:[],readTicket:ticket,outputFormat:null}},
 history:{ticketCoverage:result.coverage,provenance:[],eventCandidateIds:['care:source']},
 sources:[],represented:[],losses:[],verifiedFacts:[],representation:'complete'}};
}
test('known ticket shape with explicit assumed empty metadata is supported, not a reproduction of missing live metadata',async()=>{
 const {evidence,rows}=await fixture();assert.equal(evidence.history.ticketCoverage.resultSet.certified,true);
 assert.deepEqual(historyPublicationCapability(evidence),{supported:true,reasons:[]});
 assert.ok(buildLabsList(evidence,rows));
});
test('residual requirements do not veto certified factual capability',async()=>{
 const {evidence,rows}=await fixture();evidence.interpretation.request.requirements=['Return the requested observation.'];
 const before=JSON.stringify(evidence);
 assert.deepEqual(historyPublicationCapability(evidence),{supported:true,reasons:[]});
 assert.equal(supportedHistoryPublication(evidence),true);assert.equal(supportedPlainResultSetRead(evidence),true);
 assert.ok(buildLabsList(evidence,rows));assert.equal(JSON.stringify(evidence),before);
});
for(const [name,patch,reason] of [
 ['task',{task:{}},'task_present'],['projection',{projection:{}},'projection_present'],
 ['profile',{profileFields:['species']},'profile_fields_present'],['needs',{evidenceNeeds:[{}]},'evidence_needs_present'],
 ['quantity',{quantity:'episodes'},'unsupported_quantity'],['format',{outputFormat:'table'},'unsupported_presentation'],
 ['write',{writeJob:{}},'write_job_present'],['append',{appendJob:{}},'append_job_present'],
 ['mutation',{mutationIntent:'correct_record'},'mutation_intent_present'],
 ['calculation',{calculatePlan:{}},'calculation_present'],['stored',{storedRead:{}},'stored_read_present'],
 ['selection',{recordSelection:{}},'record_selection_present'],['remove',{removeJob:{}},'remove_job_present'],
 ['field',{fieldMutationJob:{}},'field_mutation_present'],['state',{stateTransitionJob:{}},'state_transition_present'],
 ['lifecycle',{lifecyclePlan:{}},'lifecycle_plan_present']
])test('exact capability reason: '+name,async()=>{
 const {evidence}=await fixture();Object.assign(evidence.interpretation.request,patch);
 assert.deepEqual(historyPublicationCapability(evidence),{supported:false,reasons:[reason]});
 assert.equal(supportedPlainResultSetRead(evidence),false);
});
test('scope and operation reasons are independent of free text',async()=>{
 const {evidence}=await fixture();evidence.scope.status='ambiguous';evidence.scope.authorizedPetIds=[];
 evidence.interpretation.readOperation='comparison';
 assert.deepEqual(historyPublicationCapability(evidence).reasons,['scope_unresolved','subject_unauthorized','unsupported_read_operation']);
});
test('dispatch separates certified factual completion from residual completion',async()=>{
 const {evidence,rows}=await fixture();evidence.interpretation.request.requirements=['Arbitrary companion'];
 const logs=[],original=console.info;console.info=(label,json)=>{if(label==='[Ask publication authority]')logs.push(JSON.parse(json));};
 try{logPublicationDispatch(evidence,rows.map(r=>({id:r.id,petId:r.pet_profile_id})),'labs','normal');}finally{console.info=original;}
 assert.deepEqual(logs[0].capability,historyPublicationCapability(evidence));
 assert.deepEqual(logs[0].historyCapability,historyPublicationCapability(evidence,'history'));
 assert.equal(logs[0].obligations[0].semanticRequirement.kind,'result_set_records');
 assert.equal(logs[0].obligations[0].mapping,'result_set_component_only');
 assert.equal(logs[0].factualComponentComplete,true);assert.equal(logs[0].labsClaimsTaskSatisfied,false);
 assert.equal(logs[0].residualRequirementCount,1);assert.equal(logs[0].obligations[1].semanticRequirement.kind,'residual_requirement');
 assert.deepEqual(logs[0].obligations[1].certificateAuthorizedSourceIds,[]);
 assert.deepEqual(logs[0].obligations[1].certificateAuthorizedEventIds,[]);
 assert.equal(logs[0].obligations[1].labsClaimsObligationSatisfied,false);
 assert.equal(logs[0].sentToModelGeneration,false);
});
