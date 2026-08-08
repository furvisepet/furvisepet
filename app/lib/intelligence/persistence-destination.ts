import type { CanonicalEvent, IntelligenceCareAction, IntelligenceLearning, SemanticPersistenceDestination } from "./types.ts";

export type PersistenceDestination = "pet_memory" | "owner_memory" | "care_event" | "profile_change" | "state_only" | "none";
export type PersistenceDestinationDecision = { destination: PersistenceDestination; reason: string; confidence: number; requiresConfirmation: boolean };

const CHRONOLOGICAL_TRANSITIONS = new Set(["observed", "started", "continued", "changed", "improved", "worsened", "resolved", "corrected", "confirmed"]);
const CHRONOLOGICAL_DOMAINS = new Set(["health", "behavior", "nutrition", "medication", "safety", "routine", "care", "other"]);

/**
 * Routes validated semantics, not phrases. Completed point-in-time care belongs in
 * History, while an ongoing lifecycle also updates its episode/current state.
 */
export function routeSemanticEventDestinations(event: CanonicalEvent): SemanticPersistenceDestination[] {
  if (event.transition === "preference_set") return [event.subject.type === "owner" ? "owner_memory" : "pet_memory"];
  if (event.domain === "profile" && event.transition === "corrected") return ["profile_change"];
  if (event.subject.type !== "pet") return ["none"];

  const destinations: SemanticPersistenceDestination[] = [];
  const hasExplicitTime = Boolean(event.temporal.occurredAt?.trim() || event.temporal.explicitTime?.trim());
  const isChronologicalCareEvent = CHRONOLOGICAL_DOMAINS.has(event.domain) && event.confidence >= 0.9 && (
    event.state === "historical"
    || hasExplicitTime
    || CHRONOLOGICAL_TRANSITIONS.has(event.transition)
  );
  if (isChronologicalCareEvent) destinations.push("care_event");
  if (CHRONOLOGICAL_DOMAINS.has(event.domain) && ["active", "monitoring", "resolved"].includes(event.state)) destinations.push("episode_current_state");

  return destinations.length ? destinations : ["none"];
}

export function routePersistenceDestinations(input: {
  message: string;
  petId: string;
  learnings: IntelligenceLearning[];
  careActions: IntelligenceCareAction[];
}) {
  const message = input.message.trim();
  const petPreference = /\b(refuses?|dislikes?|likes?|prefers?)\b/i.test(message) && /\b(chews?|treats?|textures?|baths?|groom\w*|food)\b/i.test(message);
  const retailerPreference = /\b(?:usually\s+)?shop(?:s|ping)?\s+(?:at|from)\s+([A-Z][\w&'-]*)/i.exec(message);
  const budgetPreference = /\bprefer\w*\s+products?\s+under\s+\$(\d+(?:\.\d{1,2})?)/i.exec(message);
  const vagueMedication = /\b(?:medication|medicine|tablet|capsule)\b/i.test(message) && !hasNamedMedication(message);
  const namedMedication = medicationUpdate(message);

  if (vagueMedication) return {
    decisions: [{ destination: "none", reason: "unnamed_medication_requires_clarification", confidence: 1, requiresConfirmation: true }] satisfies PersistenceDestinationDecision[],
    learnings: [], careActions: [],
  };
  if (namedMedication) {
    const proposed = input.careActions.find((item) => item.category === "medication");
    const action: IntelligenceCareAction = {
      action: "create_entry", category: "medication",
      title: `${namedMedication.operation === "start" ? "Started" : "Finished"} ${namedMedication.name}`,
      details: proposed?.details || message, severity: "routine", confidence: 0.99, relatedRecordId: null,
      episodeOperation: namedMedication.operation, normalizedEpisodeKey: `medication_${namedMedication.name.toLowerCase()}`,
    };
    return { decisions: [{ destination: "care_event", reason: `explicit_medication_${namedMedication.operation}`, confidence: 0.99, requiresConfirmation: false }] satisfies PersistenceDestinationDecision[], learnings: [], careActions: [action] };
  }
  if (petPreference) {
    const learning = canonicalPetPreference(message, input.petId) || input.learnings.find((item) => item.subjectType === "pet");
    return {
      decisions: [{ destination: "pet_memory", reason: "explicit_durable_pet_preference", confidence: 0.99, requiresConfirmation: false }] satisfies PersistenceDestinationDecision[],
      learnings: learning ? [learning] : [], careActions: [],
    };
  }
  if (retailerPreference) {
    return {
      decisions: [{ destination: "owner_memory", reason: "explicit_owner_retailer_preference", confidence: 0.99, requiresConfirmation: false }] satisfies PersistenceDestinationDecision[],
      learnings: [ownerLearning("preferred_retailer", retailerPreference[1], message)], careActions: [],
    };
  }
  if (budgetPreference) {
    return {
      decisions: [{ destination: "owner_memory", reason: "explicit_owner_budget_preference", confidence: 0.99, requiresConfirmation: false }] satisfies PersistenceDestinationDecision[],
      learnings: [ownerLearning("product_budget_preference", `under $${budgetPreference[1]} unless there is a much better option`, message)], careActions: [],
    };
  }

  const decisions: PersistenceDestinationDecision[] = [];
  if (input.learnings.some((item) => item.subjectType === "pet")) decisions.push({ destination: "pet_memory", reason: "approved_pet_learning", confidence: 0.95, requiresConfirmation: false });
  if (input.learnings.some((item) => item.subjectType === "owner")) decisions.push({ destination: "owner_memory", reason: "approved_owner_learning", confidence: 0.95, requiresConfirmation: false });
  if (input.careActions.some((item) => ["create_entry", "resolve_concern", "reopen_concern"].includes(item.action))) decisions.push({ destination: "care_event", reason: "explicit_care_chronology_update", confidence: 0.95, requiresConfirmation: false });
  if (!decisions.length) decisions.push({ destination: "none", reason: "no_approved_persistence", confidence: 1, requiresConfirmation: false });
  return { decisions, learnings: input.learnings, careActions: input.careActions };
}

function canonicalPetPreference(message: string, petId: string): IntelligenceLearning | null {
  if (!/\bchew/i.test(message)) return null;
  return { subjectType: "pet", subjectId: petId, category: "product_preference", factKey: "dental_chew_texture_preference",
    factValue: "prefers softer dental chews and refuses hard dental chews", confidence: 0.99, importance: "medium", durability: "ongoing",
    action: "create", sourceExcerpt: message };
}

function ownerLearning(factKey: string, factValue: string, message: string): IntelligenceLearning {
  return { subjectType: "owner", subjectId: null, category: "shopping", factKey, factValue, confidence: 0.99,
    importance: "medium", durability: "ongoing", action: "create", sourceExcerpt: message };
}

function hasNamedMedication(message: string) {
  const match = /\b(?:started|finished|completed|stopped|took)\s+([A-Za-z][A-Za-z0-9-]{2,})\b/i.exec(message);
  return Boolean(match && !/^(?:a|an|one|the|some|medication|medicine|tablet|capsule)$/i.test(match[1]));
}

function medicationUpdate(message: string) {
  const match = /\b(started|finished|completed|stopped)\s+([A-Za-z][A-Za-z0-9-]{2,})\b/i.exec(message);
  if (!match || /^(?:a|an|the|some|medication|medicine)$/i.test(match[2])) return null;
  return { name: match[2], operation: /^(?:finished|completed|stopped)$/i.test(match[1]) ? "complete" as const : "start" as const };
}
