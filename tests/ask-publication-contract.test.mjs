import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalReadPresentation, readPublicationFailure, readPublicationStages, scrubUntrustedMutationClaim } from '../app/lib/ask-publication.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
const window = { from: '2021-09-10T00:00:00.000Z', to: '2026-09-11T00:00:00.000Z' };
const proposed = [false,true].flatMap(descending => [true,false].map(lexical => ({ ...window, descending, lexical, terms: ['weight'] })));

test('publication diagnostics identify rejection stages without retaining answer content',()=>{
 const rejected=readPublicationStages('I updated the profile.');
 assert.equal(rejected.stateClaimDetected,true);
 assert.equal(rejected.statePolicyChanged,true);
 assert.ok(Object.values(rejected).every(value=>typeof value==='boolean'));
 assert.ok(Object.values(readPublicationStages('The source reports a dated observation.')).every(value=>value===false));
});

test('explicit date targets remain independent of chronological query ordering', () => {
 const {strategies,omittedTargets}=compileHistoryReadStrategies('Compare September 9, 2022 with now.',2026,window,proposed,4);
 assert.equal(strategies.length,4); assert.deepEqual(omittedTargets,[]);
 assert.equal(strategies[0].from,'2022-09-09T00:00:00.000Z');
 assert.equal(strategies[0].to,'2022-09-10T00:00:00.000Z');
 assert.equal(strategies[0].lexical,false);
 assert.ok(strategies.some(s=>s.descending && s.from===window.from));
});
test('date targets cannot expand subscription access and disclose overflow', () => {
 const r=compileHistoryReadStrategies('2020-01-01 2022-01-01 2023-01-01 2024-01-01 2025-01-01 2022-02-30',2026,window,proposed,4);
 assert.equal(r.strategies.length,4);
 assert.deepEqual(r.omittedTargets,['2025-01-01']);
 assert.ok(r.strategies.every(s=>s.from>=window.from && s.to<=window.to));
});
test('publication preflight rejects semantic deletion before an answer is approved', () => {
 for(const text of ['I updated the profile.','The account was deleted.','The change was recorded in the profile.'])
  assert.equal(readPublicationFailure(text),'publication_changed_text');
 for(const text of ['The owner reported a food transition because of itching. The cause remains unknown.','Weight: 7.21 kg. No diagnosis was recorded.'])
  assert.equal(readPublicationFailure(text),null);
 assert.equal(scrubUntrustedMutationClaim('I updated the profile.','Fallback'),'I can help with that.');
});

test('canonical review text applies the exact publication scrub before semantic approval', () => {
 const complete = 'Episode 2 started on 2024-06-09 and stopped on 2024-06-11, a 2 calendar-day difference. If you want, I can also format this for your vet.';
 const publishable = canonicalReadPresentation(complete);
 assert.equal(publishable, 'Episode 2 started on 2024-06-09 and stopped on 2024-06-11, a 2 calendar-day difference.');
 assert.equal(readPublicationFailure(publishable), null);
 assert.equal(readPublicationFailure(complete), 'publication_changed_text');
});

test('canonical review text does not preserve unsupported mutation claims', () => {
 const publishable = canonicalReadPresentation('Episode 2 lasted 2 calendar days. I recorded this in the history.');
 assert.equal(publishable, 'Episode 2 lasted 2 calendar days.');
 assert.equal(readPublicationFailure(publishable), null);
});
