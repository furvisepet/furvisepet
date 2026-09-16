import test from 'node:test';
import assert from 'node:assert/strict';
import {historyDateBindingHints,historyNarrativeAnchorsSupported,historyQuantityAnchors} from '../app/lib/intelligence/history-narrative-facts.ts';
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

test('recording timestamps cannot borrow event instants even when the calendar date matches',()=>{
 const source={sourceId:'care:a',petId:'owned',sourceType:'care_update',text:'An evening observation.',occurredAt:'2026-09-15T02:30:00Z',recordedAt:'2026-09-15T06:15:42.787774Z'};
 const check=text=>historyNarrativeAnchorsSupported(text,[source],'',[],false);
 assert.equal(check('The note was recorded at 2026-09-15T02:30:00+00:00.'),false);
 assert.equal(check('The note was recorded at 2026-09-15T06:15:42.787774+00:00.'),true);
 assert.equal(historyNarrativeAnchorsSupported('The note was saved at 2026-09-15T02:30:00Z.',[{...source,recordedAt:null}],'',[],false),false);
 assert.equal(check('The event occurred at 2026-09-15T02:30:00Z.'),true);
});

test('shared month and year bind both explicit range endpoints without authorizing unreported dates',()=>{
 for (const separator of ['–','—','-']) {
  const source={sourceId:'care:range',text:`Recorded course September 1${separator}5, 2026, then September 6${separator}10, 2026.`};
  const endpoints='September 1, 2026; September 5, 2026; September 6, 2026; September 10, 2026.';
  assert.equal(historyNarrativeAnchorsSupported(endpoints,[source],'',[],false),true);
  assert.ok(historyDateBindingHints(endpoints,[source]).every(h=>h.sourceIds.includes(source.sourceId)));
  for (const unsupported of ['September 3, 2026','September 11, 2026','September 10, 2025']) {
   assert.equal(historyNarrativeAnchorsSupported(unsupported,[source],'',[],false),false,unsupported);
  }
 }
});

test('date range masking preserves adjacent quantities and rejects invalid endpoint dates',()=>{
 assert.deepEqual(historyQuantityAnchors('September 1–5, 2026: 5 mg; September 6–10, 2026: 2.5 mg.'),['5:mg','2.5:mg']);
 assert.equal(historyNarrativeAnchorsSupported('February 31, 2026.',[{text:'February 1–31, 2026.'}],'',[],false),false);
 assert.equal(historyNarrativeAnchorsSupported('September 5, 2026.',[{text:'September 1–5.'}],'',[],false),false);
 assert.deepEqual(historyQuantityAnchors('September 1–5 mg.'),['5:mg']);
});
