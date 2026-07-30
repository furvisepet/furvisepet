import type { User } from "@supabase/supabase-js";
import { evaluatePetLimit, getPlanCapabilities, getUserPlan, type PlanId } from "./billing/plan-limits";
import { loadDogProfilesWithMemories, type DogProfileWithMemories } from "./supabase";

export type PetCreationAccess = {
  allowed: boolean;
  existingPet: DogProfileWithMemories | null;
  petCount: number;
  planId: PlanId;
  planLabel: string;
};

export function buildPetCreationAccess({
  planId,
  profiles,
}: {
  planId: PlanId;
  profiles: DogProfileWithMemories[];
}): PetCreationAccess {
  const decision = evaluatePetLimit({
    earlyAccessUnlocked: false,
    isEditingExistingPet: false,
    petCount: profiles.length,
    planId,
  });
  return {
    allowed: decision.allowed,
    existingPet: profiles[0] || null,
    petCount: profiles.length,
    planId,
    planLabel: getPlanCapabilities(planId).label,
  };
}

export async function resolvePetCreationAccessForUser(user: User) {
  const profiles = await loadDogProfilesWithMemories(user);
  const planId = await getUserPlan(user.id, () => user.app_metadata?.plan);
  return buildPetCreationAccess({ planId, profiles });
}
