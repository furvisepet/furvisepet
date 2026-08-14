import assert from "node:assert/strict";
import test from "node:test";
import { normalizeKnownPreferenceMemory, planPreferenceSupersession, preferenceTargetIdentity } from "../app/lib/intelligence/preference-semantics.ts";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";
import { projectGovernedPreferencesToLegacyMemories } from "../app/lib/intelligence/v2/projections/legacy-memory.ts";
import { buildRememberedDetails } from "../app/lib/remembered-details.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";
import { extractProposedSemanticFrame } from "../app/lib/intelligence/semantic-frame/extract-frame.ts";
import { routePersistenceDestinations } from "../app/lib/intelligence/persistence-destination.ts";

const miloId = "951316a7-545d-4cf7-ac2e-82196d4d3ac6";
const lunaId = "b9ab9905-2788-485c-b908-0ac0c5582792";
const ownerId = "bd23dda6-b423-443a-9081-89b47955ca39";
const correction = "Actually, Milo doesn't like chicken. He prefers salmon.";

const learning = (overrides = {}) => ({
  subjectType: "pet", subjectId: miloId, category: "preference", factKey: "foodavoid",
  factValue: "chicken", canonicalConceptKey: null, sourceExcerpt: "Milo doesn't like chicken", ...overrides,
});
const stored = (id, overrides = {}) => ({
  id, subjectType: "pet", subjectId: miloId, factKey: "food_preference", factValue: "Milo likes chicken.", ...overrides,
});

test("heterogeneous legacy food preferences normalize to one deterministic target", () => {
  const shapes = [
    stored("prose"),
    stored("likes", { factKey: "likesfood", factValue: "chicken" }),
    stored("compact-live", { factKey: "foodprefer", factValue: "chicken" }),
    stored("compact", { factKey: "foodpreference", factValue: "chicken" }),
    stored("canonical", { factKey: "food_preference_chicken", factValue: { preference: "prefer", value: "chicken", conceptKey: "food_preference" } }),
  ].map((row) => normalizeKnownPreferenceMemory({ ...row, petName: "Milo" }));
  assert.equal(shapes.every(Boolean), true);
  assert.equal(new Set(shapes.map(preferenceTargetIdentity)).size, 1);
  assert.deepEqual(new Set(shapes.map((item) => item.polarity)), new Set(["prefer"]));
});

test("food and treat representations for the same object share one exact semantic target", () => {
  const shapes = [
    stored("treat-prose", { factKey: "treat_preference", factValue: "Milo likes beef treats." }),
    stored("food-canonical", { factKey: "food_preference_beef", factValue: { preference: "prefer", value: "beef" } }),
  ].map((row) => normalizeKnownPreferenceMemory({ ...row, petName: "Milo" }));
  assert.equal(shapes.every(Boolean), true);
  assert.equal(new Set(shapes.map(preferenceTargetIdentity)).size, 1);
});

test("live and historical compact avoidance aliases share one negative semantic identity", () => {
  const shapes = [
    learning({ factKey: "foodavoid" }),
    learning({ factKey: "foodavoidance" }),
  ].map((row) => normalizeKnownPreferenceMemory(row));
  assert.equal(shapes.every(Boolean), true);
  assert.equal(new Set(shapes.map(preferenceTargetIdentity)).size, 1);
  assert.deepEqual(new Set(shapes.map((item) => item.polarity)), new Set(["avoid"]));
});

test("correction supersedes only Milo's positive chicken representations", () => {
  const current = [
    learning(),
    learning({ factKey: "food_preference_salmon", factValue: { preference: "prefer", value: "salmon", conceptKey: "food_preference" }, canonicalConceptKey: "food_preference", sourceExcerpt: "He prefers salmon" }),
  ];
  const existing = [
    stored("milo-prose"),
    stored("milo-likes", { factKey: "likesfood", factValue: "chicken" }),
    stored("milo-compact-live", { factKey: "foodprefer", factValue: "chicken" }),
    stored("milo-compact", { factKey: "foodpreference", factValue: "chicken" }),
    stored("milo-qualified", { factKey: "food_preference_chicken", factValue: { preference: "prefer", value: "chicken", conceptKey: "food_preference" } }),
    stored("milo-governed", { factKey: "model-food-label", canonicalConceptKey: "food_preference", factValue: { preference: "prefer", value: "chicken", conceptKey: "food_preference" } }),
    stored("milo-treat", { factKey: "treat_preference", factValue: "Milo likes chicken treats." }),
    stored("milo-beef", { factKey: "likesfood", factValue: "beef" }),
    stored("luna-chicken", { subjectId: lunaId, factKey: "likesfood", factValue: "chicken" }),
  ];
  assert.deepEqual(planPreferenceSupersession(current, existing), [
    "milo-prose", "milo-likes", "milo-compact-live", "milo-compact", "milo-qualified", "milo-governed", "milo-treat",
  ]);
  assert.deepEqual(planPreferenceSupersession(current, existing), planPreferenceSupersession(current, existing));
});

test("previous preferred food is a historical replacement marker for persistence", () => {
  const current = [
    learning({ factKey: "previouspreferredfood", factValue: "salmon", subjectId: lunaId, sourceExcerpt: "Luna used to like salmon" }),
    learning({ factKey: "food_preference_tuna", factValue: { preference: "prefer", value: "tuna" }, subjectId: lunaId, sourceExcerpt: "now she prefers tuna" }),
  ];
  const existing = [stored("luna-salmon", { subjectId: lunaId, factKey: "food_preference_salmon", factValue: "salmon" })];
  assert.deepEqual(planPreferenceSupersession(current, existing), ["luna-salmon"]);
});

test("Remembered Details hides an active stale prose row behind the effective correction", () => {
  const details = buildRememberedDetails({ petName: "Milo", now: new Date("2026-08-12T20:00:00Z"), canonical: [
    memory("old-prose", { fact_key: "food_preference", fact_value: "Milo likes chicken.", last_confirmed_at: "2026-08-01T00:00:00Z" }),
    memory("beef", { fact_key: "likesfood", fact_value: "beef", last_confirmed_at: "2026-08-02T00:00:00Z" }),
    memory("negative", { fact_key: "dislikesfood", fact_value: "chicken", source_excerpt: "Milo doesn't like chicken", last_confirmed_at: "2026-08-12T00:00:00Z" }),
    memory("salmon", { fact_key: "food_preference_salmon", fact_value: { preference: "prefer", value: "salmon", conceptKey: "food_preference" }, source_excerpt: "He prefers salmon", last_confirmed_at: "2026-08-12T00:00:01Z" }),
  ] });
  assert.deepEqual(new Set(details.pet.map((item) => item.fact)), new Set([
    "Milo dislikes chicken.", "Milo prefers salmon.", "Milo prefers beef.",
  ]));
});

test("exact production sequence projects one negative chicken and one positive salmon detail", () => {
  const initial = [
    memory("turn-1-chicken", {
      fact_key: "food_preference_chicken",
      fact_value: { preference: "prefer", value: "chicken", conceptKey: "food_preference" },
      last_confirmed_at: "2026-08-11T00:00:00Z",
    }),
  ];
  const before = buildRememberedDetails({ petName: "Milo", now: new Date("2026-08-12T20:00:00Z"), canonical: initial });
  assert.deepEqual(before.pet.map((item) => item.fact), ["Milo prefers chicken."]);

  const afterRows = [
    ...initial,
    memory("turn-2-avoid-live", {
      fact_key: "foodavoid", fact_value: "chicken", source_excerpt: "Milo doesn't like chicken",
      last_confirmed_at: "2026-08-12T00:00:00Z",
    }),
    memory("turn-2-avoidance-compat", {
      fact_key: "foodavoidance", fact_value: "chicken", source_excerpt: "Milo doesn't like chicken",
      last_confirmed_at: "2026-08-12T00:00:01Z",
    }),
    memory("turn-2-salmon-live", {
      fact_key: "foodprefer", fact_value: "salmon", source_excerpt: "He prefers salmon",
      last_confirmed_at: "2026-08-12T00:00:02Z",
    }),
    memory("turn-2-salmon-compat", {
      fact_key: "foodpreference", fact_value: "salmon", source_excerpt: "He prefers salmon",
      last_confirmed_at: "2026-08-12T00:00:03Z",
    }),
    memory("turn-2-salmon-canonical", {
      fact_key: "food_preference_salmon",
      fact_value: { preference: "prefer", value: "salmon", conceptKey: "food_preference" },
      source_excerpt: "He prefers salmon", last_confirmed_at: "2026-08-12T00:00:04Z",
    }),
  ];
  const after = buildRememberedDetails({ petName: "Milo", now: new Date("2026-08-12T20:00:00Z"), canonical: afterRows });
  assert.deepEqual(new Set(after.pet.map((item) => item.fact)), new Set(["Milo dislikes chicken.", "Milo prefers salmon."]));
  assert.equal(after.pet.length, 2);
});

test("beef treat correction projects negative beef and human-readable turkey only", () => {
  const details = buildRememberedDetails({ petName: "Milo", now: new Date("2026-08-12T20:00:00Z"), canonical: [
    memory("old-beef-treat", {
      fact_key: "treat_preference", fact_value: "Milo likes beef treats.",
      last_confirmed_at: "2026-08-11T00:00:00Z",
    }),
    memory("beef-avoid", {
      fact_key: "food_preference_beef", fact_value: { preference: "avoid", value: "beef" },
      source_excerpt: "Milo doesn't like beef anymore", last_confirmed_at: "2026-08-12T00:00:00Z",
    }),
    memory("turkey", {
      fact_key: "food_preference_turkey", fact_value: "He prefers turkey",
      source_excerpt: "He prefers turkey", last_confirmed_at: "2026-08-12T00:00:01Z",
    }),
  ] });
  assert.deepEqual(details.pet.map((item) => item.fact).sort(), ["Milo dislikes beef.", "Milo prefers turkey."].sort());
  assert.equal(details.pet.some((item) => /prefers he prefers|prefers beef/i.test(item.fact)), false);
});

test("used-to replacement keeps salmon historical and projects tuna as current", () => {
  const details = buildRememberedDetails({ petName: "Luna", now: new Date("2026-08-12T20:00:00Z"), canonical: [
    memory("old-salmon", { pet_id: lunaId, fact_key: "food_preference_salmon", fact_value: "salmon", last_confirmed_at: "2026-08-11T00:00:00Z" }),
    memory("previous-salmon", { pet_id: lunaId, fact_key: "previouspreferredfood", fact_value: "salmon", source_excerpt: "Luna used to like salmon", last_confirmed_at: "2026-08-12T00:00:00Z" }),
    memory("preferred-tuna", { pet_id: lunaId, fact_key: "preferredfood", fact_value: "tuna", source_excerpt: "now she prefers tuna", last_confirmed_at: "2026-08-12T00:00:01Z" }),
    memory("canonical-tuna", { pet_id: lunaId, fact_key: "food_preference_tuna", fact_value: { preference: "prefer", value: "tuna" }, source_excerpt: "Luna used to like salmon but now she prefers tuna", last_confirmed_at: "2026-08-12T00:00:02Z" }),
  ] });
  assert.deepEqual(details.pet.map((item) => item.fact), ["Luna prefers tuna."]);
});

test("one governed correction turn projects both independently grounded preference facts", () => {
  const governed = governSemanticTurnV2({
    frame: correctionFrame(), sourceMessage: correction, sourceMessageId: "20000000-0000-4000-8000-000000000001",
    ownerId, pets: [{ id: miloId, name: "Milo", species: "dog", age_value: 4, age_unit: "years" }],
    canonicalConcepts: [{ key: "food_preference", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false }],
  });
  const projected = projectGovernedPreferencesToLegacyMemories(governed);
  const routed = routePersistenceDestinations({ message: correction, petId: miloId, learnings: projected, careActions: [] });
  assert.equal(governed.rejectedClaims.length, 0);
  assert.deepEqual(projected.map((item) => item.factValue), [
    { preference: "avoid", value: "chicken", conceptKey: "food_preference" },
    { preference: "prefer", value: "salmon", conceptKey: "food_preference" },
  ]);
  assert.deepEqual(projected.map((item) => item.subjectId), [miloId, miloId]);
  assert.deepEqual(routed.learnings, projected);
  assert.equal(new Set(projected.map((item) => item.factKey)).size, 2);
  assert.deepEqual(projectGovernedPreferencesToLegacyMemories(governed), projected);
});

test("assertion-shaped correction facts require registry authority and still project both outputs", () => {
  const proposed = correctionFrame();
  proposed.claims = proposed.claims.map((claim) => {
    const object = claim.object;
    const declaredPreference = claim.preference;
    const common = { ...claim };
    delete common.object;
    delete common.constraints;
    delete common.preference;
    return {
      ...common, kind: "assertion", value: object.value, unit: null, durability: "ongoing",
      polarity: declaredPreference === "avoid" ? "negated" : "affirmed",
    };
  });
  const input = {
    frame: proposed, sourceMessage: correction, sourceMessageId: "20000000-0000-4000-8000-000000000002",
    ownerId, pets: [{ id: miloId, name: "Milo", species: "dog", age_value: 4, age_unit: "years" }],
  };
  assert.ok(extractProposedSemanticFrame(proposed));
  const withoutRegistry = governSemanticTurnV2(input);
  const governed = governSemanticTurnV2({
    ...input,
    canonicalConcepts: [{
      key: "food_preference", version: "furvise.core.v1", conceptKind: "preference", lifecycleCapable: false,
      semanticRole: "food_preference", selectionAuthority: "semantic_signature",
    }],
  });
  assert.equal(projectGovernedPreferencesToLegacyMemories(withoutRegistry).length, 0);
  assert.deepEqual(projectGovernedPreferencesToLegacyMemories(governed).map((item) => item.factValue), [
    { preference: "avoid", value: "chicken", conceptKey: "food_preference" },
    { preference: "prefer", value: "salmon", conceptKey: "food_preference" },
  ]);
});

function memory(id, overrides = {}) {
  return {
    id, user_id: ownerId, pet_id: miloId, subject_type: "pet", category: "preference", fact_key: "likesfood",
    fact_value: "chicken", normalized_value: "chicken", confidence: 0.98, importance: "medium", durability: "ongoing",
    status: "active", source_type: "ask_message", source_id: `source-${id}`, source_excerpt: "Milo likes chicken",
    first_observed_at: "2026-08-01T00:00:00Z", last_confirmed_at: "2026-08-01T00:00:00Z", superseded_by: null,
    created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", observed_at: "2026-08-01T00:00:00Z",
    expires_at: "2027-08-01T00:00:00Z", freshness_class: "medium_lived", base_confidence: 0.98,
    current_confidence: 0.98, decay_policy: "linear", confirmation_required_after: "2026-12-01T00:00:00Z",
    stale_at: "2026-12-01T00:00:00Z", ...overrides,
  };
}

function correctionFrame() {
  const concept = { label: "food preference", definition: null, aliases: [], parentLabels: [], relatedLabels: [] };
  const base = (localId, evidence) => ({
    localId, kind: "preference", subjectRef: "milo", predicate: concept, polarity: "affirmed", modality: "asserted",
    temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
    uncertainty: { confidence: 0.99, reasons: [] }, evidence: [{ surfaceText: evidence }], persistenceHint: "pet_memory",
    object: { concept, value: localId === "negative" ? "chicken" : "salmon" }, constraints: [],
  });
  return {
    schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_correction",
    discourseActs: [{ kind: "correction", confidence: 0.99 }],
    mentions: [{ localId: "milo", surface: "Milo", coarseType: "animal", attributes: { species: "dog", lifeStage: null, ownership: "owner" }, evidence: [{ surfaceText: "Milo" }], confidence: 0.99 }],
    references: [],
    claims: [
      { ...base("negative", "Milo doesn't like chicken"), preference: "avoid" },
      { ...base("replacement", "He prefers salmon"), preference: "prefer" },
    ],
    uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] },
  };
}
