import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Offline fixture contract only. These rows describe the unchanged SQL seed
// bindings; they do not claim native mint execution or database authorization.
export function replacementFixturePairs(fixture){
 const pairs=[];
 const add=(name,action,group,source)=>pairs.push({name,action,ownerId:group.owner,subject:group.subject,reference:group.reference,source,
  sourceRow:{id:source.id,user_id:group.owner,role:'user',request_id:source.requestId},
  assistantRow:{user_id:group.owner,role:'furvise',request_id:source.requestId}});
 fixture.actions.forEach((action,i)=>add(i===fixture.actions.length-1?'legacy':`ordinary-${i+1}`,action,fixture,fixture.source));
 fixture.foreign.actions.forEach((action,i)=>add(`foreign-${i+1}`,action,fixture.foreign,fixture.foreign.source));
 add('latest',fixture.latest.action,fixture,fixture.source);
 fixture.unicode.forEach((item,i)=>{if(item.expected)add(`unicode-${i+1}`,item.action,fixture,item.source);});
 return pairs;
}
export function assertReplacementFixturePair(pair){
 const {action,source,sourceRow,assistantRow,ownerId,subject,reference}=pair;
 assert.equal(typeof source.requestId,'string','serialized source requestId is required');
 assert.match(source.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'UUID request identity');
 assert.equal(action.id.split(':')[0],source.requestId,'exact action prefix matches serialized request');
 assert.ok(action.id.startsWith(source.requestId+':'),'request delimiter');
 assert.equal(sourceRow.request_id,source.requestId,'source SQL seed request');
 assert.equal(assistantRow.request_id,source.requestId,'assistant SQL seed request');
 assert.equal(sourceRow.id,source.id,'source SQL seed identity');
 assert.equal(action.sourceMessageId,source.id,'action source identity');
 assert.equal(action.replaceJob.sourceMessageId,source.id,'bound job source identity');
 assert.equal(sourceRow.role,'user','source row must be USER');
 assert.equal(sourceRow.user_id,ownerId,'source row owner');
 assert.equal(assistantRow.user_id,ownerId,'assistant row owner');
 assert.equal(reference.ownerId,ownerId,'production Binder reference owner');
 assert.equal(action.petId,subject.id,'action subject');
 assert.equal(action.replaceJob.petId,subject.id,'job subject');
 assert.equal(reference.petId,subject.id,'target reference subject');
 assert.equal(action.targetSourceId,'care:'+reference.recordId,'target record identity');
 assert.equal(source.text.slice(action.replaceJob.body.start,action.replaceJob.body.end),action.replaceJob.body.text,'exact UTF-16 source span');
 return {name:pair.name,actionId:action.id,sourceId:source.id,requestId:source.requestId,sourceRowRequestId:sourceRow.request_id,assistantRowRequestId:assistantRow.request_id,ownerId,petId:subject.id,referenceOwnerId:reference.ownerId,referencePetId:reference.petId,result:'PASS',nativeSqlExecuted:false};
}
export function preflightReplacementFixture(fixture){
 assert.equal(fixture.schema,'ReplaceSemanticsBinderFixtures.v2');
 const pairs=replacementFixturePairs(fixture);assert.equal(pairs.length,10,'all positive fixtures present');
 const negative=fixture.unicode.filter(x=>!x.expected);assert.equal(negative.length,1);assert.equal(negative[0].body.length,1001);assert.equal(negative[0].utf16Length,1001);assert.equal(negative[0].action,undefined,'rejected 1001-unit body has no prepared action');
 return{schema:'ReplacementFixturePairPreflight.v1',pairs:pairs.map(assertReplacementFixturePair),positiveCount:pairs.length,utf16NegativeRetained:true,nativeSql:'UNEXECUTED',scope:'Actual Binder fixture output checked against serialized owner/source/request/pet SQL seed identities; no native mint, service-role ACL or RLS execution'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const fixture=JSON.parse(readFileSync(process.argv[2],'utf8'));const result=preflightReplacementFixture(fixture);
 if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(result,null,2),{flag:'wx',encoding:'utf8'});
 console.log(JSON.stringify(result));
}
