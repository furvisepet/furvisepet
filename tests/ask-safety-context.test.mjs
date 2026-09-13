import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecentAskUpdates,
  evaluateAskSafetyContext,
  isHistoricalSafetyRelevantToTurn,
  getPetReferenceGuidance,
  removeUnsupportedGenderedPronouns,
} from "../app/lib/ask-safety-context.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const baseTime = new Date("2026-07-28T02:00:00Z");

function entry(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    user_id: "user-1",
    pet_profile_id: "pet-mani",
    category: "general",
    title: "Care update",
    note: "A useful note",
    severity: null,
    occurred_at: "2026-07-27T22:00:00Z",
    created_at: "2026-07-27T22:01:00Z",
    updated_at: "2026-07-27T22:01:00Z",
    ...overrides,
  };
}

function semanticFrame({ claims = [], mentions = [], question = false } = {}) {
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION,
    frameLocalId: "frame_1",
    discourseActs: [{ kind: question ? "question" : "statement", confidence: 0.99 }],
    mentions,
    references: [],
    claims,
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}

function conceptClaim(label, kind = "event") {
  const common = {
    localId: "claim_1", kind, subjectRef: "luna", predicate: { label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] },
    polarity: "affirmed", modality: "asserted", temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
    uncertainty: { confidence: 0.98, reasons: [] }, evidence: [{ surfaceText: label }], persistenceHint: "none",
  };
  return kind === "preference"
    ? { ...common, preference: "prefer", object: { concept: common.predicate, value: label }, constraints: [] }
    : { ...common, participants: [{ role: "subject", entityRef: "luna" }], lifecycle: { phase: "observed", boundedInMessage: true, resultingState: "active" } };
}

const lunaMention = { localId: "luna", surface: "Luna", coarseType: "animal", attributes: { species: "dog", lifeStage: null, ownership: "owner" }, evidence: [{ surfaceText: "Luna" }], confidence: 0.99 };

test("historical urgent state requires current semantic relevance or new safety evidence", () => {
  const activeConcerns = [{ normalized_key: "vomiting" }];
  for (const message of ["I prefer shopping at Chewy.", "Luna likes chicken.", "Good morning.", "My sister helps take care of Luna."]) {
    assert.equal(isHistoricalSafetyRelevantToTurn({
      activeConcerns, concernStateHint: "unrelated", currentMessage: message,
      frame: semanticFrame({ claims: message.includes("prefer") ? [conceptClaim("preferred retailer", "preference")] : [], mentions: message.includes("Luna") ? [lunaMention] : [] }),
    }), false, message);
  }
  assert.equal(isHistoricalSafetyRelevantToTurn({ activeConcerns, currentMessage: "Luna vomited again.", frame: semanticFrame({ claims: [conceptClaim("vomiting")], mentions: [lunaMention] }) }), true);
  assert.equal(isHistoricalSafetyRelevantToTurn({ activeConcerns, currentMessage: "She can't keep water down.", frame: semanticFrame() }), true);
  assert.equal(isHistoricalSafetyRelevantToTurn({ activeConcerns, concernStateHint: "still_active", currentMessage: "What should I do about her vomiting?", frame: semanticFrame() }), true);
  assert.equal(isHistoricalSafetyRelevantToTurn({ activeConcerns, currentMessage: "Is Luna okay?", frame: semanticFrame({ mentions: [lunaMention], question: true }) }), true);
});

test("Mani receives neutral references when no sex or pronouns are saved", () => {
  const reference = getPetReferenceGuidance({ name: "Mani", species: "cat" });
  assert.equal(reference.allowsGenderedPronouns, false);
  assert.match(reference.instruction, /Mani, your cat, or neutral they wording/);
  const sanitized = removeUnsupportedGenderedPronouns("She should rest and her food can wait.", "Mani");
  assert.doesNotMatch(sanitized, /\b(?:he|she|him|her|his|hers)\b/i);
  assert.match(sanitized, /Mani/);
});

test("explicit saved female identity permits consistent she and her references", () => {
  const bySex = getPetReferenceGuidance({ name: "Mani", sex: "female", species: "cat" });
  const byPronouns = getPetReferenceGuidance({ name: "Mani", pronouns: "she/her", species: "cat" });
  assert.equal(bySex.allowsGenderedPronouns, true);
  assert.equal(byPronouns.allowsGenderedPronouns, true);
  assert.match(byPronouns.instruction, /Use she and her consistently/);
});

test("a recent unresolved breathing update outranks a feeding question", () => {
  const updates = buildRecentAskUpdates([
    entry({
      category: "symptom",
      title: "Shortage of breath",
      note: "Ran around the house and is now very tired and taking deep breaths",
      severity: "mild",
      occurred_at: "2026-07-28T01:45:00Z",
      created_at: "2026-07-28T01:46:00Z",
    }),
  ], baseTime);
  const safety = evaluateAskSafetyContext({ currentMessage: "Should I feed my cat now?", recentUpdates: updates });
  assert.deepEqual(safety.activeConcernTags, ["breathing_difficulty", "extreme_lethargy"]);
  assert.equal(safety.safetyLevel, "urgent");
});

test("a later breathing-normal update resolves the earlier breathing concern", () => {
  const updates = buildRecentAskUpdates([
    entry({ title: "Shortage of breath", category: "symptom", note: "Very tired and taking deep breaths", occurred_at: "2026-07-28T01:30:00Z" }),
    entry({ title: "Back to normal", category: "symptom", note: "Breathing returned to normal after resting.", occurred_at: "2026-07-28T01:50:00Z", created_at: "2026-07-28T01:51:00Z" }),
  ], baseTime);
  const safety = evaluateAskSafetyContext({ currentMessage: "Should I feed my cat now?", recentUpdates: updates });
  assert.equal(updates.find((update) => update.title === "Shortage of breath")?.active, false);
  assert.equal(safety.safetyLevel, "normal");
});

test("a mild unrelated nail trim does not hijack a feeding question", () => {
  const updates = buildRecentAskUpdates([
    entry({ title: "Nail trim completed", category: "grooming", note: "Trim went normally", severity: "mild" }),
  ], baseTime);
  const safety = evaluateAskSafetyContext({ currentMessage: "Should I feed my cat now?", recentUpdates: updates });
  assert.deepEqual(safety.activeConcernTags, []);
  assert.equal(safety.safetyLevel, "normal");
});

test("authoritative resolved concern state prevents old urgent history from reactivating tags", () => {
  const updates = buildRecentAskUpdates([
    entry({ title: "Shortage of breath", category: "symptom", note: "Very tired and taking deep breaths" }),
  ], baseTime);
  const safety = evaluateAskSafetyContext({
    authoritativeActiveConcernTags: [],
    currentMessage: "How was your day?",
    recentUpdates: updates,
  });
  assert.deepEqual(safety.activeConcernTags, []);
  assert.equal(safety.safetyLevel, "normal");
});

test("new updates are included immediately in server context construction", () => {
  const prior = entry({ id: "prior", title: "Earlier note", occurred_at: "2026-07-27T20:00:00Z" });
  const fresh = entry({ id: "fresh", title: "New symptom", category: "symptom", note: "Open-mouth breathing", occurred_at: "2026-07-28T01:59:00Z", created_at: "2026-07-28T01:59:30Z" });
  const before = buildRecentAskUpdates([prior], baseTime);
  const after = buildRecentAskUpdates([prior, fresh], baseTime);
  assert.equal(before.some((update) => update.title === "New symptom"), false);
  assert.equal(after[0].title, "New symptom");
  assert.equal(after[0].active, true);
});

test("occurred_at controls update order even when created_at is older", () => {
  const updates = buildRecentAskUpdates([
    entry({ title: "Created later", occurred_at: "2026-07-27T20:00:00Z", created_at: "2026-07-28T01:59:00Z" }),
    entry({ title: "Occurred later", occurred_at: "2026-07-28T01:30:00Z", created_at: "2026-07-27T19:00:00Z" }),
  ], baseTime);
  assert.equal(updates[0].title, "Occurred later");
});

test("recent context keeps the full 30-day window when it exceeds ten updates", () => {
  const entries = Array.from({ length: 14 }, (_, index) => entry({
    id: `entry-${index}`,
    title: `Update ${index}`,
    occurred_at: new Date(baseTime.getTime() - index * 24 * 60 * 60 * 1000).toISOString(),
  }));
  const updates = buildRecentAskUpdates(entries, baseTime);
  assert.equal(updates.length, 14);
  assert.equal(updates[0].title, "Update 0");
});
