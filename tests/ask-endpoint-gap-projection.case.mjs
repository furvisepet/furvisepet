import assert from 'node:assert/strict';
import test from 'node:test';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';
import { verifiedCalculationQuantities } from '../app/lib/intelligence/history-calculation.ts';

const pets=[
  ['a','Aster',23.71,30.31],
  ['c','Cedar',10.81,14.51],
];

function evidence(){
  const represented=[], sources=[], provenance=[], endpointPairs=[];
  for(const [id,name,first,last] of pets){
    const oldId='care:'+id+':old', newId='care:'+id+':new';
    const oldText=name+' weighed '+first+' kg.';
    const newText=name+' weighed '+last+' kg.';
    represented.push(
      {sourceId:oldId,petId:id,sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2016-10-15T12:00:00Z'},
      {sourceId:newId,petId:id,sourceType:'care_update',field:'value',start:0,end:newText.length,text:newText,occurredAt:'2026-09-15T12:00:00Z'},
    );
    sources.push({petId:id,source:'care_entries',status:'loaded',loadedIds:[oldId,newId],loadedCount:2,cap:null,reasons:[],completeness:{}});
    provenance.push({sourceId:oldId,status:'effective_linked'},{sourceId:newId,status:'effective_linked'});
    endpointPairs.push({petId:id,earliestIds:[oldId],latestIds:[newId],blocked:false});
  }
  return {
    version:'ask-evidence.v1',
    scope:{authorizedPetIds:pets.map(p=>p[0]),requestedTopic:'weight',
      requestText:"Compare Aster's and Cedar's body-weight change from their earliest saved record to their latest saved record. Give each change in kg and tell me how much larger one change was than the other.",
      requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
    sources,completeness:{},losses:[],representation:'complete',verifiedFacts:[],
    petNames:Object.fromEntries(pets.map(([id,name])=>[id,name])),
    interpretation:{selection:'comparison',request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',
      profileFields:[],temporalScope:'historical',outputFormat:'prose',referenceTurnIds:[]}},
    history:{corrections:'complete',endpointPairs,provenance},
    represented,
  };
}

test('two-pet lifetime endpoint projection computes the difference between changes from original operands',()=>{
  const e=evidence();
  const result=deterministicReadProjection(e);
  assert.ok(result);
  assert.equal(result.sentences.length,3);
  assert.match(result.sentences[0].text,/Aster.*\+6\.6 kg/i);
  assert.match(result.sentences[1].text,/Cedar.*\+3\.7 kg/i);
  assert.match(result.sentences[2].text,/Aster's change was 2\.9 kg larger than Cedar's/i);
  const calc=result.sentences[2].calculations[0];
  assert.equal(calc.operation,'expression');
  assert.deepEqual(calc.expression,[0,1,'subtract',2,3,'subtract','subtract']);
  assert.equal(calc.value,2.9);
  const sourceSpans=e.represented.map(s=>({sourceId:s.sourceId,text:s.text,occurredAt:s.occurredAt}));
  assert.ok(verifiedCalculationQuantities([calc],sourceSpans));
});

test('four-pet long endpoint request completes ranking future-date coverage and correction disclosures',()=>{
  const cohort=[
    ['a','Aster',23.71,30.31],
    ['b','Bramble',3.61,4.71],
    ['c','Cedar',10.81,14.51],
    ['d','Dune',4.81,6.61],
  ];
  const represented=[],sources=[],provenance=[],endpointPairs=[];
  for(const [id,name,first,last] of cohort){
    const oldId='care:'+id+':old',newId='care:'+id+':new';
    const oldText=name+' weighed '+first+' kg.',newText=name+' weighed '+last+' kg.';
    represented.push(
      {sourceId:oldId,petId:id,sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2016-10-15T12:00:00Z'},
      {sourceId:newId,petId:id,sourceType:'care_update',field:'value',start:0,end:newText.length,text:newText,occurredAt:'2026-09-15T12:00:00Z'},
    );
    sources.push({petId:id,source:'care_entries',status:'loaded',loadedIds:[oldId,newId],loadedCount:2,cap:null,reasons:[],completeness:{}});
    provenance.push({sourceId:oldId,status:'effective_linked'},{sourceId:newId,status:'effective_linked'});
    endpointPairs.push({petId:id,earliestIds:[oldId],latestIds:[newId],blocked:false});
  }
  const q="Using only care-history receipts, ignore the profile card. For Aster, Bramble, Cedar, and Dune, not Echo, take each pet's earliest weight and latest weight by event date, not by when the row was saved. If two receipts share the same event date, use the later saved-at. If a later receipt corrects or replaces an earlier weight, use the correction and say so. Then give the kg change per pet, which of those four gained the most and which lost the most, whether any endpoint receipt is dated after today, and if you did not actually search a pet's full timeline, name the window you used.";
  const evidence={
    version:'ask-evidence.v1',timeZone:'UTC',
    historyAccess:{months:null,from:'1900-01-01T00:00:00.000Z',to:'2026-09-20T00:00:00.000Z'},
    scope:{authorizedPetIds:cohort.map(x=>x[0]),requestedTopic:'weight',requestText:q,requestedPeriod:{kind:'lifetime',surface:'full timeline'},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
    sources,completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],representation:'complete',verifiedFacts:[],
    petNames:Object.fromEntries(cohort.map(([id,name])=>[id,name])),
    interpretation:{selection:'comparison',request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',profileFields:[],temporalScope:'historical',outputFormat:'prose',referenceTurnIds:[]}},
    history:{corrections:'complete',endpointPairs,provenance,perPet:cohort.map(([id])=>({petId:id,rows:2,pages:2,exhausted:false,status:'partial'})),plan:{from:null,to:null,terms:[],interpretation:'broad_comparison'}},
    represented,
  };
  const result=deterministicReadProjection(evidence);assert.ok(result);
  const text=result.sentences.map(s=>s.text).join('\n');
  for(const [,name] of cohort) assert.match(text,new RegExp(name+':'));
  assert.match(text,/Aster gained the most at \+6\.6 kg/);
  assert.match(text,/No pet lost weight/);
  assert.match(text,/None of these endpoint dates is after today/);
  assert.match(text,/endpoint searches across the accessible history window/i);
  assert.match(text,/No endpoint correction or replacement was needed/);
  assert.match(text,/Oct 15, 2016/);
  assert.match(text,/Sep 15, 2026/);
});

test('single-pet ten-years-ago comparison uses historical and latest endpoint pair',()=>{
  const q="How does that compare to hers from ten years ago?";
  const oldText='Dune weighed 4.81 kg.',newText='Dune weighed 6.61 kg.';
  const evidence={
    version:'ask-evidence.v1',timeZone:'UTC',
    scope:{authorizedPetIds:['dune'],requestedTopic:'weight',requestText:q,requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
    sources:[{petId:'dune',source:'care_entries',status:'loaded',loadedIds:['care:dune:old','care:dune:new'],loadedCount:2,cap:null,reasons:[],completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'}}],
    completeness:{retrieval:'complete',corrections:'complete',extraction:'complete',grouping:'complete'},losses:[],representation:'complete',verifiedFacts:[],petNames:{dune:'Dune'},
    interpretation:{selection:'comparison',request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',profileFields:[],temporalScope:'historical',outputFormat:'prose',referenceTurnIds:['prior']}},
    history:{corrections:'complete',endpointPairs:[{petId:'dune',earliestIds:['care:dune:old'],latestIds:['care:dune:new'],blocked:false}],provenance:[{sourceId:'care:dune:old',status:'effective_linked'},{sourceId:'care:dune:new',status:'effective_linked'}]},
    represented:[
      {sourceId:'care:dune:old',petId:'dune',sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2016-10-15T12:00:00Z'},
      {sourceId:'care:dune:new',petId:'dune',sourceType:'care_update',field:'value',start:0,end:newText.length,text:newText,occurredAt:'2026-09-15T12:00:00Z'},
    ],
  };
  const result=deterministicReadProjection(evidence);assert.ok(result);
  const text=result.sentences.map(s=>s.text).join('\n');
  assert.match(text,/Dune was 4\.81 kg on Oct 15, 2016/);
  assert.match(text,/6\.61 kg on Sep 15, 2026/);
  assert.match(text,/\+1\.8 kg/);
});
