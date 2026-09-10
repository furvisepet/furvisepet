import type { SupabaseClient } from "@supabase/supabase-js";
import type { PetConcern } from "./concern-engine";

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
