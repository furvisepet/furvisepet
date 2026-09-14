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


test('source-grounded record years are not counts; totals and wrong years still fail',()=>{
 const sources=[{text:'Skin redness was reported.',occurredAt:'2024-03-12T12:00:00Z'}];
 for(const text of ['The 2024 notes describe skin redness.', "Rowan's 2024 records describe skin redness."])
  assert.equal(supported(text,sources,'',[],false),true,text);
 for(const text of ['The 2023 notes describe skin redness.', 'There were 2024 notes.', 'All 2024 records describe redness.', 'Exactly 2024 records describe redness.', 'The 2024 notes report three episodes.'])
  assert.equal(supported(text,sources,'',[],false),false,text);
});


test('compact measured units retain exact magnitude across prose formatting',()=>{
 for(const [compact, spaced] of [['5mg','5 mg'],['0.5mg','0.5 mg'],['5.10kg','5.10 kg'],['250mL','250 ml'],['-2.5kg','-2.5 kg']]) {
  assert.equal(supported(`Reported ${spaced}.`,[{text:`Reported ${compact}.`}],'',[],false),true,compact);
  assert.equal(supported(`Reported ${compact}.`,[{text:`Reported ${spaced}.`}],'',[],false),true,spaced);
 }
 assert.equal(supported('Reported 5 mg.',[{text:'Reported 0.5mg.'}],'',[],false),false);
 assert.equal(supported('Reported 50mg.',[{text:'Reported 5 mg.'}],'',[],false),false);
 assert.equal(supported('Reported 5 g.',[{text:'Reported 5mg.'}],'',[],false),false);
});
