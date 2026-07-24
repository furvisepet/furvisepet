import type { PetProfile } from "../lib/petwise";
import { formatAge, formatBudget, formatSpecies, formatWeight, selectedConcern } from "../lib/petwise";
import { buildDraftProfileCompleteness } from "../lib/profile-completeness";

export type StepKey =
  | "name"
  | "species"
  | "breed"
  | "age"
  | "weight"
  | "currentFood"
  | "mainConcern"
  | "avoidIngredients"
  | "monthlyBudget";

export type PetProfileDraft = PetProfile;

export type SummaryRow = {
  key: StepKey;
  label: string;
  getValue: (profile: PetProfileDraft) => string;
};

export const summaryRows: SummaryRow[] = [
  {
    key: "name",
    label: "Name",
    getValue: (profile) => profile.name.trim() || "Not provided",
  },
  {
    key: "species",
    label: "Species",
    getValue: (profile) => formatSpecies(profile.species),
  },
  {
    key: "breed",
    label: "Breed",
    getValue: (profile) => profile.breed.trim() || "Not provided",
  },
  {
    key: "age",
    label: "Age",
    getValue: formatAge,
  },
  {
    key: "weight",
    label: "Weight",
    getValue: formatWeight,
  },
  {
    key: "currentFood",
    label: "Current food",
    getValue: (profile) =>
      profile.currentFoodUnknown ? "I'm not sure" : profile.currentFood.trim() || "Not provided",
  },
  {
    key: "mainConcern",
    label: "Main concern",
    getValue: (profile) => selectedConcern(profile).trim() || "Not provided",
  },
  {
    key: "avoidIngredients",
    label: "Avoid",
    getValue: (profile) => {
      if (profile.avoidIngredients.length > 0) {
        return profile.avoidIngredients.join(", ");
      }

      const customIngredients = profile.customAvoidIngredient.trim();
      return customIngredients || "None known";
    },
  },
  {
    key: "monthlyBudget",
    label: "Monthly care budget",
    getValue: formatBudget,
  },
];

export type SummaryItem = SummaryRow & {
  valueText: string;
  stepIndex: number;
};

type StepLike = {
  key: StepKey;
};

export function buildSummaryItems(profile: PetProfileDraft, steps: readonly StepLike[]): SummaryItem[] {
  const activeStepKeys = new Set(steps.map((step) => step.key));
  return summaryRows
    .filter((item) => activeStepKeys.has(item.key))
    .map((item) => ({
      ...item,
      valueText: item.getValue(profile),
      stepIndex: steps.findIndex((step) => step.key === item.key),
    }));
}

export function buildSummaryProfileStatus(profile: PetProfileDraft) {
  return buildDraftProfileCompleteness(profile).status;
}
