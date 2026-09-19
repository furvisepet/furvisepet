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
    subject: { petIds: ["pebble"], source: "selected_pet" },
    intent: "conversation",
  });

  assert.equal(turn.subject.unresolved, false);
  assert.equal(turn.mutation.allowed, false);
  assert.equal(turn.mutation.userAuthorizationVerified, false);
  assert.equal(turn.mutation.authorizationSource, null);
  assert.equal(turn.mutation.authorizationTurnId, null);
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

test("model inference without verified user authorization cannot grant mutation authority", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId });
  const inferred = grantFurviseMutationAuthority(turn, {
    kind: "record_care",
    userAuthorizationVerified: false,
    authorizationSource: "current_turn",
    authorizationTurnId: turnId,
  });

  assert.strictEqual(inferred, turn);
  assert.equal(inferred.mutation.allowed, false);
});

test("verified current-turn save authority can open a non-confirmed mutation", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId, intent: "record" });
  const authorized = grantFurviseMutationAuthority(turn, {
    kind: "record_care",
    userAuthorizationVerified: true,
    authorizationSource: "current_turn",
    authorizationTurnId: turnId,
  });

  assert.equal(authorized.mutation.allowed, true);
  assert.equal(authorized.mutation.authorizationSource, "current_turn");
  assert.doesNotThrow(() => assertFurviseMutationAllowed(authorized, "record_care"));
  assert.throws(() => assertFurviseMutationAllowed(authorized, "correct_record"), /FURVISE_MUTATION_KIND_MISMATCH/);
});

test("a clarification may exercise a previously verified durable capability but cannot mint it", () => {
  const turn = clarifyFurviseTurnSubject(createFurviseTurnAuthority({ logicalTurnId: turnId }), ["pebble"]);
  assert.throws(() => assertFurviseMutationAllowed(turn), /FURVISE_MUTATION_NOT_AUTHORIZED/);

  const resumed = grantFurviseMutationAuthority(turn, {
    kind: "record_care",
    userAuthorizationVerified: true,
    authorizationSource: "durable_capability",
    authorizationTurnId: "earlier-save-request",
  });
  assert.equal(resumed.mutation.allowed, true);
  assert.equal(resumed.mutation.authorizationTurnId, "earlier-save-request");
  assert.doesNotThrow(() => assertFurviseMutationAllowed(resumed, "record_care"));
});

test("destructive or lifecycle mutation remains closed until confirmation is satisfied", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: turnId, intent: "lifecycle" });
  const awaitingConfirmation = grantFurviseMutationAuthority(turn, {
    kind: "mark_deceased",
    userAuthorizationVerified: true,
    authorizationSource: "current_turn",
    authorizationTurnId: turnId,
    confirmationRequired: true,
    confirmationSatisfied: false,
  });

  assert.equal(awaitingConfirmation.mutation.allowed, false);
  assert.equal(awaitingConfirmation.mutation.userAuthorizationVerified, true);
  assert.throws(() => assertFurviseMutationAllowed(awaitingConfirmation), /FURVISE_MUTATION_NOT_AUTHORIZED/);

  const confirmed = grantFurviseMutationAuthority(turn, {
    kind: "mark_deceased",
    userAuthorizationVerified: true,
    authorizationSource: "current_turn",
    authorizationTurnId: turnId,
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
