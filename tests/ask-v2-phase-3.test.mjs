import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { decidePhase3LowRiskClaim, selectPhase3LowRiskTurn } from "../app/lib/intelligence/v2/phase3/cutover-policy.ts";
import { executePhase3WriteFailOpen, phase3AllowsLowRiskWrite, phase3AllowsShadowRead } from "../app/lib/intelligence/v2/phase3/execution.ts";
import { resolveAskV2Phase3Mode } from "../app/lib/intelligence/v2/phase3/rollout.ts";

const owner = "10000000-0000-4000-8000-000000000001";
const pet = "10000000-0000-4000-8000-000000000002";
const otherPet = "10000000-0000-4000-8000-000000000003";
const policies = new Map([
  ["weight", { conceptKind: "profile", lifecycleCapable: false }],
  ["owner_profile_fact", { conceptKind: "care_fact", lifecycleCapable: false }],
  ["vomiting", { conceptKind: "symptom", lifecycleCapable: true }],
  ["medication_course", { conceptKind: "medication", lifecycleCapable: true }],
]);

function governedClaim(overrides = {}) {
  const subjectType = overrides.subjectType || "pet";
  const subjectId = overrides.subjectId || (subjectType === "owner" ? owner : pet);
  const claimKind = overrides.claimKind || "preference";
  const conceptKey = overrides.conceptKey || "food_preference";
  return {
    sourceLocalClaimKey: overrides.sourceLocalClaimKey || "claim_1",
    proposed: {
      localId: overrides.sourceLocalClaimKey || "claim_1", kind: claimKind, subjectRef: "entity_1",
      predicate: { label: conceptKey, definition: null, aliases: [], parentLabels: [], relatedLabels: [] },
      polarity: "affirmed", modality: "asserted", temporal: { occurredAt: null, validFrom: null, validTo: null, surfaceText: null, precision: "unknown" },
      uncertainty: { confidence: 0.95, reasons: [] }, evidence: [{ surfaceText: "evidence" }], persistenceHint: "pet_memory",
    },
    subject: { type: subjectType, id: subjectId, sourceMentionId: "entity_1", resolution: "owned", confidence: 1 },
    resolvedEntities: [{ entityType: subjectType, entityId: subjectId, sourceMentionId: "entity_1", confidence: 1 }],
    groundedEvidence: [{ surfaceText: "evidence", start: 0, end: 8, quote: "evidence", alignment: "exact" }],
    temporal: { occurredAt: null, validFrom: null, validTo: null, precision: "unknown" },
    extractionConfidence: 0.95, conceptKey,
    canonicalConceptKey: overrides.canonical === false ? null : conceptKey,
    conceptVersion: overrides.canonical === false ? "ask_v2.concepts.provisional.v1" : "furvise.core.v1",
    conceptResolutionStatus: overrides.canonical === false ? "provisional" : "canonical",
    conceptAuthority: overrides.canonical === false ? "provisional_normalizer" : "governed_registry",
    claimKind, operationType: overrides.operationType || "assert", structuredValue: {}, unit: null,
    durability: overrides.durability || (claimKind === "assertion" ? "durable" : "unknown"),
    lifecycleRole: overrides.lifecycleRole || null, lifecycleTransition: overrides.lifecycleTransition || null,
    serverEpisodeId: overrides.serverEpisodeId || null, governedConfidence: 0.95,
    persistenceDestination: overrides.persistenceDestination || (claimKind === "relationship" ? "relationship" : subjectType === "owner" ? "owner_memory" : "pet_memory"),
    persistenceEligible: overrides.persistenceEligible ?? true, proposedPersistenceHint: "pet_memory",
    persistencePolicyReasons: [], persistencePermission: "shadow_only", provenanceClassification: "ask_v2_shadow",
    governanceMetadata: {}, safetyFloorMetadata: { level: overrides.safetyLevel || "routine", reasonCodes: [], policyVersion: "v1" },
    ...overrides.extra,
  };
}

function learning(claim, overrides = {}) {
  return {
    subjectType: claim.subject.type, subjectId: claim.subject.type === "pet" ? claim.subject.id : null,
    category: claim.claimKind === "relationship" ? "relationship" : claim.claimKind === "preference" ? "preference" : "profile",
    factKey: claim.conceptKey, factValue: "value", confidence: 0.95, importance: "medium", durability: "durable",
    action: "create", sourceExcerpt: "evidence", ...overrides,
  };
}

function turn(claims) {
  return {
    frame: { schemaVersion: "furvise.semantic-frame.proposed.v1.5", frameLocalId: "frame_1", discourseActs: [], mentions: [], references: [], claims: [], uncertainty: { needsClarification: false, clarificationQuestion: null, reasons: [] } },
    sourceMessageId: "20000000-0000-4000-8000-000000000001", frameSchemaVersion: "furvise.semantic-frame.proposed.v1.5",
    governancePolicyVersion: "v1", acceptedClaims: claims, rejectedClaims: [], relations: [], needsClarification: false,
    safetyFloor: { level: "routine", reasonCodes: [], policyVersion: "v1" }, mode: "shadow_only",
  };
}

test("Phase 3 rollout defaults off and tenant allowlisting cannot be client-selected", () => {
  assert.equal(resolveAskV2Phase3Mode({ verifiedUserId: owner }), "off");
  assert.equal(resolveAskV2Phase3Mode({ configuredMode: "shadow_read", tenantAllowlist: owner, verifiedUserId: owner }), "shadow_read");
  assert.equal(resolveAskV2Phase3Mode({ configuredMode: "low_risk_dual_write", tenantAllowlist: "", verifiedUserId: owner }), "shadow_read");
  assert.equal(resolveAskV2Phase3Mode({ configuredMode: "low_risk_dual_write", tenantAllowlist: owner, verifiedUserId: owner }), "low_risk_dual_write");
  assert.equal(phase3AllowsShadowRead("off"), false);
  assert.equal(phase3AllowsShadowRead("shadow_read"), true);
  assert.equal(phase3AllowsLowRiskWrite("shadow_read"), false);
  assert.equal(phase3AllowsLowRiskWrite("low_risk_dual_write"), true);
});

test("the low-risk policy admits owner/pet preferences, relationships, and governed durable facts", () => {
  const cases = [
    [governedClaim({ subjectType: "owner", conceptKey: "preferred_retailer" }), "owner_preference"],
    [governedClaim({ conceptKey: "food_preference" }), "pet_preference"],
    [governedClaim({ claimKind: "relationship", conceptKey: "caregiver_relationship" }), "relationship"],
    [governedClaim({ claimKind: "assertion", subjectType: "owner", conceptKey: "owner_profile_fact" }), "owner_fact"],
    [governedClaim({ claimKind: "assertion", conceptKey: "weight" }), "pet_fact"],
  ];
  for (const [claim, expected] of cases) {
    const decision = decidePhase3LowRiskClaim(claim, policies);
    assert.equal(decision.eligible, true);
    assert.equal(decision.claimClass, expected);
  }
});

test("medical lifecycle, recovery, safety, medication, and provisional durable facts fail closed", () => {
  const cases = [
    governedClaim({ claimKind: "assertion", conceptKey: "vomiting" }),
    governedClaim({ claimKind: "state_transition", conceptKey: "vomiting", lifecycleRole: "resolution", lifecycleTransition: "resolved", persistenceDestination: "history" }),
    governedClaim({ safetyLevel: "urgent" }),
    governedClaim({ claimKind: "event", conceptKey: "medication_course", lifecycleRole: "opening", lifecycleTransition: "started", persistenceDestination: "history" }),
    governedClaim({ claimKind: "assertion", conceptKey: "unknown_profile_fact", canonical: false }),
  ];
  for (const claim of cases) assert.equal(decidePhase3LowRiskClaim(claim, policies).eligible, false);
});

test("v2 claims require an exact matching legacy learning and preserve explicit pet identity", () => {
  const explicitOtherPet = governedClaim({ subjectId: otherPet, conceptKey: "food_preference" });
  const mismatched = selectPhase3LowRiskTurn({
    turn: turn([explicitOtherPet]), conceptPolicies: policies,
    legacyLearnings: [learning(explicitOtherPet, { subjectId: pet })], selectedPetId: pet,
  });
  assert.equal(mismatched.accepted.length, 0);
  assert.equal(mismatched.rejected[0].reason, "no_exact_legacy_learning_match");
  const matched = selectPhase3LowRiskTurn({
    turn: turn([explicitOtherPet]), conceptPolicies: policies,
    legacyLearnings: [learning(explicitOtherPet)], selectedPetId: pet,
  });
  assert.equal(matched.accepted.length, 1);
  assert.equal(matched.accepted[0].claim.subject.id, otherPet);
});

test("v2 write failures are fail-open operation results", async () => {
  const legacyResult = { saved: true, memoryIds: ["legacy-memory"] };
  const result = await executePhase3WriteFailOpen(async () => { throw new Error("V2_DOWN"); });
  assert.equal(result.status, "failed");
  assert.deepEqual(legacyResult, { saved: true, memoryIds: ["legacy-memory"] });
});

test("production integration remains legacy-authoritative, service-only, and idempotent", () => {
  const route = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../app/lib/intelligence/v2/phase3/runtime.ts", import.meta.url), "utf8");
  const boundary = readFileSync(new URL("../app/lib/intelligence/v2/persistence/server-client.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../supabase/migrations/20260811150000_add_ask_v2_semantic_claims_foundation.sql", import.meta.url), "utf8");
  assert.ok(route.indexOf("persistIntelligenceLearnings({") < route.indexOf("persistAskV2Phase3LowRisk({"));
  assert.match(runtime, /idempotencyKey: input\.requestId/);
  assert.match(runtime, /if \(result\.error\) throw result\.error/);
  for (const event of [
    "v2_shadow_read_ok", "v2_shadow_read_diverged", "v2_low_risk_write_attempt", "v2_low_risk_write_ok",
    "v2_low_risk_write_failed", "v2_retry_idempotent", "v2_claim_class_rejected_from_cutover", "v2_projection_hash",
  ]) assert.match(runtime, new RegExp(`"${event}"`));
  assert.match(runtime, /\.eq\("user_id", userId\)/);
  assert.match(runtime, /ownerTelemetryId: telemetryId\(input\.verifiedUserId\)/);
  assert.doesNotMatch(runtime, /ownerId:\s*input\.verifiedUserId|userId:\s*input\.verifiedUserId/);
  assert.match(boundary, /import "server-only"/);
  assert.match(boundary, /verifyV2PersistenceUser\(accessToken, verifier\)/);
  assert.match(sql, /message_row\.user_id = v_user_id/);
  assert.match(sql, /pet\.id = v_subject_id and pet\.user_id = v_user_id/);
  assert.match(sql, /turn_idempotency_key = p_idempotency_key/);
  assert.doesNotMatch(route, /response\s*=\s*.*phase3|contextUsed\s*=\s*.*phase3/i);
  assert.doesNotMatch(route, /persist_governed_semantic_turn_v2/);
});

const skippedSourceDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

function listTypeScriptSourceFiles(rootDirectory) {
  const files = [];

  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skippedSourceDirectories.has(entry.name)) {
          visit(join(directory, entry.name));
        }
        continue;
      }

      if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        files.push(join(directory, entry.name));
      }
    }
  }

  visit(rootDirectory);
  return files.sort((left, right) => left.localeCompare(right));
}

test("no client module imports the server-only Phase 3 runtime or service secret", () => {
  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const appRoot = join(projectRoot, "app");
  const forbiddenServerDependency = /v2[\\/]phase3[\\/]runtime|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/;
  const clientDirective = /^\uFEFF?\s*["']use client["'];?/;

  const violations = listTypeScriptSourceFiles(appRoot)
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return clientDirective.test(source) && forbiddenServerDependency.test(source);
    })
    .map((file) => relative(projectRoot, file).replaceAll("\\", "/"));

  assert.equal(
    violations.length,
    0,
    `Client modules must not reference the Phase 3 server runtime or service secrets. Violations:\n${violations
      .map((file) => `- ${file}`)
      .join("\n")}`,
  );
});
