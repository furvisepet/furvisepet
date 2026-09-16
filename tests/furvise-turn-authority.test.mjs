import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySubjectClarification,
  assertMutationCommitAllowed,
  canCommitMutation,
  issueTurnAuthority,
} from '../app/lib/brain/turn-authority.ts';

function base(overrides = {}) {
  return issueTurnAuthority({
    turnId: 'turn-1',
    messageId: 'message-1',
    subject: { petIds: ['pebble'], basis: 'selected_pet', requiresClarification: false },
    intent: 'conversation',
    memory: 'working',
    mutation: { requested: false, kind: null, state: 'forbidden', authorization: null, confirmationRequired: false },
    ...overrides,
  });
}

test('ordinary conversation cannot commit a mutation', () => {
  const turn = base();
  assert.equal(canCommitMutation(turn), false);
  assert.throws(() => assertMutationCommitAllowed(turn), /FURVISE_MUTATION_NOT_AUTHORIZED/);
});

test('subject clarification cannot manufacture save authority', () => {
  const unresolved = base({
    subject: { petIds: [], basis: 'none', requiresClarification: true },
    intent: 'observation',
    mutation: { requested: false, kind: 'owner_note', state: 'proposed', authorization: null, confirmationRequired: false },
  });
  const clarified = applySubjectClarification(unresolved, { petIds: ['pebble'] });
  assert.deepEqual(clarified.subject.petIds, ['pebble']);
  assert.equal(clarified.subject.basis, 'clarification');
  assert.deepEqual(clarified.mutation, unresolved.mutation);
  assert.equal(canCommitMutation(clarified), false, '"I mean Pebble" resolves only the subject');
});

test('authorized owner note can commit only with one resolved subject', () => {
  const turn = base({
    intent: 'save',
    mutation: {
      requested: true,
      kind: 'owner_note',
      state: 'authorized',
      authorization: { basis: 'explicit_user', messageId: 'message-1', quote: 'save this note', capabilityId: null },
      confirmationRequired: false,
    },
  });
  assert.equal(canCommitMutation(turn), true);
  assert.doesNotThrow(() => assertMutationCommitAllowed(turn));
});

test('confirmation-required lifecycle action cannot commit from language alone', () => {
  const languageOnly = base({
    intent: 'lifecycle',
    mutation: {
      requested: true,
      kind: 'lifecycle',
      state: 'authorized',
      authorization: { basis: 'explicit_user', messageId: 'message-1', quote: 'Pebble died', capabilityId: null },
      confirmationRequired: true,
    },
  });
  assert.equal(canCommitMutation(languageOnly), false);

  const confirmed = base({
    intent: 'lifecycle',
    mutation: {
      requested: true,
      kind: 'lifecycle',
      state: 'authorized',
      authorization: { basis: 'confirmed_capability', messageId: 'message-2', quote: null, capabilityId: 'capability-1' },
      confirmationRequired: true,
    },
  });
  assert.equal(canCommitMutation(confirmed), true);
});

test('authority object is immutable after issuance', () => {
  const turn = base();
  assert.equal(Object.isFrozen(turn), true);
  assert.equal(Object.isFrozen(turn.subject), true);
  assert.throws(() => { turn.subject.petIds.push('other'); }, TypeError);
});
