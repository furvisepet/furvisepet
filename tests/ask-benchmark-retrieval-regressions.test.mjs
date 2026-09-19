import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitHistoryDays, explicitHistoryMonths } from '../app/lib/intelligence/history-dates.ts';
import { historyQueryTerms } from '../app/lib/intelligence/history-query-relevance.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
import { readFileSync } from 'node:fs';

test('benchmark shared trailing year keeps every explicit date/month target',()=>{
 assert.deepEqual(explicitHistoryDays('between September 8 and September 12, 2026',2026,8),['2026-09-08','2026-09-12']);
 assert.deepEqual(explicitHistoryMonths('Across June, July, and August 2026'),['2026-06','2026-07','2026-08']);
 const window={from:'2026-09-01T00:00:00.000Z',to:'2026-10-01T00:00:00.000Z'};
 const r=compileHistoryReadStrategies('September 12 than on September 11, 2026',2026,window,[{...window,descending:false,lexical:false,terms:[]}],4,[]);
 assert.deepEqual(r.strategies.filter(x=>x.target).map(x=>x.target).sort(),['2026-09-11','2026-09-12']);
});

test('latest appetite and energy hints include bounded owner-language aliases',()=>{
 const terms=historyQueryTerms(['appetite','energy'],['Sable']);
 assert.ok(terms.includes('appet'));
 assert.ok(terms.some(term=>['tired','slugg','letha','activ'].includes(term)));
 assert.ok(terms.some(term=>['eat','ate','intak','break'].includes(term)));
 assert.ok(terms.length<=6);
});

test('read-only subject resolution uses the validated multi-pet read scope',()=>{
 const source=readFileSync('app/lib/intelligence/interpret-ask.ts','utf8');
 assert.match(source,/interpretation\.readOnly && interpretation\.readPetIds\?\.length/);
 assert.match(source,/\? interpretation\.readPetIds : interpretation\.petIds/);
 assert.match(source,/subjects\.length > 1 \? "multi_subject"/);
 assert.match(source,/petIds: subjects/);
});
test('missing simple comparison metadata is reconstructed only from two cited compatible source measurements',async()=>{
 const {attachDeterministicCalculationBindings}=await import('../app/lib/intelligence/repair-calculation-bindings.ts');
 const narrative={sentences:[{text:'Sable played 3 minutes longer.',sourceIds:['care:a','care:b']}]};
 const sources=[{sourceId:'care:a',text:'Sable played for 14 minutes.'},{sourceId:'care:b',text:'Sable played for 17 minutes.'}];
 const repaired=attachDeterministicCalculationBindings(narrative,sources,'How much longer did Sable play?');
 assert.equal(repaired.sentences[0].calculations?.[0]?.operation,'absolute_difference');
 assert.equal(repaired.sentences[0].calculations?.[0]?.value,3);
 assert.equal(repaired.sentences[0].calculations?.[0]?.unit,'minute');
 const unsafe=attachDeterministicCalculationBindings({sentences:[{...narrative.sentences[0],sourceIds:['care:a','care:b','care:c']}]},[...sources,{sourceId:'care:c',text:'Sable rested for 2 minutes.'}],'How much longer did Sable play?');
 assert.equal(unsafe.sentences[0].calculations,undefined);
});test('route proves alternate read widening from current user explicit owned names only',()=>{
 const route=readFileSync('app/api/ask/route.ts','utf8');
 assert.match(route,/explicitlyNamedOwnedPets\(question, liveContext\.eligiblePets \|\| \[\]\)\.map\(pet => pet\.id\)/);
 const guard=readFileSync('app/lib/intelligence/selected-pet-read.ts','utf8');
 assert.match(guard,/explicitOwnedAlternateRead/);
 assert.match(guard,/explicit\.has\(id\)/);
 assert.match(guard,/interpretation\.readOnly && interpretation\.request\?\.mode === "read"/);
});
