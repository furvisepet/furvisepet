import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveConversationTitle } from '../app/lib/ask-conversations.ts';

test('symptom mentions remain neutral under negation, uncertainty and other-pet context', () => {
  for (const question of [
    'From today’s note, how long was Maple’s walk and was vomiting reported?',
    'Maple has not been vomiting.',
    'What if she starts vomiting?',
    'Mochi was vomiting; Maple was fine. Keep their records separate.',
  ]) assert.equal(deriveConversationTitle(question, 'Maple'), 'About vomiting');
  assert.equal(deriveConversationTitle('Her food has not changed.', 'Maple'), 'About food and diet');
  assert.equal(deriveConversationTitle('She is not hiding more.', 'Maple'), 'About hiding and behavior');
});

test('unclassified titles preserve question framing and the named subject', () => {
  assert.equal(deriveConversationTitle('Is Mochi tired? Maple is fine.', 'Maple'), 'Is Mochi tired? Maple is fine.');
  assert.equal(deriveConversationTitle('She is not tired.', 'Maple'), 'She is not tired.');
  assert.equal(deriveConversationTitle('', 'Maple'), 'Question about Maple');
  assert.ok(deriveConversationTitle('Is this normal? '.repeat(20), 'Maple').length <= 72);
});
