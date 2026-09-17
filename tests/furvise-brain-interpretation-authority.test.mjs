import assert from "node:assert/strict";
import test from "node:test";

import { applyAskInterpretation } from "../app/lib/furvise-brain/interpretation-authority.ts";
import {
  createFurviseTurnAuthority,
  grantFurviseMutationAuthority,
} from "../app/lib/furvise-brain/turn-authority.ts";

const request = (overrides = {}) => ({
  version: "ask-request.v2",
  mode: "read",
  question: "What happened with Pebble yesterday?",
  requirements: [],
  mutationIntent: null,
  recordSelection: null,
  projection: null,
  profileFields: [],
  temporalScope: "historical",
  evidenceNeeds: [],
  evidenceBasis: "saved_history",
  outputFormat: null,
  referenceTurnIds: [],
  quantity: null,
  scope: "selected",
  petNames: ["Pebble"],
  operation: "recall",
  selection: "summary",
  topic: "history",
  terms: [],
  from: "2026-09-15T00:00:00.000Z",
  to: "2026-09-16T00:00:00.000Z",
  episodeTopic: null,
  ordinal: null,
  task: null,
  ...overrides,
});

test("interpretation may choose reasoning and memory fields but not subject authority", () => {
  const turn = createFurviseTurnAuthority({
    logicalTurnId: "turn",
    subject: { petIds: ["pebble"], source: "selected_pet", unresolved: false },
  });
  const next = applyAskInterpretation(turn, request());
  assert.equal(next.intent, "question");
  assert.equal(next.memoryNeed, "targeted");
  assert.deepEqual(next.subject, turn.subject);
  assert.deepEqual(next.mutation, turn.mutation);
});

test("even an update-looking interpretation cannot open mutation authority", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: "turn" });
  const next = applyAskInterpretation(turn, request({
    mode: "mixed",
    mutationIntent: "correct_record",
    evidenceBasis: "saved_history",
  }));
  assert.equal(next.intent, "correct");
  assert.equal(next.mutation.allowed, false);
  assert.equal(next.mutation.userAuthorizationVerified, false);
});

test("interpretation cannot erase an already verified action capability", () => {
  const authorized = grantFurviseMutationAuthority(
    createFurviseTurnAuthority({ logicalTurnId: "turn" }),
    {
      kind: "record_care",
      userAuthorizationVerified: true,
      authorizationSource: "current_turn",
      authorizationTurnId: "turn",
    },
  );
  const next = applyAskInterpretation(authorized, request({ mode: "conversation", evidenceBasis: "general" }));
  assert.deepEqual(next.mutation, authorized.mutation);
});

test("unbounded lifetime wording selects lifetime memory without changing permissions", () => {
  const turn = createFurviseTurnAuthority({ logicalTurnId: "turn" });
  const next = applyAskInterpretation(turn, request({
    question: "Has Pebble ever had this across his entire lifetime?",
    from: null,
    to: null,
  }));
  assert.equal(next.memoryNeed, "lifetime");
  assert.equal(next.mutation.allowed, false);
});
