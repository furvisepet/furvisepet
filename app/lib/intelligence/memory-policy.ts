import type { IntelligenceCareAction, IntelligenceLearning, IntelligenceMessageUnderstanding, IntelligenceSafetyLevel } from "./types";

const forbiddenOwnerCategories = /(?:age|race|religion|politic|medical_condition|disability|sexual|ethnicity)/i;
const diagnosisPattern = /\b(diagnos(?:e|is)|has allergies|has an infection|is sick|definitely has)\b/i;
const dosagePattern = /\b\d+(?:\.\d+)?\s*(?:mg|ml|tablet|capsule)s?\b/i;

export function evaluateLearningPolicy(learnings: IntelligenceLearning[], currentMessage: string, authorizedPetIds: readonly string[]) {
  const accepted: IntelligenceLearning[] = [];
  const rejected: Array<{ learning: IntelligenceLearning; reason: string }> = [];
  for (const learning of learnings.slice(0, 8)) {
    const reason = rejectLearningReason(learning, currentMessage, authorizedPetIds);
    if (reason) rejected.push({ learning, reason });
    else accepted.push({
      ...learning,
      subjectId: learning.subjectType === "pet" ? learning.subjectId || authorizedPetIds[0] : null,
    });
  }
  return { accepted, rejected };
}

export function evaluateCareActionPolicy({
  actions,
  currentMessage,
  understanding,
  safetyLevel,
  activeConcernIds,
}: {
  actions: IntelligenceCareAction[];
  currentMessage: string;
  understanding: IntelligenceMessageUnderstanding;
  safetyLevel: IntelligenceSafetyLevel;
  activeConcernIds: string[];
}) {
  const accepted: IntelligenceCareAction[] = [];
  const rejected: Array<{ action: IntelligenceCareAction; reason: string }> = [];
  for (const action of actions.slice(0, 3)) {
    let reason = "";
    if (action.action === "none") reason = "no_action";
    else if (action.confidence < 0.9) reason = "confidence_below_automatic_threshold";
    else if (action.action === "update_profile") reason = "profile_updates_require_explicit_editing";
    else if (!understanding.userIsProvidingUpdate && !understanding.userIsResolvingConcern && !understanding.userIsCorrectingPriorInformation) reason = "message_is_not_an_explicit_care_update";
    else if (!hasSupport(currentMessage, `${action.title} ${action.details}`)) reason = "care_action_not_supported_by_message";
    else if (diagnosisPattern.test(`${action.title} ${action.details}`)) reason = "diagnosis_is_not_persisted";
    else if (dosagePattern.test(action.details) && !dosagePattern.test(currentMessage)) reason = "medication_dosage_not_explicit";
    else if (action.action === "resolve_concern" && (safetyLevel !== "recently_resolved" || !action.relatedRecordId || !activeConcernIds.includes(action.relatedRecordId))) reason = "concern_resolution_not_sufficiently_grounded";
    if (reason) rejected.push({ action, reason });
    else if (!accepted.some((item) => item.action === "create_entry" || item.action === "resolve_concern")) accepted.push(action);
    else rejected.push({ action, reason: "one_automatic_care_event_per_message" });
  }
  return { accepted, rejected };
}

function rejectLearningReason(learning: IntelligenceLearning, currentMessage: string, authorizedPetIds: readonly string[]) {
  if (learning.action === "none" || learning.durability === "temporary") return "not_durable";
  if (learning.confidence < 0.85) return "confidence_below_automatic_threshold";
  if (!learning.factKey.trim() || learning.factValue === null || learning.factValue === undefined) return "empty_fact";
  if (learning.subjectType === "pet" && learning.subjectId && !authorizedPetIds.includes(learning.subjectId)) return "wrong_pet";
  if (learning.subjectType === "pet" && !learning.subjectId && authorizedPetIds.length !== 1) return "ambiguous_pet";
  if (learning.subjectType === "owner" && forbiddenOwnerCategories.test(`${learning.category} ${learning.factKey}`)) return "sensitive_owner_inference";
  if (diagnosisPattern.test(`${learning.category} ${learning.factKey} ${stringify(learning.factValue)}`)) return "diagnosis_is_not_memory";
  if (!learning.sourceExcerpt.trim() || !normalized(currentMessage).includes(normalized(learning.sourceExcerpt))) return "source_excerpt_not_explicit";
  if (/^(?:hello|hi|hey|thanks|thank you|okay|ok)$/i.test(String(learning.factValue).trim())) return "conversational_filler";
  return "";
}

function hasSupport(message: string, proposed: string) {
  const messageTerms = new Set(tokens(message));
  const proposedTerms = tokens(proposed);
  return proposedTerms.filter((term) => messageTerms.has(term)).length >= Math.min(2, Math.max(1, Math.floor(messageTerms.size / 3)));
}

function tokens(value: string) { return [...new Set(normalized(value).match(/[a-z0-9]{3,}/g) || [])]; }
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function stringify(value: unknown) { try { return JSON.stringify(value); } catch { return String(value); } }

export function normalizeMemoryValue(value: unknown) {
  const raw = stringify(value);
  return raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
}
