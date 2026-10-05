import assert from 'node:assert/strict';
import {readFileSync,writeFileSync}from'node:fs';
import path from'node:path';import{pathToFileURL}from'node:url';
const root=process.env.FURVISE_TEST_ROOT||process.cwd();
const {validateReplaceJob,readBoundReplaceJob}=await import(pathToFileURL(path.join(root,'app/lib/furvise-brain/replace-job.ts')).href);
const {readWriteSourceSemantics}=await import(pathToFileURL(path.join(root,'app/lib/furvise-brain/source-semantics.ts')).href);
const owner='89300000-0000-4000-8000-000000000001',pet='89300000-0000-4000-8000-000000000002',record='89300000-0000-4000-8000-000000000003';
const source={requestId:'89300000-0000-4000-8000-000000000009',id:'89300000-0000-4000-8000-000000000004',text:'Replace the selected record with: Coat looked clean.',createdAt:'2026-01-12T12:00:00.000Z'};
const subject={id:pet,name:'Synthetic Subject'},reference={ref:'offline-target',recordId:record,ownerId:owner,petId:pet,updatedAt:'2026-01-10T09:00:00.000Z',createdAt:'2026-01-10T09:00:00.000Z',eventAt:'2025-12-05T09:00:00.000Z',body:'Previous observation.'};
const proposal={operation:'replace',target:{kind:'exact_record',ref:reference.ref},petName:subject.name,instructionQuote:source.text,bodyQuote:'Coat looked clean.',constraints:[]};
const meanings=[{classification:'observation',target:null},{classification:'unknown',target:null},{classification:'attributed_correction',target:{kind:'target_unknown'}},{classification:'attributed_correction',target:{kind:'scope',from:'2025-12-01T00:00:00Z',to:'2026-01-01T00:00:00Z',conceptKey:null}},{classification:'attributed_correction',target:{kind:'scope',from:null,to:null,conceptKey:null}}];
const jobs=meanings.map(semantics=>validateReplaceJob({...proposal,semantics},source,subject,{ownerId:owner,references:[reference]}));
const legacy=validateReplaceJob(proposal,source,subject,{ownerId:owner,references:[reference]});
for(const job of [...jobs,legacy])assert.deepEqual(readBoundReplaceJob(job),job);
const old=readFileSync(path.join(root,'supabase/migrations/20260923221741_generalize_canonical_replace_targets.sql'),'utf8');
const keys=old.match(/j-array\[([^\]]+)\]/)[1].match(/'[^']+'/g).map(x=>x.slice(1,-1));
const remaining=Object.keys(jobs[0]).filter(k=>!keys.includes(k));assert.deepEqual(remaining,['semantics']);
const bad=[null,{},[],{classification:'observation',target:{kind:'target_unknown'}},{classification:'unknown',target:null,extra:true},{classification:'invented',target:null},{classification:'attributed_correction',target:null},{classification:'attributed_correction',target:{kind:'source',id:record}},{classification:'attributed_correction',target:{kind:'claim',id:record}},{classification:'attributed_correction',target:{kind:'target_unknown',extra:true}},...[
 {from:42},{to:false},{conceptKey:'coat'},{from:'not-a-time'},{to:'2025-11-01T00:00:00Z'},{extra:true}
].map(x=>({classification:'attributed_correction',target:{kind:'scope',from:'2025-12-01T00:00:00Z',to:'2026-01-01T00:00:00Z',conceptKey:null,...x}}))];
for(const semantics of bad){assert.equal(readWriteSourceSemantics(semantics),null);assert.throws(()=>validateReplaceJob({...proposal,semantics},source,subject,{ownerId:owner,references:[reference]}));assert.equal(readBoundReplaceJob({...jobs[0],semantics}),null);}
assert.equal(readBoundReplaceJob({...jobs[0],extra:true}),null);
const {prepareBoundReplaceAction}=await import(pathToFileURL(path.join(root,'app/lib/application-actions/planner.ts')).href);
const actions=[...jobs,legacy].map(job=>prepareBoundReplaceAction(job,{id:'care:'+record,petId:pet,sourceType:'care_update'},subject.name,source.requestId));

// Each positive foreign/Unicode/latest action is bound by the production Binder.
function bindAlternate({ownerId,subject:sub,source:src,reference:ref,body,target={kind:'exact_record',ref:ref.ref}}){
 const job=validateReplaceJob({operation:'replace',target,petName:sub.name,instructionQuote:src.text,bodyQuote:body,constraints:[],semantics:{classification:'observation',target:null}},src,sub,{ownerId,references:[ref]});
 const action=prepareBoundReplaceAction(job,{id:'care:'+ref.recordId,petId:sub.id,sourceType:'care_update'},sub.name,src.requestId);
 return{job,action};
}
const foreignOwner='89300000-0000-4000-8000-000000000101';
const foreignSubject={id:'89300000-0000-4000-8000-000000000102',name:'Second Synthetic Subject'};
const foreignSource={...source,requestId:'89300000-0000-4000-8000-000000000109',id:'89300000-0000-4000-8000-000000000104'};
const foreignReference={...reference,recordId:'89300000-0000-4000-8000-000000000103',ownerId:foreignOwner,petId:foreignSubject.id};
const foreignBound=bindAlternate({ownerId:foreignOwner,subject:foreignSubject,source:foreignSource,reference:foreignReference,body:proposal.bodyQuote});
const foreign={owner:foreignOwner,subject:foreignSubject,source:foreignSource,reference:foreignReference,actions:[foreignBound.action],offset:100};
const latest=bindAlternate({ownerId:owner,subject,source,reference,body:proposal.bodyQuote,target:'last_event_for_subject'});
const unicodeBodies=['It’s steady – “café” 🐾.','🐾'.repeat(500),'a'.repeat(999)+'🐾'];
const unicode=unicodeBodies.map((body,index)=>{
 const src={...source,requestId:`89300000-0000-4000-8000-${String(401+index).padStart(12,'0')}`,id:`89300000-0000-4000-8000-${String(204+index).padStart(12,'0')}`,text:`Replace with: ${body}`};
 const args={ownerId:owner,subject,source:src,reference,body};
 if(body.length>1000){assert.throws(()=>bindAlternate(args));return{body,source:src,expected:false,utf16Length:body.length};}
 const bound=bindAlternate(args);assert.equal(bound.job.body.text,body);return{body,source:src,expected:true,utf16Length:body.length,...bound};
});
export const fixture={actions,schema:'ReplaceSemanticsBinderFixtures.v2',owner,subject,source,reference,jobs,legacy,bad,foreign,latest,unicode,offset:0,baseline:{remainingDisallowedKeys:remaining,nativeSqlExecuted:false}};
if(process.env.FURVISE_REPLACE_FIXTURE)writeFileSync(process.env.FURVISE_REPLACE_FIXTURE,JSON.stringify(fixture,null,2),{flag:'wx',encoding:'utf8'});
console.log(JSON.stringify({result:'PASS source-contract fixture construction only',boundTyped:jobs.length,legacy:1,negativeMeanings:bad.length,foreignBinder:1,latestBinder:1,unicode:unicode.length,remainingDisallowedKeys:remaining,nativeSqlExecuted:false}));
