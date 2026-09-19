import { actionCanAutoExecute, getFurviseActionPolicy } from "../application-actions/policy.ts";
import type { FurviseApplicationAction, FurviseActionKind } from "../application-actions/types.ts";
import {
  assertFurviseMutationAllowed,
  createFurviseTurnAuthority,
  grantFurviseMutationAuthority,
  type FurviseMutationKind,
  type FurviseTurnAuthority,
} from "./turn-authority.ts";

export type FurviseActionExecutionMode = "confirm" | "cancel" | "auto";

const mutationKinds: Partial<Record<FurviseActionKind, FurviseMutationKind>> = {
  "memory.set_preference": "set_preference",
  "memory.forget_preference": "forget_preference",
  "care_history.add": "record_care",
  "care_history.edit": "correct_record",
  "care_history.remove": "delete_record",
  "care_state.resolve": "resolve_care_state",
  "care_state.reopen": "reopen_care_state",
  "pet.update_profile": "update_profile",
  "pet.mark_deceased": "mark_deceased",
  "pet.mark_active": "restore_living",
  "pet.archive": "archive_pet",
  "pet.delete_permanently": "delete_pet",
};

export function furviseMutationKindForAction(kind: FurviseActionKind): FurviseMutationKind | null {
  return mutationKinds[kind] || null;
}

/**
 * Executive control for application actions. The action subsystem may hold a
 * server-minted capability, but it still cannot mutate until the Brain grants
 * this exact execution attempt.
 */
export function authorizeFurviseActionExecution(input: {
  action: FurviseApplicationAction;
  capabilityId: string;
  mode: FurviseActionExecutionMode;
}): FurviseTurnAuthority {
  const policy = getFurviseActionPolicy(input.action.kind);
  if (policy.mutationClass !== "mutation" || input.action.mutationClass !== "mutation") {
    throw new Error("FURVISE_ACTION_NOT_MUTATION");
  }
  if (input.action.safetyClass !== policy.safetyClass
    || input.action.confirmationPolicy !== policy.confirmationPolicy
    || input.action.authorizationScope !== policy.authorizationScope) {
    throw new Error("FURVISE_ACTION_POLICY_DRIFT");
  }

  let turn = createFurviseTurnAuthority({
    logicalTurnId: input.capabilityId,
    subject: { petIds: [input.action.petId], kind: "pet", source: "explicit", unresolved: false },
    intent: actionIntent(input.action.kind),
    memoryNeed: "working",
    memoryPetIds: [input.action.petId],
  });

  if (input.mode === "cancel") {
    turn = grantFurviseMutationAuthority(turn, {
      kind: "cancel_pending",
      userAuthorizationVerified: true,
      authorizationSource: "transport",
      authorizationTurnId: input.capabilityId,
    });
    assertFurviseMutationAllowed(turn, "cancel_pending");
    return turn;
  }

  const kind = furviseMutationKindForAction(input.action.kind);
  if (!kind) throw new Error("FURVISE_ACTION_KIND_NOT_EXECUTABLE");

  if (input.mode === "auto") {
    if (!actionCanAutoExecute(input.action.kind, input.action.explicitIntent)) {
      throw new Error("FURVISE_ACTION_AUTO_NOT_AUTHORIZED");
    }
    turn = grantFurviseMutationAuthority(turn, {
      kind,
      userAuthorizationVerified: true,
      authorizationSource: "durable_capability",
      authorizationTurnId: input.action.sourceMessageId || input.capabilityId,
      confirmationRequired: false,
      confirmationSatisfied: false,
    });
  } else {
    turn = grantFurviseMutationAuthority(turn, {
      kind,
      userAuthorizationVerified: true,
      authorizationSource: "transport",
      authorizationTurnId: input.capabilityId,
      confirmationRequired: policy.confirmationPolicy === "always",
      confirmationSatisfied: true,
    });
  }

  assertFurviseMutationAllowed(turn, kind);
  return turn;
}

function actionIntent(kind: FurviseActionKind) {
  if (["pet.mark_deceased", "pet.mark_active", "pet.archive", "pet.delete_permanently"].includes(kind)) return "lifecycle" as const;
  if (kind === "care_history.edit") return "correct" as const;
  if (kind === "care_history.remove") return "delete" as const;
  return "record" as const;
}
