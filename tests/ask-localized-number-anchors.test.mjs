import test from 'node:test';
import assert from 'node:assert/strict';
import {historyNarrativeAnchorsSupported as supported} from '../app/lib/intelligence/history-narrative-facts.ts';
const source=value=>[{text:`Recorded weight: ${value} kg.`,occurredAt:'2026-09-09T12:00:00Z'}];
test('decimal commas match complete numbers, never their fractional suffix',()=>{
 for(const [literal,value] of [['3,8',3.8],['3,93',3.93],['-0,13',-0.13],['3,8125',3.8125]]) {
  assert.equal(supported(`Poids: ${literal} kg.`,source(value),'',[],false),true,literal);
  assert.equal(supported(`Poids: ${literal} kg.`,source(Number(literal.split(',')[1])),'',[],false),false,literal+' suffix');
 }
});
test('English thousands grouping keeps its magnitude and malformed decimal tokens cannot yield a suffix',()=>{
 assert.equal(supported('Mass: 1,200 kg.',source(1200),'',[],false),true);
 assert.equal(supported('Mass: 1,200 kg.',source(200),'',[],false),false);
 assert.equal(supported('Mass: 3,8 kg.',source(38),'',[],false),false);
});
test('decimal commas in rates retain their complete signed value',()=>{
 const records=[{text:'Recorded rate: -0.5 kg/day.'}];
 assert.equal(supported('Variation: -0,5 kg/day.',records,'',[],false),true);
 assert.equal(supported('Variation: -0,5 kg/day.',[{text:'Recorded rate: 5 kg/day.'}],'',[],false),false);
});
