// Existing accepted Binder output is input; fresh post-deletion authority uses distinct live source IDs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {validateReplaceJob,readBoundReplaceJob} from '../../app/lib/furvise-brain/replace-job.ts';
import {bindRemovePlan,readBoundRemoveJob} from '../../app/lib/furvise-brain/remove-job.ts';
import {prepareBoundReplaceAction,prepareBoundRemoveAction,prepareBoundLifecycleAction} from '../../app/lib/application-actions/planner.ts';
const f=JSON.parse(readFileSync(process.argv[2],'utf8'));
const source={...f.source,id:'89300000-0000-4000-8000-000000000304',requestId:'89300000-0000-4000-8000-000000000309'};
const job=validateReplaceJob({operation:'replace',target:{kind:'exact_record',ref:f.reference.ref},petName:f.subject.name,instructionQuote:source.text,bodyQuote:'Coat looked clean.',constraints:[],semantics:{classification:'observation',target:null}},source,f.subject,{ownerId:f.owner,references:[f.reference]});
assert.deepEqual(readBoundReplaceJob(job),job);
const replace=prepareBoundReplaceAction(job,{id:'care:'+f.reference.recordId,petId:f.subject.id,sourceType:'care_update'},f.subject.name,source.requestId);
const removeSource={...source,id:'89300000-0000-4000-8000-000000000314',requestId:'89300000-0000-4000-8000-000000000319',role:'user',text:'Remove the selected saved care record.'};
const plan=bindRemovePlan({operation:'remove',domain:'care_history',target:{kind:'exact_record',ref:f.reference.ref},petName:f.subject.name,instructionQuote:removeSource.text},removeSource,f.subject,{ownerId:f.owner,references:[f.reference]});
// Fixture target lookup supplies the exact independently seeded version; SQL must recheck it at mint/confirm.
const removeJob={...plan,resolvedTarget:{recordId:f.reference.recordId,updatedAt:f.reference.updatedAt}};
assert.deepEqual(readBoundRemoveJob(removeJob),removeJob);
const remove=prepareBoundRemoveAction(removeJob,removeSource.requestId);
const lifecycleSource={...source,id:'89300000-0000-4000-8000-000000000324',requestId:'89300000-0000-4000-8000-000000000329',text:`${f.subject.name} has died.`};
// Typed transition is a declared fixture semantic decision; actual action preparation and SQL enforcement remain real.
const lifecycle=prepareBoundLifecycleAction({authorization:{sourceMessageId:lifecycleSource.id,start:0,end:lifecycleSource.text.length,text:lifecycleSource.text},pendingDisposition:'keep',cancellation:null,pendingAction:null,pendingSubjectIds:null,transition:{petId:f.subject.id,petName:f.subject.name,fromState:'active',toState:'deceased'},requiredSubjectState:null,subjects:[{petId:f.subject.id,petName:f.subject.name,state:'active'}]},lifecycleSource.requestId);
const result={...f,deletion:{source,replace,removeSource,remove,lifecycleSource,lifecycle}};
for(const [action,src]of [[replace,source],[remove,removeSource],[lifecycle,lifecycleSource]]){assert.equal(action.sourceMessageId,src.id);assert.ok(action.id.startsWith(src.requestId+':'));assert.equal(action.petId,f.subject.id);}
writeFileSync(process.argv[3],JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify({result:'PASS',actualBinderReplace:1,actualRemoveBindingAndPreparation:1,lifecyclePreparation:1,scope:'offline fixture authority; no DB or provider'}));
