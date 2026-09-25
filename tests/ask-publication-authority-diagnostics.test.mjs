import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return s==='server-only'?{url:'data:text/javascript,export {};',format:'module',shortCircuit:true}:next(s,c);}});
globalThis.fetch=async()=>{throw Error('OFFLINE_ONLY');};
const {buildLabsList,serializeLabsList}=await import('../app/lib/intelligence/labs-list.ts');
const {logLabsEligibility,logPublicationDispatch,logReviewAuthority}=await import('../app/lib/intelligence/publication-authority-diagnostics.ts');
function fixture(){
 const id='event-a',petId='pet-a',text='PRIVATE_SOURCE 30.31 kg';
 const ticket={operation:'read',subjectScope:'named',subjects:{petIds:[petId]},needs:[],episode:null,
  temporal:{calendar:null,from:null,to:null,anchor:null},predicates:[{kind:'text_any',terms:['PRIVATE_PREDICATE']}],
  outputs:{completeness:'sufficient',ordering:'desc',limit:null},
  selection:{groupBy:['subject'],union:[{orderBy:[{field:'event_at',direction:'desc'}],take:{count:1,per:'group'}}]}};
 const coverage={status:'partial',groups:[{petId,clauses:[{direction:'desc',count:1,ids:[id],certified:true}],
  selectedIds:[id],retainedIds:[id],selectionStatus:'complete',blocked:false,reasons:[]}],
  selection:{retainedIds:[id]},effectiveStream:[{petId,lineageClosed:true,replacementSeedsExhausted:true,
  effectiveIds:[id],certifiedSelectedIds:[id]}]};
 const evidence={scope:{authorizedPetIds:[petId],requestText:'PRIVATE_QUESTION',status:'resolved',readOnlyRecall:true},
  representation:'complete',represented:[{sourceId:'care:'+id,petId,sourceType:'care_update',text,start:0,end:text.length},
   {sourceId:'profile:'+petId+':weight',petId,sourceType:'profile',text:'30.4 kg',start:0,end:7}],
  sources:[{petId,source:'care_entries',loadedIds:['care:'+id],status:'loaded'},
   {petId,source:'profile',loadedIds:[petId],status:'loaded'}],losses:[],
  history:{ticketCoverage:coverage,provenance:[],perPet:[],reasons:[],corrections:'complete'},
  interpretation:{operation:'recall',readOperation:'recall',request:{readTicket:ticket,mode:'read',quantity:'measurement',
   requirements:[],referenceTurnIds:[],outputFormat:'table',projection:null,task:null}}};
 return {evidence,rows:[{id,petId,pet_profile_id:petId,note:text,occurred_at:'2026-09-15T12:00:00Z',deleted_at:null}]};
}
function capture(run){
 const original=console.info,logs=[];console.info=(label,json)=>{if(label==='[Ask publication authority]')logs.push(JSON.parse(json));};
 try{return {result:run(),logs};}finally{console.info=original;}
}
test('eligible table remains deterministic; diagnostics do not mutate evidence or rendered facts',()=>{
 const f=fixture(),before=JSON.stringify(f);
 const {result:labs,logs}=capture(()=>buildLabsList(f.evidence,f.rows));
 assert.ok(labs);assert.equal(logs[0].eligible,true);assert.deepEqual(logs[0].rejectedBy,[]);
 assert.equal(logs[0].certificateCount,1);assert.equal(logs[0].certificates[0].certified,true);
 assert.deepEqual(logs[0].selectedEventIds,['event-a']);assert.equal(JSON.stringify(f),before);
 assert.match(serializeLabsList(labs),/30.31/);
});
test('each legacy selection exclusion is named without changing the existing rejection',()=>{
 for(const [patch,interpretation,reason] of [
  [{task:{intent:'save_note'}},{},'selection.request.task.present'],
  [{projection:{quantity:'body_mass',unit:'kg',order:'scope',nameHeader:'PRIVATE_HEADER',valueHeader:'PRIVATE_HEADER'}},{},'selection.request.projection.present'],
  [{evidenceNeeds:[{id:'PRIVATE_NEED',quote:'PRIVATE_QUOTE',terms:['PRIVATE_TERM'],petIds:['pet-a']}]},{},'selection.request.evidenceNeeds.nonempty'],
  [{quantity:'duration'},{},'selection.request.quantity.unsupported'],
  [{},{readOperation:'comparison'},'selection.interpretation.operation.unsupported'],
 ]){
  const f=fixture();Object.assign(f.evidence.interpretation.request,patch);Object.assign(f.evidence.interpretation,interpretation);
  const {result,logs}=capture(()=>buildLabsList(f.evidence,f.rows));
  assert.equal(result,null);assert.equal(logs[0].eligible,false);assert.deepEqual(logs[0].rejectedBy,[reason]);
  assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_/);
 }
});
test('all simultaneously true exclusion operands are retained',()=>{
 const f=fixture();Object.assign(f.evidence.interpretation.request,{task:{intent:'save_note'},quantity:'duration',projection:{quantity:'body_mass',unit:'kg',order:'scope'}});
 const {logs}=capture(()=>logLabsEligibility(f.evidence,f.rows));
 assert.deepEqual(logs[0].rejectedBy,['selection.request.task.present','selection.request.projection.present','selection.request.quantity.unsupported']);
});
test('certified authority and model dispatch are separately observable',()=>{
 const f=fixture();f.evidence.interpretation.request.projection={quantity:'body_mass',unit:'kg',order:'scope'};
 const {logs}=capture(()=>logPublicationDispatch(f.evidence,f.rows,'model','normal'));
 const log=logs[0],o=log.obligations[0];assert.equal(log.sentToModelGeneration,true);
 assert.equal(log.labsClaimsTaskSatisfied,null);assert.equal(o.selectionComponentCertified,true);
 assert.deepEqual(o.certificateAuthorizedSourceIds,['care:event-a']);
 assert.deepEqual(o.availableProfileSourceIds,['profile:pet-a:weight']);
 assert.equal(o.semanticRequirement.kind,'selected_records');assert.doesNotMatch(JSON.stringify(log),/PRIVATE_/);
});
test('review can report approved profile substitution without altering its decision',()=>{
 const f=fixture(),obligations=[{index:0,text:'PRIVATE_QUESTION'}];
 const sources=f.evidence.represented,completion=[{index:0,status:'answered',sourceIds:['profile:pet-a:weight'],sentenceIndexes:[0]}];
 const before=JSON.stringify({f,completion});
 const {logs}=capture(()=>{logReviewAuthority(f.evidence,obligations,sources);
  logReviewAuthority(f.evidence,obligations,sources,completion,true,true);});
 assert.equal(logs[0].phase,'review_input');assert.deepEqual(logs[0].obligations[0].suppliedSourceIds,['care:event-a','profile:pet-a:weight']);
 assert.equal(logs[1].publicationAccepted,true);
 assert.deepEqual(logs[1].obligations[0].acceptedSources,[{sourceId:'profile:pet-a:weight',kind:'profile',certificateAuthorized:false}]);
 assert.equal(JSON.stringify({f,completion}),before);assert.doesNotMatch(JSON.stringify(logs),/PRIVATE_|30\.31|30\.4/);
});
test('blocked certificates never appear as authorized review support',()=>{
 const f=fixture();f.evidence.history.ticketCoverage.effectiveStream[0].lineageClosed=false;
 const {logs}=capture(()=>logReviewAuthority(f.evidence,[{index:0,text:'PRIVATE'}],f.evidence.represented,
  [{index:0,status:'answered',sourceIds:['care:event-a'],sentenceIndexes:[0]}],true,true));
 assert.equal(logs[0].obligations[0].acceptedSources[0].certificateAuthorized,false);
 assert.equal(logs[0].obligations[0].selectionComponentCertified,false);
});
test('logging failures cannot change eligible rendering or rejected dispatch',()=>{
 const f=fixture(),original=console.info;
 console.info=(label)=>{if(label==='[Ask publication authority]')throw Error('logging unavailable');};
 try{assert.ok(buildLabsList(f.evidence,f.rows));
  f.evidence.interpretation.request.quantity='duration';assert.equal(buildLabsList(f.evidence,f.rows),null);
 }finally{console.info=original;}
});
