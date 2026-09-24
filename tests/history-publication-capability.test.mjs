import test from 'node:test';
import assert from 'node:assert/strict';
import {historyPublicationCapability,supportedHistoryPublication,supportedPlainResultSetRead} from '../app/lib/intelligence/publication-authority.ts';
import {bindTypedReadTicket} from '../app/lib/furvise-brain/typed-read-ticket.ts';
import {retrieveReadTicket} from '../app/lib/furvise-brain/lungs.ts';
import {buildLabsList} from '../app/lib/intelligence/labs-list.ts';
import {logPublicationDispatch} from '../app/lib/intelligence/publication-authority-diagnostics.ts';

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
test('requirements hypothesis has exactly one veto; this does not establish the original live metadata',async()=>{
 const {evidence,rows}=await fixture();evidence.interpretation.request.requirements=['Return the requested observation.'];
 const before=JSON.stringify(evidence);
 assert.deepEqual(historyPublicationCapability(evidence),{supported:false,reasons:['requirements_present']});
 assert.equal(supportedHistoryPublication(evidence),false);assert.equal(supportedPlainResultSetRead(evidence),false);
 assert.equal(buildLabsList(evidence,rows),null);assert.equal(JSON.stringify(evidence),before);
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
test('unavailable dispatch logs the same gate even when Labs is never called',async()=>{
 const {evidence,rows}=await fixture();evidence.interpretation.request.requirements=['Arbitrary companion'];
 const logs=[],original=console.info;console.info=(label,json)=>{if(label==='[Ask publication authority]')logs.push(JSON.parse(json));};
 try{logPublicationDispatch(evidence,rows.map(r=>({id:r.id,petId:r.pet_profile_id})),'unavailable','normal');}finally{console.info=original;}
 assert.deepEqual(logs[0].capability,historyPublicationCapability(evidence));
 assert.deepEqual(logs[0].historyCapability,historyPublicationCapability(evidence,'history'));
 assert.equal(logs[0].obligations[0].semanticRequirement.kind,'additional_obligation');
 assert.equal(logs[0].sentToModelGeneration,false);
});
