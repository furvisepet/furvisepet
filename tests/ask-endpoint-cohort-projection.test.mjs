import assert from 'node:assert/strict';
import test from 'node:test';
import { deterministicReadProjection } from '../app/lib/intelligence/read-projection.ts';

const pets=[
  ['a','Aster',23.71,30.31,6.6],
  ['b','Bramble',3.61,4.71,1.1],
  ['c','Cedar',10.81,14.51,3.7],
  ['d','Dune',4.81,6.61,1.8],
  ['e','Echo',5.11,7.01,1.9],
];

function evidence(blockedPet=null) {
  const represented=[], sources=[], provenance=[], endpointPairs=[];
  for(const [id,name,first,last] of pets) {
    const oldId='care:'+id+':old', newId='care:'+id+':new';
    const oldText=name+' weighed '+first+' kg. Monthly care check.';
    const newText=name+' weighed '+last+' kg. Monthly care check.';
    represented.push(
      {sourceId:oldId,petId:id,sourceType:'care_update',field:'value',start:0,end:oldText.length,text:oldText,occurredAt:'2016-10-15T12:00:00Z'},
      {sourceId:newId,petId:id,sourceType:'care_update',field:'value',start:0,end:newText.length,text:newText,occurredAt:'2026-09-15T12:00:00Z'},
    );    sources.push({petId:id,source:'care_entries',status:'loaded',loadedIds:[oldId,newId],loadedCount:2,cap:null,reasons:[],completeness:{}});
    provenance.push({sourceId:oldId,status:'effective_linked'},{sourceId:newId,status:'effective_linked'});
    endpointPairs.push({petId:id,earliestIds:[oldId],latestIds:[newId],blocked:id===blockedPet});
  }
  return {
    version:'ask-evidence.v1',
    scope:{authorizedPetIds:pets.map(p=>p[0]),requestedTopic:'weight',
      requestText:"For Aster, Bramble, Cedar, Dune, and Echo, give each pet's earliest recorded body weight and latest recorded body weight across the saved 2016-2026 history. Keep all five pets separate, include both dates, and give the exact change in kg for each pet.",
      requestedPeriod:{kind:'unspecified',surface:null},requestKind:'comparison',status:'resolved',readOnlyRecall:true},
    sources,completeness:{},losses:[],representation:'complete',verifiedFacts:[],
    petNames:Object.fromEntries(pets.map(([id,name])=>[id,name])),
    interpretation:{selection:'comparison',request:{mode:'read',evidenceBasis:'saved_history',quantity:'measurement',
      profileFields:['weight'],temporalScope:'historical_and_current',outputFormat:null,referenceTurnIds:[]}},
    history:{corrections:'complete',endpointPairs,provenance},
    represented,
  };
}
test('multi-pet lifetime endpoint projection preserves both boundaries and exact changes',()=>{
  const result=deterministicReadProjection(evidence());
  assert.ok(result);
  assert.equal(result.sentences.length,5);
  for(let i=0;i<pets.length;i++) {
    const [,name,first,last,change]=pets[i], sentence=result.sentences[i];
    assert.match(sentence.text,new RegExp(name+'.*'+first+' kg.*2016-10-15.*'+last+' kg.*2026-09-15.*\\+'+change+' kg'));
    assert.equal(sentence.calculations.length,1);
    assert.equal(sentence.calculations[0].operation,'difference');
    assert.equal(sentence.calculations[0].value,change);
    assert.equal(sentence.calculations[0].unit,'kg');
  }
});

test('multi-pet lifetime endpoint projection fails closed when any pair is blocked',()=>{
  assert.equal(deterministicReadProjection(evidence('c')),null);
});
