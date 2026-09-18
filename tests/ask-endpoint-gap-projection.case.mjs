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
