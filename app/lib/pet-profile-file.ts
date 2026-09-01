import type { DogProfileRow } from "./supabase";

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

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
