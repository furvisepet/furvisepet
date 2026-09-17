import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDeterministicTurnSubject, explicitMutationTarget } from '../../app/lib/intelligence/entities/resolve-turn-subject.ts';
import { pets } from './fixtures/ask-three-month-multi-pet.mjs';

const [milo, luna, pepper] = pets;
const resolve = (message, recentConversation = [], selectedPetId = milo.id) => resolveDeterministicTurnSubject({
  message, pets, recentConversation, selectedPetId,
});

test('broken punctuation still allows an explicit pet correction to take focus', () => {
  const recent = [{ role: 'user', text: 'Milo was throwing up.' }];
  const result = resolve('nah wait,,, Luna not Milo', recent);
  assert.equal(result?.petId, luna.id);
  assert.equal(result?.requiresClarification, false);
});

test('explicit correction survives shorthand and lowercase pet naming', () => {
  const recent = [{ role: 'user', text: 'Milo has been itchy.' }];
  const result = resolve('no meant luna lol', recent);
  assert.equal(result?.petId, luna.id);
});

test('a vague pronoun after an explicit correction stays with the corrected pet', () => {
  const recent = [
    { role: 'user', text: 'Milo has been itchy.' },
    { role: 'user', text: 'no meant Luna not Milo' },
  ];
  assert.equal(resolve('what abt her now?', recent)?.petId, luna.id);
});
test('read-only language cannot become a mutation target even with save vocabulary nearby', () => {
  for (const message of [
    'show me Luna history dont save that',
    'if i said save that for Pepper would u?',
    'quote this exactly: save that for Milo',
  ]) assert.equal(explicitMutationTarget(message, pets), null, message);
});

test('an explicit messy save target stays singular', () => {
  const target = explicitMutationTarget('ok save this for pepper only pls not milo', pets);
  assert.equal(target, pepper.id);
});

test('conflicting multi-pet write language fails closed instead of guessing', () => {
  assert.equal(explicitMutationTarget('save this for Milo and Luna', pets), null);
  assert.equal(explicitMutationTarget('change that for Luna no wait Pepper', pets), null);
});

test('selected-pet pronouns do not jump because another pet is mentioned as an object', () => {
  const recent = [{ role: 'user', text: 'Milo was resting next to Luna.' }];
  const result = resolve('is he ok tho', recent, milo.id);
  assert.equal(result?.petId, milo.id);
});