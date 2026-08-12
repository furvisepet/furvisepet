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

function memoryFact(id, overrides = {}) {
  return claim(id, {
    claimKind: "preference", lifecycleCapable: false, lifecycleRole: null,
    canonicalConceptKey: null, conceptKey: "preferred_retailer", conceptResolutionStatus: "provisional",
    persistenceDestination: "owner_memory", ...overrides,
  });
}

function operation(id, operationType, overrides = {}) {
  return claim(id, {
    claimKind: "operation", operationType, lifecycleCapable: false, lifecycleRole: null,
    canonicalConceptKey: null, conceptKey: "preferred_retailer", conceptResolutionStatus: "provisional",
    persistenceDestination: "none", ...overrides,
  });
}

function rebuildOrderInvariant(claims, relations) {
  const forward = rebuildSemanticProjectionsV2(claims, relations);
  const reversed = rebuildSemanticProjectionsV2([...claims].reverse(), [...relations].reverse());
  assert.deepEqual(reversed, forward);
  assert.equal(reversed.bundleHash, forward.bundleHash);
  return forward;
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

test("a governed correction replaces its target independent of input order", () => {
  const a = memoryFact("a1");
  const b = memoryFact("b2", { structuredValue: { value: "corrected" } });
  const result = rebuildOrderInvariant([a, b], [
    { fromClaimId: b.id, toClaimId: a.id, relationType: "corrects" },
  ]);
  assert.deepEqual(result.effectiveClaimIds, ["b2"]);
  assert.deepEqual(result.memories.map((row) => row.value.sourceClaimId), ["b2"]);
});

test("a supersession chain resolves to its sole terminal replacement", () => {
  const a = memoryFact("a1");
  const b = memoryFact("b2");
  const c = memoryFact("c3");
  const result = rebuildOrderInvariant([a, b, c], [
    { fromClaimId: b.id, toClaimId: a.id, relationType: "supersedes" },
    { fromClaimId: c.id, toClaimId: b.id, relationType: "supersedes" },
  ]);
  assert.deepEqual(result.effectiveClaimIds, ["c3"]);
  assert.deepEqual(result.ambiguousOperationClaimIds, []);
});

test("retracting or forgetting a replacement does not revive its prior claim", () => {
  for (const operationType of ["retract", "forget"]) {
    const a = memoryFact("a1");
    const b = memoryFact("b2");
    const c = operation("c3", operationType);
    const result = rebuildOrderInvariant([a, b, c], [
      { fromClaimId: b.id, toClaimId: a.id, relationType: "corrects" },
      { fromClaimId: c.id, toClaimId: b.id, relationType: "retracts" },
    ]);
    assert.deepEqual(result.effectiveClaimIds, ["c3"]);
    assert.equal(result.memories.length, 0);
  }
});

test("superseding a correction preserves the chain and selects the newest claim", () => {
  const a = memoryFact("a1");
  const b = memoryFact("b2");
  const c = memoryFact("c3");
  const result = rebuildOrderInvariant([a, b, c], [
    { fromClaimId: b.id, toClaimId: a.id, relationType: "corrects" },
    { fromClaimId: c.id, toClaimId: b.id, relationType: "supersedes" },
  ]);
  assert.deepEqual(result.effectiveClaimIds, ["c3"]);
});

test("rejected corrections never gain authority while later removal never revives replaced knowledge", () => {
  const rejected = rebuildOrderInvariant([
    memoryFact("a1"), memoryFact("b2", { knowledgeStatus: "rejected" }),
  ], [{ fromClaimId: "b2", toClaimId: "a1", relationType: "corrects" }]);
  assert.deepEqual(rejected.effectiveClaimIds, ["a1"]);
  assert.deepEqual(rejected.invalidRelationClaimIds, ["b2"]);

  for (const knowledgeStatus of ["tombstoned", "forgotten"]) {
    const removed = rebuildOrderInvariant([
      memoryFact("a1"), memoryFact("b2", { knowledgeStatus }),
    ], [{ fromClaimId: "b2", toClaimId: "a1", relationType: "corrects" }]);
    assert.deepEqual(removed.effectiveClaimIds, []);
    assert.equal(removed.memories.length, 0);
  }
});

test("an operation against an already ineffective target remains deterministic", () => {
  const result = rebuildOrderInvariant([
    memoryFact("a1", { knowledgeStatus: "forgotten" }), memoryFact("b2"),
  ], [{ fromClaimId: "b2", toClaimId: "a1", relationType: "corrects" }]);
  assert.deepEqual(result.effectiveClaimIds, ["b2"]);
});

test("competing correction heads fail closed instead of choosing by ordering", () => {
  const result = rebuildOrderInvariant([
    memoryFact("a1"), memoryFact("b2"), memoryFact("c3"),
  ], [
    { fromClaimId: "b2", toClaimId: "a1", relationType: "corrects" },
    { fromClaimId: "c3", toClaimId: "a1", relationType: "corrects" },
  ]);
  assert.deepEqual(result.effectiveClaimIds, []);
  assert.deepEqual(result.ambiguousOperationClaimIds, ["b2", "c3"]);
  assert.equal(result.memories.length, 0);
});

test("confirmation relations preserve both claims", () => {
  const result = rebuildOrderInvariant([
    memoryFact("a1"), operation("b2", "confirm"),
  ], [{ fromClaimId: "b2", toClaimId: "a1", relationType: "confirms" }]);
  assert.deepEqual(result.effectiveClaimIds, ["a1", "b2"]);
  assert.deepEqual(result.memories.map((row) => row.value.sourceClaimId), ["a1"]);
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

test("dismissal closes tracking without deleting provenance or creating resolved state", () => {
  const result = rebuildOrderInvariant([
    claim("d1", { lifecycleRole: "opening" }),
    claim("d2", { lifecycleRole: "dismissal", lifecycleTransition: "dismissed", persistenceDestination: "none" }),
  ], [{ fromClaimId: "d2", toClaimId: "d1", relationType: "dismisses_lifecycle" }]);
  assert.equal(result.episodes[0].status, "dismissed");
  assert.deepEqual(result.effectiveClaimIds, ["d1", "d2"]);
  assert.deepEqual(result.history.map((row) => row.value.sourceClaimId), ["d1"]);
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

test("the database retains self-edge and non-confirmation cycle protection", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20260811150000_add_ask_v2_semantic_claims_foundation.sql", import.meta.url), "utf8");
  assert.match(sql, /semantic_claim_relations_not_self_check check \(from_claim_id <> to_claim_id\)/);
  assert.match(sql, /create or replace function public\.prevent_semantic_claim_relation_cycle\(\)/);
  assert.match(sql, /with recursive descendants\(claim_id\)/);
  assert.match(sql, /relation_row\.relation_type <> 'confirms'/);
  assert.match(sql, /create trigger semantic_claim_relations_prevent_cycle/);
});
