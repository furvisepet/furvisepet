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
