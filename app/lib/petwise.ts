export type AgeUnit = "months" | "years";
export type WeightUnit = "lb" | "kg";
export type PetSpecies = "dog" | "cat";

export type MainConcern =
  | "Itchy skin"
  | "Sensitive stomach"
  | "Picky eating"
  | "Weight management"
  | "General wellness"
  | "Grooming"
  | "Other";
export type WellnessGoal =
  | "nutrition"
  | "dental_care"
  | "grooming"
  | "activity"
  | "preventive_care"
  | "reminders"
  | "something_else";

export type ProductCountry = "US" | "CA";

export type PetProfile = {
  name: string;
  species: PetSpecies | "";
  breed: string;
  age: string;
  ageUnit: AgeUnit;
  ageUnknown: boolean;
  weight: string;
  weightUnit: WeightUnit;
  weightUnknown: boolean;
  currentFood: string;
  currentFoodUnknown: boolean;
  mainConcern: MainConcern | "";
  otherConcern: string;
  avoidIngredients: string[];
  avoidIngredientsNoneKnown?: boolean;
  customAvoidIngredient: string;
  monthlyBudget: string;
  sex?: "female" | "male" | "not_sure" | "";
  routineNote?: string;
  wellnessGoal?: WellnessGoal | "";
};

/** @deprecated Use PetProfile. Kept while the dog_profiles table remains the compatibility store. */
export type DogProfile = PetProfile;

export function normalizeWellnessGoal(value: string | null | undefined): WellnessGoal | "" {
  if (
    value === "nutrition" ||
    value === "dental_care" ||
    value === "grooming" ||
    value === "activity" ||
    value === "preventive_care" ||
    value === "reminders" ||
    value === "something_else"
  ) {
    return value;
  }

  return "";
}

export const MAIN_CONCERN_OPTIONS = [
  "Itchy skin",
  "Sensitive stomach",
  "Picky eating",
  "Weight management",
  "General wellness",
  "Grooming",
  "Other",
] as const satisfies readonly MainConcern[];

export const initialProfile: DogProfile = {
  name: "",
  species: "",
  breed: "",
  age: "",
  ageUnit: "years",
  ageUnknown: false,
  weight: "",
  weightUnit: "lb",
  weightUnknown: false,
  currentFood: "",
  currentFoodUnknown: false,
  mainConcern: "",
  otherConcern: "",
  avoidIngredients: [],
  avoidIngredientsNoneKnown: false,
  customAvoidIngredient: "",
  monthlyBudget: "",
  sex: "",
  routineNote: "",
};

export function normalizeProfile(value: unknown): DogProfile {
  if (!value || typeof value !== "object") return initialProfile;
  const draft = value as Partial<DogProfile>;
  const ageUnknown = Boolean(draft.ageUnknown);
  const weightUnknown = Boolean(draft.weightUnknown);
  const currentFoodUnknown = Boolean(draft.currentFoodUnknown);
  const avoidIngredientsNoneKnown = Boolean(draft.avoidIngredientsNoneKnown);

  return {
    ...initialProfile,
    ...draft,
    species: normalizeSpecies(draft.species),
    ageUnit: draft.ageUnit === "months" ? "months" : "years",
    weightUnit: draft.weightUnit === "kg" ? "kg" : "lb",
    age: draft.age ?? "",
    ageUnknown,
    weight: draft.weight ?? "",
    weightUnknown,
    currentFood: draft.currentFood ?? "",
    currentFoodUnknown,
    avoidIngredientsNoneKnown,
    avoidIngredients: Array.isArray(draft.avoidIngredients)
      ? normalizeAvoidIngredientValues(draft.avoidIngredients.filter((item): item is string => typeof item === "string"))
      : [],
  };
}

export function normalizeSpecies(value: unknown): PetSpecies | "" {
  return value === "dog" || value === "cat" ? value : "";
}

export function formatSpecies(value: PetSpecies | "" | null | undefined) {
  if (value === "dog") return "Dog";
  if (value === "cat") return "Cat";
  return "Species not provided";
}

export function formatPetDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "Unnamed pet";
  }

  return trimmed
    .split(/\s+/)
    .map((part) =>
      part
        .split(/([-'\u2019])/)
        .map((segment) => {
          if (!segment || segment === "-" || segment === "'" || segment === "\u2019") {
            return segment;
          }

          if (/^[A-Z]{1,2}$/.test(segment) || (/^[A-Z]/.test(segment) && /[a-z]/.test(segment))) {
            return segment;
          }

          const normalized = segment.toLowerCase();
          return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
        })
        .join(""),
    )
    .join(" ");
}

export function parsePositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return Number.NaN;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function normalizeIngredient(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function normalizeAvoidIngredientValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .flatMap((value) => normalizeAvoidIngredientInput(value))
    .filter((value) => {
      const key = normalizeIngredient(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeAvoidIngredientInput(value: string) {
  const trimmed = value.trim();
  const normalized = normalizeIngredient(trimmed);
  if (!normalized || isNoneKnown(normalized)) return [];

  const noIngredientMatch = normalized.match(/^(?:no|without|avoid)\s+(.+)$/);
  const ingredient = noIngredientMatch?.[1]?.trim();
  if (ingredient && !isNoneKnown(ingredient)) return [ingredient];

  return [trimmed];
}

export function isNoneKnown(value: string) {
  return [
    "n/a",
    "na",
    "no",
    "no allergies",
    "no known",
    "no known allergies",
    "none",
    "none known",
    "not sure",
    "nothing",
  ].includes(normalizeIngredient(value));
}
