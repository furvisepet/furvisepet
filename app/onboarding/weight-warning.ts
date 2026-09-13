import type { AddPetDraftV2 } from "../lib/onboarding-drafts";

const UPPER_WEIGHT_LIMITS = {
  cat: { kg: 18, lb: 40 },
  dog: { kg: 113, lb: 250 },
} as const;

export function getWeightPlausibilityWarning({
  species,
  unit,
  unknown,
  value,
}: {
  species: AddPetDraftV2["species"];
  unit: AddPetDraftV2["weightUnit"];
  unknown: boolean;
  value: string;
}) {
  if (!species || unknown || !value.trim()) return "";
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= UPPER_WEIGHT_LIMITS[species][unit]) return "";
  return `That weight looks unusual for a ${species}. Double-check it or choose Not sure.`;
}
