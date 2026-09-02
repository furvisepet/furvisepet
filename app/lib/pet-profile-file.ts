import { formatPetDisplayName, formatSpecies } from "./petwise";
import type { DogProfileRow } from "./supabase";

type ProfileFactSource = Pick<
  DogProfileRow,
  "age_unit" | "age_value" | "breed" | "current_food" | "name" | "routine_note" | "sex" | "species" | "weight_unit" | "weight_value"
>;

export function buildPetProfileFactRows(profile: ProfileFactSource) {
  const facts: Array<{ label: string; value: string }> = [];
  const name = knownText(profile.name);
  const species = profile.species === "cat" || profile.species === "dog" ? formatSpecies(profile.species) : "";
  const sex = profile.sex === "female" ? "Female" : profile.sex === "male" ? "Male" : "";
  const age = formatAge(profile.age_value, profile.age_unit);
  const breed = knownText(profile.breed);
  const currentFood = knownText(profile.current_food);
  const routine = knownText(profile.routine_note);

  if (name) facts.push({ label: "Name", value: formatPetDisplayName(name) });
  if (species) facts.push({ label: "Species", value: species });
  if (sex) facts.push({ label: "Sex", value: sex });
  if (age) facts.push({ label: "Age", value: age });
  if (breed) facts.push({ label: "Breed", value: breed });
  if (profile.weight_value !== null && profile.weight_value !== undefined && Number.isFinite(profile.weight_value) && profile.weight_value > 0) {
    facts.push({ label: "Weight", value: `${formatNumber(profile.weight_value)} ${profile.weight_unit?.trim() || "lb"}` });
  }
  if (currentFood) facts.push({ label: "Current food", value: currentFood });
  if (routine) facts.push({ label: "Routine", value: routine });

  return facts;
}

type ProfileAboutSource = Pick<DogProfileRow, "breed" | "current_food" | "routine_note" | "weight_unit" | "weight_value">;

export function buildPetProfileAboutDetails(profile: ProfileAboutSource) {
  const details: Array<{ label: string; value: string }> = [];
  const breed = knownText(profile.breed);
  const currentFood = knownText(profile.current_food);
  const routine = knownText(profile.routine_note);

  if (breed) details.push({ label: "Breed", value: breed });
  if (profile.weight_value !== null && profile.weight_value !== undefined && Number.isFinite(profile.weight_value)) {
    details.push({ label: "Weight", value: `${formatNumber(profile.weight_value)} ${profile.weight_unit?.trim() || "lb"}` });
  }
  if (routine) details.push({ label: "Routine", value: routine });
  if (currentFood) details.push({ label: "Current food", value: currentFood });
  return details;
}

function knownText(value: string | null | undefined) {
  const clean = value?.trim() || "";
  return ["unknown", "not sure", "i'm not sure", "not provided"].includes(clean.toLowerCase()) ? "" : clean;
}

function formatAge(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return "";
  const singularUnit = unit === "months" ? "month" : "year";
  return `${formatNumber(value)} ${value === 1 ? singularUnit : `${singularUnit}s`}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
