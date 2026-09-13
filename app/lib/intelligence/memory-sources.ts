import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DogMemoryRow } from "../supabase";
import type { FurviseMemoryRow } from "./types";
import type { InactiveMemoryMarker } from "./memory-lifecycle/filter-conversation";
import { recoverOptionalQuery } from "./context-recovery.ts";
import { isEligibleLegacyMemory, isEligibleStoredMemory } from "./memory-integrity.ts";
import { selectFreshRelevantMemories } from "./memory-freshness.ts";

type ScopedInactiveMemory = InactiveMemoryMarker & Pick<FurviseMemoryRow, "category" | "pet_id" | "source_excerpt" | "subject_type">;

/** All live-context memory reads retain their separate coverage and failure states. */
export async function loadMemorySources({ supabase, userId, petId, limit, now }: {
  supabase: SupabaseClient; userId: string; petId: string; limit: number; now: Date;
}) {
  const legacyQuery = supabase.from("dog_memories").select("*").eq("dog_profile_id", petId).eq("user_id", userId)
    .eq("status", "active").order("created_at", { ascending: false }).limit(limit).returns<DogMemoryRow[]>();
  const sharedQuery = supabase.from("furvise_memories").select("*").eq("user_id", userId).eq("status", "active")
    .or(`pet_id.eq.${petId},pet_id.is.null`).or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
    .order("last_confirmed_at", { ascending: false }).limit(limit * 2).returns<FurviseMemoryRow[]>();
  const inactiveQuery = supabase.from("furvise_memories").select("category,fact_key,fact_value,pet_id,source_excerpt,subject_type,normalized_value,status,updated_at").eq("user_id", userId)
    .in("status", ["resolved", "superseded", "rejected", "expired"]).or(`pet_id.eq.${petId},pet_id.is.null`)
    .order("updated_at", { ascending: false }).limit(40).returns<ScopedInactiveMemory[]>();
  const [legacyMemories, sharedMemories, inactiveMemories] = await Promise.all([
    recoverOptionalQuery("legacy_memories", legacyQuery, [] as DogMemoryRow[]),
    recoverOptionalQuery("furvise_memories", sharedQuery, [] as FurviseMemoryRow[]),
    recoverOptionalQuery("inactive_memories", inactiveQuery, [] as ScopedInactiveMemory[]),
  ]);
  return { legacyMemories, sharedMemories, inactiveMemories };
}

/** Keep original source results for coverage; project only eligible model inputs. */
export function selectMemorySources(sources: Awaited<ReturnType<typeof loadMemorySources>>, {
  currentMessage, suppressedSourceMessageIds, now, limit,
}: { currentMessage: string; suppressedSourceMessageIds: ReadonlySet<string>; now: Date; limit: number }) {
  return {
    legacyPetMemories: sources.legacyMemories.data.filter(isEligibleLegacyMemory),
    memories: selectFreshRelevantMemories(sources.sharedMemories.data.filter((memory) =>
      isEligibleStoredMemory(memory) && !(memory.source_type === "ask_message" && memory.source_id
        && suppressedSourceMessageIds.has(memory.source_id))), currentMessage, now, limit).map(item => item.memory),
    inactiveMemoryMarkers: sources.inactiveMemories.data.filter(isEligibleStoredMemory),
  };
}

