import type { DogProfile } from "./petwise";
import { parsePositiveNumber } from "./petwise";
import type { DogProfileWithMemories } from "./supabase";

export type FinishProfileItem = {
  key: "breed" | "current_food" | "avoid_ingredients" | "weight" | "monthly_budget";
  label: string;
};

const FINISH_PROFILE_ITEMS: FinishProfileItem[] = [
  { key: "breed", label: "Add breed" },
  { key: "current_food", label: "Add current food" },
  { key: "avoid_ingredients", label: "Add avoid ingredients" },
  { key: "weight", label: "Add weight" },
  { key: "monthly_budget", label: "Add monthly care budget" },
];

export function getFinishProfileItemsFromDraft(profile: DogProfile): FinishProfileItem[] {
  return FINISH_PROFILE_ITEMS.filter((item) => {
    if (item.key === "breed") return !profile.breed.trim();
    if (item.key === "current_food") return profile.currentFoodUnknown || !profile.currentFood.trim();
    if (item.key === "avoid_ingredients") return profile.avoidIngredients.length === 0;
    if (item.key === "weight") {
      const weight = parsePositiveNumber(profile.weight);
      return profile.weightUnknown || !profile.weight.trim() || !Number.isFinite(weight) || weight <= 0;
    }
    const budget = parsePositiveNumber(profile.monthlyBudget);
    return !profile.monthlyBudget.trim() || !Number.isFinite(budget) || budget <= 0;
  });
}

export function getFinishProfileItemsFromRow(
  profile: Pick<
    DogProfileWithMemories,
    "avoid_ingredients" | "breed" | "current_food" | "monthly_budget" | "weight_value"
  >,
): FinishProfileItem[] {
  return FINISH_PROFILE_ITEMS.filter((item) => {
    if (item.key === "breed") return !profile.breed?.trim();
    if (item.key === "current_food") return !profile.current_food?.trim();
    if (item.key === "avoid_ingredients") return !profile.avoid_ingredients?.some((value) => value.trim());
    if (item.key === "weight") return profile.weight_value === null || !Number.isFinite(Number(profile.weight_value));
    return profile.monthly_budget === null || !Number.isFinite(Number(profile.monthly_budget)) || Number(profile.monthly_budget) <= 0;
  });
}
