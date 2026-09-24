import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAskRequest } from '../app/lib/intelligence/ask-request-contract.ts';
import { assertStoredPublicationUnavailable } from './helpers/unsupported-stored-publication.mjs';

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

test('legacy saved-note metadata cannot select timestamps or infer field changes',async()=>{
  const message="Don't save anything. Nobody died in this message. For Aster, Bramble, Cedar, and Dune, list the last care-history receipt only. Include future-dated saves. Say if food, weight, or alive status changed in that receipt.";
  const sources=ids.map((id,i)=>{ const text=i===0?'Aster skipped breakfast but ate dinner fine. A bit slower on the evening walk. Save that for today.':`${names[i]} weighed ${[30.31,4.71,14.51,6.61][i]} kg. Monthly care check recorded stable appetite, usual routine, and no new ongoing concern.`; return {sourceId:'care:'+id,petId:id,sourceType:'care_update',field:'value',start:0,end:text.length,text,occurredAt:i===0?null:'2026-09-15T12:00:00Z',recordedAt:i===0?'2026-09-18T19:14:00Z':'2026-09-16T12:00:00Z'}; });
  const evidence={version:'ask-evidence.v1',timeZone:'UTC',scope:{authorizedPetIds:ids,requestedTopic:'history',requestText:message,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'ordinary',readOnlyRecall:true,status:'resolved',resolutionSubject:'pets'},
    sources:ids.map(id=>({petId:id,source:'care_entries',status:'loaded',loadedIds:['care:'+id],loadedCount:1,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}})),
    completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],represented:sources,representation:'complete',verifiedFacts:[],petNames:Object.fromEntries(ids.map((id,i)=>[id,names[i]]),
    ),interpretation:{operation:'recall',readOnly:true,petIds:ids,readPetIds:true,conversationOnly:false,selection:'latest',request:{version:'ask-request.v2',mode:'read',question:message,requirements:[],referenceTurnIds:[],quantity:null,evidenceBasis:'saved_history',outputFormat:'bullets',premiseQuotes:[],excludedPetNames:[],projection:null,evidenceNeeds:[],scope:'named',operation:'recall',selection:'latest',frame:null}},
    history:{plan:{from:null,to:null,terms:[],interpretation:'broad_comparison'},candidateIds:sources.map(s=>s.sourceId),queryCount:4,retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete',continuation:[],reasons:[],consistency:'read_committed_no_snapshot',perPet:ids.map(id=>({petId:id,rows:1,pages:1,exhausted:true,status:'complete'})),provenance:[],claimSources:[],excludedIds:[],chronology:ids.map(id=>({petId:id,boundaryIds:['care:'+id],blocked:false})),requiredSourceIds:sources.map(s=>s.sourceId),needs:[],targets:[],endpointPairs:[]}};
  await assertStoredPublicationUnavailable(evidence);
});

test('self-contained multi-pet history read drops stale save-turn references',()=>{
  const echo={id:'echo',user_id:'owner',name:'Echo'};
  const all=[...pets,echo];
  const message="Using only care-history receipts, ignore the profile card. For Aster, Bramble, Cedar, and Dune, not Echo, take each pet's earliest weight and latest weight by event date, not by when the row was saved. If two receipts share the same event date, use the later saved-at. Then give the kg change per pet, which gained the most and which lost the most. Do not save anything.";
  const p=proposal(message);
  Object.assign(p,{mode:'read',scope:'named',petNames:names,evidenceBasis:'saved_history',operation:'comparison',selection:'comparison',quantity:'measurement',temporalScope:'historical',excludedPetNames:['Echo'],referenceTurnIds:['old-save'],terms:[],from:null,to:null});
  const r=validateAskRequest(p,{owner:{userId:'owner'},eligiblePets:all,pet:pets[0],currentMessage:message,conversationTurns:[{id:'old-save',role:'user',text:'Aster ate normally. Save that for today.',createdAt:'2026-09-18T20:00:00Z'}]});
  assert.deepEqual(new Set(r.petIds),new Set(ids));
  assert.equal(r.selection,'comparison');
  assert.deepEqual(r.request.referenceTurnIds,[]);
  assert.equal(r.request.evidenceBasis,'saved_history');
});
