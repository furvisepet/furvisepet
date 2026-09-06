import type { IntelligenceCareAction, IntelligenceLearning, IntelligenceMessageUnderstanding, IntelligenceSafetyLevel } from "./types";
import { analyzeOwnerAssertions, isOwnerCertainEvidence } from "../ai/owner-assertion.ts";
import { classifyUserTurn } from "../ai/turn-classifier.ts";
import { buildResolutionSuggestion, isRecoveryGroundedForConcern, type PetConcern } from "../ai/concern-engine.ts";
import { isPetObservationEvidence } from "../ai/recovery-subject.ts";
import { containsUnsupportedPetIdentitySemantics } from "./pet-identity-persistence-policy.ts";
import { evaluateCareHistorySaveWorthiness } from "./care-history-policy.ts";
import { canPersistFurviseMemory } from "../application-actions/memory-scopes.ts";
import { prepareTypedMemoryCandidate } from "./memory-integrity.ts";

const diagnosisPattern = /\b(diagnos(?:e|is)|has allergies|has an infection|is sick|definitely has)\b/i;
const dosagePattern = /\b\d+(?:\.\d+)?\s*(?:mg|ml|tablet|capsule)s?\b/i;

export function evaluateLearningPolicy(learnings: IntelligenceLearning[], currentMessage: string, authorizedPetIds: readonly string[]) {
  const accepted: IntelligenceLearning[] = [];
  const rejected: Array<{ learning: IntelligenceLearning; reason: string }> = [];
  for (const learning of learnings.slice(0, 8)) {
    if (learning.subjectType === "pet" && containsUnsupportedPetIdentitySemantics(
      learning.category, learning.factKey, stringify(learning.factValue), learning.sourceExcerpt,
    )) {
      rejected.push({ learning, reason: "unsupported_pet_identity_claim" });
      continue;
    }
    const semanticDecision = prepareTypedMemoryCandidate(learning, currentMessage, authorizedPetIds);
    if (!semanticDecision.accepted) {
      rejected.push({ learning, reason: semanticDecision.reason });
      continue;
    }
    const reason = rejectLearningReason(semanticDecision.learning, currentMessage, authorizedPetIds);
    if (reason) rejected.push({ learning, reason });
    else accepted.push({
      ...semanticDecision.learning,
      subjectId: semanticDecision.learning.subjectType === "pet" ? semanticDecision.learning.subjectId || authorizedPetIds[0] : null,
    });
  }
  return { accepted, rejected };
}

export function evaluateCareActionPolicy({
  actions,
  currentMessage,
  safetyLevel,
  activeConcernIds,
  activeConcerns = [],
  petId,
  petName,
}: {
  actions: IntelligenceCareAction[];
  currentMessage: string;
  understanding: IntelligenceMessageUnderstanding;
  safetyLevel: IntelligenceSafetyLevel;
  activeConcernIds: string[];
  activeConcerns?: PetConcern[];
  petId?: string;
  petName?: string;
}) {
  const accepted: IntelligenceCareAction[] = [];
  const rejected: Array<{ action: IntelligenceCareAction; reason: string }> = [];
  const sourceAssertion = analyzeOwnerAssertions(currentMessage);
  const sourceTurn = classifyUserTurn(currentMessage, { hasActiveConcern: activeConcernIds.length > 0 });
  for (const proposedAction of actions.slice(0, 3)) {
    let action = proposedAction;
    let reason = "";
    if (action.action === "none") reason = "no_action";
    else if (containsUnsupportedPetIdentitySemantics(currentMessage, action.category, action.title, action.details)) reason = "unsupported_pet_identity_claim";
    else if (action.confidence < 0.9) reason = "confidence_below_automatic_threshold";
    else if (action.action === "update_profile") reason = "profile_updates_require_explicit_editing";
    else if (!sourceAssertion.hasOwnerAssertion) reason = "message_is_not_an_owner_asserted_care_update";
    else if (!hasSupport(currentMessage, `${action.title} ${action.details}`)) reason = "care_action_not_supported_by_message";
    else if (diagnosisPattern.test(`${action.title} ${action.details}`)) reason = "diagnosis_is_not_persisted";
    else if (dosagePattern.test(action.details) && !dosagePattern.test(currentMessage)) reason = "medication_dosage_not_explicit";
    else if (!evaluateCareHistorySaveWorthiness({
      category: action.category,
      title: action.title,
      details: action.details,
      sourceMessage: currentMessage,
    }).eligible) reason = "insufficient_longitudinal_value";
    else if (action.action === "resolve_concern") {
      const concern = activeConcerns.find((item) => item.id === action.relatedRecordId) || null;
      if (sourceTurn.concernState !== "resolved"
        || safetyLevel !== "recently_resolved"
        || !action.relatedRecordId
        || !activeConcernIds.includes(action.relatedRecordId)
        || !concern
        || !isRecoveryGroundedForConcern({ activeConcerns, concern, message: currentMessage, petId, petName })) {
        reason = "concern_resolution_not_sufficiently_grounded";
      }
      if (!reason && concern && petName) {
        const canonical = buildResolutionSuggestion({ concern, message: currentMessage, petName });
        action = { ...action, title: String(canonical.payload.title), details: String(canonical.payload.resolutionNote) };
      }
    }
    if (!reason && action.action === "create_entry" && petName
      && /\b(?:resolved|recovered|normal|stopped|ceased)\b/i.test(`${action.title} ${action.details}`)) {
      // A history action is not an alternate channel for a rejected resolution.
      if (!isPetObservationEvidence(currentMessage, currentMessage, petName)) reason = "care_action_subject_or_source_ambiguous";
      else action = { ...action, title: "Care update", details: currentMessage.trim(), relatedRecordId: null };
    }
    if (reason) rejected.push({ action, reason });
    else if (!accepted.some((item) => item.action === "create_entry" || item.action === "resolve_concern")) accepted.push(action);
    else rejected.push({ action, reason: "one_automatic_care_event_per_message" });
  }
  return { accepted, rejected };
}

function rejectLearningReason(learning: IntelligenceLearning, currentMessage: string, authorizedPetIds: readonly string[]) {
  if (!canPersistFurviseMemory(learning.factKey)) return "conversation_scope_is_not_durable";
  if (learning.action === "none" || learning.durability === "temporary") return "not_durable";
  if (learning.confidence < 0.85) return "confidence_below_automatic_threshold";
  if (!learning.factKey.trim() || typeof learning.factValue !== "string" || !learning.factValue.trim()) return "empty_fact";
  if (learning.subjectType === "pet" && learning.subjectId && !authorizedPetIds.includes(learning.subjectId)) return "wrong_pet";
  if (learning.subjectType === "pet" && !learning.subjectId && authorizedPetIds.length !== 1) return "ambiguous_pet";
  if (learning.subjectType === "pet" && containsUnsupportedPetIdentitySemantics(
    learning.category, learning.factKey, learning.factValue, learning.sourceExcerpt,
  )) return "unsupported_pet_identity_claim";
  if (diagnosisPattern.test(`${learning.category} ${learning.factKey} ${stringify(learning.factValue)}`)) return "diagnosis_is_not_memory";
  if (!learning.sourceExcerpt.trim() || !normalized(currentMessage).includes(normalized(learning.sourceExcerpt))) return "source_excerpt_not_explicit";
  if (!isOwnerCertainEvidence(currentMessage, learning.sourceExcerpt)) return "source_excerpt_is_not_certain_owner_assertion";
  if (/^(?:hello|hi|hey|thanks|thank you|okay|ok)$/i.test(learning.factValue.trim())) return "conversational_filler";
  return "";
}

function hasSupport(message: string, proposed: string) {
  const messageTerms = new Set(tokens(message));
  const proposedTerms = tokens(proposed);
  return proposedTerms.filter((term) => messageTerms.has(term)).length >= Math.min(2, Math.max(1, Math.floor(messageTerms.size / 3)));
}

function tokens(value: string) { return [...new Set(normalized(value).match(/[a-z0-9]{3,}/g) || [])]; }
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function stringify(value: unknown) { try { return JSON.stringify(value); } catch { return "[unavailable]"; } }

export function normalizeMemoryValue(value: unknown) {
  if (typeof value !== "string") return "";
  const raw = value;
  return raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
}
