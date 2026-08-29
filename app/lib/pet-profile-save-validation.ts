import { normalizeProfile, normalizeSpecies, type DogProfile } from "./petwise";

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
