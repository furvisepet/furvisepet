import {assertPublicMutationDenied} from "./helpers/ask-public-mutation-boundary.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,id} from './helpers/canonical-replace.mjs';
const {validateReplaceJob,readBoundReplaceJob,resolveReplaceJob,replaceJobProviderSchema} = await import('../app/lib/furvise-brain/replace-job.ts');
const {prepareBoundReplaceAction,prepareFurviseApplicationActions} = await import('../app/lib/application-actions/planner.ts');
const {parseStoredApplicationActions} = await import('../app/lib/application-actions/contracts.ts');
const {validateAskRequest} = await import('../app/lib/intelligence/ask-request-contract.ts');
const {rebindCanonicalCapabilityAction,executeActionCapability} = await import('../app/lib/application-actions/capabilities.ts');
const {confirmFurviseWriteReceipt} = await import('../app/lib/furvise-brain/write-contract.ts');
function exact(){
 const f=fixture(),row=f.rows.pet_care_entries[0];
 row.updated_at='2026-09-22T12:00:00Z';
 f.rows.pet_care_entries.push({...row,id:id(8),created_at:'2026-09-22T18:00:00Z'});
 const ref={ref:'supplied-handle',recordId:row.id,ownerId:id(1),petId:f.pet.id,
  createdAt:row.created_at,updatedAt:row.updated_at,body:'Original record.',eventAt:row.created_at};
 f.context.replaceReferences=[ref];f.proposal.target={kind:'exact_record',ref:ref.ref};
 return {...f,ref,row};
}
test('provider selector union exposes only supplied handles, never database IDs',()=>{
 const f=exact(),schema=replaceJobProviderSchema([f.ref]);
 const target=schema.anyOf[1].properties.target;
 assert.deepEqual(target.anyOf[1].properties.ref.enum,['supplied-handle']);
 assert.deepEqual(target.anyOf[1].required,['kind','ref']);
 assert.equal(target.anyOf[1].additionalProperties,false);
 assert.equal(replaceJobProviderSchema().anyOf[1].properties.target.anyOf.length,1);
});
test('Binder freezes exact supplied record and version independently of replacement prose',()=>{
 const f=exact(),j=f.job();
 assert.deepEqual(j.target,{kind:'exact_record',ref:f.ref.ref,recordId:f.ref.recordId,updatedAt:f.ref.updatedAt});
 assert.ok(Object.isFrozen(j.target));assert.equal(j.body.text,f.proposal.bodyQuote);
 assert.deepEqual(readBoundReplaceJob(JSON.parse(JSON.stringify(j))),j);
});
for(const which of ['unknown','ambiguous','owner','pet','future','unbound-id','version','extra-selector']){
 test('Binder rejects '+which+' target authority',()=>{
  const f=exact();
  if(which==='unknown')f.proposal.target.ref='invented';
  if(which==='ambiguous')f.context.replaceReferences.push({...f.ref});
  if(which==='owner')f.ref.ownerId=id(99);
  if(which==='pet')f.ref.petId=id(99);
  if(which==='future')f.ref.createdAt='2099-01-01T00:00:00Z';
  if(which==='unbound-id')f.proposal.target.recordId=id(4);
  if(which==='version')f.ref.updatedAt='invalid';
  if(which==='extra-selector')f.proposal.target.topic='arbitrary';
  assert.throws(f.job,/write_job/);
 });
}
test('exact target resolves older supplied record without ordering or latest acquisition',async()=>{
 const f=exact(),j=f.job(),resolved=await resolveReplaceJob(j,f.db,id(1));
 assert.equal(resolved.target.id,'care:'+id(4));
 assert.ok(f.queries.every(q=>q[1]!=='order'&&q[1]!=='lte'));
 assert.ok(f.queries.some(q=>q[2]==='updated_at'&&q[3]===f.ref.updatedAt));
 const action=prepareBoundReplaceAction(j,resolved.target,f.pet.name,'request');
 const [cap]=await f.mint(action);
 assert.deepEqual(cap.replaceJob,j);assert.equal(cap.targetSourceId,'care:'+id(4));
 f.queries.length=0;
 const result=await executeActionCapability({capabilityId:cap.id,assistantMessageId:id(6),userId:id(1),mode:'confirm'});
 assert.equal(result.action.status,'succeeded');assert.equal(result.action.targetSourceId,'care:'+id(4));
 assert.ok(f.queries.every(q=>q[0]==='ask_action_capabilities'));
});
for(const which of ['foreign','pet','deleted','stale'])test('exact resolution rejects '+which+' without choosing replacement target',async()=>{
 const f=exact(),j=f.job();
 if(which==='foreign')f.row.user_id=id(9);
 if(which==='pet')f.row.pet_profile_id=id(9);
 if(which==='deleted')f.row.deleted_at='2026-09-23T00:00:00Z';
 if(which==='stale')f.row.updated_at='2026-09-23T00:00:00Z';
 await assert.rejects(resolveReplaceJob(j,f.db,id(1)),/TARGET_MISSING/);
 assert.ok(f.queries.every(q=>q[1]!=='order'));
});
for(const which of ['sourceId','recordId','version','body'])test('stored edit rejects changed '+which,async()=>{
 const f=exact(),action=await f.prepare();
 if(which==='sourceId')action.targetSourceId='care:'+id(8);
 if(which==='recordId')action.replaceJob={...action.replaceJob,target:{...action.replaceJob.target,recordId:id(8)}};
 if(which==='version')action.replaceJob={...action.replaceJob,target:{...action.replaceJob.target,updatedAt:'invalid'}};
 if(which==='body')action.input.detail+='changed';
 assert.deepEqual(parseStoredApplicationActions([action]),[]);
});
test('model-shaped edit cannot prepare or bind executable authority',async()=>{
 const f=exact(),action=await f.prepare(),{replaceJob,...legacy}=action;
 assert.deepEqual(prepareFurviseApplicationActions({proposals:[legacy],petId:f.pet.id,petName:f.pet.name,sourceMessage:f.source.text,requestId:'r'}),[]);
 assert.deepEqual(parseStoredApplicationActions([legacy]),[]);
 assert.throws(()=>rebindCanonicalCapabilityAction(legacy,f.source.id,f.source,f.pet.name,id(1)),/JOB_REQUIRED/);
});
test('Heart refuses an otherwise matching receipt for a different exact record',async()=>{
 const f=exact(),authorized=await f.prepare(),receipt={...structuredClone(authorized),id:id(5),status:'succeeded',targetSourceId:'care:'+id(8)};
 assert.throws(()=>confirmFurviseWriteReceipt({operationId:id(5),authorized,returned:receipt,persistedStatus:'succeeded',persistedReceipt:receipt}),/UNCONFIRMED/);
});
test("public Ask refuses saved-record replacement and retains opaque reference lookup",async () => {
 const route=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
 assert.doesNotMatch(route,/latestHistoryEditTarget|latestEditActions/);
 assert.match(route,/runReadOnlyAsk\(/);assert.doesNotMatch(route,/resolveReplaceJob|prepareReplaceTurn/);
 const loader=readFileSync(new URL('../app/lib/intelligence/replace-reference-context.ts',import.meta.url),'utf8');
 assert.doesNotMatch(loader,/question|currentMessage|\.match\(|\.includes\(.*topic/);
 await assertPublicMutationDenied("Replace Juniper's latest saved note with rested quietly.","I corrected Juniper's saved note.");
});
