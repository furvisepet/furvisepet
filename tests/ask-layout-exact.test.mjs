import test from 'node:test';
import assert from 'node:assert/strict';
import { requestedHistoryLayout, presentReviewedHistory } from "../app/lib/furvise-output.ts";
test('exactly and precisely preserve requested bullet counts',()=>{
 for(const q of ['Give the June history in exactly three bullets.','Summarize in precisely 3 bullet points.']) {
 assert.deepEqual(requestedHistoryLayout(q),{style:'bullets',count:3});
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],q),'- First.\n- Second.\n- Third.');
 }
});

test('a reviewed table remains a separate block beside explanatory prose',()=>{
 const table='| Date | Weight |\n| --- | --- |\n| 2026-06-04 | 4.2 kg |\n| 2026-09-02 | 4.2 kg |';
 assert.equal(presentReviewedHistory([table,'Both recorded weights are the same.'],'Show weights in a table.'),table+'\n\nBoth recorded weights are the same.');
 assert.equal(presentReviewedHistory(['Here are the measurements.',...table.split('\n'),'Both recorded weights are the same.'],'Show weights in a table.'),'Here are the measurements.\n\n'+table+'\n\nBoth recorded weights are the same.');
});

test('bullet layout survives safe pronoun substitution without restoring changed facts',async()=>{
 const {preserveReviewedLayout}=await import('../app/lib/furvise-output.ts');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','- He ate. - He played.'),'- He ate.\n- He played.');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','- He did not eat. - He played.'),'- He did not eat.\n- He played.');
 assert.equal(preserveReviewedLayout('- Pip ate.\n- Pip played.','He did not eat.'),'He did not eat.');
});

test('using two bullets is an explicit format request',()=>{
 assert.deepEqual(requestedHistoryLayout('Summarize June and August, using two bullets.'),{style:'bullets',count:2});
 assert.equal(presentReviewedHistory(['First.','Second.','Third.'],'Summarize, using two bullets.'),'- First.\n- Second. Third.');
});


test('requested separate pet lines preserve every reviewed sentence without merging them',()=>{
 const sentences=['Pip ate salmon food in July.','Fern changed from chicken to turkey in August.','Nori ate senior food in September.'];
 assert.equal(presentReviewedHistory(sentences,'Give a separate line for each pet.'),sentences.join('\n\n'));
 assert.equal(requestedHistoryLayout('Explain the quoted phrase "a separate line for each pet".'),null);
});

test('requested bullets separate retained inline list items without changing facts',()=>{
 const text='On July 5, the tray moved and litter changed. - On July 10, both changes were reversed.';
 assert.equal(presentReviewedHistory([text],'Summarize the litter changes in two bullets.'),'- On July 5, the tray moved and litter changed.\n- On July 10, both changes were reversed.');
});

test('inline list layout leaves quotes, negative quantities and plain prose intact',()=>{
 const quote='The note says "First. - Second."';
 assert.equal(presentReviewedHistory([quote],'Use two bullets.'),'- '+quote);
 assert.equal(presentReviewedHistory(['Weight changed by - 0.6 kg.'],'Use two bullets.'),'- Weight changed by - 0.6 kg.');
 assert.equal(presentReviewedHistory(['First. - Second.'],'Use one paragraph.'),'First. - Second.');
 assert.equal(presentReviewedHistory(['No diagnosis recorded. - Medicine name unknown.'],'Use two bullets.'),'- No diagnosis recorded.\n- Medicine name unknown.');
});

test('just two measurements omits only the generic coverage footer',async()=>{
 const {presentHistoryLimitation}=await import('../app/lib/furvise-output.ts');
 const prose='27.8 kg and 28.4 kg.';
 const generic='This covers the matching saved notes I could verify, not necessarily every event in their life.';
 const q='Give just the two weight measurements behind the 0.6 kg decrease.';
 assert.equal(presentHistoryLimitation(prose,generic,q),prose);
 assert.match(presentHistoryLimitation(prose,'Some matching records were unavailable.',q),/unavailable/);
 assert.match(presentHistoryLimitation(prose,generic,q+' Are these the lifetime endpoints?'),/This covers/);
 assert.match(presentHistoryLimitation('No weight change.',generic,q),/This covers/);
});
