import test from 'node:test';
import assert from 'node:assert/strict';
import { readPublicationFailure, scrubUntrustedMutationClaim } from '../app/lib/ask-publication.ts';
import { compileHistoryReadStrategies } from '../app/lib/intelligence/history-read-strategies.ts';
const window = { from: '2021-09-10T00:00:00.000Z', to: '2026-09-11T00:00:00.000Z' };
const proposed = [false,true].flatMap(descending => [true,false].map(lexical => ({ ...window, descending, lexical, terms: ['weight'] })));

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
