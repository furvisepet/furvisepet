import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,id} from './helpers/canonical-replace.mjs';
const {bindRemovePlan,resolveRemovePlan,readBoundRemoveJob,removeJobSchema}=await import('../app/lib/furvise-brain/remove-job.ts');
const {validateAskRequest,askRequestProviderSchema}=await import('../app/lib/intelligence/ask-request-contract.ts');
const {interpretAskQuestion}=await import('../app/lib/intelligence/interpret-ask.ts');
const {prepareBoundRemoveAction,prepareFurviseApplicationActions}=await import('../app/lib/application-actions/planner.ts');
const {parseStoredApplicationActions}=await import('../app/lib/application-actions/contracts.ts');
const {rebindCanonicalCapabilityAction,executeActionCapability}=await import('../app/lib/application-actions/capabilities.ts');
const {confirmFurviseWriteReceipt}=await import('../app/lib/furvise-brain/write-contract.ts');
const {canonicalSuggestionJob}=await import('../app/lib/intelligence/canonical-suggestion.ts');
function setup(exact=false){
 const f=fixture(),row=f.rows.pet_care_entries[0];row.updated_at='2026-09-22T12:00:00Z';
 const ref={ref:'supplied-handle',recordId:row.id,ownerId:id(1),petId:f.pet.id,createdAt:row.created_at,updatedAt:row.updated_at,body:'Original',eventAt:row.created_at};
 f.context.replaceReferences=[ref];
 const proposal={operation:'remove',domain:'care_history',petName:f.pet.name,instructionQuote:f.source.text.trim(),target:exact?{kind:'exact_record',ref:ref.ref}:'last_event_for_subject'};
 Object.assign(f.request,{writeJob:null,removeJob:proposal,selection:'summary',mutationIntent:null,requirements:[],frame:null});
 const plan=()=>validateAskRequest(f.request,f.context).request.removeJob;
 const action=async()=>prepareBoundRemoveAction(await resolveRemovePlan(plan(),f.db,id(1)),'request');
 return {...f,row,ref,proposal,plan,action};
}
test('REMOVE schema is closed, domain-bound and exposes supplied handles only',()=>{
 const f=setup(true),s=removeJobSchema([f.ref]).anyOf[1];
 assert.equal(s.additionalProperties,false);assert.deepEqual(s.properties.domain.enum,['care_history']);
 assert.deepEqual(s.properties.target.anyOf[1].properties.ref.enum,[f.ref.ref]);
 assert.equal(removeJobSchema().anyOf[1].properties.target.anyOf.length,1);
});
for(const exact of [false,true])test('selector survives binding, JSON transport and source rebinding: '+exact,async()=>{
 const f=setup(exact),a=await f.action(),j=a.removeJob;
 assert.deepEqual(j.resolvedTarget,{recordId:f.row.id,updatedAt:f.row.updated_at});assert.equal(a.confirmationPolicy,'always');
 assert.deepEqual(readBoundRemoveJob(JSON.parse(JSON.stringify(j))),j);
 assert.deepEqual(rebindCanonicalCapabilityAction(a,f.source.id,f.source,f.pet.name,id(1)),a);
 const [cap]=await f.mint(a);assert.deepEqual(cap.removeJob,j);assert.equal(f.caps[0].target_id,f.row.id);
 assert.equal(f.caps[0].action_payload.targetSourceId,'care:'+f.row.id);
});
for(const invalid of ['unknown','ambiguous','owner','pet','future','arbitrary-id','instruction','extra','mixed','recovered'])test('Binder rejects '+invalid,()=>{
 const f=setup(true);
 if(invalid==='unknown')f.proposal.target.ref='unknown';
 if(invalid==='ambiguous')f.context.replaceReferences.push({...f.ref});
 if(invalid==='owner')f.ref.ownerId='foreign';if(invalid==='pet')f.ref.petId=id(7);
 if(invalid==='future')f.ref.createdAt='2030-01-01';if(invalid==='arbitrary-id')f.proposal.target.recordId=id(8);
 if(invalid==='instruction')f.proposal.instructionQuote='Invented';if(invalid==='extra')f.proposal.cleanup=true;
 if(invalid==='mixed')f.request.writeJob=f.proposal;if(invalid==='recovered')f.context.currentTurn.recoveredReceiptReference=true;
 assert.throws(f.plan,/remove_job/);
});
test('exact older target cannot become latest and confirmation never reselects',async()=>{
 const f=setup(true);f.rows.pet_care_entries.push({...f.row,id:id(8),created_at:'2026-09-22T18:00:00Z'});
 const a=await f.action();assert.equal(a.removeJob.resolvedTarget.recordId,id(4));
 assert.equal(f.queries.some(q=>q[1]==='order'),false);
 const [cap]=await f.mint(a);f.rows.pet_care_entries.push({...f.row,id:id(9),created_at:'2026-09-24'});
 const before=f.queries.filter(q=>q[0]==='pet_care_entries').length;
 const r=await executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm'});
 assert.equal(r.action.status,'succeeded');assert.deepEqual(r.action.removeJob,a.removeJob);
 assert.equal(f.queries.filter(q=>q[0]==='pet_care_entries').length,before);
});
for(const field of ['deleted_at','user_id','pet_profile_id','updated_at'])test('changed exact '+field+' cannot bind another target',async()=>{
 const f=setup(true),plan=f.plan();f.row[field]='changed';await assert.rejects(resolveRemovePlan(plan,f.db,id(1)),/TARGET_MISSING/);
});
for(const kind of ['target','source','job','input','extra-job'])test('stored action fails closed on '+kind+' tamper',async()=>{
 const f=setup(true),a=structuredClone(await f.action());
 if(kind==='target')a.targetSourceId='care:'+id(8);if(kind==='source')a.sourceMessageId=id(9);
 if(kind==='job')a.removeJob.resolvedTarget.recordId=id(8);if(kind==='input')a.input.detail='Cleanup';if(kind==='extra-job')a.replaceJob=fixture().job();
 assert.deepEqual(parseStoredApplicationActions([a]),[]);
});
test('model-shaped remove and legacy stored remove have no executable authority',async()=>{
 const f=setup(),a=await f.action(),legacy={...a};delete legacy.removeJob;
 assert.deepEqual(prepareFurviseApplicationActions({proposals:[legacy],petId:f.pet.id,petName:f.pet.name,requestId:'request',sourceMessage:f.source.text}),[]);
 assert.deepEqual(parseStoredApplicationActions([legacy]),[]);
 assert.throws(()=>rebindCanonicalCapabilityAction(legacy,f.source.id,f.source,f.pet.name,id(1)),/REMOVE_CAPABILITY_JOB_REQUIRED/);
 assert.equal(canonicalSuggestionJob(a),null);
});
test('Heart requires exact job, target and durable terminal receipt',async()=>{
 const f=setup(true),a=await f.action(),receipt={...a,id:id(5),status:'succeeded'};
 const input={operationId:id(5),authorized:a,returned:receipt,persistedStatus:'succeeded',persistedReceipt:receipt};
 assert.equal(confirmFurviseWriteReceipt(input).operation,'remove');
 for(const field of ['targetSourceId','removeJob','sourceMessageId']){const changed=structuredClone(receipt);changed[field]=field==='removeJob'?{...changed.removeJob,target:'last_event_for_subject'}:'wrong';
 assert.throws(()=>confirmFurviseWriteReceipt({...input,returned:changed,persistedReceipt:changed}),/UNCONFIRMED/);}
 assert.throws(()=>confirmFurviseWriteReceipt({...input,persistedReceipt:null}),/UNCONFIRMED/);
});
test('arbitrary USER wording enters REMOVE through one Brain proposal, never a command parser',async()=>{
 const f=setup(false);let calls=0;
 const result=await interpretAskQuestion({context:f.context,model:'gpt-5.4-mini',client:{responses:{create:async()=>{calls++;return {output_text:JSON.stringify(f.request)};}}}});
 assert.equal(calls,1);assert.equal(result.request.removeJob.operation,'remove');assert.equal(result.request.removeJob.target,'last_event_for_subject');
 const resolved=await resolveRemovePlan(result.request.removeJob,f.db,id(1));assert.equal(resolved.resolvedTarget.recordId,f.row.id);
});
test('route dispatches canonical removal before factual context and narrative generation',()=>{
 const s=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8'),start=s.indexOf('if (interpretation.request?.removeJob)');
 assert.ok(start>0);assert.ok(start<s.indexOf('// A validated ticket precedes every factual context read.'));
 assert.match(s.slice(start,start+1400),/resolveRemovePlan/);assert.doesNotMatch(s.slice(start,start+1100),/question\.includes|\.match\(|RegExp/);
});

test('provider grammar admits only standalone REMOVE and supplied reference handles',async()=>{
 const {default:Ajv}=await import('ajv'),f=setup(true),schema=askRequestProviderSchema({},f.context);
 const validate=new Ajv({allErrors:true}).compile(schema);
 const base={calculatePlan:null,storedRead:null,removeJob:null,stateTransitionJob:null,fieldMutationJob:null,lifecyclePlan:null,appendJob:null,readTicket:null,task:null,temporalScope:null,
 recordSelection:null,profileFields:[],projection:null,evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:null,excludedPetNames:[],...f.request};
 assert.equal(validate({request:base}),true,JSON.stringify(validate.errors));
 assert.equal(validate({request:{...base,removeJob:{...base.removeJob,target:{kind:'exact_record',ref:'invented'}}}}),false);
 for(const extra of [{writeJob:{}},{readTicket:{}},{fieldMutationJob:{}},{stateTransitionJob:{}},{mode:'mixed'},{profileFields:['weight']}])
 assert.equal(validate({request:{...base,...extra}}),false);
});
