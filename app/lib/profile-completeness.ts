import { parsePositiveNumber, selectedConcern, type DogProfile, type PetSpecies } from "./petwise";

export type ProfileFieldState = "complete-known" | "complete-none" | "complete-unknown" | "missing";

export type ProfileFieldStates = {
  age: ProfileFieldState;
  avoidIngredients: ProfileFieldState;
  breed: ProfileFieldState;
  currentFood: ProfileFieldState;
  mainConcern: ProfileFieldState;
  monthlyBudget: ProfileFieldState;
  name: ProfileFieldState;
  species: ProfileFieldState;
  weight: ProfileFieldState;
};

export type ProfileCompletenessStatus =
  | "Ready for guidance"
  | "Limited context"
  | "Missing required information";

export type ProfileCompletenessLevel =
  | "complete_factual_profile"
  | "complete_owner_response_with_unknowns"
  | "incomplete_profile";

export type ProfileCompleteness = {
  fieldStates: ProfileFieldStates;
  guidanceReadiness: ProfileCompletenessStatus;
  level: ProfileCompletenessLevel;
  limitingUnknownFields: string[];
  missingFields: string[];
  setupCompletion: ProfileCompletenessStatus;
  status: ProfileCompletenessStatus;
  unknownFields: string[];
};

type RowProfileShape = {
  age_value: number | null;
  avoid_ingredients?: string[] | null;
  breed: string | null;
  current_food: string | null;
  main_concern: string | null;
  monthly_budget: number | null;
  name: string;
  species?: PetSpecies | null;
  weight_value: number | null;
};

const FIELD_LABELS: Record<keyof ProfileFieldStates, string> = {
  age: "age",
  avoidIngredients: "avoid ingredients",
  breed: "breed or mixed/unknown",
  currentFood: "current food",
  mainConcern: "main concern",
  monthlyBudget: "monthly care budget",
  name: "name",
  species: "species",
  weight: "weight",
};

const REQUIRED_FIRST_RESULT_FIELDS = new Set(["name", "species", "age", "main concern"]);
const MATERIAL_CONTEXT_FIELDS = new Set(["age", "weight", "current food"]);

export function buildProfileFieldStates(profile: RowProfileShape): ProfileFieldStates {
  return {
    age: numberRowState(profile.age_value),
    avoidIngredients: avoidanceRowState(profile.avoid_ingredients),
    breed: textState(profile.breed),
    currentFood: profile.current_food?.trim() ? "complete-known" : "complete-unknown",
    mainConcern: textState(profile.main_concern),
    monthlyBudget: validBudget(profile.monthly_budget) ? "complete-known" : "missing",
    name: textState(profile.name),
    species: textState(profile.species),
    weight: numberRowState(profile.weight_value),
  };
}

export function buildDraftProfileFieldStates(profile: DogProfile): ProfileFieldStates {
  return {
    age: profile.ageUnknown ? "complete-unknown" : positiveNumberState(profile.age, { allowZero: true }),
    avoidIngredients: profile.avoidIngredientsNoneKnown
      ? "complete-none"
      : profile.avoidIngredients.length
        ? "complete-known"
        : "missing",
    breed: textState(profile.breed),
    currentFood: profile.currentFoodUnknown ? "complete-unknown" : textState(profile.currentFood),
    mainConcern: textState(selectedConcern(profile)),
    monthlyBudget: positiveNumberState(profile.monthlyBudget),
    name: textState(profile.name),
    species: textState(profile.species),
    weight: profile.weightUnknown ? "complete-unknown" : positiveNumberState(profile.weight),
  };
}

export function buildProfileCompleteness(profile: RowProfileShape): ProfileCompleteness {
  return summarizeCompleteness(buildProfileFieldStates(profile));
}

export function buildDraftProfileCompleteness(profile: DogProfile): ProfileCompleteness {
  return summarizeCompleteness(buildDraftProfileFieldStates(profile));
}

export function getProfileActionFields(completeness: ProfileCompleteness) {
  return [...completeness.missingFields, ...completeness.limitingUnknownFields];
}

export function isProfileFieldComplete(state: ProfileFieldState) {
  return state !== "missing";
}

function summarizeCompleteness(fieldStates: ProfileFieldStates): ProfileCompleteness {
  const missingFields: string[] = [];
  const unknownFields: string[] = [];

  for (const [key, state] of Object.entries(fieldStates) as [keyof ProfileFieldStates, ProfileFieldState][]) {
    if (state === "missing") missingFields.push(FIELD_LABELS[key]);
    if (state === "complete-unknown") unknownFields.push(FIELD_LABELS[key]);
  }

  const materialUnknownFields = ["age", "weight", "current food"].filter((field) => unknownFields.includes(field));
  const limitingUnknownFields = materialUnknownFields.length >= MATERIAL_CONTEXT_FIELDS.size ? materialUnknownFields : [];
  const hasRequiredMissingField = missingFields.some((field) => REQUIRED_FIRST_RESULT_FIELDS.has(field));

  let setupCompletion: ProfileCompletenessStatus = "Ready for guidance";
  if (hasRequiredMissingField) setupCompletion = "Missing required information";
  else if (missingFields.length > 0 || limitingUnknownFields.length > 0) setupCompletion = "Limited context";

  let guidanceReadiness = setupCompletion;
  if (
    fieldStates.name === "missing" ||
    fieldStates.species === "missing" ||
    fieldStates.age === "missing" ||
    fieldStates.mainConcern === "missing"
  ) {
    guidanceReadiness = "Missing required information";
  }

  const level: ProfileCompletenessLevel =
    missingFields.length > 0
      ? "incomplete_profile"
      : unknownFields.length > 0
        ? "complete_owner_response_with_unknowns"
        : "complete_factual_profile";

  return {
    fieldStates,
    guidanceReadiness,
    level,
    limitingUnknownFields,
    missingFields,
    setupCompletion,
    status: guidanceReadiness,
    unknownFields,
  };
}

function textState(value: string | null | undefined): ProfileFieldState {
  const normalized = value?.trim().toLowerCase() || "";
  if (!normalized) return "missing";
  if (["unknown", "not sure", "i'm not sure", "mixed / unknown", "mixed/unknown"].includes(normalized)) {
    return "complete-unknown";
  }
  return "complete-known";
}

function numberRowState(value: number | null | undefined): ProfileFieldState {
  return typeof value === "number" && Number.isFinite(value) ? "complete-known" : "complete-unknown";
}

function positiveNumberState(value: string, options: { allowZero?: boolean } = {}): ProfileFieldState {
  const parsed = parsePositiveNumber(value);
  if (!value.trim() || !Number.isFinite(parsed)) return "missing";
  return options.allowZero ? (parsed >= 0 ? "complete-known" : "missing") : parsed > 0 ? "complete-known" : "missing";
}

function avoidanceRowState(value: string[] | null | undefined): ProfileFieldState {
  if (value === null || value === undefined) return "missing";
  return value.some((item) => item.trim()) ? "complete-known" : "complete-none";
}

function validBudget(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
