import type { FurviseActionConfirmationPolicy, FurviseActionKind, FurviseActionMutationClass, FurviseActionSafetyClass } from "./types.ts";

type ActionPolicy = {
  safetyClass: FurviseActionSafetyClass;
  mutationClass: FurviseActionMutationClass;
  confirmationPolicy: FurviseActionConfirmationPolicy;
  authorizationScope: "owned_pet" | "owned_user" | "owned_care_record" | "owned_concern" | "authenticated_user";
};

const policies: Record<FurviseActionKind, ActionPolicy> = {
  "pet.read": readOnly("owned_pet"),
  "navigation.open_pet_profile": readNavigation("owned_pet"),
  "navigation.open_memories": readNavigation("owned_pet"),
  "navigation.open_care_history": readNavigation("owned_pet"),
  "navigation.open_vet_brief": readNavigation("owned_pet"),
  "vet_brief.prepare": { safetyClass: "READ_ONLY", mutationClass: "navigation", confirmationPolicy: "none", authorizationScope: "owned_pet" },
  "memory.set_preference": lowRisk("owned_user"),
  "memory.forget_preference": lowRisk("owned_user"),
  "memory.list": readOnly("owned_user"),
  "memory.edit_detail": readOnly("owned_user"),
  "care_history.add": lowRisk("owned_pet"),
  "care_history.edit": { safetyClass: "CONFIRMATION_REQUIRED", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_care_record" },
  "care_history.remove": { safetyClass: "CONFIRMATION_REQUIRED", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_care_record" },
  "care_history.query": readOnly("owned_pet"),
  "care_state.resolve": lowRisk("owned_concern"),
  "care_state.reopen": lowRisk("owned_concern"),
  "pet.update_profile": lowRisk("owned_pet"),
  "pet.mark_deceased": { safetyClass: "CONFIRMATION_REQUIRED", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_pet" },
  "pet.mark_active": { safetyClass: "CONFIRMATION_REQUIRED", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_pet" },
  "pet.archive": { safetyClass: "CONFIRMATION_REQUIRED", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_pet" },
  "pet.delete_permanently": { safetyClass: "DESTRUCTIVE", mutationClass: "mutation", confirmationPolicy: "always", authorizationScope: "owned_pet" },
};

export function getFurviseActionPolicy(kind: FurviseActionKind): ActionPolicy {
  return policies[kind];
}

export function actionCanAutoExecute(kind: FurviseActionKind, serverVerifiedUserIntent: boolean) {
  const policy = getFurviseActionPolicy(kind);
  return policy.safetyClass === "LOW_RISK_REVERSIBLE" && policy.confirmationPolicy === "explicit_intent" && serverVerifiedUserIntent;
}

function lowRisk(authorizationScope: ActionPolicy["authorizationScope"]): ActionPolicy {
  return { safetyClass: "LOW_RISK_REVERSIBLE", mutationClass: "mutation", confirmationPolicy: "explicit_intent", authorizationScope };
}

function readNavigation(authorizationScope: ActionPolicy["authorizationScope"]): ActionPolicy {
  return { safetyClass: "READ_ONLY", mutationClass: "navigation", confirmationPolicy: "none", authorizationScope };
}

function readOnly(authorizationScope: ActionPolicy["authorizationScope"]): ActionPolicy {
  return { safetyClass: "READ_ONLY", mutationClass: "read", confirmationPolicy: "none", authorizationScope };
}
