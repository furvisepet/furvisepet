import type { SupabaseClient } from "@supabase/supabase-js";
import type { CareEntryRow, DogMemoryRow, DogProfileRow } from "../supabase";
import type { PetConcern } from "./concern-engine";
import { isEligibleLegacyMemory } from "../intelligence/memory-integrity.ts";

export async function loadPetContext(supabase: SupabaseClient, userId: string, petId: string) {
  const { data, error } = await supabase
    .from("dog_profiles")
    .select("*")
    .eq("id", petId)
    .eq("user_id", userId)
    .single<DogProfileRow>();
  if (error || !data) throw new Error("PET_NOT_FOUND");
  return data;
}

export async function loadRecentCareEvents(supabase: SupabaseClient, userId: string, petId: string, limit = 200) {
  const { data, error } = await supabase
    .from("pet_care_entries")
    .select("*")
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<CareEntryRow[]>();
  if (error) throw new Error("CARE_CONTEXT_UNAVAILABLE");
  return data || [];
}

export async function loadActiveConcerns(supabase: SupabaseClient, userId: string, petId: string) {
  const { data, error } = await supabase
    .from("pet_concerns")
    .select("*")
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .in("status", ["active", "reopened"])
    .is("resolved_at", null)
    .order("updated_at", { ascending: false })
    .returns<PetConcern[]>();
  if (error) throw new Error("CONCERN_CONTEXT_UNAVAILABLE");
  return data || [];
}

export async function loadRecentlyResolvedConcerns(
  supabase: SupabaseClient,
  userId: string,
  petId: string,
  limit = 5,
) {
  const { data, error } = await supabase
    .from("pet_concerns")
    .select("*")
    .eq("pet_profile_id", petId)
    .eq("user_id", userId)
    .eq("status", "resolved")
    .not("resolved_at", "is", null)
    .gte("resolved_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("resolved_at", { ascending: false })
    .limit(limit)
    .returns<PetConcern[]>();
  if (error) throw new Error("CONCERN_CONTEXT_UNAVAILABLE");
  return data || [];
}

export async function loadRememberedDetails(supabase: SupabaseClient, userId: string, petId: string) {
  const { data, error } = await supabase
    .from("dog_memories")
    .select("*")
    .eq("dog_profile_id", petId)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<DogMemoryRow[]>();
  if (error) throw new Error("MEMORY_CONTEXT_UNAVAILABLE");
  return (data || []).filter(isEligibleLegacyMemory);
}
