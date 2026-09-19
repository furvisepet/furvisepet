import assert from 'node:assert/strict';
import test from 'node:test';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { recoverGroundedCohortNeeds } from '../app/lib/intelligence/evidence-needs.ts';
import { buildHistoryObligations } from '../app/lib/intelligence/history-obligations.ts';
import { canonicalReadPresentation, readPublicationFailure } from '../app/lib/ask-publication.ts';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

const petNames=['Aster','Bramble','Cedar','Dune','Echo'];
const petIds=petNames.map(n=>n.toLowerCase());
const ymd=(y,m,d=15)=>String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
const monthName=['','January','February','March','April','May','June','July','August','September','October','November','December'];
const summary={total:0,passed:0,failed:0,families:{},failures:[]};
const record=(family,question,fn)=>{
  test(question,()=>{summary.total++; try{fn(); summary.passed++; summary.families[family]=(summary.families[family]||0)+1;}
  catch(error){summary.failed++; summary.failures.push({family,question,error:String(error?.message||error)}); throw error;}});
};
function baseEvidence(question,ids=petIds){
  const pets=Object.fromEntries(ids.map((id,i)=>[id,petNames[petIds.indexOf(id)]||('Pet'+i)]));
  return {
    version:'ask-evidence.v1',timeZone:'UTC',
    scope:{authorizedPetIds:[...ids],requestedTopic:'history',requestText:question,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'ordinary',readOnlyRecall:true,status:'resolved',resolutionSubject:pets[ids[0]]||'Pet'},
    sources:ids.map(id=>({petId:id,source:'care_entries',status:'loaded',loadedIds:[],loadedCount:0,cap:null,reasons:[],completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'}})),
    completeness:{retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown'},losses:[],represented:[],representation:'complete',verifiedFacts:[],petNames:pets,
    interpretation:{operation:'recall',readOnly:true,petIds:[...ids],readPetIds:true,conversationOnly:false,request:{version:'ask-request.v2',mode:'read',question,requirements:[],referenceTurnIds:[],quantity:null,evidenceBasis:'saved_history',outputFormat:'prose',premiseQuotes:[],excludedPetNames:[],projection:null,evidenceNeeds:[],scope:ids.length>1?'named':'selected',operation:'recall',selection:'summary',frame:null}},
    history:{plan:{from:null,to:null,terms:[],interpretation:'broad_comparison'},candidateIds:[],queryCount:0,retrieval:'unknown',corrections:'unknown',extraction:'unknown',grouping:'unknown',continuation:[],reasons:[],consistency:'read_committed_no_snapshot',perPet:ids.map(id=>({petId:id,rows:0,pages:0,exhausted:true,status:'unknown'})),provenance:[],claimSources:ids.map(id=>({petId:id,sourceIds:[]})),excludedIds:[],needs:[],targets:[],endpointPairs:[],requiredSourceIds:[]}
  };
}

// 1) 100 explicit two-month comparisons: both anchors must consume a 2-query budget.
for(let i=0;i<100;i++){
  const a=1+(i%10), b=1+((i*3+4)%12), y1=2012+(i%7), y2=2020+(i%6);
  const q=`Compare ${monthName[a]} ${y1} with ${monthName[b]} ${y2} for Aster.`;
  record('explicit_two_month_budget',q,()=>{
    const r=compileHistoryReadStrategies(q,2026,{from:'2010-01-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'},[],2,[],'UTC',false);
    const targets=r.strategies.map(s=>s.target).filter(Boolean);
    assert.equal(targets.length,2); assert.deepEqual(new Set(targets),new Set([`${y1}-${String(a).padStart(2,'0')}`,`${y2}-${String(b).padStart(2,'0')}`]));
  });
}

// 2) 100 broad overflow reads: extra dates must be disclosed, not silently treated complete.
for(let i=0;i<100;i++){
  const dates=Array.from({length:5},(_,j)=>ymd(2018+j,(j+i)%12+1,1));
  const q='Review '+dates.join(', ')+' for Aster.';
  record('explicit_target_overflow',q,()=>{
    const r=compileHistoryReadStrategies(q,2026,{from:'2010-01-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'},[],4,[],'UTC',false);
    assert.ok(r.omittedTargets.length>=1);
    const requested=new Set(dates);
    const accounted=new Set([...r.strategies.map(s=>s.target).filter(Boolean),...r.omittedTargets]);
    assert.deepEqual(accounted,requested);
    assert.ok(r.strategies.length<=4);
  });
}

// 3) 100 cohort-need recovery variants: the fifth named pet cannot disappear because provider maxItems=4.
for(let i=0;i<100;i++){
  const q=`Across Aster, Bramble, Cedar, Dune, and Echo, which pets had a noteworthy event in ${2010+i%16}?`;
  const quote='which pets had a noteworthy event';
  const needs=petIds.slice(0,4).map((id,j)=>({id:'need:'+j,quote,sourceTurnId:null,terms:['noteworthy','event'],order:'context',petIds:[id],window:{from:`${2010+i%16}-01-01T00:00:00.000Z`,to:`${2011+i%16}-01-01T00:00:00.000Z`}}));
  record('five_pet_need_recovery',q,()=>{
    const out=recoverGroundedCohortNeeds(q,needs,petIds.map((id,j)=>({id,name:petNames[j]})));
    assert.equal(new Set(out.flatMap(n=>n.petIds||[])).size,5); assert.equal(out.length,5);
  });
}

// 4) 100 subset-selection obligation checks: "which pets" must not fabricate one answer obligation per pet.
for(let i=0;i<100;i++){
  const q=`Which pets had a non-routine event in ${2015+i%10}?`;
  record('subset_selection_obligations',q,()=>{
    const e=baseEvidence(q); e.scope.requestKind='overview';
    e.interpretation.request.evidenceNeeds=petIds.map((id,j)=>({id:'need:'+j,quote:q,sourceTurnId:null,terms:['event'],order:'context',petIds:[id]}));
    const obligations=buildHistoryObligations(e);
    assert.equal(obligations.length,1); assert.equal(obligations[0].text,q);
  });
}

// 5) 100 publication wording cases: clinical "change recorded" survives while app receipt wording is still removed.
for(let i=0;i<100;i++){
  const pet=petNames[i%5];
  const q=`${pet}: no ongoing urinary change recorded afterward.`;
  record('clinical_recorded_publication',q,()=>{
    assert.equal(readPublicationFailure(q),null); assert.equal(canonicalReadPresentation(q),q);
    assert.equal(readPublicationFailure('The change was recorded in the profile.'),'publication_changed_text');
  });
}

// 6) 100 endpoint-gap arithmetic projections, two-pet second-order difference.
for(let i=0;i<100;i++){
  const [p1,p2]=[petIds[i%5],petIds[(i+1)%5]], names=[petNames[i%5],petNames[(i+1)%5]];
  const q=`Compare ${names[0]}'s and ${names[1]}'s body-weight change from earliest to latest; how much larger was one change?`;
  record('second_order_endpoint_arithmetic',q,()=>{
    const e=baseEvidence(q,[p1,p2]); e.scope.requestKind='comparison'; e.interpretation.operation='comparison'; e.interpretation.request.operation='comparison'; e.interpretation.request.selection='comparison';
    const vals=[[20+i/100,26+i/100],[10+i/200,13+i/200]];
    const dates=['2016-01-15T12:00:00Z','2026-01-15T12:00:00Z'];
    const spans=[];
    e.history.endpointPairs=[];
    const ids=[p1,p2];
    ids.forEach((pid,k)=>{
      const old='care:'+pid+'-old', neu='care:'+pid+'-new';
      const a=vals[k][0], b=vals[k][1];
      spans.push({sourceId:old,petId:pid,sourceType:'care_update',field:'value',start:0,end:(names[k]+' weighed '+a.toFixed(2)+' kg.').length,text:names[k]+' weighed '+a.toFixed(2)+' kg.',occurredAt:dates[0]});
      spans.push({sourceId:neu,petId:pid,sourceType:'care_update',field:'value',start:0,end:(names[k]+' weighed '+b.toFixed(2)+' kg.').length,text:names[k]+' weighed '+b.toFixed(2)+' kg.',occurredAt:dates[1]});
      e.history.endpointPairs.push({petId:pid,earliestIds:[old],latestIds:[neu],blocked:false});
      e.sources.find(s=>s.petId===pid).loadedIds.push(old,neu); e.sources.find(s=>s.petId===pid).loadedCount=2;
    });
    e.represented=spans; e.history.requiredSourceIds=spans.map(s=>s.sourceId);
    const p=deterministicReadProjection(e);
    assert.ok(p); const text=p.sentences.map(s=>s.text).join('\n'); assert.match(text,/larger|difference/i);
    assert.ok(p.sentences.some(s=>s.calculations?.length));
  });
}

// 7) 100 app-receipt safety cases: terminal mutation claims must still be rejected.
for(let i=0;i<100;i++){
  const nouns=['profile','history','record','entry','preference'];
  const verbs=['saved','deleted','updated','recorded'];
  const text=`The ${nouns[i%nouns.length]} was ${verbs[i%verbs.length]} successfully.`;
  record('terminal_mutation_safety',text,()=>assert.equal(readPublicationFailure(text),'publication_changed_text'));
}

// 8) 100 per-pet obligation checks for actual "each pet" requests: every pet still needs its own completion row.
for(let i=0;i<100;i++){
  const q=`Give each pet's latest weight for Aster, Bramble, Cedar, Dune, and Echo.`;
  record('all_pet_obligations',q,()=>{
    const e=baseEvidence(q); e.scope.requestKind='comparison';
    const obligations=buildHistoryObligations(e);
    assert.equal(obligations.length,6);
    assert.deepEqual(new Set(obligations.slice(1).map(o=>o.petId)),new Set(petIds));
  });
}

// 9) 100 date-window clipping checks: requested dates never escape authorized lifetime window.
for(let i=0;i<100;i++){
  const year=1900+(i%127), month=1+(i%12);
  const q=`What happened on ${ymd(year,month,1)} for Aster?`;
  record('date_window_authority',q,()=>{
    const r=compileHistoryReadStrategies(q,2026,{from:'2000-01-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'},[],2,[],'UTC',false);
    assert.ok(r.strategies.every(s=>!s.from||s.from>='2000-01-01T00:00:00.000Z'));
  });
}

// 10) 100 ordinary clinical-history phrases containing "recorded" must remain publishable.
for(let i=0;i<100;i++){
  const pet=petNames[i%5], signs=['stiffness','hairballs','soft stool','itching','appetite'];
  const text=`${pet}'s note says no ongoing ${signs[i%signs.length]} was recorded afterward.`;
  record('recorded_clinical_phrase_safety',text,()=>{
    assert.equal(readPublicationFailure(text),null); assert.equal(canonicalReadPresentation(text),text);
  });
}

process.on('exit',()=>{
  const out={...summary,passRate:summary.total?summary.passed/summary.total:0};
  console.log('READINESS_1000_SUMMARY '+JSON.stringify(out));
});
