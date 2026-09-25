import type { FurviseApplicationAction } from "../application-actions/types.ts";

export type PendingLifecycleAssertionKind = "reported_deceased" | "reported_archived";

export type PendingLifecycleAssertion = {
  kind: PendingLifecycleAssertionKind;
  phase: "pending_confirmation";
  petId: string;
  petName: string;
  sourceMessageId: string | null;
  action: FurviseApplicationAction;
};

type ConversationTurnWithActions = {
  role?: string;
  applicationActions?: FurviseApplicationAction[];
};

export function hasPendingReportedLifecycle(
  turns: ConversationTurnWithActions[],
  kind: PendingLifecycleAssertionKind,
) {
  const actionKind = kind === "reported_deceased" ? "pet.mark_deceased" : "pet.archive";
  const terminal = new Set<string>();
  for (const turn of turns) {
    for (const action of turn.applicationActions || []) {
      if (action.kind === actionKind && (action.status === "succeeded" || action.status === "cancelled")) terminal.add(action.id);
    }
  }
  return turns.some((turn) => (turn.applicationActions || []).some((action) =>
    action.kind === actionKind && !terminal.has(action.id) && isExecutablePendingStatus(action.status),
  ));
}

type EligiblePet = { id: string; name?: string | null; species?: string | null; lifecycle_status?: string | null };

export function derivePendingLifecycleAssertion(input: {
  turns: ConversationTurnWithActions[];
  pets: EligiblePet[];
}): PendingLifecycleAssertion | null {
  const terminalActionIds = new Set<string>();
  for (const turn of input.turns) {
    for (const action of turn.applicationActions || []) {
      if (isLifecycleAction(action) && (action.status === "succeeded" || action.status === "cancelled")) terminalActionIds.add(action.id);
    }
  }
  for (const turn of [...input.turns].reverse()) {
    for (const action of [...(turn.applicationActions || [])].reverse()) {
      if (!isLifecycleAction(action) || !isExecutablePendingStatus(action.status) || terminalActionIds.has(action.id)) continue;
      const pet = input.pets.find((candidate) => candidate.id === action.petId);
      if (!pet) continue;
      if (action.kind === "pet.mark_deceased" && pet.lifecycle_status === "deceased") continue;
      if (action.kind === "pet.archive" && pet.lifecycle_status === "archived") continue;
      return {
        kind: action.kind === "pet.mark_deceased" ? "reported_deceased" : "reported_archived",
        phase: "pending_confirmation",
        petId: action.petId,
        petName: cleanPetName(pet.name),
        sourceMessageId: action.sourceMessageId || null,
        action,
      };
    }
  }
  return null;
}

function isLifecycleAction(action: FurviseApplicationAction) {
  return action.kind === "pet.mark_deceased" || action.kind === "pet.archive";
}

function isExecutablePendingStatus(status: FurviseApplicationAction["status"]) {
  return status === "proposed" || status === "confirmation_required";
}

function cleanPetName(value?: string | null) {
  return String(value || "the pet").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "the pet";
}
