import type { AskInterpretation } from "./interpret-ask.ts";
import { PUBLIC_V1_CAPABILITIES } from "../public-v1-capabilities.ts";

export type AskExecutionCapabilityKind =
  | "history_read"
  | "profile_read"
  | "stored_read"
  | "calculation"
  | "mutation"
  | "clarification"
  | "conversation"
  | "unsupported_plan";

export type AskExecutionCapability = Readonly<{
  kind: AskExecutionCapabilityKind;
  supported: boolean;
}>;

export const ASK_EXECUTION_LIMITATIONS: Readonly<Record<AskExecutionCapabilityKind, string>> = Object.freeze({
  history_read: "This saved-history read is not available yet.",
  profile_read: "This saved-profile read is not available yet.",
  stored_read: "This saved-information read is not available yet.",
  calculation: "Calculations are not available in this public beta yet.",
  mutation: "Ask can read your saved information in this public beta, but it cannot change records yet. Use Today, History, or Pets to make changes.",
  clarification: "I need one more detail before I can continue.",
  conversation: "This type of Ask response is not available in the public beta yet.",
  unsupported_plan: "This request is not available in the public beta yet.",
});

function requestHasMutation(request: Record<string, unknown>) {
  for (const key of ["appendJob","writeJob","removeJob","fieldMutationJob","stateTransitionJob","task"] as const) {
    if (request[key] !== null && request[key] !== undefined) return true;
  }
  const lifecycle = request.lifecyclePlan;
  if (lifecycle && typeof lifecycle === "object" && !Array.isArray(lifecycle)) {
    const plan = lifecycle as Record<string, unknown>;
    if (plan.pendingDisposition === "cancel" || plan.transition !== null && plan.transition !== undefined) return true;
  }
  return false;
}

/** Product availability consumes only the validated semantic interpretation.
 * It never reads question text and never changes subject/retrieval semantics. */
export function assessAskExecutionCapability(interpretation: AskInterpretation): AskExecutionCapability {
  if (interpretation.clarification) return Object.freeze({ kind: "clarification", supported: true });
  const request = interpretation.request as Record<string, unknown> | undefined;
  if (!request) return Object.freeze({ kind: interpretation.conversationOnly ? "conversation" : "unsupported_plan", supported: false });
  if (requestHasMutation(request)) return Object.freeze({ kind: "mutation", supported: PUBLIC_V1_CAPABILITIES.askMutations });
  if (request.calculatePlan !== null && request.calculatePlan !== undefined)
    return Object.freeze({ kind: "calculation", supported: PUBLIC_V1_CAPABILITIES.calculationExecution });
  if (request.readTicket !== null && request.readTicket !== undefined)
    return Object.freeze({ kind: "history_read", supported: true });
  if (request.storedRead !== null && request.storedRead !== undefined)
    return Object.freeze({ kind: "stored_read", supported: true });
  if (Array.isArray(request.profileFields) && request.profileFields.length)
    return Object.freeze({ kind: "profile_read", supported: true });
  if (request.mode === "conversation" || interpretation.conversationOnly)
    return Object.freeze({ kind: "conversation", supported: false });
  return Object.freeze({ kind: "unsupported_plan", supported: false });
}
