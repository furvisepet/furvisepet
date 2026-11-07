import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalReadPresentation, readPublicationFailure } from '../app/lib/ask-publication.ts';
test('real read publication normalizes generated punctuation before review',()=>{
 const text=canonicalReadPresentation('The result is available—please read it.');
 assert.doesNotMatch(text,/—/);
 assert.equal(readPublicationFailure(text),null);
});
test('publication preserves exact quoted source punctuation',()=>{
 const literal='"Ate — then rested."';
 const text=canonicalReadPresentation('The note says '+literal+'—that is the recorded wording.');
 assert.ok(text.includes(literal),text);
 assert.equal(text.replace(literal,'').includes('—'),false);
});
