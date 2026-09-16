import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFurviseMutationAllowed,
  clarifyFurviseTurnSubject,
  createFurviseTurnAuthority,
  grantFurviseMutationAuthority,
} from "../app/lib/furvise-brain/turn-authority.ts";

const turnId = "43a3b358-c86e-4dbd-826e-ffb3d25176f6";

test("new brain turn starts with mutation authority closed", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: turnId,
    subject: { petIds: ["pebble"], source: "selected_pet", unresolved: false },
    intent: "conversation",
  });

  assert.equal(turn.mutation.allowed, false);
  assert.equal(turn.mutation.explicitUserAuthorization, false);
  assert.equal(turn.mutation.kind, null);
  assert.throws(() => assertFurviseMutationAllowed(turn), /FURVISE_MUTATION_NOT_AUTHORIZED/);
});

test("subject clarification cannot create save authority", () => {
  const original = createFurviseTurnAuthority({
    logicalTurnId: turnId,
    subject: { petIds: [], source: "unresolved", unresolved: true },
    intent: "conversation",
    memoryNeed: "working",
  });

  const clarified = clarifyFurviseTurnSubject(original, ["pebble"]);

  assert.deepEqual(clarified.subject.petIds, ["pebble"]);
  assert.equal(clarified.subject.source, "clarified");
  assert.equal(clarified.subject.unresolved, false);
  assert.equal(clarified.intent, original.intent);
  assert.equal(clarified.memoryNeed, original.memoryNeed);
  assert.deepEqual(clarified.mutation, original.mutation);
  assert.throws(() => assertFurviseMutationAllowed(clarified), /FURVISE_MUTATION_NOT_AUTHORIZED/);
});

test("pending or inferred desire to save cannot grant mutation authority", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId });
  const inferred = grantFurviseMutationAuthority(turn, {
    kind: "record_care",
    explicitUserAuthorization: false,
  });

  assert.strictEqual(inferred, turn);
  assert.equal(inferred.mutation.allowed, false);
});

test("explicit current-turn save authority can open a non-confirmed mutation", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId, intent: "record" });
  const authorized = grantFurviseMutationAuthority(turn, {
    kind: "record_care",
    explicitUserAuthorization: true,
  });

  assert.equal(authorized.mutation.allowed, true);
  assert.doesNotThrow(() => assertFurviseMutationAllowed(authorized, "record_care"));
  assert.throws(() => assertFurviseMutationAllowed(authorized, "correct_record"), /FURVISE_MUTATION_KIND_MISMATCH/);
});

test("destructive or lifecycle mutation remains closed until confirmation is satisfied", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId, intent: "lifecycle" });
  const awaitingConfirmation = grantFurviseMutationAuthority(turn, {
    kind: "mark_deceased",
    explicitUserAuthorization: true,
    confirmationRequired: true,
    confirmationSatisfied: false,
  });

  assert.equal(awaitingConfirmation.mutation.allowed, false);
  assert.throws(() => assertFurviseMutationAllowed(awaitingConfirmation), /FURVISE_MUTATION_NOT_AUTHORIZED/);

  const confirmed = grantFurviseMutationAuthority(turn, {
    kind: "mark_deceased",
    explicitUserAuthorization: true,
    confirmationRequired: true,
    confirmationSatisfied: true,
  });

  assert.equal(confirmed.mutation.allowed, true);
  assert.doesNotThrow(() => assertFurviseMutationAllowed(confirmed, "mark_deceased"));
});

test("turn objects and nested authority objects are immutable", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: turnId,
    subject: { petIds: ["pebble"], source: "selected_pet", unresolved: false },
  });

  assert.equal(Object.isFrozen(turn), true);
  assert.equal(Object.isFrozen(turn.subject), true);
  assert.equal(Object.isFrozen(turn.subject.petIds), true);
  assert.equal(Object.isFrozen(turn.mutation), true);
});
