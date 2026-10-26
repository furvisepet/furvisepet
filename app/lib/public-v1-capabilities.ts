export const PUBLIC_V1_CAPABILITIES = Object.freeze({
  askMutations: false,
  calculationExecution: false,
  vetBriefGeneration: false,
});

export const PUBLIC_V1_ASK_MUTATION_LIMITATION =
  "Ask can read your saved information in this public beta, but it cannot change records yet. Use Today, History, or Pets to make changes.";

export const PUBLIC_V1_VET_BRIEF_LIMITATION =
  "New Vet Brief generation is not available in the public beta yet.";

export const PUBLIC_V1_CALCULATION_LIMITATION =
  "Furvise cannot perform this type of calculation yet.";

export const PUBLIC_V1_UNPLANNED_LIMITATION =
  "That request isn't available in Ask during the public beta. Ask can read supported saved information in your account, but it cannot access records outside your account.";

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
  const cancellation = plan.pendingDisposition;
  return cancellation === "cancel"
    || cancellation !== null && typeof cancellation === "object" && !Array.isArray(cancellation)
    || plan.transition !== null && plan.transition !== undefined;
}

export function publicV1RequestHasExcludedAskMutation(request: unknown) {
  if (PUBLIC_V1_CAPABILITIES.askMutations || !request || typeof request !== "object") return false;
  const record = request as Record<string, unknown>;
  return ASK_MUTATION_KEYS.some((key) => record[key] !== null && record[key] !== undefined)
    || lifecyclePlanRequestsMutation(record.lifecyclePlan);
}

export type PublicV1AskCapabilityDecision =
  | Readonly<{ available: true; reason: "supported" }>
  | Readonly<{ available: false; reason: "mutation" | "calculation" | "unplanned"; message: string }>;

export function publicV1AskCapability(request: unknown): PublicV1AskCapabilityDecision {
  if (!request || typeof request !== "object" || Array.isArray(request))
    return Object.freeze({ available: false, reason: "unplanned", message: PUBLIC_V1_UNPLANNED_LIMITATION });
  const record = request as Record<string, unknown>;
  if (publicV1RequestHasExcludedAskMutation(record))
    return Object.freeze({ available: false, reason: "mutation", message: PUBLIC_V1_ASK_MUTATION_LIMITATION });
  if (record.calculatePlan !== null && record.calculatePlan !== undefined) {
    if (!PUBLIC_V1_CAPABILITIES.calculationExecution)
      return Object.freeze({ available: false, reason: "calculation", message: PUBLIC_V1_CALCULATION_LIMITATION });
    return Object.freeze({ available: true, reason: "supported" });
  }
  // The original Binder owns mode/scope/source validation. Conversation has no
  // stored evidence or write authority and must reach the existing Mouth path.
  if (record.version === "ask-request.v2" && record.mode === "conversation"
    && [undefined, null, "general", "supplied_context"].includes(record.evidenceBasis as string | null | undefined)
    && record.readTicket == null && record.storedRead == null
    && (record.profileFields == null || Array.isArray(record.profileFields) && record.profileFields.length === 0)
    && (record.evidenceNeeds == null || Array.isArray(record.evidenceNeeds) && record.evidenceNeeds.length === 0))
    return Object.freeze({ available: true, reason: "supported" });
  if (record.mode === "read" && (record.readTicket !== null && record.readTicket !== undefined
    || record.storedRead !== null && record.storedRead !== undefined
    || Array.isArray(record.profileFields) && record.profileFields.length > 0))
    return Object.freeze({ available: true, reason: "supported" });
  return Object.freeze({ available: false, reason: "unplanned", message: PUBLIC_V1_UNPLANNED_LIMITATION });
}
