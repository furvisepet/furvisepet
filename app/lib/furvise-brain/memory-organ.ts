import type { SupabaseClient } from "@supabase/supabase-js";
import type { FurviseLiveContext } from "../intelligence/types.ts";
import {
  retrieveAskHistory,
  type HistoryPlan,
} from "../intelligence/history-retrieval.ts";
import type { FurviseTurnAuthority } from "./turn-authority.ts";

export type FurviseMemoryRead = Readonly<{
  turnId: string;
  petIds: readonly string[];
  depth: FurviseTurnAuthority["memoryNeed"];
}>;

export function planFurviseMemoryRead(turn: FurviseTurnAuthority): FurviseMemoryRead {
  if (turn.subject.unresolved) {
    return Object.freeze({ turnId: turn.logicalTurnId, petIds: Object.freeze([]), depth: "none" as const });
  }
  return Object.freeze({
    turnId: turn.logicalTurnId,
    petIds: Object.freeze([...turn.subject.petIds]),
    depth: turn.memoryNeed,
  });
}

/**
 * Memory is an organ: it can retrieve only the subject scope already approved
 * by the brain. It cannot widen subjects, reinterpret intent, grant writes, or
 * publish an answer.
 */
export async function retrieveFurviseMemory(
  context: FurviseLiveContext,
  db: SupabaseClient,
  turn: FurviseTurnAuthority,
  vetBriefRead?: { plan: HistoryPlan; termGroups: string[][]; periodFrom?: string | null; periodTo?: string | null },
): Promise<FurviseLiveContext> {
  const read = planFurviseMemoryRead(turn);
  if (read.depth === "none" || read.depth === "working") return context;
  if (!read.petIds.length) return context;

  const owned = new Set(context.eligiblePets
    .filter(pet => pet.user_id === context.owner.userId)
    .map(pet => pet.id));
  if (read.petIds.some(petId => !owned.has(petId))) throw new Error("FURVISE_MEMORY_SCOPE_NOT_AUTHORIZED");

  return retrieveAskHistory(context, db, [...read.petIds], vetBriefRead);
}
