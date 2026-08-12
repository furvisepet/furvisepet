import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveRegistryConceptV2 } from "../app/lib/intelligence/v2/concepts/registry.ts";
import { rebuildSemanticProjectionsV2 } from "../app/lib/intelligence/v2/projections/rebuild.ts";
import { compareLegacyToV2Rebuild } from "../app/lib/intelligence/v2/projections/audit.ts";

const owner = "10000000-0000-4000-8000-000000000001";
const pet = "10000000-0000-4000-8000-000000000002";
const registry = [
  { id: "c1", canonicalKey: "vomiting", conceptVersion: "v1", lifecycleCapable: true, speciesApplicability: ["dog", "cat"], status: "active", aliases: ["vomit", "health_vomiting"] },
  { id: "c2", canonicalKey: "food_preference", conceptVersion: "v1", lifecycleCapable: false, speciesApplicability: ["dog", "cat"], status: "active", aliases: ["food_likes"] },
];

function claim(id, overrides = {}) {
  return {
    id, userId: owner, subjectType: "pet", subjectId: pet, claimKind: "event", operationType: "assert",
    conceptKey: "vomiting", canonicalConceptKey: "vomiting", conceptResolutionStatus: "canonical",
    lifecycleCapable: true, lifecycleRole: null, lifecycleTransition: null, persistenceDestination: "history",
    knowledgeStatus: "effective", occurredAt: `2026-08-11T00:00:0${id.slice(-1)}.000Z`,
    recordedAt: `2026-08-11T00:01:0${id.slice(-1)}.000Z`, provenanceClassification: "imported_legacy",
    structuredValue: { id }, ...overrides,
  };
}

test("exact canonical keys and registered aliases resolve without fuzzy matching", () => {
  assert.equal(resolveRegistryConceptV2("vomiting", "dog", registry).concept.id, "c1");
  assert.equal(resolveRegistryConceptV2("Vomit", "cat", registry).concept.id, "c1");
  assert.equal(resolveRegistryConceptV2("health vomiting", "dog", registry).concept.id, "c1");
  assert.equal(resolveRegistryConceptV2("Mani was vomiting", "dog", registry).status, "provisional");
  assert.equal(resolveRegistryConceptV2(null, "dog", registry).status, "unresolved");
});

test("an alias registered to two concepts remains ambiguous", () => {
  const ambiguous = [...registry, { ...registry[1], id: "c3", canonicalKey: "nausea", aliases: ["sick"] }, { ...registry[0], id: "c4", canonicalKey: "illness", aliases: ["sick"] }];
  assert.equal(resolveRegistryConceptV2("sick", "dog", ambiguous).status, "ambiguous");
});

test("History, owner preferences, pet preferences, and relationships rebuild from effective claims", () => {
  const result = rebuildSemanticProjectionsV2([
    claim("h1"),
    claim("o2", { subjectType: "owner", subjectId: owner, claimKind: "preference", lifecycleCapable: false,
      lifecycleRole: null, canonicalConceptKey: null, conceptKey: "shop_local", conceptResolutionStatus: "provisional", persistenceDestination: "owner_memory" }),
    claim("p3", { claimKind: "preference", lifecycleCapable: false, lifecycleRole: null,
      canonicalConceptKey: "food_preference", conceptKey: "food_preference", persistenceDestination: "pet_memory" }),
    claim("r4", { claimKind: "relationship", lifecycleCapable: false, lifecycleRole: null,
      canonicalConceptKey: null, conceptKey: "weekend_caregiver", conceptResolutionStatus: "provisional", persistenceDestination: "relationship" }),
  ], []);
  assert.equal(result.history.length, 1);
  assert.deepEqual(result.memories.map((row) => row.value.destination).sort(), ["owner_memory", "pet_memory", "relationship"]);
});

test("tombstones, correction, retraction, and forgetting preserve inputs but remove ineffective projections", () => {
  const old = claim("m1", { claimKind: "preference", lifecycleCapable: false, canonicalConceptKey: null,
    conceptKey: "retailer", conceptResolutionStatus: "provisional", persistenceDestination: "owner_memory" });
  const replacement = claim("m2", { ...old, id: "m2", structuredValue: { value: "new" } });
  const forgotten = claim("m3", { ...old, id: "m3" });
  const operation = claim("x4", { claimKind: "correction", operationType: "forget", lifecycleCapable: false,
    lifecycleRole: null, persistenceDestination: "none", canonicalConceptKey: null, conceptKey: "retailer", conceptResolutionStatus: "provisional" });
  const tombstone = claim("h5", { knowledgeStatus: "tombstoned" });
  const result = rebuildSemanticProjectionsV2([old, replacement, forgotten, operation, tombstone], [
    { fromClaimId: replacement.id, toClaimId: old.id, relationType: "corrects" },
    { fromClaimId: operation.id, toClaimId: forgotten.id, relationType: "retracts" },
  ]);
  assert.deepEqual(result.memories.map((row) => row.value.sourceClaimId), ["m2"]);
  assert.equal(result.inputClaimIds.length, 5);
  assert.equal(result.history.length, 0);
});

test("canonical lifecycle reducer handles opening through resolution", () => {
  const roles = ["opening", "continuation", "worsening", "improvement", "resolution"];
  const claims = roles.map((role, index) => claim(`l${index + 1}`, { lifecycleRole: role,
    lifecycleTransition: ["started", "continued", "worsened", "improved", "resolved"][index] }));
  const result = rebuildSemanticProjectionsV2(claims, []);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0].status, "resolved");
  assert.deepEqual(result.episodes[0].sourceClaimIds, claims.map((item) => item.id));
  assert.equal(result.concerns.length, 0);
  assert.equal(result.currentState.length, 0);
});

test("recurrence creates a new deterministic lifecycle sequence", () => {
  const result = rebuildSemanticProjectionsV2([
    claim("e1", { lifecycleRole: "opening" }), claim("e2", { lifecycleRole: "resolution" }),
    claim("e3", { lifecycleRole: "recurrence" }),
  ], []);
  assert.deepEqual(result.episodes.map((episode) => [episode.sequence, episode.status]), [[1, "resolved"], [2, "active"]]);
  assert.equal(result.concerns.length, 1);
});

test("dismissal closes tracking without creating resolved state", () => {
  const result = rebuildSemanticProjectionsV2([
    claim("d1", { lifecycleRole: "opening" }), claim("d2", { lifecycleRole: "dismissal", lifecycleTransition: "dismissed" }),
  ], []);
  assert.equal(result.episodes[0].status, "dismissed");
  assert.equal(result.episodes.filter((episode) => episode.status === "resolved").length, 0);
  assert.equal(result.concerns.length, 0);
  assert.equal(result.currentState.length, 0);
});

test("provisional and ambiguous concepts cannot mutate canonical lifecycle", () => {
  const result = rebuildSemanticProjectionsV2([
    claim("u1", { lifecycleRole: "opening", canonicalConceptKey: null, conceptResolutionStatus: "provisional" }),
    claim("u2", { lifecycleRole: "opening", canonicalConceptKey: null, conceptResolutionStatus: "ambiguous" }),
  ], []);
  assert.equal(result.episodes.length, 0);
  assert.deepEqual(result.invalidLifecycleClaimIds, ["u1", "u2"]);
});

test("occurred_at orders chronology and recorded_at plus ID break ties deterministically", () => {
  const result = rebuildSemanticProjectionsV2([
    claim("z3", { occurredAt: null, recordedAt: "2026-08-11T00:00:03.000Z" }),
    claim("b2", { occurredAt: "2026-08-11T00:00:01.000Z", recordedAt: "2026-08-11T00:00:02.000Z" }),
    claim("a1", { occurredAt: "2026-08-11T00:00:01.000Z", recordedAt: "2026-08-11T00:00:02.000Z" }),
  ], []);
  assert.deepEqual(result.inputClaimIds, ["a1", "b2", "z3"]);
});

test("rebuild and audit hashes are stable", () => {
  const input = [claim("s1", { lifecycleRole: "opening" }), claim("s2", { lifecycleRole: "improvement" })];
  const first = rebuildSemanticProjectionsV2(input, []);
  const second = rebuildSemanticProjectionsV2([...input].reverse(), []);
  assert.deepEqual(first, second);
  const audit = compareLegacyToV2Rebuild({ imported: { canonical: 2, provisional: 0, ambiguous: 0, unresolved: 0 },
    legacy: { historyRows: 2, activeEpisodes: 1, resolvedEpisodes: 0, concerns: 1, currentStateRows: 1, activeMemories: 0 },
    rebuild: first, orphanLegacySourceRows: 0, duplicateLineage: 0, invalidCrossUserLineage: 0 });
  assert.equal(audit.agreement.activeEpisodes.agrees, true);
  assert.equal(audit.rebuildHash, first.bundleHash);
});

test("Phase 2 migration is explicit, service-only, and does not backfill or cut over production", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260812044302_ask_v2_phase_2_legacy_import_rebuild.sql", import.meta.url), "utf8");
  assert.match(sql, /create table public\.semantic_concepts/);
  assert.match(sql, /create table public\.semantic_concept_aliases/);
  assert.match(sql, /create table public\.semantic_claim_legacy_lineage/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /grant execute on function public\.import_legacy_semantic_claims_v2[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /grant execute on function public\.import_legacy_semantic_claims_v2[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /select public\.import_legacy_semantic_claims_v2|perform public\.import_legacy_semantic_claims_v2/);
  assert.doesNotMatch(sql, /ends_with|endsWith|like ['"]%/i);
  const askRoute = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(askRoute, /import_legacy_semantic_claims_v2|rebuildSemanticProjectionsV2|persistGovernedSemanticTurnV2Shadow/);
  const context = readFileSync(new URL("../app/lib/ai/ask-reasoning.ts", import.meta.url), "utf8");
  assert.doesNotMatch(context, /semantic_claims|rebuildSemanticProjectionsV2/);
});
