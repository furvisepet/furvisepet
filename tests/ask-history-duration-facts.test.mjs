import test from 'node:test';
import assert from 'node:assert/strict';
import { historyNarrativeAnchorsSupported as supported } from '../app/lib/intelligence/history-narrative-facts.ts';
const sources=[
  {text:'Soft stools were reported.',occurredAt:'2026-04-03T12:00:00Z',petId:'pip'},
  {text:'Normal stools for three days.',occurredAt:'2026-04-09T12:00:00Z',petId:'pip'},
];
const question="How many days are there from Pip's April 3 stool note to April 9?";
test('a computed duration is supported by both cited dated endpoints',()=>{
  assert.equal(supported('There are six days between April 3 and April 9.',sources,question),true);
  assert.equal(supported('Six days.',sources,question),true);
});
test('wrong duration and unrelated medical quantities remain unsupported',()=>{
  for(const text of ['Five days.','Give six mg.','Six episodes.','Six weeks.'])
    assert.equal(supported(text,sources,question),false);
});
test('duration arithmetic cannot invent endpoints or symptom duration',()=>{
  assert.equal(supported('Six days.',sources.slice(0,1),question),false);
  assert.equal(supported('Six days.',sources,'How many days did Pip have soft stool between April 3 and April 9?'),false);
  assert.equal(supported('Six days.',sources),false);
});
test('ambiguous years and conflicting pet scopes cannot authorize duration',()=>{
  assert.equal(supported('Six days.',[...sources,{...sources[0],occurredAt:'2025-04-03T12:00:00Z'}],question),false);
  assert.equal(supported('Six days.',[sources[0],{...sources[1],petId:'fern'}],question),false);
});

const weights=[
 {text:'Pip weighed 12.4 kg today.',occurredAt:'2026-04-03T12:00:00Z',petId:'pip'},
 {text:'Pip weighs 11.8 kg.',occurredAt:'2026-08-09T12:00:00Z',petId:'pip'},
];
test('weight differences are derived within a pet and unit',()=>{
 const q='Compare the recorded weight change for Pip.';
 assert.equal(supported('Pip was 0.6 kg lower.',weights,q),true);
 assert.equal(supported('Pip was 0.7 kg lower.',weights,q),false);
 assert.equal(supported('Pip was 0.6 kg lower.',weights,'What medication dose was recorded?'),false);
 assert.equal(supported('Pip was 0.6 kg lower.',[weights[0],{...weights[1],petId:'fern'}],q),false);
});
test('uncertain or multiple measurements cannot establish a derived weight delta',()=>{
 const q='Compare the recorded weight change for Pip.';
 for(const text of ['Pip may weigh 11.8 kg.','Pip weighed 11.8 kg or 12 kg.','Pip did not weigh 11.8 kg.'])
   assert.equal(supported('Pip was 0.6 kg lower.',[weights[0],{...weights[1],text}],q),false);
});

test('explicit once yesterday and once today supports a within-note total, not episodes',()=>{
 const q="How many accidents does Fern's July 8 note describe, and on which days?";
 const source={text:'Fern urinated on the bath mat once yesterday and once today. I do not know the cause.',occurredAt:'2026-07-08T12:00:00Z',petId:'fern'};
 assert.equal(supported('Two accidents: one on July 7 and one on July 8.',[source],q),true);
 assert.equal(supported('Three accidents.',[source],q),false);
 assert.equal(supported('Two episodes.',[source],q),false);
 assert.equal(supported('Two accidents.',[{...source,text:'Fern may have urinated on the bath mat once yesterday and once today.'}],q),false);
 assert.equal(supported('Two accidents.',[source],'How many accidents has Fern ever had?'),false);
});
