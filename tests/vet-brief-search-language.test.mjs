import test from 'node:test';
import assert from 'node:assert/strict';
import { vetBriefSearchVocabulary } from '../app/lib/vet-brief/appointment-plan.ts';

test('search-language hints are bounded and isolated to the selected pet', () => {
  const entries = [{ pet_profile_id: 'other', title: 'Do not include', note: 'foreign pet' }, ...Array.from({ length: 20 }, (_, index) => ({ pet_profile_id: 'selected', title: `Record ${index}`, note: 'a'.repeat(500) }))];
  const result = vetBriefSearchVocabulary(entries, 'selected');
  assert.equal(result.length, 8);
  assert.ok(result.every(value => value.length <= 240 && !value.includes('foreign pet')));
  assert.deepEqual(vetBriefSearchVocabulary(entries, 'missing'), []);
});


test('old clinical topic spellings survive a recent routine-only vocabulary without expanding its bound',()=>{
 const recent=Array.from({length:20},()=>({pet_profile_id:'selected',title:'Routine bedding washed',note:'Ordinary care.'}));
 const concerns=[{pet_profile_id:'other',title:'foreign illness'},...Array.from({length:10},(_,i)=>({pet_profile_id:'selected',title:i?'Clinical topic '+i:'vaccination and reaction'}))];
 const hints=vetBriefSearchVocabulary(recent,'selected',concerns);
 assert.equal(hints.length,8);assert.ok(hints.includes('vaccination and reaction'));assert.ok(hints.some(x=>x.includes('Routine bedding')));assert.ok(!hints.some(x=>x.includes('foreign illness')));
 assert.ok(hints.every(x=>x.length<=240));assert.deepEqual(vetBriefSearchVocabulary([], 'missing', concerns),[]);
});
