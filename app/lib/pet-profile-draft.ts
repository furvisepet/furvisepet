import type { PetProfile } from "./petwise.ts";

export type PetProfileDraftAction =
  | { type: "load"; profile: PetProfile }
  | { type: "patch"; values: Partial<PetProfile> };

export function reducePetProfileDraft(state: PetProfile, action: PetProfileDraftAction): PetProfile {
  if (action.type === "load") return { ...action.profile, avoidIngredients: [...action.profile.avoidIngredients] };
  return { ...state, ...action.values };
}

export function setUnknownWithoutDiscarding(
  profile: PetProfile,
  field: "ageUnknown" | "weightUnknown" | "currentFoodUnknown",
  unknown: boolean,
) {
  return reducePetProfileDraft(profile, { type: "patch", values: { [field]: unknown } });
}

export function petProfileDraftsEqual(left: PetProfile, right: PetProfile) {
  return JSON.stringify(left) === JSON.stringify(right);
}
