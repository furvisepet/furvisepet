import type { FurviseLiveContext } from "../intelligence/types.ts";
import { applyAskInterpretation } from "./interpretation-authority.ts";
import {
  createFurviseTurnAuthority,
  type FurviseTurnAuthority,
} from "./turn-authority.ts";

export function buildAskBrainTurn(input: {
  context: FurviseLiveContext;
  logicalTurnId: string;
  authoritativePetIds: readonly string[];
}): FurviseTurnAuthority {
  const owned = new Set(input.context.eligiblePets
    .filter(pet => pet.user_id === input.context.owner.userId)
    .map(pet => pet.id));
  const subjectPetIds = [...new Set(input.authoritativePetIds.filter(id => owned.has(id)))];
  if (subjectPetIds.length !== new Set(input.authoritativePetIds).size) {
    throw new Error("FURVISE_SUBJECT_SCOPE_NOT_AUTHORIZED");
  }

  const interpretation = input.context.askInterpretation;
  const conversationOnly = interpretation?.conversationOnly === true;
  let turn = createFurviseTurnAuthority({
    logicalTurnId: input.logicalTurnId,
    subject: conversationOnly
      ? { petIds: [], kind: "other", source: "conversation", unresolved: false }
      : subjectPetIds.length
        ? { petIds: subjectPetIds, source: "conversation", unresolved: false }
        : { petIds: [], kind: "unresolved", source: "unresolved", unresolved: true },
    memoryNeed: "working",
    memoryPetIds: [],
  });

  if (!interpretation?.request) return turn;
  const readPetIds = conversationOnly
    ? []
    : [...new Set((interpretation.readPetIds || subjectPetIds).filter(id => owned.has(id)))];
  if (readPetIds.length !== new Set(interpretation.readPetIds || subjectPetIds).size) {
    throw new Error("FURVISE_MEMORY_SCOPE_NOT_AUTHORIZED");
  }
  turn = applyAskInterpretation(turn, interpretation.request, {
    readPetIds,
    operation: interpretation.readOperation || interpretation.operation,
    historyWindow: interpretation.history,
  });
  return turn;
}

/** Ensure route-local legacy variables cannot silently widen the canonical turn. */
export function assertAskBrainScope(input: {
  turn: FurviseTurnAuthority;
  authoritativePetIds: readonly string[];
  readPetIds: readonly string[];
}) {
  const same = (left: readonly string[], right: readonly string[]) => {
    const a = [...new Set(left)].sort();
    const b = [...new Set(right)].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  };
  if (!same(input.turn.subject.petIds, input.authoritativePetIds)) {
    throw new Error("FURVISE_SUBJECT_AUTHORITY_DRIFT");
  }
  if (!same(input.turn.memoryPetIds, input.readPetIds)) {
    throw new Error("FURVISE_MEMORY_AUTHORITY_DRIFT");
  }
}
