import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

const names=['Aster','Bramble','Cedar','Dune'];
const ids=names.map(x=>x.toLowerCase());
const pets=ids.map((id,i)=>({id,user_id:'owner',name:names[i]}));

function proposal(message){
  return {version:'ask-request.v2',task:null,temporalScope:null,mutationIntent:null,recordSelection:null,profileFields:[],projection:null,
    mode:'clarify',question:message,requirements:[],evidenceNeeds:[],outputFormat:null,evidenceBasis:null,premiseQuotes:[],excludedPetNames:[],
    referenceTurnIds:[],scope:'selected',petNames:[],operation:'clarify',selection:'summary',quantity:null,topic:'history',terms:['death','food'],
    from:null,to:null,episodeTopic:null,ordinal:null,frame:null};
}
test('latest saved care prompt is forced to read-only saved-history latest scope',()=>{
  const message="Don't save anything. Nobody died in this message. For Aster, Bramble, Cedar, and Dune, list the last care-history receipt only. Include future-dated saves.";
  const r=validateAskRequest(proposal(message),{owner:{userId:'owner'},eligiblePets:pets,pet:pets[0],currentMessage:message,conversationTurns:[]});
  assert.equal(r.request.mode,'read');
  assert.equal(r.request.evidenceBasis,'saved_history');
  assert.equal(r.selection,'latest');
  assert.equal(r.readOnly,true);
  assert.deepEqual(new Set(r.petIds),new Set(ids));
  assert.deepEqual(r.history?.terms,[]);
});

test('latest saved care projection uses save timestamp and does not invent field changes',()=>{
  const message="Don't save anything. Nobody died in this message. For Aster, Bramble, Cedar, and Dune, list the last care-history receipt only. Include future-dated saves. Say if food, weight, or alive status changed in that receipt.";
  const sources=ids.map((id,i)=>{ const text=i===0?'Aster skipped breakfast but ate dinner fine. A bit slower on the evening walk. Save that for today.':`${names[i]} weighed ${[30.31,4.71,14.51,6.61][i]} kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.`; return {sourceId:'care:'+id,petId:id,sourceType:'care_update',field:'value',start:0,end:text.length,text,occurredAt:i===0?null:'2026-09-15T12:00:00Z',recordedAt:i===0?'2026-09-18T19:14:00Z':'2026-09-16T12:00:00Z'}; });
  const evidence={version:'ask-evidence.v1',timeZone:'UTC',scope:{authorizedPetIds:ids,requestedTopic:'history',requestText:message,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'ordinary',readOnlyRecall:true,status:'resolved',resolutionSubject:'pets'},
    sources:ids.map(id=>({petId:id,source:'care_entries',status:'loaded',loadedIds:['care:'+id],loadedCount:1,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}})),
    completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],represented:sources,representation:'complete',verifiedFacts:[],petNames:Object.fromEntries(ids.map((id,i)=>[id,names[i]]),
    ),interpretation:{operation:'recall',readOnly:true,petIds:ids,readPetIds:true,conversationOnly:false,selection:'latest',request:{version:'ask-request.v2',mode:'read',question:message,requirements:[],referenceTurnIds:[],quantity:null,evidenceBasis:'saved_history',outputFormat:'bullets',premiseQuotes:[],excludedPetNames:[],projection:null,evidenceNeeds:[],scope:'named',operation:'recall',selection:'latest',frame:null}},
    history:{plan:{from:null,to:null,terms:[],interpretation:'broad_comparison'},candidateIds:sources.map(s=>s.sourceId),queryCount:4,retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete',continuation:[],reasons:[],consistency:'read_committed_no_snapshot',perPet:ids.map(id=>({petId:id,rows:1,pages:1,exhausted:true,status:'complete'})),provenance:[],claimSources:[],excludedIds:[],chronology:ids.map(id=>({petId:id,boundaryIds:['care:'+id],blocked:false})),requiredSourceIds:sources.map(s=>s.sourceId),needs:[],targets:[],endpointPairs:[]}};
  const p=deterministicReadProjection(evidence); assert.ok(p);
  const text=p.sentences.map(x=>x.text).join('\n');
  assert.match(text,/Aster: no weight in this entry\. No entry date is recorded\. Saved Sep 18, 2026 at 7:14 PM\. Aster skipped breakfast but ate dinner fine\. A bit slower on the evening walk\./);
  assert.match(text,/Bramble, Cedar, and Dune have entries dated Sep 15, 2026\. They were saved Sep 16, 2026 at 12:00 PM\./);
  assert.match(text,/None of these latest entries shows a food or life-status change\./);
  assert.match(text,/The weights shown come from the saved entries/);
  assert.doesNotMatch(text,/—|2026-09-16T12:00:00Z|Save that for today|Weight in this receipt|Food change in this receipt|Alive-status change in this receipt|profile defaults|Entry dated date not recorded/);
  assert.equal((text.match(/Monthly care check recorded stable appetite, usual routine, and no new ongoing concern\./g)||[]).length,1);
});
