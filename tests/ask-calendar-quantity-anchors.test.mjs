import assert from 'node:assert/strict';
import test from 'node:test';
import {historyNarrativeAnchorsSupported as supported} from '../app/lib/intelligence/history-narrative-facts.ts';
test('month-year labels do not become symptom or treatment quantities',()=>{
 const sources=[{text:'One soft stool was observed.',occurredAt:'2024-02-03T12:00:00Z'}];
 assert.equal(supported('The February 2024 soft stool observation.',sources,'',[],false),true);
 assert.equal(supported('There were 2024 soft stools.',sources,'',[],false),false);
 const treatment=[{text:'The prescribed course ended.',occurredAt:'2023-12-08T12:00:00Z'}];
 assert.equal(supported('The December 2023 course ended.',treatment,'',[],false),true);
 assert.equal(supported('2023 courses ended.',treatment,'',[],false),false);
});
test('calendar stripping preserves genuine adjacent quantities and exact quotation checks',()=>{
 const sources=[{text:'Two stools were observed.',occurredAt:'2024-02-03T12:00:00Z'}];
 assert.equal(supported('February 2024: two stools.',sources,'',[],false),true);
 assert.equal(supported('February 2024: three stools.',sources,'',[],false),false);
 assert.equal(supported('"two stools"',sources,'',[],false),false);
});
