import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

const names=['Aster','Bramble','Cedar','Dune','Echo'];
const ids=names.map(n=>n.toLowerCase());
function evidence(question, dates, values, terms=[]){
  const petNames=Object.fromEntries(ids.map((id,i)=>[id,names[i]]));
  const e={version:'ask-evidence.v1',timeZone:'UTC',
    scope:{authorizedPetIds:[...ids],requestedTopic:'history',requestText:question,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',readOnlyRecall:true,status:'resolved',resolutionSubject:'pets'},
    sources:ids.map(id=>({petId:id,source:'care_entries',status:'loaded',loadedIds:[],loadedCount:0,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}})),
    completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],represented:[],representation:'complete',verifiedFacts:[],petNames,
    interpretation:{operation:'comparison',readOnly:true,petIds:[...ids],readPetIds:true,conversationOnly:false,request:{version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],quantity:null,evidenceBasis:'saved_history',outputFormat:'prose',premiseQuotes:[],excludedPetNames:[],projection:null,evidenceNeeds:terms.length?[{id:'need:0',quote:question,sourceTurnId:null,terms,order:'context'}]:[],scope:'account',operation:'comparison',selection:'comparison',frame:null}},
    history:{plan:{from:null,to:null,terms:[],interpretation:'period'},candidateIds:[],queryCount:0,retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete',continuation:[],reasons:[],consistency:'read_committed_no_snapshot',perPet:[],provenance:[],claimSources:[],excludedIds:[],needs:[],targets:[],endpointPairs:[],requiredSourceIds:[]}};
  ids.forEach((id,i)=>dates.forEach((date,j)=>{
    const raw=values?.[j]?.[i]; const text=typeof raw==='string' ? raw : raw ? `${names[i]} weighed ${raw} kg.` : raw===0 ? '' : String(raw||'');
    const sourceId=`care:${id}:${date}`; if(!text)return;
    e.represented.push({sourceId,petId:id,sourceType:'care_update',field:'value',start:0,end:text.length,text,occurredAt:date+'T12:00:00Z'});
    const s=e.sources.find(x=>x.petId===id); s.loadedIds.push(sourceId); s.loadedCount++;
  }));
  return e;
}
test('exact-date cohort threshold returns selected pets without partial fallback',()=>{
  const q='Which pets weighed more than 10 kg on September 15, 2026?';
  const e=evidence(q,['2026-09-15'],[[30.31,4.71,14.51,6.61,7.01]]);
  const p=deterministicReadProjection(e); assert.ok(p); assert.match(p.sentences[0].text,/Aster and Cedar/); assert.doesNotMatch(p.sentences[0].text,/Partial answer/i);
});

test('two-date cohort directional comparison returns every matching pet',()=>{
  const q='Which pets lost weight from August 15, 2026 to September 15, 2026?';
  const e=evidence(q,['2026-08-15','2026-09-15'],[[30.43,4.88,14.66,6.77,7.17],[30.31,4.71,14.51,6.61,7.01]]);
  const p=deterministicReadProjection(e); assert.ok(p);
  for(const name of names) assert.match(p.sentences[0].text,new RegExp(name));
  assert.match(p.sentences[0].text,/lost weight/);
});

test('exact-date cohort ranking returns highest and lowest deterministically',()=>{
  const q='On September 15, 2026, which pet had the highest recorded weight and which had the lowest?';
  const e=evidence(q,['2026-09-15'],[[30.31,4.71,14.51,6.61,7.01]]);
  const p=deterministicReadProjection(e); assert.ok(p);
  assert.match(p.sentences[0].text,/Aster.*highest.*30\.31 kg/i);
  assert.match(p.sentences[0].text,/Bramble.*lowest.*4\.71 kg/i);
});

test('unique cohort lexical source identifies the pet and preserves resolution text',()=>{
  const q='Which pet had soft stool after a new treat, and did it resolve?';
  const vals=[['','','','','Echo weighed 6.90 kg. One episode of soft stool was recorded after a new treat; it resolved by the next day and the new treat was not repeated.']];
  const e=evidence(q,['2026-02-15'],vals,['soft stool','new treat']);
  const p=deterministicReadProjection(e); assert.ok(p);
  assert.match(p.sentences[0].text,/^Echo:/); assert.match(p.sentences[0].text,/resolved by the next day/i);
});

test('exact-day which-pets care detail does not degrade to partial when every pet matches',()=>{
  const q='Which pets had stable appetite recorded at the January 15, 2026 wellness visit?';
  const weights=[30.05,4.82,14.44,6.67,7.06];
  const rows=names.map((name,i)=>name+' weighed '+weights[i]+' kg at the annual wellness visit. Routine exam notes recorded stable appetite, normal activity for age, and no new ongoing concern.');
  const e=evidence(q,['2026-01-15'],[rows],['stable appetite']);
  const p=deterministicReadProjection(e); assert.ok(p);
  for(const name of names) assert.match(p.sentences[0].text,new RegExp(name));
});

test('identical exact-day cohort note body is summarized deterministically',()=>{
  const q='What did the June 15, 2026 nutrition reviews say about diet, appetite, and digestion?';
  const body='Monthly nutrition review: the usual measured diet was continued, appetite was normal, and no persistent digestive change was reported.';
  const weights=[30.26,4.80,14.54,6.68,7.08];
  const rows=names.map((name,i)=>name+' weighed '+weights[i]+' kg. '+body);
  const e=evidence(q,['2026-06-15'],[rows]);
  const p=deterministicReadProjection(e);
  assert.ok(p); assert.equal(p.sentences[0].text,body);
});
