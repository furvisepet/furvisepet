import test from 'node:test';
import assert from 'node:assert/strict';
import {historyNarrativeAnchorsSupported as supported,historyDateBindingHints as hints} from '../app/lib/intelligence/history-narrative-facts.ts';
const amounts=[31,34,36,39];
const sources=[3,6,9,12].map((day,i)=>({sourceId:`care:${day}`,occurredAt:`2026-08-${String(day).padStart(2,'0')}T00:00:00Z`,text:`August ${day}, 2026: ate ${amounts[i]} g at breakfast.`}));
test('day-first prose never turns gram quantities into calendar days',()=>{
 const text='Am 3. August 31 g, am 6. August 34 g, am 9. August 36 g und am 12. August 39 g.';
 assert.deepEqual(hints(text,sources).map(h=>h.anchor),['8-3','8-6','8-9','8-12']);
 assert.equal(supported(text,sources,'',[],false),true);
 assert.equal(supported(text.replace('34 g','35 g'),sources,'',[],false),false,'measurements must still be checked');
 assert.equal(supported(text.replace('6. August','7. August'),sources,'',[],false),false,'dates must still be checked');
});
test('both date orders retain quantities and explicit years',()=>{
 for(const text of ['On 3 August 2026: 31 g.','On August 3, 2026: 31 g.','Am 3. August 2026: 31 g.']) {
  assert.equal(supported(text,[sources[0]],'',[],false),true,text);
  assert.equal(supported(text.replace('31 g','32 g'),[sources[0]],'',[],false),false,text);
 }
 assert.equal(supported('August 34 g.',[{text:'Recorded 34 g.'}],'',[],false),true);
 assert.equal(supported('August 34 g.',[{text:'Recorded 35 g.'}],'',[],false),false);
 assert.equal(supported('September 3.8 kg.',[{text:'Recorded 3.8 kg.'}],'',[],false),true);
 assert.equal(supported('September 3.8 kg.',[{text:'Recorded 4.8 kg.'}],'',[],false),false);
});
test('qualified record-year labels are not literal counts',()=>{
 const records=[{text:'Vomiting was reported.',occurredAt:'2024-02-01T12:00:00Z'},{text:'Vomiting stopped.',occurredAt:'2024-02-03T12:00:00Z'}];
 for(const text of ['The only 2024 notes shown concern vomiting.','The only available 2024 notes shown concern vomiting.','In the visible 2024 notes, vomiting was reported.']) assert.equal(supported(text,records,'',[],false),true,text);
 assert.equal(supported('There are exactly 2024 notes.',records,'',[],false),false);
 assert.equal(supported('The only 2023 notes shown concern vomiting.',records,'',[],false),false);
});
