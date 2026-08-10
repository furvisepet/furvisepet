import type { User } from "@supabase/supabase-js";
import { getPlanCapabilities, type PlanId } from "./billing/plan-limits";
import { getCurrentAccessToken, loadDogProfilesWithMemories, type DogProfileWithMemories } from "./supabase";

export type PetCreationAccess = {
  allowed: boolean;
  existingPet: DogProfileWithMemories | null;
  maxPets: number;
  petCount: number;
  planId: PlanId;
  planLabel: string;
};

export function buildPetCreationAccess({
  maxPets,
  planId,
  profiles,
}: {
  maxPets: number;
  planId: PlanId;
  profiles: DogProfileWithMemories[];
}): PetCreationAccess {
  return {
    allowed: profiles.length < maxPets,
    existingPet: profiles[0] || null,
    maxPets,
    petCount: profiles.length,
    planId,
    planLabel: getPlanCapabilities(planId).label,
  };
}

export async function resolvePetCreationAccessForUser(user: User) {
  const [profiles, token] = await Promise.all([loadDogProfilesWithMemories(user), getCurrentAccessToken()]);
  if (!token) throw new Error("Please sign in again before adding a pet.");
  const response = await fetch("/api/account/entitlements", { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null) as {
    entitlements?: { effectivePlan?: unknown; limits?: { maxPets?: unknown } };
  } | null;
  const planId = payload?.entitlements?.effectivePlan;
  const maxPets = payload?.entitlements?.limits?.maxPets;
  if (!response.ok || (planId !== "free" && planId !== "plus") || typeof maxPets !== "number" || !Number.isInteger(maxPets) || maxPets < 1) {
    throw new Error("Furvise could not verify pet access.");
  }
  return buildPetCreationAccess({ maxPets, planId, profiles });
}
