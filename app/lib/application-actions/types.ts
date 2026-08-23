export const FURVISE_ACTION_KINDS = [
  "pet.read",
  "pet.update_profile",
  "pet.mark_deceased",
  "pet.mark_active",
  "pet.archive",
  "pet.delete_permanently",
  "memory.set_preference",
  "memory.forget_preference",
  "memory.list",
  "memory.edit_detail",
  "care_history.add",
  "care_history.edit",
  "care_history.remove",
  "care_history.query",
  "care_state.resolve",
  "care_state.reopen",
  "vet_brief.prepare",
  "navigation.open_pet_profile",
  "navigation.open_memories",
  "navigation.open_care_history",
  "navigation.open_vet_brief",
] as const;

export type FurviseActionKind = (typeof FURVISE_ACTION_KINDS)[number];

export function parseStoredFurviseActionKind(value: unknown): FurviseActionKind | null {
  return typeof value === "string" && (FURVISE_ACTION_KINDS as readonly string[]).includes(value)
    ? value as FurviseActionKind
    : null;
}
export type FurviseActionSafetyClass = "READ_ONLY" | "LOW_RISK_REVERSIBLE" | "CONFIRMATION_REQUIRED" | "DESTRUCTIVE";
export type FurviseActionMutationClass = "read" | "mutation" | "navigation";
export type FurviseActionConfirmationPolicy = "none" | "explicit_intent" | "always";
export type FurviseActionStatus = "proposed" | "confirmation_required" | "succeeded" | "failed" | "cancelled";

export type FurviseActionInput = {
  field: string | null;
  value: string | null;
  title: string | null;
  detail: string | null;
  category: string | null;
  target: "selected" | "last" | "specified" | null;
};

export type ModelApplicationAction = {
  kind: FurviseActionKind;
  input: FurviseActionInput;
  evidence: string;
  /** Non-authoritative model classification. Never use directly for mutation authority. */
  explicitIntent: boolean;
};

export type FurviseApplicationAction = Omit<ModelApplicationAction, "explicitIntent"> & {
  id: string;
  petId: string;
  sourceMessageId?: string | null;
  /** Server-derived authorization from the persisted user message and exact action semantics. */
  explicitIntent: boolean;
  safetyClass: FurviseActionSafetyClass;
  mutationClass: FurviseActionMutationClass;
  confirmationPolicy: FurviseActionConfirmationPolicy;
  authorizationScope: "owned_pet" | "owned_user" | "owned_care_record" | "owned_concern" | "authenticated_user";
  status: FurviseActionStatus;
  label: string;
  description: string;
  href: string | null;
  resultMessage: string | null;
  errorMessage: string | null;
};

export type FurviseActionExecutionResult = {
  action: FurviseApplicationAction;
  changed: boolean;
  audit: {
    actionKind: FurviseActionKind;
    authorization: "allowed" | "denied";
    mutationClass: FurviseActionMutationClass;
    outcome: "succeeded" | "failed" | "cancelled" | "confirmation_required";
    petIdPresent: boolean;
  };
};
