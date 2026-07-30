import type { DogProfile } from "./petwise";
import type { DogProfileWithMemories } from "./supabase";
import { buildDraftProfileFieldStates, buildProfileFieldStates } from "./profile-completeness";

export type FinishProfileItem = {
  key: "breed" | "current_food" | "avoid_ingredients" | "weight" | "main_concern" | "monthly_budget";
  label: string;
};

const FINISH_PROFILE_ITEMS: FinishProfileItem[] = [
  { key: "breed", label: "Add breed" },
  { key: "current_food", label: "Add current food" },
  { key: "avoid_ingredients", label: "Add avoid ingredients" },
  { key: "weight", label: "Add weight" },
  { key: "main_concern", label: "Add main care goal" },
  { key: "monthly_budget", label: "Add monthly care budget" },
];

export function getFinishProfileItemsFromDraft(profile: DogProfile): FinishProfileItem[] {
  const states = buildDraftProfileFieldStates(profile);
  return FINISH_PROFILE_ITEMS.filter((item) => finishItemState(states, item.key) === "missing");
}

export function getFinishProfileItemsFromRow(
  profile: Pick<
    DogProfileWithMemories,
    "age_value" | "avoid_ingredients" | "breed" | "current_food" | "main_concern" | "monthly_budget" | "name" | "species" | "weight_value"
  >,
): FinishProfileItem[] {
  const states = buildProfileFieldStates(profile);
  return FINISH_PROFILE_ITEMS.filter((item) => finishItemState(states, item.key) === "missing");
}

function finishItemState(states: ReturnType<typeof buildProfileFieldStates>, key: FinishProfileItem["key"]) {
  if (key === "breed") return states.breed;
  if (key === "current_food") return states.currentFood;
  if (key === "avoid_ingredients") return states.avoidIngredients;
  if (key === "weight") return states.weight;
  if (key === "main_concern") return states.mainConcern;
  return states.monthlyBudget;
}
