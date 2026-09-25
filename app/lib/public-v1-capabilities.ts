export const PUBLIC_V1_CAPABILITIES = Object.freeze({
  askMutations: false,
  calculationExecution: false,
  vetBriefGeneration: false,
});

export const PUBLIC_V1_ASK_MUTATION_LIMITATION =
  "Ask can read your saved information in this public beta, but it cannot change records yet. Use Today, History, or Pets to make changes.";

export const PUBLIC_V1_VET_BRIEF_LIMITATION =
  "New Vet Brief generation is not available in the public beta yet.";

export const PUBLIC_V1_ASK_READ_LIMITATION =
  "Ask can read saved history, profile details, and supported saved information in this public beta. Other generated answers are not available yet.";

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

export function publicV1RequestIsSupportedAskRead(request: unknown) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return false;
  const record = request as Record<string, unknown>;
  if (!PUBLIC_V1_CAPABILITIES.calculationExecution
    && record.calculatePlan !== null && record.calculatePlan !== undefined) return false;
  if (publicV1RequestHasExcludedAskMutation(record)) return false;
  if (record.mode !== "read") return false;
  if (record.readTicket !== null && record.readTicket !== undefined) return true;
  if (record.storedRead !== null && record.storedRead !== undefined) return true;
  return Array.isArray(record.profileFields) && record.profileFields.length > 0;
}
