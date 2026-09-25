export const PUBLIC_V1_CAPABILITIES = Object.freeze({
  askMutations: false,
  calculationExecution: false,
  vetBriefGeneration: false,
});

export const PUBLIC_V1_ASK_MUTATION_LIMITATION =
  "Ask can read your saved information in this public beta, but it cannot change records yet. Use Today, History, or Pets to make changes.";

export const PUBLIC_V1_VET_BRIEF_LIMITATION =
  "New Vet Brief generation is not available in the public beta yet.";

const ASK_MUTATION_KEYS = Object.freeze([
  "appendJob",
  "writeJob",
  "removeJob",
  "fieldMutationJob",
  "stateTransitionJob",
  "task",
] as const);

function lifecyclePlanRequestsMutation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return plan.pendingDisposition === "cancel" || plan.transition !== null && plan.transition !== undefined;
}

export function publicV1RequestHasExcludedAskMutation(request: unknown) {
  if (PUBLIC_V1_CAPABILITIES.askMutations || !request || typeof request !== "object") return false;
  const record = request as Record<string, unknown>;
  return ASK_MUTATION_KEYS.some((key) => record[key] !== null && record[key] !== undefined)
    || lifecyclePlanRequestsMutation(record.lifecyclePlan);
}
