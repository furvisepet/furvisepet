import { parsePositiveNumber, type PetProfile } from "./petwise.ts";

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
