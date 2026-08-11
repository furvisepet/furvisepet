import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { governSemanticTurnV2 } from "../app/lib/intelligence/v2/governance/govern-turn.ts";
import { serializeGovernedSemanticTurnV2 } from "../app/lib/intelligence/v2/persistence/serialize.ts";
import { planV2ProjectionRebuild, V2_PROJECTION_VERSIONS } from "../app/lib/intelligence/v2/projections/contracts.ts";
import { buildShadowSemanticAnalysis } from "../app/lib/intelligence/semantic-observability.ts";
import { SEMANTIC_FRAME_SCHEMA_VERSION } from "../app/lib/intelligence/semantic-frame/types.ts";

const ownerId = "10000000-0000-4000-8000-000000000001";
const pets = [
  { id: "10000000-0000-4000-8000-000000000011", name: "Luna", species: "dog", age_value: 5, age_unit: "years" },
  { id: "10000000-0000-4000-8000-000000000012", name: "Milo", species: "cat", age_value: 4, age_unit: "years" },
  { id: "10000000-0000-4000-8000-000000000013", name: "Poppy", species: "dog", age_value: 3, age_unit: "years" },
];

const concept = (label) => ({ label, definition: null, aliases: [], parentLabels: [], relatedLabels: [] });
const temporal = (occurredAt = null, precision = "unknown") => ({ occurredAt, validFrom: null, validTo: null, surfaceText: null, precision });
const evidence = (surfaceText) => [{ surfaceText }];
const mention = (localId, surface, coarseType, attributes = {}) => ({
  localId, surface, coarseType,
  attributes: { species: null, lifeStage: null, ownership: "unknown", ...attributes },
  evidence: evidence(surface), confidence: 0.98,
});
const base = (localId, kind, subjectRef, predicate, surfaceText, persistenceHint) => ({
  localId, kind, subjectRef, predicate: concept(predicate), polarity: "affirmed", modality: "asserted",
  temporal: temporal(), uncertainty: { confidence: 0.96, reasons: [] }, evidence: evidence(surfaceText), persistenceHint,
});
const preference = (localId, subjectRef, predicate, surfaceText, value, hint) => ({
  ...base(localId, "preference", subjectRef, predicate, surfaceText, hint), preference: "prefer",
  object: { concept: concept(predicate), value }, constraints: [],
});
const event = (localId, subjectRef, predicate, surfaceText, phase = "started", resultingState = "active") => ({
  ...base(localId, "event", subjectRef, predicate, surfaceText, "history"),
  participants: [{ role: "subject", entityRef: subjectRef }], lifecycle: { phase, boundedInMessage: false, resultingState },
});
const frame = (mentions, claims, references = [], uncertainty = { needsClarification: false, clarificationQuestion: null, reasons: [] }) => ({
  schemaVersion: SEMANTIC_FRAME_SCHEMA_VERSION, frameLocalId: "frame_1",
  discourseActs: [{ kind: "statement", confidence: 0.99 }], mentions, references, claims, uncertainty,
});
const govern = (message, semanticFrame, options = {}) => governSemanticTurnV2({
  frame: semanticFrame, sourceMessage: message, sourceMessageId: "20000000-0000-4000-8000-000000000001",
  ownerId, pets, activeEpisodes: [], ...options,
});

test("v2 governs a multi-claim turn without legacy intelligence outputs", () => {
  const message = "Luna likes salmon and I prefer local stores";
  const result = govern(message, frame([
    mention("pet_1", "Luna", "animal"), mention("owner_1", "I", "person", { ownership: "owner" }),
  ], [
    preference("claim_pet", "pet_1", "salmon food", "Luna likes salmon", "salmon", "pet_memory"),
    preference("claim_owner", "owner_1", "retailer locality", "I prefer local stores", "local", "owner_memory"),
  ]));
  assert.equal(result.acceptedClaims.length, 2);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.type), ["pet", "owner"]);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.canonicalConceptKey), ["salmon_food", "retailer_locality"]);
});

test("v2 resolves independent claims in a multi-pet turn", () => {
  const message = "Luna is limping and Milo prefers wet food";
  const result = govern(message, frame([
    mention("luna", "Luna", "animal"), mention("milo", "Milo", "animal"),
  ], [
    event("claim_luna", "luna", "limping", "Luna is limping"),
    preference("claim_milo", "milo", "wet food", "Milo prefers wet food", "wet", "pet_memory"),
  ]));
  assert.equal(result.acceptedClaims.length, 2);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.subject.id), [pets[0].id, pets[1].id]);
});

test("v2 supports owner preferences, pet preferences, and external relationships", () => {
  const message = "I prefer local stores, Luna avoids chicken, and my sister watches Luna";
  const relationship = {
    ...base("claim_relationship", "relationship", "sister", "pet caregiving", "my sister watches Luna", "relationship"),
    objectRef: "luna", qualifiers: [{ key: "role", value: "caregiver" }],
  };
  const result = govern(message, frame([
    mention("owner", "I", "person", { ownership: "owner" }), mention("luna", "Luna", "animal"),
    mention("sister", "my sister", "person", { ownership: "household" }),
  ], [
    preference("claim_owner", "owner", "retailer locality", "I prefer local stores", "local", "owner_memory"),
    { ...preference("claim_pet", "luna", "chicken", "Luna avoids chicken", "chicken", "pet_memory"), preference: "avoid" },
    relationship,
  ]));
  assert.equal(result.rejectedClaims.length, 0);
  assert.deepEqual(result.acceptedClaims.map((claim) => claim.claimKind), ["preference", "preference", "relationship"]);
  assert.equal(result.acceptedClaims[2].subject.resolution, "external");
  assert.deepEqual(result.acceptedClaims[2].resolvedEntities.map((entity) => entity.entityId), [pets[0].id]);
});

test("v2 creates explicit correction and retraction relations", () => {
  const message = "I prefer local stores; actually online stores; forget that preference";
  const original = preference("claim_original", "owner", "retailer locality", "I prefer local stores", "local", "owner_memory");
  const replacement = preference("claim_replacement", "owner", "retailer locality", "actually online stores", "online", "owner_memory");
  const correction = {
    ...base("claim_correct", "correction", "owner", "retailer locality", "actually online stores", "owner_memory"),
    operation: "replace", target: { claimRef: "claim_original", subjectRef: "owner", predicate: concept("retailer locality"), value: "local" },
    replacementClaimRef: "claim_replacement",
  };
  const retraction = {
    ...base("claim_retract", "correction", "owner", "retailer locality", "forget that preference", "owner_memory"),
    operation: "retract", target: { claimRef: "claim_replacement", subjectRef: "owner", predicate: concept("retailer locality"), value: "online" },
    replacementClaimRef: null,
  };
  const result = govern(message, frame([mention("owner", "I", "person", { ownership: "owner" })], [original, replacement, correction, retraction]));
  assert.equal(result.acceptedClaims.length, 4);
  assert.deepEqual(result.acceptedClaims.slice(2).map((claim) => claim.operationType), ["correct", "retract"]);
  assert.deepEqual(result.relations.map((relation) => ({ from: relation.fromLocalClaimKey, to: relation.toLocalClaimKey, type: relation.relationType })), [
    { from: "claim_correct", to: "claim_original", type: "corrects" },
    { from: "claim_retract", to: "claim_replacement", type: "retracts" },
  ]);
});

test("v2 identifies opening lifecycle events and uniquely grounded terminal recovery", () => {
  const openingMessage = "Luna started limping";
  const opening = govern(openingMessage, frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", openingMessage)]));
  assert.equal(opening.acceptedClaims[0].lifecycleRole, "opening");
  assert.equal(opening.acceptedClaims[0].serverEpisodeId, null);

  const recoveryMessage = "Luna is no longer limping";
  const recoveryClaim = {
    ...base("claim_recovery", "state_transition", "luna", "limping", recoveryMessage, "current_state"),
    transition: "resolved", fromState: "active", toState: "resolved", targetConcept: concept("limping"),
  };
  const activeEpisode = {
    id: "30000000-0000-4000-8000-000000000001", pet_profile_id: pets[0].id, normalized_key: "health_limping",
    episode_type: "symptom", status: "active", sequence_number: 1, recurrence_of: null,
    started_at: "2026-08-10T00:00:00.000Z", last_event_at: "2026-08-10T00:00:00.000Z", resolved_at: null,
  };
  const recovery = govern(recoveryMessage, frame([mention("luna", "Luna", "animal")], [recoveryClaim]), { activeEpisodes: [activeEpisode] });
  assert.equal(recovery.rejectedClaims.length, 0);
  assert.equal(recovery.acceptedClaims[0].lifecycleRole, "resolution");
  assert.equal(recovery.acceptedClaims[0].serverEpisodeId, activeEpisode.id);
});

test("v2 fails closed for ambiguous pets even when one is selected elsewhere", () => {
  const message = "My dog is tired";
  const result = govern(message, frame([
    mention("dog", "My dog", "animal", { species: "dog", ownership: "owner" }),
  ], [event("claim_1", "dog", "fatigue", message)]));
  assert.equal(result.acceptedClaims.length, 0);
  assert.equal(result.rejectedClaims[0].reason, "ENTITY_AMBIGUOUS");
  assert.equal(result.needsClarification, true);
});

test("v2 cannot bind a claim to a pet outside the owned candidate set", () => {
  const message = "Private pet is tired";
  const result = govern(message, frame([
    mention("private_pet", "Private pet", "animal"),
  ], [event("claim_private", "private_pet", "fatigue", message)]));
  assert.equal(result.acceptedClaims.length, 0);
  assert.equal(result.rejectedClaims[0].reason, "ENTITY_UNRESOLVED");
});

test("v2 rejects evidence tampering and serializes trusted fields only", () => {
  const message = "Luna likes salmon";
  const semanticFrame = frame([mention("luna", "Luna", "animal")], [
    preference("claim_1", "luna", "salmon", "invented excerpt", "salmon", "pet_memory"),
  ]);
  const rejected = govern(message, semanticFrame);
  assert.equal(rejected.rejectedClaims[0].reason, "EVIDENCE_NOT_FOUND");

  semanticFrame.claims[0].evidence = evidence(message);
  const accepted = govern(message, semanticFrame);
  const payload = serializeGovernedSemanticTurnV2(accepted, message);
  assert.equal(payload.claims[0].subject_id, pets[0].id);
  assert.equal("user_id" in payload.claims[0], false);
  assert.deepEqual(payload.claims[0].grounded_evidence[0], { start: 0, end: message.length, excerpt: message, alignment: "exact" });
});

test("projection plans are deterministic and explicitly versioned", () => {
  const message = "Luna started limping";
  const governed = govern(message, frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", message)]));
  const first = planV2ProjectionRebuild(governed.acceptedClaims);
  const second = planV2ProjectionRebuild([...governed.acceptedClaims].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.bundleVersion, V2_PROJECTION_VERSIONS.bundle);
  assert.deepEqual(first.records.map((record) => record.projection), ["history", "episodes", "concerns", "currentState"]);
});

test("shadow observability compares legacy and v2 without retaining message reasoning", () => {
  const message = "Luna started limping";
  const semanticFrame = frame([mention("luna", "Luna", "animal")], [event("claim_open", "luna", "limping", message)]);
  const analysis = buildShadowSemanticAnalysis({
    activeEpisodes: [], acceptedCareActions: [], acceptedLearnings: [], acceptedSemanticEvents: [],
    conversationTurns: [], eligiblePets: pets, frame: semanticFrame, message, ownerId,
    requestId: "v2-observation", selectedPetId: pets[1].id,
    sourceMessageId: "20000000-0000-4000-8000-000000000001",
    reasoning: { model: "test", semanticFrameValid: true, messageUnderstanding: { needsClarification: false } },
  });
  assert.equal(analysis.trace.v2.status, "governed");
  assert.equal(analysis.trace.v2.observation.proposedClaimCount, 1);
  assert.equal(analysis.trace.v2.observation.governedClaimCount, 1);
  assert.equal(analysis.trace.v2.observation.lifecycle[0].role, "opening");
  assert.equal(analysis.trace.v2.legacyComparison.claimCountDelta, 1);
  assert.equal(JSON.stringify(analysis.trace.v2).includes(message), false);
  assert.equal(JSON.stringify(analysis.trace.v2).toLowerCase().includes("chain-of-thought"), false);
});

test("Phase 1 does not wire v2 persistence into production Ask", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /persistGovernedSemanticTurnV2Shadow|persist_governed_semantic_turn_v2/);
  const runIntelligence = readFileSync(new URL("../app/lib/intelligence/run-intelligence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(runIntelligence, /persistGovernedSemanticTurnV2Shadow|persist_governed_semantic_turn_v2/);
});

test("migration establishes append-only, service-only, same-tenant claim persistence", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260811150000_add_ask_v2_semantic_claims_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.semantic_claims/);
  assert.match(sql, /create table if not exists public\.semantic_claim_relations/);
  assert.match(sql, /foreign key \(from_claim_id, user_id\)[\s\S]*foreign key \(to_claim_id, user_id\)/);
  assert.match(sql, /add column if not exists claim_id uuid/);
  assert.match(sql, /care_entry_id is not null or claim_id is not null/);
  assert.match(sql, /create or replace function public\.persist_governed_semantic_turn_v2/);
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /message_row\.user_id = v_user_id[\s\S]*message_row\.role = 'user'/);
  assert.match(sql, /pet\.id = v_subject_id and pet\.user_id = v_user_id/);
  assert.match(sql, /Grounded evidence does not match source message/);
  assert.match(sql, /prevent_semantic_claim_relation_cycle/);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*turn_payload_hash/);
  assert.match(sql, /grant execute on function public\.persist_governed_semantic_turn_v2[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.persist_governed_semantic_turn_v2[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*semantic_claims.*authenticated/i);
  assert.doesNotMatch(sql, /insert into public\.semantic_claims[\s\S]*select .*pet_care_entries/i);
});
