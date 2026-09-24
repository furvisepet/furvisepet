import type { AskReasoningResult } from "../ai/ask-reasoning.ts";
import type { AskEvidenceContract } from "./ask-evidence.ts";
import type { FurviseLiveContext } from "./types.ts";
import { buildImmediateEmergencyGuidance, isImmediateAskEmergencyTag } from "../ask-safety-context.ts";
import type { ResolvedSafetyState } from "./safety-state.ts";
import { dependsOnStoredState } from "./factual-dispatch.ts";

export const STORED_EMERGENCY = "server-current-emergency";
export const STORED_EMERGENCY_REASON = "current_emergency_superseded_stored_fact";

/** Terminal applicability consumes turn-local server safety; it never interprets language. */
export function storedEmergencyApplies(evidence: AskEvidenceContract | undefined, safety: ResolvedSafetyState | undefined): boolean {
  return dependsOnStoredState(evidence) && safety?.currentMessageEmergency === true;
}
export function storedEmergencySafetyFailure(safety: ResolvedSafetyState | undefined): string | null {
  const tags = safety?.currentMessageEmergencyTags;
  return safety?.currentMessageEmergency === true && safety.level === "emergency"
    && Array.isArray(tags) && tags.length > 0 && tags.every(isImmediateAskEmergencyTag)
    && new Set(tags).size === tags.length ? null : "emergency_safety_inconsistent";
}
function guidance(safety: ResolvedSafetyState) {
  if (storedEmergencySafetyFailure(safety)) throw new Error("EMERGENCY_SAFETY_INCONSISTENT");
  return buildImmediateEmergencyGuidance({ tags: [...safety.currentMessageEmergencyTags] });
}
const empty = (value: unknown) => Array.isArray(value) && value.length === 0;

/** Stripping factual presentation is not permission to launder scope or writes. */
export function storedEmergencyInputFailure(result: AskReasoningResult, context: FurviseLiveContext, authorizedPetIds: readonly string[]): string | null {
  const e = result.evidenceContract, r = e?.interpretation?.request;
  const owned = new Set(context.eligiblePets.filter(p => p.user_id === context.owner.userId).map(p => p.id));
  const validScope = (ids: unknown): ids is string[] => Array.isArray(ids)
    && ids.every(id => typeof id === "string" && owned.has(id) && authorizedPetIds.includes(id));
  if (!e || !validScope(e.scope.authorizedPetIds) || !validScope([...authorizedPetIds])
    || e.interpretation?.petIds && !validScope(e.interpretation.petIds)
    || r?.readTicket && !validScope(r.readTicket.subjects.petIds)
    || r?.storedRead && (r.storedRead.ownerId !== context.owner.userId || !validScope(r.storedRead.subjectIds)))
    return "emergency_publication_scope";
  if (![result.applicationActions, result.careActions, result.semanticEvents, result.learnings].every(empty)
    || !result.proposedHistoryUpdate || result.proposedHistoryUpdate.shouldOffer !== false
    || Object.entries(result.proposedHistoryUpdate).some(([key, value]) => key !== "shouldOffer" && value !== null)
    || r?.writeJob || r?.appendJob || r?.removeJob || r?.fieldMutationJob || r?.stateTransitionJob
    || r?.lifecyclePlan || r?.mutationIntent
    || r?.jobs?.some(job => !["read", "read_since_event", "compare", "count", "episode"].includes(job.operation)))
    return "emergency_publication_has_write";
  return null;
}

/** No historical review receipt is transferred: this publishes safety guidance only. */
export function replaceStoredPublicationWithEmergency(response: AskReasoningResult, safety: ResolvedSafetyState) {
  response.model = STORED_EMERGENCY;
  response.answer = guidance(safety);
  response.relevantContextIds = [];
  response.referencedRecords = [];
  delete response.labsList;
  delete response.profileFieldLabs;
  delete response.historyNarrative;
  delete response.historicalResult;
  delete response.historySynthesis;
  delete response.historyNarrativeDeclined;
  if (response.evidenceContract) {
    delete response.evidenceContract.answerSourceIds;
    delete response.evidenceContract.answerContent;
  }
  response.applicationActions = [];
  response.careActions = [];
  response.semanticEvents = [];
  response.learnings = [];
  response.proposedHistoryUpdate = { shouldOffer: false, category: null, title: null, details: null, severity: null, resolvesConcernId: null };
  response.suggestedFollowUps = [];
  response.safetyLevel = "urgent";
  response.shoppingSuppressed = true;
  response.responseMode = "urgent_safety";
  response.intelligenceSafety = { level: safety.level,
    reason: STORED_EMERGENCY_REASON, requiresImmediateAction: true, shoppingSuppressed: true };
}

/** Exact terminal contract, not a generic urgent flag or factual review bypass. */
export function storedEmergencyPublicationFailure(result: AskReasoningResult, context: FurviseLiveContext, authorizedPetIds: readonly string[], safety: ResolvedSafetyState | undefined): string | null {
  const safetyFailure = storedEmergencySafetyFailure(safety);
  if (safetyFailure) return safetyFailure;
  const inputFailure = storedEmergencyInputFailure(result, context, authorizedPetIds);
  if (inputFailure) return inputFailure;
  if (result.model !== STORED_EMERGENCY
    || !storedEmergencyApplies(result.evidenceContract, safety)
    || JSON.stringify(result.answer) !== JSON.stringify(guidance(safety!))
    || !empty(result.relevantContextIds) || !empty(result.referencedRecords)
    || result.labsList || result.profileFieldLabs || result.historyNarrative || result.historicalResult || result.historySynthesis
    || result.evidenceContract?.answerSourceIds || result.evidenceContract?.answerContent
    || !empty(result.suggestedFollowUps) || result.safetyLevel !== "urgent" || !result.shoppingSuppressed
    || result.intelligenceSafety.level !== safety!.level
    || result.responseMode !== "urgent_safety" || !result.intelligenceSafety.requiresImmediateAction
    || !result.intelligenceSafety.shoppingSuppressed || result.intelligenceSafety.reason !== STORED_EMERGENCY_REASON)
    return "emergency_publication_changed";
  return null;
}
