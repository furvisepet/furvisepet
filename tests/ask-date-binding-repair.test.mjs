import test from 'node:test';
import assert from 'node:assert/strict';
import {historyDateBindingHints,historyNarrativeAnchorsSupported} from '../app/lib/intelligence/history-narrative-facts.ts';
const sources=[3,6,9,12].map(day=>({sourceId:`care:${day}`,petId:'owned',occurredAt:`2026-08-${String(day).padStart(2,'0')}T12:00:00Z`,text:'Recorded breakfast.'}));
const text='August 3, August 6, August 9 and August 12, 2026.';
test('repair receives a candidate source for each independently cited date',()=>{
 assert.deepEqual(historyDateBindingHints(text,sources).map(h=>h.sourceIds),sources.map(s=>[s.sourceId]));
 assert.equal(historyNarrativeAnchorsSupported(text,[sources[3]],'',[],false),false);
 assert.equal(historyNarrativeAnchorsSupported(text,sources,'',[],false),true);
});
test('candidate date hints neither create sources nor approve their clinical meaning',()=>{
 assert.deepEqual(historyDateBindingHints('August 31, 2026.',sources),[{anchor:'2026:8-31',sourceIds:[]}]);
 const wrongDate='No symptoms on August 31, 2026.';
 assert.equal(historyNarrativeAnchorsSupported(wrongDate,sources,'',[],false),false);
 const before=structuredClone(sources);historyDateBindingHints(text,sources);assert.deepEqual(sources,before);
});
