import { parsePositiveNumber, selectedConcern, type DogProfile, type PetSpecies } from "./petwise";

export type ProfileCompletenessStatus =
  | "Ready for guidance"
  | "Limited context"
  | "Missing required information";

export type ProfileCompletenessLevel =
  | "complete_factual_profile"
  | "complete_owner_response_with_unknowns"
  | "incomplete_profile";

export type ProfileCompleteness = {
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
  breed: string | null;
  current_food: string | null;
  main_concern: string | null;
  monthly_budget: number | null;
  name: string;
  species?: PetSpecies | null;
  weight_value: number | null;
};

const REQUIRED_FIRST_RESULT_FIELDS = new Set(["name", "species", "age", "main concern"]);
const MATERIAL_CONTEXT_FIELDS = new Set(["age", "weight", "current food"]);

export function buildProfileCompleteness(profile: RowProfileShape): ProfileCompleteness {
  return summarizeCompleteness({
    age: numberFieldState(profile.age_value),
    breed: textFieldState(profile.breed),
    currentFood: textFieldState(profile.current_food, "unknown"),
    mainConcern: textFieldState(profile.main_concern),
    monthlyBudget: validBudget(profile.monthly_budget) ? "known" : "missing",
    name: textFieldState(profile.name),
    species: textFieldState(profile.species),
    weight: numberFieldState(profile.weight_value),
  });
}

export function buildDraftProfileCompleteness(profile: DogProfile): ProfileCompleteness {
  return summarizeCompleteness({
    age: profile.ageUnknown ? "unknown" : positiveNumberFieldState(profile.age, { allowZero: true }),
    breed: textFieldState(profile.breed),
    currentFood: profile.currentFoodUnknown ? "unknown" : textFieldState(profile.currentFood),
    mainConcern: textFieldState(selectedConcern(profile)),
    monthlyBudget: positiveNumberFieldState(profile.monthlyBudget),
    name: textFieldState(profile.name),
    species: textFieldState(profile.species),
    weight: profile.weightUnknown ? "unknown" : positiveNumberFieldState(profile.weight),
  });
}

export function getProfileActionFields(completeness: ProfileCompleteness) {
  return [...completeness.missingFields, ...completeness.limitingUnknownFields];
}

function summarizeCompleteness(fields: {
  age: FieldState;
  breed: FieldState;
  currentFood: FieldState;
  mainConcern: FieldState;
  monthlyBudget: FieldState;
  name: FieldState;
  species: FieldState;
  weight: FieldState;
}): ProfileCompleteness {
  const missingFields: string[] = [];
  const unknownFields: string[] = [];

  collectField("name", fields.name, missingFields, unknownFields);
  collectField("species", fields.species, missingFields, unknownFields);
  collectField("breed or mixed/unknown", fields.breed, missingFields, unknownFields);
  collectField("age", fields.age, missingFields, unknownFields);
  collectField("weight", fields.weight, missingFields, unknownFields);
  collectField("current food", fields.currentFood, missingFields, unknownFields);
  collectField("main concern", fields.mainConcern, missingFields, unknownFields);
  collectField("monthly care budget", fields.monthlyBudget, missingFields, unknownFields);

  const limitingUnknownFields =
    unknownFields.filter((field) => MATERIAL_CONTEXT_FIELDS.has(field)).length >= 3
      ? unknownFields.filter((field) => MATERIAL_CONTEXT_FIELDS.has(field))
      : [];
  const hasRequiredMissingField = missingFields.some((field) => REQUIRED_FIRST_RESULT_FIELDS.has(field));

  let setupCompletion: ProfileCompletenessStatus = "Ready for guidance";
  if (hasRequiredMissingField) {
    setupCompletion = "Missing required information";
  } else if (missingFields.length > 0 || limitingUnknownFields.length > 0) {
    setupCompletion = "Limited context";
  }

  let guidanceReadiness = setupCompletion;
  if (fields.name === "missing" || fields.species === "missing" || fields.age === "missing" || fields.mainConcern === "missing") {
    guidanceReadiness = "Missing required information";
  } else if (
    fields.weight === "unknown" ||
    fields.age === "unknown" ||
    fields.currentFood === "unknown" ||
    unknownFields.length > 0
  ) {
    guidanceReadiness = setupCompletion === "Missing required information" ? setupCompletion : "Limited context";
  }

  const level: ProfileCompletenessLevel =
    missingFields.length > 0
      ? "incomplete_profile"
      : unknownFields.length > 0
        ? "complete_owner_response_with_unknowns"
        : "complete_factual_profile";

  return {
    level,
    guidanceReadiness,
    limitingUnknownFields,
    missingFields,
    setupCompletion,
    status: guidanceReadiness,
    unknownFields,
  };
}

type FieldState = "known" | "missing" | "unknown";

function collectField(
  label: string,
  state: FieldState,
  missingFields: string[],
  unknownFields: string[],
) {
  if (state === "missing") missingFields.push(label);
  if (state === "unknown") unknownFields.push(label);
}

function textFieldState(value: string | null | undefined, emptyState: FieldState = "missing"): FieldState {
  return value?.trim() ? "known" : emptyState;
}

function numberFieldState(value: number | null | undefined): FieldState {
  return typeof value === "number" && Number.isFinite(value) ? "known" : "unknown";
}

function positiveNumberFieldState(value: string, options: { allowZero?: boolean } = {}): FieldState {
  const parsed = parsePositiveNumber(value);
  if (!value.trim() || !Number.isFinite(parsed)) return "missing";
  return options.allowZero ? (parsed >= 0 ? "known" : "missing") : parsed > 0 ? "known" : "missing";
}

function validBudget(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
