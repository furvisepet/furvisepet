import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  areMemorySemanticsEquivalent,
  canonicalMemoryIdentifier,
  invalidLegacyMemoryReason,
  invalidStoredMemoryReason,
  isEligibleLegacyMemory,
  isEligibleStoredMemory,
  normalizeMemoryIdentifier,
  prepareTypedMemoryCandidate,
  supportedPreferenceDecision,
} from "../app/lib/intelligence/memory-integrity.ts";
import { evaluateLearningPolicy } from "../app/lib/intelligence/memory-policy.ts";
import { selectFreshRelevantMemories } from "../app/lib/intelligence/memory-freshness/select-fresh-memories.ts";
import { buildRememberedDetails } from "../app/lib/remembered-details.ts";

const petId = "380211f7-4b9a-4690-ad68-35b141ec14a6";
const ownerId = "bd23dda6-b423-443a-9081-89b47955ca39";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function learning(overrides = {}) {
  return {
    subjectType: "pet", subjectId: petId, category: "behavior", factKey: "touch_sensitivity",
    factValue: "sometimes flinches when approached quickly", confidence: 0.96, importance: "high",
    durability: "ongoing", action: "create", sourceExcerpt: "sometimes flinches when approached quickly",
    ...overrides,
  };
}

function memory(overrides = {}) {
  return {
    id: "715e0cee-4cc1-4ca5-acc5-d9c7522b6965", user_id: ownerId, pet_id: petId,
    subject_type: "pet", category: "behavior", fact_key: "touchsensitivity",
    fact_value: "sometimes flinches when approached quickly", normalized_value: "sometimes flinches when approached quickly",
    confidence: 0.95, importance: "high", durability: "ongoing", status: "active", source_type: "ask_message",
    source_id: "2c262446-bada-4f47-8f93-475b07b8e07f", source_excerpt: "she sometimes flinches when I approach quickly",
    first_observed_at: "2026-08-20T00:11:41.776Z", last_confirmed_at: "2026-08-20T00:11:41.776Z",
    superseded_by: null, created_at: "2026-08-20T00:11:41.776Z", updated_at: "2026-08-20T00:11:41.776Z",
    freshness_class: "long_lived", current_confidence: 0.95,
    ...overrides,
  };
}

test("BOOLEAN_NEVER_SERIALIZES_AS_MEMORY", () => {
  for (const value of [true, false, null, undefined, 1, 0, ["behavior"], { behavior_change: true }]) {
    const decision = prepareTypedMemoryCandidate(learning({ factValue: value }), "sometimes flinches when approached quickly", [petId]);
    assert.equal(decision.accepted, false, `unexpected acceptance for ${String(value)}`);
  }
  for (const value of ["true", "false", "yes", "no", "42", petId, '{"behavior_change":true}']) {
    const decision = prepareTypedMemoryCandidate(learning({ factValue: value }), "sometimes flinches when approached quickly", [petId]);
    assert.equal(decision.accepted, false, `unexpected acceptance for ${value}`);
  }
});

test("PET_LIFECYCLE_STATE_NOT_STORED_AS_MEMORY", () => {
  const cases = [
    learning({ category: "lifecycle", factKey: "lifecycleStatus", factValue: "active", sourceExcerpt: "She is active." }),
    learning({ category: "lifecycle", factKey: "deathReported", factValue: "is deceased", sourceExcerpt: "She is deceased." }),
    learning({ category: "profile", factKey: "species", factValue: "is a cat", sourceExcerpt: "She is a cat." }),
  ];
  for (const item of cases) assert.equal(prepareTypedMemoryCandidate(item, item.sourceExcerpt, [petId]).accepted, false);
});

test("TEMPORARY_STATE_NEVER_BECOMES_MEMORY", () => {
  for (const factKey of ["hasBehaviorChange", "requiresFollowup", "selectedPet", "routeType", "confirmationState"]) {
    const item = learning({ factKey, factValue: "is enabled", sourceExcerpt: "is enabled" });
    assert.equal(prepareTypedMemoryCandidate(item, "is enabled", [petId]).accepted, false);
  }
});

test("case-first identifier normalization preserves letters and classifies equivalent machine keys", () => {
  assert.equal(normalizeMemoryIdentifier("selectedPet"), "selectedpet");
  assert.equal(normalizeMemoryIdentifier("SELECTED_PET"), "selected_pet");
  assert.equal(canonicalMemoryIdentifier("selected pet"), "selectedpet");
  assert.equal(canonicalMemoryIdentifier("selected-pet"), "selectedpet");

  for (const factKey of [
    "selectedPet", "selected_pet", "selected-pet", "SELECTED_PET", "SelectedPet", "selected pet",
    "requiresFollowup", "lifecycleStatus", "deathReported", "hasBehaviorChange", "routeType", "safetyLevel",
  ]) {
    const item = learning({ factKey, factValue: `${factKey}=true`, sourceExcerpt: `${factKey}=true` });
    assert.equal(prepareTypedMemoryCandidate(item, item.sourceExcerpt, [petId]).accepted, false, factKey);
  }
});

test("lossy historical machine-key aliases fail closed without banning valid camelCase semantics", () => {
  for (const factKey of ["selected_et", "requires_ollowup", "lifecycle_tatus", "death_eported", "has_ehavior_hange", "route_ype", "safety_evel"]) {
    const stored = memory({ fact_key: factKey, fact_value: `${factKey}=true`, normalized_value: `${factKey}=true` });
    assert.equal(isEligibleStoredMemory(stored), false, factKey);
    assert.match(invalidStoredMemoryReason(stored), /(?:machine_state|authoritative_state)_is_not_memory/, factKey);
  }

  for (const [factKey, factValue, sourceExcerpt] of [
    ["approachSensitivity", "sometimes flinches when approached quickly", "sometimes flinches when approached quickly"],
    ["foodPreference", "usually prefers salmon wet food", "usually prefers salmon wet food"],
    ["sleepRoutine", "usually sleeps in the crate at night", "usually sleeps in the crate at night"],
  ]) {
    const item = learning({ category: factKey === "sleepRoutine" ? "routine" : "behavior", factKey, factValue, sourceExcerpt });
    assert.equal(prepareTypedMemoryCandidate(item, sourceExcerpt, [petId]).accepted, true, factKey);
  }
});

test("machine assignments cannot be serialized as human memory prose", () => {
  for (const factValue of ["selectedPet=true", "requiresFollowup=false", "lifecycleStatus=active", "deathReported: confirmed"]) {
    const item = learning({ factKey: "conversation_observation", factValue, sourceExcerpt: factValue });
    assert.deepEqual(prepareTypedMemoryCandidate(item, factValue, [petId]), { accepted: false, reason: "non_semantic_machine_value" });
  }
});

test("valid owner-reported behavior is typed and uncertainty is preserved", () => {
  const message = "She sometimes flinches when I approach quickly.";
  const decision = prepareTypedMemoryCandidate(learning({ sourceExcerpt: "sometimes flinches when I approach quickly" }), message, [petId]);
  assert.equal(decision.accepted, true);
  assert.equal(decision.candidate.scope, "pet");
  assert.equal(decision.candidate.kind, "behavior");
  assert.equal(decision.candidate.provenance, "owner_reported");
  assert.match(decision.candidate.content, /sometimes/);
  const strengthened = prepareTypedMemoryCandidate(learning({ factValue: "flinches when approached quickly", sourceExcerpt: "sometimes flinches when I approach quickly" }), message, [petId]);
  assert.deepEqual(strengthened, { accepted: false, reason: "owner_uncertainty_not_preserved" });
});

test("explicit remember intent accepts a durable semantic proposition while routine sleep is low value", () => {
  const remembered = learning({ factKey: "travel_sensitivity", factValue: "gets carsick", sourceExcerpt: "she gets carsick" });
  const accepted = prepareTypedMemoryCandidate(remembered, "Remember that she gets carsick.", [petId]);
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.candidate.provenance, "explicit_remember_request");

  const sleep = learning({ category: "routine", factKey: "sleeping_arrangement", factValue: "always sleeps on my pillow", sourceExcerpt: "She always sleeps on my pillow" });
  assert.equal(prepareTypedMemoryCandidate(sleep, "She always sleeps on my pillow.", [petId]).accepted, false);
  assert.equal(prepareTypedMemoryCandidate(sleep, "Remember that she always sleeps on my pillow.", [petId]).accepted, true);
});

test("model boolean leakage is rejected by the shared learning policy", () => {
  const result = evaluateLearningPolicy([
    learning({ factKey: "bedAvoidance", factValue: true, sourceExcerpt: "she won't sleep on the bed anymore" }),
  ], "she won't sleep on the bed anymore", [petId]);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected[0].reason, "boolean_value");
});

test("ORIGINAL_SEMANTIC_DOMAIN_VALIDATED_BEFORE_PREFERENCE_ROUTING", () => {
  for (const item of [
    learning({ subjectType: "owner", subjectId: null, category: "medical_condition", factKey: "communication_style", factValue: "I have diabetes", sourceExcerpt: "I have diabetes" }),
    learning({ subjectType: "owner", subjectId: null, category: "behavior", factKey: "preferred_language", factValue: "hides from visitors", sourceExcerpt: "hides from visitors" }),
    learning({ subjectType: "owner", subjectId: null, category: "lifecycle", factKey: "preferred_units", factValue: "active", sourceExcerpt: "active" }),
  ]) {
    const result = evaluateLearningPolicy([item], item.sourceExcerpt, [petId]);
    assert.equal(result.accepted.length, 0);
    assert.match(result.rejected[0].reason, /(?:preference_domain_mismatch|authoritative_state_is_not_memory)/);
  }
});

test("typed preference contract preserves explicit supported preferences", () => {
  const cases = [
    ["communication_style", "concise", "Please answer more concisely."],
    ["preferred_units", "metric", "Use metric units."],
    ["preferred_language", "French", "Answer me in French."],
    ["communication_style", "short answers", "Remember that I prefer short answers."],
  ];
  for (const [factKey, factValue, message] of cases) {
    const item = learning({ subjectType: "owner", subjectId: null, category: "communication_preference", factKey, factValue, sourceExcerpt: message });
    const result = evaluateLearningPolicy([item], message, [petId]);
    assert.equal(result.accepted.length, 1, `${factKey}: ${result.rejected[0]?.reason || "rejected"}`);
    assert.equal(result.accepted[0].subjectType, "owner");
    assert.equal(result.accepted[0].factKey, factKey);
  }
});

test("preference contract rejects structured, identifier, and unrelated values", () => {
  for (const [factKey, factValue, message] of [
    ["communication_style", '{"tone":"concise"}', "Use this communication style."],
    ["communication_style", petId, `Use ${petId} as my communication style.`],
    ["communication_style", "I have diabetes", "I have diabetes"],
    ["preferred_language", "hides from visitors", "She hides from visitors"],
    ["preferred_units", "active", "She is active"],
  ]) {
    const decision = supportedPreferenceDecision({
      category: "communication_preference", factKey, factValue, sourceExcerpt: message,
      currentMessage: message, subjectType: "owner",
    });
    assert.equal(decision.accepted, false, `${factKey}=${factValue}`);
  }
});

test("stored invalid rows never enter reasoning context or Remembered Details", () => {
  const invalid = [
    memory({ id: "death", category: "lifecycle", fact_key: "deathreported", fact_value: true, normalized_value: "true" }),
    memory({ id: "active", category: "lifecycle", fact_key: "lifecyclestatus", fact_value: "active", normalized_value: '"active"' }),
    memory({ id: "bed", fact_key: "bedavoidance", fact_value: true, normalized_value: "true" }),
  ];
  assert.deepEqual(invalid.map(invalidStoredMemoryReason), ["authoritative_state_is_not_memory", "authoritative_state_is_not_memory", "boolean_value"]);
  assert.equal(invalid.every((item) => !isEligibleStoredMemory(item)), true);
  assert.deepEqual(selectFreshRelevantMemories([...invalid, memory()], "Why does she flinch?", new Date("2026-08-20T01:00:00Z")).map((item) => item.memory.id), [memory().id]);
  const details = buildRememberedDetails({ canonical: [...invalid, memory()], petName: "Mani", now: new Date("2026-08-20T01:00:00Z") });
  assert.deepEqual(details.pet.map((item) => item.fact), ["Sometimes flinches when approached quickly."]);
  assert.equal(details.all.some((item) => /Mani:\s*(?:true|active)/i.test(item.fact)), false);
});

test("legacy machine and lifecycle values are excluded while semantic details remain", () => {
  for (const row of [
    { type: "behavior", text: "true" },
    { type: "lifecycle", text: "Mani is active" },
    { type: "behavior", text: petId },
    { type: "behavior", text: '{"hasBehaviorChange":true}' },
  ]) assert.equal(isEligibleLegacyMemory(row), false);
  assert.equal(invalidLegacyMemoryReason({ type: "lifecycle", text: "Mani is active" }), "authoritative_state_is_not_memory");
  for (const type of [
    "selectedPet", "selected_pet", "selected-pet", "SELECTED_PET", "SelectedPet", "selected pet",
    "requiresFollowup", "lifecycleStatus", "deathReported", "hasBehaviorChange", "routeType", "safetyLevel",
    "selected_et", "requires_ollowup", "lifecycle_tatus",
  ]) assert.notEqual(invalidLegacyMemoryReason({ type, text: "is enabled" }), null, type);
  assert.equal(invalidLegacyMemoryReason({ type: "approachSensitivity", text: "Sometimes flinches when approached quickly." }), null);
  assert.equal(invalidLegacyMemoryReason({ type: "foodPreference", text: "Usually prefers salmon wet food." }), null);
  assert.equal(invalidLegacyMemoryReason({ type: "sleepRoutine", text: "Usually sleeps in the crate at night." }), null);
  assert.equal(isEligibleLegacyMemory({ type: "behavior", text: "Mani gets nervous around the vacuum." }), true);
});

test("bounded semantic deduplication merges equivalent memories but preserves distinct facts", () => {
  const first = memory({ fact_key: "touch_sensitivity", fact_value: "flinches when approached quickly" });
  const equivalent = memory({ fact_key: "approach_reaction", fact_value: "gets startled when someone approaches too fast" });
  const distinct = memory({ fact_key: "vacuum_fear", fact_value: "hides when the vacuum runs" });
  assert.equal(areMemorySemanticsEquivalent(first, equivalent), true);
  assert.equal(areMemorySemanticsEquivalent(first, distinct), false);
});

test("MEMORY_SCOPE_MUST_MATCH_AUTHORITATIVE_OWNER_OR_PET", () => {
  const wrongPet = learning({ subjectId: "11111111-1111-4111-8111-111111111111" });
  assert.equal(prepareTypedMemoryCandidate(wrongPet, wrongPet.sourceExcerpt, [petId]).accepted, false);
  const missingInMultiPet = learning({ subjectId: null });
  assert.equal(prepareTypedMemoryCandidate(missingInMultiPet, missingInMultiPet.sourceExcerpt, [petId, "22222222-2222-4222-8222-222222222222"]).accepted, false);
});

test("edit and forget endpoints preserve ownership and cannot mutate profile/lifecycle state", () => {
  const route = read("app/api/memories/[id]/route.ts");
  assert.match(route, /eq\("id", id\)\.eq\("user_id", auth\.userId\)/);
  assert.match(route, /action !== "forget" && !isEligibleStoredMemory/);
  assert.match(route, /prepareTypedMemoryCandidate/);
  assert.doesNotMatch(route, /dog_profiles[^;]*(?:update|delete)/);
});

test("database boundary rejects machine state and removes direct identity/content writes", () => {
  const migration = read("supabase/migrations/20260820010000_enforce_furvise_memory_semantic_integrity.sql");
  assert.match(migration, /normalize_furvise_memory_identifier\(p_value text\)[\s\S]*regexp_replace\(lower\(coalesce\(p_value, ''\)\), '\[\^a-z0-9\]\+'/);
  assert.equal((migration.match(/v_fact_key := lower\(regexp_replace\(coalesce\(v_learning->>'factKey'/g) || []).length, 1,
    "the unsafe RPC expression should remain only as the guarded rewrite source literal");
  assert.doesNotMatch(migration, /v_(?:category|key|type) text := lower\(regexp_replace/);
  assert.match(migration, /persist_furvise_intelligence\(uuid,uuid,jsonb,jsonb\)/);
  assert.match(migration, /drop function public\.persist_furvise_feature_intelligence\(uuid, text, uuid, jsonb, jsonb\)/);
  assert.match(migration, /persist_furvise_feature_intelligence\(uuid, uuid, text, text, uuid, text, uuid, text, jsonb, jsonb\)/);
  assert.match(migration, /v_new_assignment constant text := [\s\S]*normalize_furvise_memory_identifier/);
  assert.match(migration, /MEMORY_IDENTIFIER_NORMALIZATION_GUARD_UNEXPECTED/);
  assert.match(migration, /'selectedPet', 'selected_pet', 'selected-pet', 'SELECTED_PET', 'SelectedPet', 'selected pet'/);
  assert.match(migration, /'approachSensitivity', 'foodPreference', 'sleepRoutine'/);
  assert.match(migration, /jsonb_typeof\(new\.fact_value\) <> 'string'/);
  assert.match(migration, /MEMORY_AUTHORITATIVE_STATE_FORBIDDEN/);
  assert.match(migration, /MEMORY_MACHINE_VALUE_FORBIDDEN/);
  assert.match(migration, /source_message\.user_id = new\.user_id/);
  assert.match(migration, /source_message\.role = 'user'/);
  assert.match(migration, /revoke all privileges on table public\.furvise_memories from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.furvise_memories to authenticated/);
  assert.match(migration, /grant update \(status, superseded_by, updated_at\)/);
  assert.match(migration, /revoke all privileges on table public\.dog_memories from public, anon, authenticated/);
  assert.match(migration, /grant select, delete on table public\.dog_memories to authenticated/);
  assert.match(migration, /grant insert \(user_id, dog_profile_id, type, text, source, confidence, idempotency_key, idempotency_item_index\)/);
  assert.match(migration, /alter table public\.dog_memories force row level security/);
  assert.match(migration, /revoke all on function public\.persist_furvise_feature_intelligence\(uuid, uuid, text, text, uuid, text, uuid, text, jsonb, jsonb\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.persist_furvise_feature_intelligence\(uuid, uuid, text, text, uuid, text, uuid, text, jsonb, jsonb\)[\s\S]*to service_role/);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/);
  assert.match(migration, /idempotency_operations[\s\S]*operation_row\.user_id = p_user_id[\s\S]*operation_row\.idempotency_key = p_request_id/);
  assert.match(migration, /operation_row\.payload_hash = p_payload_hash/);
  assert.match(migration, /operation_row\.owner_token = p_operation_owner_token/);
  assert.match(migration, /FEATURE_INTELLIGENCE_REQUEST_NOT_AUTHORIZED/);
  assert.match(migration, /is_valid_furvise_preference/);
  assert.match(migration, /MEMORY_OWNER_PREFERENCE_INVALID/);
  assert.doesNotMatch(migration, /(?:delete|update)\s+from public\.furvise_memories/i);
});

test("all live memory consumers use the shared integrity boundary", () => {
  for (const path of [
    "app/lib/intelligence/retrieve-context.ts",
    "app/lib/remembered-details.ts",
    "app/lib/pet-memory.ts",
    "app/lib/ai/context-builder.ts",
    "app/api/vet-briefs/route.ts",
  ]) assert.match(read(path), /isEligible(?:Stored|Legacy)Memory/, path);
  assert.match(read("app/lib/intelligence/retrieve-context.ts"), /inactiveMemories\.data\.filter\(isEligibleStoredMemory\)/);
});

test("all application memory writers cross the shared semantic boundary", () => {
  for (const path of [
    "app/lib/intelligence/memory-policy.ts",
    "app/lib/intelligence/persist-learnings.ts",
    "app/lib/application-actions/executor.ts",
    "app/api/memories/[id]/route.ts",
  ]) assert.match(read(path), /prepareTypedMemoryCandidate/, path);
  for (const path of [
    "app/api/legacy-memories/route.ts",
    "app/api/ask/suggestions/[id]/route.ts",
  ]) assert.match(read(path), /isEligibleLegacyMemory/, path);
  assert.match(read("app/api/ask/route.ts"), /currentMessage: sourceMessage/);
  const featurePersistence = read("app/lib/intelligence/persist-learnings.ts");
  assert.match(featurePersistence, /createOperationsAdminClient\(\)\.rpc\("persist_furvise_feature_intelligence"/);
  assert.match(featurePersistence, /p_source_input: sourceInput/);
  assert.match(featurePersistence, /p_user_id: userId/);
  assert.match(featurePersistence, /p_payload_hash: payloadHash/);
  assert.match(featurePersistence, /p_operation_owner_token: operationOwnerToken/);
  for (const path of [
    "app/api/shop/product-question/route.ts",
    "app/api/shop/interpret-query/route.ts",
    "app/api/safety-followup/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /sourceInput:/, path);
    assert.match(source, /userId:/, path);
  }
});

test("the approval-gated cleanup is dry-run by default and narrowly rejects only provable garbage", () => {
  const cleanup = read("scripts/cleanup-invalid-furvise-memories.mjs");
  assert.match(cleanup, /const apply = process\.argv\.includes\("--apply"\)/);
  assert.match(cleanup, /REJECT_PROVABLY_INVALID_MEMORY_ROWS/);
  assert.match(cleanup, /provableCanonicalReasons/);
  assert.doesNotMatch(cleanup, /\.delete\(/);
});
