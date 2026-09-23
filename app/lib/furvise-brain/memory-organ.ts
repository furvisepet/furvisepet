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
  const depth = turn.memoryNeed;
  const petIds = depth === "none" ? [] : [...turn.memoryPetIds];
  return Object.freeze({
    turnId: turn.logicalTurnId,
    petIds: Object.freeze(petIds),
    depth,
  });
}

/**
 * Memory is an organ: it can retrieve only the exact owner-pet read scope the
 * brain approved. Working memory may expose already-loaded context but does not
 * trigger a lifetime/history database traversal. Read scope is independent from
 * mutation subject so mixed questions cannot accidentally write to read pets.
 */
export async function retrieveFurviseMemory(
  context: FurviseLiveContext,
  db: SupabaseClient,
  turn: FurviseTurnAuthority,
  vetBriefRead?: { plan: HistoryPlan; termGroups: string[][]; periodFrom?: string | null; periodTo?: string | null },
): Promise<FurviseLiveContext> {
  if (!vetBriefRead && !context.askInterpretation?.request) throw new Error("ASK_MEMORY_BRAIN_REQUIRED");
  if (!vetBriefRead && context.askInterpretation?.request?.mode === "read"
    && context.askInterpretation.request.evidenceBasis === "saved_history" && !context.askInterpretation.request.readTicket)
    throw new Error("ASK_MEMORY_READ_TICKET_REQUIRED");
  if (!vetBriefRead && context.askInterpretation?.request?.evidenceBasis !== "saved_history") return context;
  if (!vetBriefRead && !context.askInterpretation?.request?.readTicket) throw new Error("ASK_MEMORY_READ_TICKET_REQUIRED");
  const read = planFurviseMemoryRead(turn);
  if (read.depth === "none" || read.depth === "working" || !read.petIds.length) return context;

  const owned = new Set(context.eligiblePets
    .filter(pet => pet.user_id === context.owner.userId)
    .map(pet => pet.id));
  if (read.petIds.some(petId => !owned.has(petId))) throw new Error("FURVISE_MEMORY_SCOPE_NOT_AUTHORIZED");

  return retrieveAskHistory(context, db, [...read.petIds], vetBriefRead);
}
