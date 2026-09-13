import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFurviseCapabilityQuestion as classify } from '../app/lib/ai/ask-internal-product-policy.ts';

for (const question of [
  'Furvise, summarize all history for Milo.',
  'Hey Furvise, compare older history with this month.',
  'Furvise: show history trends for Luna.',
  'Please, Furvise, summarize longer history for Oscar.',
]) test('history recall remains care intent: ' + question, () => assert.equal(classify(question), null));
for (const question of [
  'Can Furvise Plus detect patterns over time in all her history?',
  'Does the app support longer history?',
  'Is the history patterns feature available?',
  'When will Furvise support older history?',
]) test('explicit capability inquiry remains supported: ' + question, () => assert.equal(classify(question), 'long_history_patterns'));
test('other product intents retain routing', () => {
  assert.equal(classify('Furvise, export a vet prep PDF.'), null);
  assert.equal(classify('Does Furvise support PDF exports?'), 'vet_prep_exports');
  assert.equal(classify('Can Furvise research current product prices?'), 'live_product_research');
});
