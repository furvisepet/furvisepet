import { createHash } from "node:crypto";
import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { CareEpisode } from "./episodes/types.ts";
import { buildRecentPetIds, type EligibleSemanticPet } from "./entities/candidate-retrieval.ts";
import { resolveShadowEntities, type ShadowEntityBinding } from "./entities/resolve-entities.ts";
import { resolveShadowReferences } from "./entities/resolve-references.ts";
import type { SemanticReasonCode } from "./entities/policy.ts";
import type { GovernedCanonicalEvent, IntelligenceCareAction, IntelligenceLearning, SemanticPersistenceDestination } from "./types.ts";
import type { ProposedSemanticClaim, ProposedSemanticFrame, SemanticClaimKind, SemanticPersistenceHint } from "./semantic-frame/types.ts";
import { validateSemanticFrameEvidence } from "./semantic-frame/validate-evidence.ts";

export type SemanticTracePersistence = {
  status: "not_attempted" | "persisted" | "skipped" | "failed";
  errorCode: string | null;
  careEntryCount: number;
  memoryCount: number;
};

export type SemanticComparisonMetrics = {
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
  mentionSurfaces: Array<{ mentionId: string; redactedSurface: string; entityType: string }>;
  entityCandidates: Array<{ mentionId: string; candidateTypes: string[]; scoreBands: string[] }>;
  entityBindings: Array<{ mentionId: string; result: string; binding: string | null; reasonCode: SemanticReasonCode | null }>;
  references: Array<{ referenceId: string; result: string; reasonCode: SemanticReasonCode | null }>;
  concepts: Array<{ conceptKey: string; provisional: true }>;
  governance: Array<{ claimId: string; decision: "accepted" | "rejected" | "deferred" | "no_persistence"; reasonCode: SemanticReasonCode }>;
  productionDestinations: SemanticPersistenceDestination[];
  shadowDestinations: string[];
  clarification: { production: boolean; shadow: boolean; reasonCodes: SemanticReasonCode[] };
  comparison: SemanticComparisonMetrics;
  persistence: SemanticTracePersistence;
  reasonCodes: SemanticReasonCode[];
};

export type ShadowSemanticAnalysis = {
  frame: ProposedSemanticFrame;
  trace: SemanticTrace;
};

export function buildShadowSemanticAnalysis(input: {
  activeEpisodes: CareEpisode[];
  acceptedCareActions: IntelligenceCareAction[];
  acceptedLearnings: IntelligenceLearning[];
  acceptedSemanticEvents: GovernedCanonicalEvent[];
  conversationTurns: Array<{ text: string }>;
  eligiblePets: EligibleSemanticPet[];
  frame: ProposedSemanticFrame;
  message: string;
  ownerId: string;
  reasoning: AskReasoningResult;
  requestId: string;
  selectedPetId: string;
  sourceMessageId: string;
}): ShadowSemanticAnalysis {
  const recentPetIds = buildRecentPetIds(input.eligiblePets, input.conversationTurns);
  const bindings = resolveShadowEntities({ frame: input.frame, ownerId: input.ownerId, pets: input.eligiblePets, recentPetIds, selectedPetId: input.selectedPetId });
  const references = resolveShadowReferences(input.frame, bindings);
  const evidence = validateSemanticFrameEvidence(input.frame, input.message);
  const effectiveBindings = bindReferences(bindings, references);
  const governance = input.frame.claims.map((claim) => governShadowClaim(claim, effectiveBindings, evidence.invalidClaimIds, input.activeEpisodes));
  const shadowDestinations = unique(governance.filter((item) => item.decision === "accepted").flatMap((item) => destinationsForHint(item.claim.persistenceHint)));
  const productionDestinations = productionDestinationsFor(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings);
  const shadowClarificationReasons = unique([
    ...bindings.filter((binding) => binding.status !== "resolved" && claimUsesMention(input.frame.claims, binding.mentionId)).map((binding) => binding.reasonCode).filter(isReasonCode),
    ...references.filter((reference) => reference.status !== "resolved" && claimUsesMention(input.frame.claims, reference.mentionId)).map((reference) => reference.reasonCode).filter(isReasonCode),
    ...governance.filter((item) => item.decision === "deferred").map((item) => item.reasonCode),
  ]);
  const shadowClarification = input.frame.uncertainty.needsClarification || shadowClarificationReasons.length > 0;
  const frameStatus = input.reasoning.semanticFrameValid === false ? "invalid" as const : "valid" as const;
  const productionSubjects = productionSubjectKeys(input.acceptedSemanticEvents, input.acceptedCareActions, input.acceptedLearnings, input.selectedPetId, input.ownerId);
  const shadowSubjects = unique(input.frame.claims.map((claim) => claim.subjectRef ? effectiveBindings.get(claim.subjectRef) : null)
    .filter((binding): binding is ShadowEntityBinding => Boolean(binding?.entityId)).map((binding) => `${binding.entityType}:${binding.entityId}`));
  const productionConcepts = unique([
    ...input.acceptedSemanticEvents.map((item) => normalizeConcept(item.event.normalizedTopic)),
    ...(input.acceptedSemanticEvents.length ? [] : input.acceptedCareActions.map((item) => normalizeConcept(item.category))),
  ]);
  const shadowConcepts = unique(input.frame.claims.map((claim) => normalizeConcept(claim.predicate.label)));
  const productionEventCount = input.acceptedSemanticEvents.length || input.acceptedCareActions.length;
  const shadowEventCount = input.frame.claims.filter((claim) => claim.kind === "event" || claim.kind === "state_transition").length;
  const comparison: SemanticComparisonMetrics = {
    subjectDisagreement: !sameSet(productionSubjects, shadowSubjects),
    persistenceDisagreement: !sameSet(productionDestinations, shadowDestinations),
    eventCountDisagreement: productionEventCount !== shadowEventCount,
    eventCountDelta: shadowEventCount - productionEventCount,
    conceptDisagreement: !sameSet(productionConcepts, shadowConcepts),
    clarificationDisagreement: input.reasoning.messageUnderstanding.needsClarification !== shadowClarification,
  };

  return {
    frame: input.frame,
    trace: {
      traceId: input.requestId,
      frameStatus,
      schemaVersion: input.frame.schemaVersion,
      modelVersion: input.reasoning.model,
      sourceMessageId: input.sourceMessageId,
      selectedPetId: input.selectedPetId,
      claimKinds: unique(input.frame.claims.map((claim) => claim.kind)),
      mentionSurfaces: input.frame.mentions.map((mention) => ({ mentionId: mention.localId, redactedSurface: redactMentionSurface(mention.surface, mention.coarseType, input.eligiblePets), entityType: mention.coarseType })),
      entityCandidates: bindings.map((binding) => ({ mentionId: binding.mentionId, candidateTypes: unique(binding.candidates.map((candidate) => candidate.entityType)), scoreBands: unique(binding.candidates.map((candidate) => candidate.scoreBand)) })),
      entityBindings: bindings.map((binding) => ({ mentionId: binding.mentionId, result: binding.status, binding: binding.entityId ? bindingLabel(binding, input.selectedPetId, input.ownerId) : null, reasonCode: binding.reasonCode })),
      references: references.map((reference) => ({ referenceId: reference.referenceId, result: reference.status, reasonCode: reference.reasonCode })),
      concepts: unique(input.frame.claims.map((claim) => normalizeConcept(claim.predicate.label))).map((conceptKey) => ({ conceptKey, provisional: true })),
      governance: governance.map(({ claim, decision, reasonCode }) => ({ claimId: claim.localId, decision, reasonCode })),
      productionDestinations,
      shadowDestinations,
      clarification: { production: input.reasoning.messageUnderstanding.needsClarification, shadow: shadowClarification, reasonCodes: shadowClarificationReasons },
      comparison,
      persistence: { status: "not_attempted", errorCode: null, careEntryCount: 0, memoryCount: 0 },
      reasonCodes: unique([
        ...(frameStatus === "invalid" ? ["SHADOW_FRAME_INVALID" as const] : []),
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

function governShadowClaim(claim: ProposedSemanticClaim, bindings: Map<string, ShadowEntityBinding>, invalidClaimIds: string[], episodes: CareEpisode[]) {
  if (invalidClaimIds.includes(claim.localId)) return { claim, decision: "rejected" as const, reasonCode: "EVIDENCE_UNSUPPORTED" as const };
  if (claim.uncertainty.confidence < 0.8) return { claim, decision: "rejected" as const, reasonCode: "CLAIM_LOW_CONFIDENCE" as const };
  if (claim.subjectRef) {
    const binding = bindings.get(claim.subjectRef);
    if (!binding || binding.status !== "resolved") return { claim, decision: "deferred" as const, reasonCode: binding?.reasonCode || "ENTITY_NO_MATCH" as const };
  }
  if (claim.kind === "relationship") {
    const binding = bindings.get(claim.objectRef);
    if (!binding || binding.status !== "resolved") return { claim, decision: "deferred" as const, reasonCode: binding?.reasonCode || "ENTITY_NO_MATCH" as const };
  }
  if (claim.kind === "state_transition" && !compatibleEpisode(claim.targetConcept.label, episodes)) {
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

function compatibleEpisode(concept: string, episodes: CareEpisode[]) {
  const normalized = compactConcept(concept);
  return episodes.some((episode) => compactConcept(typeof episode.summary?.semanticTopic === "string" ? episode.summary.semanticTopic : episode.normalized_key) === normalized);
}

function claimUsesMention(claims: ProposedSemanticClaim[], mentionId: string) {
  return claims.some((claim) => claim.subjectRef === mentionId || claim.kind === "relationship" && claim.objectRef === mentionId || claim.kind === "event" && claim.participants.some((participant) => participant.entityRef === mentionId));
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

function normalizeConcept(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100); }
function compactConcept(value: string) { return normalizeConcept(value).replace(/_/g, ""); }
function normalizeText(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function lengthBand(length: number) { return length <= 4 ? "SHORT" : length <= 12 ? "MEDIUM" : "LONG"; }
function sameSet(left: string[], right: string[]) { return left.length === right.length && left.every((item) => right.includes(item)); }
function unique<T>(items: T[]) { return [...new Set(items)]; }
function isReasonCode(value: SemanticReasonCode | null): value is SemanticReasonCode { return Boolean(value); }
