import assert from "node:assert/strict";
import test from "node:test";

import { applySubjectResolution } from "../app/lib/furvise-brain/subject-authority.ts";
import {
  createFurviseTurnAuthority,
  grantFurviseMutationAuthority,
} from "../app/lib/furvise-brain/turn-authority.ts";

const base = grantFurviseMutationAuthority(
  createFurviseTurnAuthority({
    logicalTurnId: "turn",
    intent: "record",
    memoryNeed: "targeted",
    referenceTurnIds: ["prior"],
  }),
  {
    kind: "record_care",
    userAuthorizationVerified: true,
    authorizationSource: "current_turn",
    authorizationTurnId: "turn",
  },
);

test("resolved subject changes only subject authority", () => {
  const next = applySubjectResolution(base, {
    status: "resolved",
    petId: "pebble",
    petIds: ["pebble"],
    reasonCode: null,
    requiresClarification: false,
    explicitSubject: true,
    confidence: 0.99,
  });

  assert.deepEqual(next.subject.petIds, ["pebble"]);
  assert.equal(next.subject.kind, "pet");
  assert.equal(next.subject.source, "explicit");
  assert.equal(next.intent, base.intent);
  assert.equal(next.memoryNeed, base.memoryNeed);
  assert.deepEqual(next.referenceTurnIds, base.referenceTurnIds);
  assert.deepEqual(next.mutation, base.mutation);
});

test("ambiguous subject cannot leak candidate pets into authoritative scope", () => {
  const next = applySubjectResolution(base, {
    status: "ambiguous",
    petId: null,
    petIds: [],
    candidatePetIds: ["pebble", "mochi"],
    candidateLabels: ["Pebble", "Mochi"],
    reasonCode: "ENTITY_AMBIGUOUS",
    requiresClarification: true,
    explicitSubject: true,
    confidence: 0,
  });

  assert.equal(next.subject.unresolved, true);
  assert.equal(next.subject.kind, "unresolved");
  assert.deepEqual(next.subject.petIds, []);
  assert.deepEqual(next.mutation, base.mutation, "subject ambiguity must not weaken or rewrite mutation authority");
});

test("non-pet discourse remains explicit without inventing pet authority", () => {
  const next = applySubjectResolution(base, {
    status: "contextual",
    petId: "pebble",
    petIds: [],
    reasonCode: null,
    requiresClarification: false,
    explicitSubject: true,
    confidence: 0.94,
    discourseFocus: { kind: "person", label: "my vet", pronouns: ["neutral"] },
  });

  assert.equal(next.subject.kind, "person");
  assert.equal(next.subject.label, "my vet");
  assert.deepEqual(next.subject.petIds, []);
  assert.equal(next.subject.unresolved, false);
});
