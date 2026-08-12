import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext, IntelligenceLearning, IntelligencePersistenceSummary } from "../../types.ts";
import { persistGovernedSemanticTurnV2Shadow } from "../persistence/persist.ts";
import { createV2ShadowPersistenceBoundary } from "../persistence/server-client.ts";
import { rebuildSemanticProjectionsV2, type RebuildClaim, type RebuildRelation } from "../projections/rebuild.ts";
import type { GovernedConceptIdentity, GovernedSemanticTurn } from "../types.ts";
import { attachRegistryConceptPolicy } from "../concepts/registry-policy.ts";
import { selectPhase3LowRiskTurn, type Phase3ConceptPolicy } from "./cutover-policy.ts";
import { executePhase3WriteFailOpen, phase3AllowsLowRiskWrite, phase3AllowsShadowRead } from "./execution.ts";
import { resolveAskV2Phase3Mode, type AskV2Phase3Mode } from "./rollout.ts";
import { comparePhase3ShadowContext } from "./shadow-comparison.ts";

export type AskV2Phase3Runtime = {
  mode: AskV2Phase3Mode;
  serviceClient: SupabaseClient | null;
  canonicalConcepts: GovernedConceptIdentity[];
  conceptPolicies: Map<string, Phase3ConceptPolicy>;
  shadowReady: boolean;
};

export async function prepareAskV2Phase3(input: {
  accessToken: string;
  context: FurviseLiveContext;
  requestId: string;
  verifiedUserId: string;
}): Promise<AskV2Phase3Runtime> {
  const mode = resolveAskV2Phase3Mode({
    configuredMode: process.env.FURVISE_ASK_V2_PHASE3_MODE,
    tenantAllowlist: process.env.FURVISE_ASK_V2_PHASE3_TENANTS,
    verifiedUserId: input.verifiedUserId,
  });
  if (!phase3AllowsShadowRead(mode)) return emptyRuntime(mode);

  let serviceClient: SupabaseClient | null = null;
  try {
    const boundary = await createV2ShadowPersistenceBoundary(input.accessToken);
    if (boundary.verifiedUserId !== input.verifiedUserId) throw new Error("V2_PHASE3_IDENTITY_MISMATCH");
    serviceClient = boundary.serviceClient;
    const graph = await loadPhase3Graph(serviceClient, input.verifiedUserId);
    const rebuild = rebuildSemanticProjectionsV2(graph.claims, graph.relations);
    const comparison = comparePhase3ShadowContext({ context: input.context, claims: graph.claims, rebuild });
    logPhase3(comparison.agrees ? "v2_shadow_read_ok" : "v2_shadow_read_diverged", input, {
      divergenceCategory: comparison.divergenceReasons,
      legacyCounts: comparison.legacy,
      v2Counts: comparison.v2,
    });
    logPhase3("v2_projection_hash", input, { projectionHash: comparison.projectionHash });
    return {
      mode,
      serviceClient,
      canonicalConcepts: graph.canonicalConcepts,
      conceptPolicies: graph.conceptPolicies,
      shadowReady: true,
    };
  } catch (error) {
    logPhase3("v2_shadow_read_diverged", input, {
      divergenceCategory: ["shadow_read_failed"],
      errorCode: safeErrorCode(error),
    });
    return { ...emptyRuntime(mode), serviceClient };
  }
}

export async function persistAskV2Phase3LowRisk(input: {
  runtime: AskV2Phase3Runtime;
  turn: GovernedSemanticTurn | null;
  legacyLearnings: IntelligenceLearning[];
  legacyPersistence: IntelligencePersistenceSummary | null;
  requestId: string;
  selectedPetId: string;
  sourceMessage: string;
  verifiedUserId: string;
}) {
  try {
    return await persistAskV2Phase3LowRiskInternal(input);
  } catch (error) {
    logPhase3("v2_low_risk_write_failed", input, { claimCount: 0, errorCode: safeErrorCode(error) });
    return { status: "failed" as const, claimCount: 0 };
  }
}

async function persistAskV2Phase3LowRiskInternal(input: {
  runtime: AskV2Phase3Runtime;
  turn: GovernedSemanticTurn | null;
  legacyLearnings: IntelligenceLearning[];
  legacyPersistence: IntelligencePersistenceSummary | null;
  requestId: string;
  selectedPetId: string;
  sourceMessage: string;
  verifiedUserId: string;
}) {
  if (!phase3AllowsLowRiskWrite(input.runtime.mode)) return { status: "skipped" as const, claimCount: 0 };
  if (!input.turn) return { status: "skipped" as const, claimCount: 0 };
  const selection = selectPhase3LowRiskTurn({
    turn: input.turn,
    conceptPolicies: input.runtime.conceptPolicies,
    legacyLearnings: input.legacyLearnings,
    selectedPetId: input.selectedPetId,
  });
  for (const rejected of selection.rejected) {
    logPhase3("v2_claim_class_rejected_from_cutover", input, claimTelemetry(rejected.claim, {
      claimClass: rejected.claimClass,
      divergenceCategory: rejected.reason,
    }));
  }
  if (!selection.accepted.length) return { status: "skipped" as const, claimCount: 0 };
  const writeSummary = {
    claimClasses: [...new Set(selection.accepted.map((decision) => decision.claimClass))],
    conceptResolutionStatuses: [...new Set(selection.accepted.map((decision) => decision.claim.conceptResolutionStatus))],
    persistenceDestinations: [...new Set(selection.accepted.map((decision) => decision.claim.persistenceDestination))],
  };
  for (const accepted of selection.accepted) {
    logPhase3("v2_low_risk_write_attempt", input, claimTelemetry(accepted.claim, { claimClass: accepted.claimClass }));
  }
  if (!input.runtime.shadowReady || !input.runtime.serviceClient || !input.legacyPersistence?.memoryIds.length) {
    logPhase3("v2_low_risk_write_failed", input, {
      claimCount: selection.accepted.length,
      errorCode: !input.legacyPersistence?.memoryIds.length ? "LEGACY_MEMORY_NOT_CONFIRMED" : "V2_SHADOW_BOUNDARY_UNAVAILABLE",
      ...writeSummary,
    });
    return { status: "failed" as const, claimCount: selection.accepted.length };
  }
  const serviceClient = input.runtime.serviceClient;

  const execution = await executePhase3WriteFailOpen(() => persistGovernedSemanticTurnV2Shadow({
      serviceClient,
      verifiedUserId: input.verifiedUserId,
      turn: selection.turn,
      sourceMessage: input.sourceMessage,
      idempotencyKey: input.requestId,
    }).then((result) => {
      if (result.error) throw result.error;
      return result.data;
    }));
  if (execution.status === "ok") {
    const row = Array.isArray(execution.value) ? execution.value[0] : execution.value;
    const idempotent = Boolean(row?.already_persisted);
    logPhase3(idempotent ? "v2_retry_idempotent" : "v2_low_risk_write_ok", input, {
      claimCount: selection.accepted.length,
      projectionVersion: row?.projection_version || null,
      ...writeSummary,
    });
    return { status: idempotent ? "idempotent" as const : "persisted" as const, claimCount: selection.accepted.length };
  } else {
    logPhase3("v2_low_risk_write_failed", input, {
      claimCount: selection.accepted.length,
      errorCode: safeErrorCode(execution.error),
      ...writeSummary,
    });
    return { status: "failed" as const, claimCount: selection.accepted.length };
  }
}

async function loadPhase3Graph(serviceClient: SupabaseClient, userId: string) {
  const [claimsResult, relationsResult, conceptsResult] = await Promise.all([
    serviceClient.from("semantic_claims").select([
      "id", "user_id", "subject_type", "subject_id", "claim_kind", "operation_type", "concept_key",
      "canonical_concept_key", "semantic_concept_id", "concept_resolution_status", "lifecycle_role",
      "lifecycle_transition", "persistence_destination", "knowledge_status", "occurred_at", "recorded_at",
      "provenance_classification", "structured_value",
    ].join(",")).eq("user_id", userId).order("recorded_at").limit(1001),
    serviceClient.from("semantic_claim_relations").select("from_claim_id,to_claim_id,relation_type")
      .eq("user_id", userId).order("recorded_at").limit(2001),
    serviceClient.from("semantic_concepts").select("id,canonical_key,concept_version,concept_kind,lifecycle_capable")
      .eq("status", "active").order("canonical_key").limit(501),
  ]);
  if (claimsResult.error) throw claimsResult.error;
  if (relationsResult.error) throw relationsResult.error;
  if (conceptsResult.error) throw conceptsResult.error;
  if ((claimsResult.data || []).length > 1000 || (relationsResult.data || []).length > 2000 || (conceptsResult.data || []).length > 500) {
    throw new Error("V2_PHASE3_READ_BOUND_EXCEEDED");
  }
  const concepts = (conceptsResult.data || []) as Array<Record<string, unknown>>;
  const conceptById = new Map(concepts.map((concept) => [String(concept.id), concept]));
  const claims = ((claimsResult.data || []) as unknown as Array<Record<string, unknown>>).map((claim): RebuildClaim => {
    const concept = claim.semantic_concept_id ? conceptById.get(String(claim.semantic_concept_id)) : null;
    return {
      id: String(claim.id), userId: String(claim.user_id), subjectType: String(claim.subject_type),
      subjectId: typeof claim.subject_id === "string" ? claim.subject_id : null,
      claimKind: String(claim.claim_kind), operationType: claim.operation_type as RebuildClaim["operationType"],
      conceptKey: String(claim.concept_key), canonicalConceptKey: typeof claim.canonical_concept_key === "string" ? claim.canonical_concept_key : null,
      conceptResolutionStatus: claim.concept_resolution_status as RebuildClaim["conceptResolutionStatus"],
      lifecycleCapable: concept?.lifecycle_capable === true,
      lifecycleRole: (claim.lifecycle_role || null) as RebuildClaim["lifecycleRole"],
      lifecycleTransition: (claim.lifecycle_transition || null) as RebuildClaim["lifecycleTransition"],
      persistenceDestination: String(claim.persistence_destination), knowledgeStatus: claim.knowledge_status as RebuildClaim["knowledgeStatus"],
      occurredAt: typeof claim.occurred_at === "string" ? claim.occurred_at : null, recordedAt: String(claim.recorded_at),
      provenanceClassification: String(claim.provenance_classification), structuredValue: claim.structured_value,
    };
  });
  const relations = ((relationsResult.data || []) as Array<Record<string, unknown>>).map((relation): RebuildRelation => ({
    fromClaimId: String(relation.from_claim_id), toClaimId: String(relation.to_claim_id),
    relationType: relation.relation_type as RebuildRelation["relationType"],
  }));
  return {
    claims,
    relations,
    canonicalConcepts: concepts.map((concept) => attachRegistryConceptPolicy({
      key: String(concept.canonical_key),
      version: String(concept.concept_version),
      conceptKind: String(concept.concept_kind) as GovernedConceptIdentity["conceptKind"],
      lifecycleCapable: concept.lifecycle_capable === true,
    })),
    conceptPolicies: new Map(concepts.map((concept) => [String(concept.canonical_key), {
      conceptKind: String(concept.concept_kind), lifecycleCapable: concept.lifecycle_capable === true,
    }])),
  };
}

type Phase3Event = "v2_shadow_read_ok" | "v2_shadow_read_diverged" | "v2_low_risk_write_attempt"
  | "v2_low_risk_write_ok" | "v2_low_risk_write_failed" | "v2_retry_idempotent"
  | "v2_claim_class_rejected_from_cutover" | "v2_projection_hash";

function logPhase3(event: Phase3Event, input: { requestId: string; verifiedUserId: string; context?: FurviseLiveContext; selectedPetId?: string }, details: Record<string, unknown>) {
  console.info("[Ask v2 Phase 3]", {
    event,
    requestId: input.requestId,
    ownerTelemetryId: telemetryId(input.verifiedUserId),
    petId: input.context?.pet.id || input.selectedPetId || null,
    ...details,
  });
}

function claimTelemetry(claim: GovernedSemanticTurn["acceptedClaims"][number], details: Record<string, unknown>) {
  return {
    conceptResolutionStatus: claim.conceptResolutionStatus,
    persistenceDestination: claim.persistenceDestination,
    subjectType: claim.subject.type,
    ...details,
  };
}

function telemetryId(userId: string) {
  const salt = process.env.FURVISE_OPERATIONS_HASH_SECRET || process.env.FURVISE_RATE_LIMIT_HASH_SECRET || "phase3-local";
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 16);
}

function safeErrorCode(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  if (typeof candidate?.code === "string" && /^[A-Z0-9_]{2,80}$/.test(candidate.code)) return candidate.code;
  if (error instanceof Error && /^[A-Z0-9_:.-]{2,100}$/.test(error.message)) return error.message;
  return "V2_PHASE3_OPERATION_FAILED";
}

function emptyRuntime(mode: AskV2Phase3Mode): AskV2Phase3Runtime {
  return { mode, serviceClient: null, canonicalConcepts: [], conceptPolicies: new Map(), shadowReady: false };
}
