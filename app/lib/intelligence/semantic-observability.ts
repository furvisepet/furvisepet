import { createHash } from "node:crypto";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEpisode } from "./episodes/types.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "./entities/candidate-retrieval.ts";
import { resolveShadowEntities, type ShadowEntityBinding } from "./entities/resolve-entities.ts";
import { resolveShadowReferences } from "./entities/resolve-references.ts";
import type { SemanticReasonCode } from "./entities/policy.ts";
import type { GovernedCanonicalEvent, IntelligenceCareAction, IntelligenceLearning, SemanticPersistenceDestination } from "./types.ts";
import type { ProposedSemanticClaim, ProposedSemanticFrame, SemanticClaimKind, SemanticPersistenceHint } from "./semantic-frame/types.ts";
import { groundSemanticFrameEvidence, type EvidenceGroundingFailureReason } from "./semantic-frame/ground-evidence.ts";
import { normalizeClaimKind } from "./semantic-frame/normalize-claim-kind.ts";
import { validateSemanticFrameEvidence } from "./semantic-frame/validate-evidence.ts";
import { normalizeConceptLabel } from "./concepts/normalize-concept.ts";
import { resolveProvisionalConcept, uniqueProposedConcepts, type ShadowConceptResolution } from "./concepts/provisional-concepts.ts";
import type { SemanticConceptRecord } from "./concepts/retrieve-candidates.ts";
import type { EffectiveRecoveryAssessment } from "./recovery-governance.ts";
import { governSemanticTurnV2 } from "./v2/governance/govern-turn.ts";
import { observeGovernedSemanticTurnV2, type V2ShadowObservation } from "./v2/observability.ts";
import type { GovernedConceptIdentity, GovernedSemanticTurn, SafetyFloorMetadata } from "./v2/types.ts";

export type SemanticTracePersistence = {
  status: "not_attempted" | "persisted" | "skipped" | "failed";
  errorCode: string | null;
  careEntryCount: number;
  memoryCount: number;
};

export type SemanticComparisonMetrics = {
  subjectBindingAgreement: boolean;
  proposedDestinationAgreement: boolean;
  claimKindAgreement: boolean | null;
  resolvedConceptAgreement: boolean | null;
  semanticRelationAgreement: boolean | null;
  productionSemanticOutputCount: number;
  productionSemanticEventCount: number;
  productionCareActionCount: number;
  productionLearningCount: number;
  shadowProposedClaimCount: number;
  shadowAcceptedClaimCount: number;
  shadowRejectedClaimCount: number;
  shadowDeferredClaimCount: number;
  rejectedClaimCountsByReason: Partial<Record<SemanticReasonCode, number>>;
  subjectDisagreement: boolean;
  persistenceDisagreement: boolean;
  eventCountDisagreement: boolean;
  eventCountDelta: number;
  conceptDisagreement: boolean;
  clarificationDisagreement: boolean;
};

export type SemanticTrace = {
  traceId: string;
  frameStatus: "valid" | "invalid";
  schemaVersion: string;
  modelVersion: string;
  sourceMessageId: string;
  selectedPetId: string;
  claimKinds: SemanticClaimKind[];
  normalizedClaimKinds: Array<{ claimId: string; declaredKind: SemanticClaimKind; structuralKind: SemanticClaimKind; consistent: boolean }>;
  evidenceGrounding: {
    total: number;
    grounded: number;
    exact: number;
    normalized: number;
    failuresByReason: Partial<Record<SemanticReasonCode, number>>;
  };
  mentionSurfaces: Array<{ mentionId: string; redactedSurface: string; entityType: string }>;
  entityCandidates: Array<{ mentionId: string; candidateTypes: string[]; scoreBands: string[] }>;
  entityBindings: Array<{ mentionId: string; result: string; binding: string | null; reasonCode: SemanticReasonCode | null }>;
  references: Array<{ referenceId: string; result: string; reasonCode: SemanticReasonCode | null }>;
  concepts: Array<{ conceptKey: string; status: string; resolvedKey: string | null; relation: string; scoreBand: string; provisional: boolean }>;
  governance: Array<{ claimId: string; decision: "accepted" | "rejected" | "deferred" | "no_persistence"; reasonCode: SemanticReasonCode }>;
  productionDestinations: SemanticPersistenceDestination[];
  shadowDestinations: string[];
  clarification: { production: boolean; shadow: boolean; reasonCodes: SemanticReasonCode[] };
  comparison: SemanticComparisonMetrics;
  persistence: SemanticTracePersistence;
  recoveryGovernance: Array<{
    promoted: boolean;
    effectiveConfidence: number;
    threshold: number;
    reasons: EffectiveRecoveryAssessment["reasons"];
    modelStatus: EffectiveRecoveryAssessment["model"]["status"];
    modelConfidence: number;
    evidenceGrounded: boolean;
    authoritativeSubject: boolean;
    subjectConfidence: number;
    compatibleEpisodeCount: number;
    lifecycleMatchScore: number;
    terminalSemanticsScore: number;
    terminalSemanticsSource: EffectiveRecoveryAssessment["terminalSemantics"]["source"];
    terminalSemanticsOutcome: EffectiveRecoveryAssessment["terminalSemantics"]["outcome"];
    terminalTargetMatched: boolean;
    contradictionAbsent: boolean;
    safetyAllowed: boolean;
  }>;
  v2: {
    mode: "shadow_only";
    status: "governed" | "failed";
    errorCode: "V2_SHADOW_GOVERNANCE_FAILED" | null;
    observation: V2ShadowObservation;
    legacyComparison: {
      legacyClaimCount: number;
      v2GovernedClaimCount: number;
      claimCountDelta: number;
      subjectBindingAgreement: boolean;
      conceptIdentityAgreement: boolean;
      lifecycleRoleAgreement: boolean;
      persistenceEligibilityAgreement: boolean;
    };
  };
  reasonCodes: SemanticReasonCode[];
};

export type ShadowSemanticAnalysis = {
  frame: ProposedSemanticFrame;
  trace: SemanticTrace;
  v2Turn: GovernedSemanticTurn;
};

export function buildShadowSemanticAnalysis(input: {
  activeEpisodes: CareEpisode[];
  acceptedCareActions: IntelligenceCareAction[];
  acceptedLearnings: IntelligenceLearning[];
  acceptedSemanticEvents: GovernedCanonicalEvent[];
  conversationTurns: Array<{ text: string; role?: string }>;
  eligiblePets: EligibleSemanticPet[];
  frame: ProposedSemanticFrame;
  message: string;
  ownerId: string;
  reasoning: AskReasoningResult;
  requestId: string;
  selectedPetId: string;
  sourceMessageId: string;
  recoveryAssessments?: EffectiveRecoveryAssessment[];
  canonicalConcepts?: GovernedConceptIdentity[];
  safetyFloor?: Omit<SafetyFloorMetadata, "policyVersion">;
}): ShadowSemanticAnalysis {
  const grounding = groundSemanticFrameEvidence(input.frame, input.message);
  const frame = grounding.frame;
  const recentPetIds = buildRecentPetIds(input.eligiblePets, input.conversationTurns);
  const bindings = resolveShadowEntities({ frame, ownerId: input.ownerId, pets: input.eligiblePets, recentPetIds, selectedPetId: input.selectedPetId });
  const references = resolveShadowReferences(frame, bindings);
  const evidence = validateSemanticFrameEvidence(frame, input.message);
  const effectiveBindings = bindReferences(bindings, references);
  const claimKindNormalizations = frame.claims.map(normalizeClaimKind);
  const evidenceFailureReasons = claimEvidenceFailureReasons(grounding.failures);
  const governance = frame.claims.map((claim) => governShadowClaim(
    claim, effectiveBindings, evidence.invalidClaimIds, evidenceFailureReasons.get(claim.localId), input.activeEpisodes,
  ));
  const shadowDestinations = unique(governance.filter((item) => item.decision === "accepted").flatMap((item) => destinationsForHint(item.claim.persistenceHint)));
  const productionDestinations = productionDestinationsFor(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings);
  const shadowClarificationReasons = unique([
    ...bindings.filter((binding) => binding.status !== "resolved" && claimUsesMention(frame.claims, binding.mentionId)).map((binding) => binding.reasonCode).filter(isReasonCode),
    ...references.filter((reference) => reference.status !== "resolved" && claimUsesMention(frame.claims, reference.mentionId)).map((reference) => reference.reasonCode).filter(isReasonCode),
    ...governance.filter((item) => item.decision === "deferred").map((item) => item.reasonCode),
  ]);
  const shadowClarification = frame.uncertainty.needsClarification || shadowClarificationReasons.length > 0;
  const frameStatus = input.reasoning.semanticFrameValid === false ? "invalid" as const : "valid" as const;
  const productionSubjects = productionSubjectKeys(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings, input.selectedPetId, input.ownerId);
  const shadowSubjects = unique(frame.claims.map((claim) => claim.subjectRef ? effectiveBindings.get(claim.subjectRef) : null)
    .filter((binding): binding is ShadowEntityBinding => Boolean(binding?.entityId)).map((binding) => `${binding.entityType}:${binding.entityId}`));
  const productionConceptRecords = buildProductionConceptRecords(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings, input.activeEpisodes);
  const productionConcepts = unique(productionConceptRecords.filter((record) => record.source !== "active_episode").map((record) => record.key));
  const shadowClaimConcepts = uniqueProposedConcepts(frame.claims.map(claimConcept));
  const conceptResolutions = shadowClaimConcepts.map((concept) => resolveProvisionalConcept(concept, productionConceptRecords));
  const shadowConcepts = shadowClaimConcepts.map((concept) => normalizeConceptLabel(concept.label));
  const productionKinds = productionClaimKinds(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings);
  const acceptedShadowKinds = governance.filter((item) => item.decision === "accepted").map((item) => normalizeClaimKind(item.claim).structuralKind);
  const rejectedClaimCountsByReason = countReasons(governance.filter((item) => item.decision === "rejected").map((item) => item.reasonCode));
  const evidenceFailuresByReason = countReasons(grounding.failures.map((item) => evidenceReasonCode(item.reason)));
  const identityEvaluated = conceptResolutions.filter((resolution) => resolution.status !== "provisional" || resolution.candidates.length > 0);
  const relationEvaluated = conceptResolutions.filter((resolution) => resolution.candidates.length > 0);
  const productionEventCount = input.acceptedSemanticEvents.length || input.acceptedCareActions.length;
  const shadowEventCount = frame.claims.filter((claim) => claim.kind === "event" || claim.kind === "state_transition").length;
  const comparison: SemanticComparisonMetrics = {
    subjectBindingAgreement: sameSet(productionSubjects, shadowSubjects),
    proposedDestinationAgreement: sameSet(productionDestinations, shadowDestinations),
    claimKindAgreement: productionKinds.length || acceptedShadowKinds.length ? sameMultiset(productionKinds, acceptedShadowKinds) : null,
    resolvedConceptAgreement: identityEvaluated.length ? identityEvaluated.every((item) => item.status === "resolved" && item.relation === "identity") : null,
    semanticRelationAgreement: relationEvaluated.length ? relationEvaluated.every((item) => item.status === "resolved" || item.relation === "parent" || item.relation === "related") : null,
    productionSemanticOutputCount: productionKinds.length,
    productionSemanticEventCount: input.acceptedSemanticEvents.length,
    productionCareActionCount: input.acceptedCareActions.length,
    productionLearningCount: input.acceptedLearnings.length,
    shadowProposedClaimCount: frame.claims.length,
    shadowAcceptedClaimCount: governance.filter((item) => item.decision === "accepted").length,
    shadowRejectedClaimCount: governance.filter((item) => item.decision === "rejected").length,
    shadowDeferredClaimCount: governance.filter((item) => item.decision === "deferred").length,
    rejectedClaimCountsByReason,
    subjectDisagreement: !sameSet(productionSubjects, shadowSubjects),
    persistenceDisagreement: !sameSet(productionDestinations, shadowDestinations),
    eventCountDisagreement: productionEventCount !== shadowEventCount,
    eventCountDelta: shadowEventCount - productionEventCount,
    conceptDisagreement: !sameSet(productionConcepts, shadowConcepts),
    clarificationDisagreement: input.reasoning.messageUnderstanding.needsClarification !== shadowClarification,
  };
  // Ask v2 consumes only the full SemanticFrame plus deterministic context. The
  // legacy arrays below are used after governance solely for aggregate comparison.
  let v2Status: SemanticTrace["v2"]["status"] = "governed";
  let v2ErrorCode: SemanticTrace["v2"]["errorCode"] = null;
  let v2Turn: GovernedSemanticTurn;
  try {
    v2Turn = governSemanticTurnV2({
      frame: input.frame,
      sourceMessage: input.message,
      sourceMessageId: input.sourceMessageId,
      ownerId: input.ownerId,
      pets: input.eligiblePets,
      conversationTurns: input.conversationTurns,
      activeEpisodes: input.activeEpisodes,
      canonicalConcepts: input.canonicalConcepts,
      safetyFloor: input.safetyFloor,
    });
  } catch {
    // Phase 1 shadow evaluation must never affect the legacy production answer.
    v2Status = "failed";
    v2ErrorCode = "V2_SHADOW_GOVERNANCE_FAILED";
    v2Turn = {
      frame: input.frame, sourceMessageId: input.sourceMessageId,
      frameSchemaVersion: input.frame.schemaVersion, governancePolicyVersion: "ask_v2.governance.shadow.v1",
      acceptedClaims: [], rejectedClaims: [], relations: [], needsClarification: false,
      safetyFloor: { level: "routine", reasonCodes: [], policyVersion: "ask_v2.governance.shadow.v1" },
      mode: "shadow_only",
    };
  }
  const v2Observation = observeGovernedSemanticTurnV2(v2Turn);
  const legacyLifecycleRoles = input.acceptedSemanticEvents.map((item) => legacyTransitionRole(item.event.transition));
  const v2LifecycleRoles = v2Turn.acceptedClaims.map((claim) => claim.lifecycleRole).filter((role): role is NonNullable<typeof role> => Boolean(role));
  const legacyPersistenceEligible = productionDestinations.length > 0;
  const v2PersistenceEligible = v2Turn.acceptedClaims.some((claim) => claim.persistenceEligible);

  return {
    frame,
    v2Turn,
    trace: {
      traceId: input.requestId,
      frameStatus,
      schemaVersion: frame.schemaVersion,
      modelVersion: input.reasoning.model,
      sourceMessageId: input.sourceMessageId,
      selectedPetId: input.selectedPetId,
      claimKinds: unique(frame.claims.map((claim) => claim.kind)),
      normalizedClaimKinds: claimKindNormalizations,
      evidenceGrounding: {
        total: grounding.totalEvidence, grounded: grounding.groundedEvidence, exact: grounding.exactEvidence,
        normalized: grounding.normalizedEvidence, failuresByReason: evidenceFailuresByReason,
      },
      mentionSurfaces: frame.mentions.map((mention) => ({ mentionId: mention.localId, redactedSurface: redactMentionSurface(mention.surface, mention.coarseType, input.eligiblePets), entityType: mention.coarseType })),
      entityCandidates: bindings.map((binding) => ({ mentionId: binding.mentionId, candidateTypes: unique(binding.candidates.map((candidate) => candidate.entityType)), scoreBands: unique(binding.candidates.map((candidate) => candidate.scoreBand)) })),
      entityBindings: bindings.map((binding) => ({ mentionId: binding.mentionId, result: binding.status, binding: binding.entityId ? bindingLabel(binding, input.selectedPetId, input.ownerId) : null, reasonCode: binding.reasonCode })),
      references: references.map((reference) => ({ referenceId: reference.referenceId, result: reference.status, reasonCode: reference.reasonCode })),
      concepts: conceptResolutions.map(traceConceptResolution),
      governance: governance.map(({ claim, decision, reasonCode }) => ({ claimId: claim.localId, decision, reasonCode })),
      productionDestinations,
      shadowDestinations,
      clarification: { production: input.reasoning.messageUnderstanding.needsClarification, shadow: shadowClarification, reasonCodes: shadowClarificationReasons },
      comparison,
      persistence: { status: "not_attempted", errorCode: null, careEntryCount: 0, memoryCount: 0 },
      recoveryGovernance: (input.recoveryAssessments || input.acceptedSemanticEvents
        .map((event) => event.recoveryGovernance).filter((item): item is EffectiveRecoveryAssessment => Boolean(item)))
        .map((item) => ({
          promoted: item.promoted,
          effectiveConfidence: item.effectiveConfidence,
          threshold: item.threshold,
          reasons: item.reasons,
          modelStatus: item.model.status,
          modelConfidence: item.model.confidence,
          evidenceGrounded: item.evidence.grounded,
          authoritativeSubject: item.subject.authoritative,
          subjectConfidence: item.subject.score,
          compatibleEpisodeCount: item.lifecycle.compatibleCandidateCount,
          lifecycleMatchScore: item.lifecycle.matchScore,
          terminalSemanticsScore: item.terminalSemantics.score,
          terminalSemanticsSource: item.terminalSemantics.source,
          terminalSemanticsOutcome: item.terminalSemantics.outcome,
          terminalTargetMatched: item.terminalSemantics.targetMatched,
          contradictionAbsent: item.contradiction.absent,
          safetyAllowed: item.safety.allowed,
        })),
      v2: {
        mode: "shadow_only",
        status: v2Status,
        errorCode: v2ErrorCode,
        observation: v2Observation,
        legacyComparison: {
          legacyClaimCount: productionKinds.length,
          v2GovernedClaimCount: v2Turn.acceptedClaims.length,
          claimCountDelta: v2Turn.acceptedClaims.length - productionKinds.length,
          subjectBindingAgreement: sameSet(productionSubjects, v2Turn.acceptedClaims.map((claim) => `${claim.subject.type}:${claim.subject.id}`)),
          conceptIdentityAgreement: sameSet(productionConcepts, v2Turn.acceptedClaims
            .map((claim) => claim.canonicalConceptKey)
            .filter((key): key is string => Boolean(key))),
          lifecycleRoleAgreement: sameMultiset(legacyLifecycleRoles, v2LifecycleRoles),
          persistenceEligibilityAgreement: legacyPersistenceEligible === v2PersistenceEligible,
        },
      },
      reasonCodes: unique([
        ...(frameStatus === "invalid" ? ["SHADOW_FRAME_INVALID" as const] : []),
        ...grounding.failures.map((item) => evidenceReasonCode(item.reason)),
        ...claimKindNormalizations.filter((item) => !item.consistent).map(() => "CLAIM_KIND_INCONSISTENT" as const),
        ...conceptResolutions.filter((item) => item.status === "ambiguous").map(() => "CONCEPT_AMBIGUOUS" as const),
        ...conceptResolutions.filter((item) => item.status === "provisional" && !item.candidates.length).map(() => "CONCEPT_PROVISIONAL" as const),
        ...governance.map((item) => item.reasonCode),
        ...shadowClarificationReasons,
      ]),
    },
  };
}

export function withSemanticPersistenceOutcome(trace: SemanticTrace, input: { status: "persisted" | "skipped" | "failed"; errorCode: string | null; careEntryCount: number; memoryCount: number }): SemanticTrace {
  return { ...trace, persistence: { ...input } };
}

export function semanticTraceForStorage(trace: SemanticTrace) {
  return trace;
}

export function logSemanticTrace(trace: SemanticTrace) {
  console.info("[Furvise semantic trace] decision", semanticTraceForStorage(trace));
}

function governShadowClaim(
  claim: ProposedSemanticClaim,
  bindings: Map<string, ShadowEntityBinding>,
  invalidClaimIds: string[],
  evidenceFailure: SemanticReasonCode | undefined,
  episodes: CareEpisode[],
) {
  const kind = normalizeClaimKind(claim);
  if (!kind.consistent) return { claim, decision: "rejected" as const, reasonCode: "CLAIM_KIND_INCONSISTENT" as const };
  if (invalidClaimIds.includes(claim.localId)) return { claim, decision: "rejected" as const, reasonCode: evidenceFailure || "EVIDENCE_UNSUPPORTED" as const };
  if (claim.uncertainty.confidence < 0.8) return { claim, decision: "rejected" as const, reasonCode: "CLAIM_LOW_CONFIDENCE" as const };
  if (claim.subjectRef) {
    const binding = bindings.get(claim.subjectRef);
    if (!binding || binding.status !== "resolved") return { claim, decision: "deferred" as const, reasonCode: binding?.reasonCode || "ENTITY_NO_MATCH" as const };
  }
  if (claim.kind === "relationship") {
    const binding = bindings.get(claim.objectRef);
    if (!binding || binding.status !== "resolved") return { claim, decision: "deferred" as const, reasonCode: binding?.reasonCode || "ENTITY_NO_MATCH" as const };
  }
  if (claim.kind === "state_transition" && !compatibleEpisode(claim.targetConcept, episodes)) {
    return { claim, decision: "deferred" as const, reasonCode: "TRANSITION_INCOMPATIBLE" as const };
  }
  if (claim.persistenceHint === "none") return { claim, decision: "no_persistence" as const, reasonCode: "CLAIM_NO_PERSISTENCE" as const };
  return { claim, decision: "accepted" as const, reasonCode: "CLAIM_ACCEPTED" as const };
}

function bindReferences(bindings: ShadowEntityBinding[], references: ReturnType<typeof resolveShadowReferences>) {
  const result = new Map(bindings.map((binding) => [binding.mentionId, binding]));
  for (const reference of references) {
    if (reference.status !== "resolved") continue;
    result.set(reference.mentionId, { mentionId: reference.mentionId, status: "resolved", entityId: reference.entityId, entityType: reference.entityType, confidence: reference.confidence, reasonCode: null, candidates: [] });
  }
  return result;
}

function productionDestinationsFor(events: GovernedCanonicalEvent[], actions: IntelligenceCareAction[], learnings: IntelligenceLearning[]) {
  const selectedEvent = events.find((item) => item.destinations.some((destination) => destination !== "none"));
  const destinations: SemanticPersistenceDestination[] = [...(selectedEvent?.destinations || (actions.length ? ["care_event"] : []))];
  for (const learning of learnings) destinations.push(learning.subjectType === "owner" ? "owner_memory" : "pet_memory");
  return unique(destinations);
}

function destinationsForHint(hint: SemanticPersistenceHint) {
  if (hint === "history") return ["care_event"];
  if (hint === "current_state") return ["care_event", "episode_current_state"];
  if (hint === "profile") return ["profile_change"];
  if (hint === "relationship") return ["relationship_context"];
  return [hint];
}

function productionSubjectKeys(events: GovernedCanonicalEvent[], actions: IntelligenceCareAction[], learnings: IntelligenceLearning[], selectedPetId: string, ownerId: string) {
  return unique([
    ...events.map((item) => item.event.subject.type === "owner" ? `owner:${ownerId}` : item.event.subject.id ? `pet:${item.event.subject.id}` : null),
    ...(events.length || !actions.length ? [] : [`pet:${selectedPetId}`]),
    ...learnings.map((learning) => learning.subjectType === "owner" ? `owner:${ownerId}` : `pet:${learning.subjectId || selectedPetId}`),
  ].filter((value): value is string => Boolean(value)));
}

function compatibleEpisode(concept: ReturnType<typeof claimConcept>, episodes: CareEpisode[]) {
  const records = episodes.map((episode) => episodeConceptRecord(episode));
  const resolution = resolveProvisionalConcept(concept, records);
  return resolution.status === "resolved" && resolution.candidates.some((candidate) => candidate.key === resolution.canonicalKey && candidate.source === "active_episode");
}

function claimUsesMention(claims: ProposedSemanticClaim[], mentionId: string) {
  return claims.some((claim) => claim.subjectRef === mentionId || claim.kind === "relationship" && claim.objectRef === mentionId || claim.kind === "event" && claim.participants.some((participant) => participant.entityRef === mentionId));
}

function claimConcept(claim: ProposedSemanticClaim) {
  return claim.kind === "state_transition" ? claim.targetConcept : claim.predicate;
}

function claimEvidenceFailureReasons(failures: Array<{ ownerType: "mention" | "claim"; ownerId: string; reason: EvidenceGroundingFailureReason }>) {
  const result = new Map<string, SemanticReasonCode>();
  for (const failure of failures) {
    if (failure.ownerType === "claim" && !result.has(failure.ownerId)) result.set(failure.ownerId, evidenceReasonCode(failure.reason));
  }
  return result;
}

function evidenceReasonCode(reason: EvidenceGroundingFailureReason): SemanticReasonCode {
  if (reason === "EVIDENCE_EMPTY_SURFACE") return "EVIDENCE_EMPTY_SURFACE";
  if (reason === "EVIDENCE_AMBIGUOUS") return "EVIDENCE_AMBIGUOUS";
  return "EVIDENCE_NOT_FOUND";
}

function countReasons(reasons: SemanticReasonCode[]) {
  const counts: Partial<Record<SemanticReasonCode, number>> = {};
  for (const reason of reasons) counts[reason] = (counts[reason] || 0) + 1;
  return counts;
}

function buildProductionConceptRecords(
  events: GovernedCanonicalEvent[], actions: IntelligenceCareAction[], learnings: IntelligenceLearning[], episodes: CareEpisode[],
): SemanticConceptRecord[] {
  const records: SemanticConceptRecord[] = [
    ...events.map((item) => conceptRecord(item.event.normalizedTopic, "production_event" as const, [item.event.topic])),
    ...actions.map((item) => conceptRecord(item.category, "production_action" as const)),
    ...learnings.map((item) => conceptRecord(item.factKey, "production_learning" as const, [item.category])),
    ...episodes.map(episodeConceptRecord),
  ];
  const seen = new Set<string>();
  return records.filter((record) => {
    const identity = `${record.source}:${record.key}`;
    if (!record.key || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function conceptRecord(label: string, source: SemanticConceptRecord["source"], aliases: string[] = []): SemanticConceptRecord {
  return { key: normalizeConceptLabel(label), label, aliases, source };
}

function episodeConceptRecord(episode: CareEpisode): SemanticConceptRecord {
  const summaryTopic = typeof episode.summary?.semanticTopic === "string" ? episode.summary.semanticTopic : "";
  return conceptRecord(summaryTopic || episode.normalized_key, "active_episode", summaryTopic ? [episode.normalized_key] : []);
}

function productionClaimKinds(events: GovernedCanonicalEvent[], actions: IntelligenceCareAction[], learnings: IntelligenceLearning[]) {
  const kinds: SemanticClaimKind[] = events.map((item) => productionEventKind(item.event.transition));
  if (!events.length) {
    kinds.push(...actions.filter((item) => item.action !== "none").map((item) => {
      if (item.action === "resolve_concern" || item.action === "reopen_concern") return "state_transition" as const;
      if (item.action === "update_profile") return "assertion" as const;
      return "event" as const;
    }));
  }
  const eventKeys = new Set(events.map((item) => normalizeConceptLabel(item.event.normalizedTopic)));
  kinds.push(...learnings.filter((item) => !eventKeys.has(normalizeConceptLabel(item.factKey))).map((item) =>
    item.category === "preference" || item.category === "shopping" ? "preference" as const : "assertion" as const));
  return kinds;
}

function productionEventKind(transition: GovernedCanonicalEvent["event"]["transition"]): SemanticClaimKind {
  if (transition === "preference_set") return "preference";
  if (transition === "corrected") return "correction";
  if (["continued", "changed", "improved", "worsened", "resolved"].includes(transition)) return "state_transition";
  return "event";
}

function traceConceptResolution(resolution: ShadowConceptResolution) {
  return {
    conceptKey: resolution.proposedKey,
    status: resolution.status,
    resolvedKey: resolution.canonicalKey,
    relation: resolution.relation,
    scoreBand: resolution.confidence >= 0.95 ? "strong" : resolution.confidence >= 0.85 ? "likely" : resolution.confidence > 0 ? "weak" : "none",
    provisional: resolution.status !== "resolved",
  };
}

function redactMentionSurface(surface: string, coarseType: string, pets: Array<{ name: string | null }>) {
  const normalized = normalizeText(surface);
  if (pets.some((pet) => normalizeText(pet.name || "") === normalized)) return "[PET_NAME]";
  if (coarseType === "animal") return "[ANIMAL_MENTION]";
  if (coarseType === "person") return "[PERSON_MENTION]";
  if (coarseType === "organization") return "[ORGANIZATION_MENTION]";
  return `[REDACTED:${lengthBand(surface.length)}]`;
}

function bindingLabel(binding: ShadowEntityBinding, selectedPetId: string, ownerId: string) {
  if (binding.entityId === selectedPetId) return "selected_pet";
  if (binding.entityId === ownerId) return "authenticated_owner";
  return `${binding.entityType}:${createHash("sha256").update(binding.entityId || "").digest("hex").slice(0, 12)}`;
}

function normalizeText(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function lengthBand(length: number) { return length <= 4 ? "SHORT" : length <= 12 ? "MEDIUM" : "LONG"; }
function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((item) => right.includes(item)); }
function sameMultiset(left: string[], right: string[]) { return [...left].sort().join("|") === [...right].sort().join("|"); }
function legacyTransitionRole(transition: GovernedCanonicalEvent["event"]["transition"]) {
  if (transition === "started") return "opening";
  if (transition === "continued") return "continuation";
  if (transition === "improved") return "improvement";
  if (transition === "worsened") return "worsening";
  if (transition === "resolved") return "resolution";
  if (transition === "corrected") return "correction";
  return "unknown";
}
function unique<T>(items: T[]) { return [...new Set(items)]; }
function isReasonCode(value: SemanticReasonCode | null): value is SemanticReasonCode { return Boolean(value); }
