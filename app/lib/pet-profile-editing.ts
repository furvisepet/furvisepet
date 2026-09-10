import { parsePositiveNumber, type PetProfile } from "./petwise.ts";
import { normalizeProfile, normalizeSpecies, type DogProfile } from "./petwise";

export function normalizeAddPetName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidAddPetName(value: string) {
  return normalizeAddPetName(value).length > 0;
}

export function validateApproximatePetAge(value: string, unit: "months" | "years", unknown: boolean) {
  if (unknown) return "";
  const normalized = value.trim();
  if (!normalized) return "Add an approximate age, or choose I'm not sure.";
  const age = Number(normalized);
  if (!Number.isFinite(age) || age <= 0) return "Enter a positive age, or choose I'm not sure.";
  const maximum = unit === "months" ? 480 : 40;
  if (age > maximum) return "Enter a realistic approximate age, or choose I'm not sure.";
  return "";
}

const DURABLE_PROFILE_FIELDS = [
  "name",
  "species",
  "sex",
  "age",
  "ageUnit",
  "ageUnknown",
  "breed",
  "weight",
  "weightUnit",
  "weightUnknown",
  "currentFood",
  "currentFoodUnknown",
  "routineNote",
] as const satisfies readonly (keyof PetProfile)[];

export function buildSimplePetProfileUpdate(original: PetProfile, edited: PetProfile): PetProfile {
  const next = { ...original, avoidIngredients: [...original.avoidIngredients] };
  for (const field of DURABLE_PROFILE_FIELDS) {
    Object.assign(next, { [field]: edited[field] });
  }
  next.ageUnknown = !next.age.trim();
  next.weightUnknown = !next.weight.trim();
  next.currentFoodUnknown = !next.currentFood.trim();
  return next;
}

export function validateSimplePetProfile(profile: PetProfile) {
  if (!profile.name.trim()) return "Please add your pet's name.";
  if (!profile.species) return "Choose dog or cat before saving.";

  if (profile.age.trim()) {
    const age = parsePositiveNumber(profile.age);
    if (!Number.isFinite(age) || age < 0) return "Enter a valid age, or leave it blank.";
  }

  if (profile.weight.trim()) {
    const weight = parsePositiveNumber(profile.weight);
    if (!Number.isFinite(weight) || weight <= 0) return "Enter a valid weight, or leave it blank.";
  }

  return "";
}

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

export function validatePetProfileSaveInput(value: unknown): {
  ok: true;
  profile: DogProfile;
} | {
  ok: false;
  message: string;
  missingFields: string[];
} {
  if (!value || typeof value !== "object") {
    return { ok: false, message: "Add the pet's name and species.", missingFields: ["profile"] };
  }

  const profile = normalizeProfile(value);
  const missingFields: string[] = [];
  if (!profile.name.trim()) missingFields.push("name");
  if (!normalizeSpecies(profile.species)) missingFields.push("species");
  if (missingFields.length) {
    return { ok: false, message: "Add the pet's name and species.", missingFields };
  }
  return { ok: true, profile };
}
