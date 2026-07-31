import type { IntelligenceCareAction, IntelligenceLearning } from "../types.ts";
import type { GovernanceDecision, GovernanceResult, ProfileChangeProposal, StateEffectProposal } from "./types.ts";

const protectedFields = new Set(["identity", "species", "sex", "birthdate", "allergy", "weight", "medication", "diagnosis"]);
export function authorizeProposedActions(input: { message: string; petId: string; careActions: IntelligenceCareAction[]; memories: IntelligenceLearning[]; stateEffects?: StateEffectProposal[]; profileChanges?: ProfileChangeProposal[] }): GovernanceResult {
  const explicit = normalize(input.message);
  return {
    careActions: dedupe(input.careActions, (action) => `${action.action}:${action.category}:${action.relatedRecordId || ""}:${normalize(action.title)}`).map((action) => decideCare(action, explicit)),
    memories: dedupe(input.memories, (memory) => `${memory.subjectType}:${memory.subjectId || ""}:${memory.factKey}:${JSON.stringify(memory.factValue)}`).map((memory) => decideMemory(memory, explicit, input.petId)),
    stateEffects: (input.stateEffects || []).map((effect) => evidenceContains(explicit, effect.sourceExcerpt) && effect.confidence >= 0.9
      ? accepted(effect) : rejected(effect, effect.confidence < 0.9 ? "low_confidence" : "unsupported_evidence")),
    profileChanges: (input.profileChanges || []).map((change) => {
      if (!evidenceContains(explicit, change.sourceExcerpt)) return rejected(change, "unsupported_evidence");
      if (protectedFields.has(change.field)) return { proposal: change, decision: "deferred", reason: "protected_field" };
      return change.confidence >= 0.95 ? accepted(change) : { proposal: change, decision: "deferred", reason: "low_confidence" };
    }),
  };
}
function decideCare(action: IntelligenceCareAction, message: string): GovernanceDecision<IntelligenceCareAction> {
  if (action.confidence < 0.9) return rejected(action, "low_confidence");
  if (/diagnos|prescrib|dosage|\b\d+(?:\.\d+)?\s*(?:mg|ml)\b/i.test(`${action.title} ${action.details}`)) return rejected(action, "unsupported_diagnosis");
  if (!evidenceContains(message, action.details) && !evidenceContains(message, action.title)) return rejected(action, "unsupported_evidence");
  return accepted(action);
}
function decideMemory(memory: IntelligenceLearning, message: string, petId: string): GovernanceDecision<IntelligenceLearning> {
  if (memory.subjectType === "pet" && memory.subjectId && memory.subjectId !== petId) return rejected(memory, "wrong_pet");
  if (memory.confidence < 0.8) return rejected(memory, "low_confidence");
  if (!evidenceContains(message, memory.sourceExcerpt)) return rejected(memory, "unsupported_evidence");
  if (memory.category === "diagnosis") return rejected(memory, "unsupported_diagnosis");
  return accepted(memory);
}
function evidenceContains(message: string, excerpt: string) {
  const normalized = normalize(excerpt); const words = [...new Set(normalized.split(" ").filter((word) => word.length > 3))];
  const overlap = words.filter((word) => message.includes(word)).length;
  return normalized.length >= 3 && (message.includes(normalized) || overlap >= Math.min(2, words.length));
}
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function dedupe<T>(items: T[], key: (item: T) => string) { const seen = new Set<string>(); return items.filter((item) => { const value = key(item); if (seen.has(value)) return false; seen.add(value); return true; }); }
function accepted<T>(proposal: T): GovernanceDecision<T> { return { proposal, decision: "accepted", reason: null }; }
function rejected<T>(proposal: T, reason: GovernanceDecision<T>["reason"]): GovernanceDecision<T> { return { proposal, decision: "rejected", reason }; }
