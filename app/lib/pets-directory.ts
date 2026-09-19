import { formatSpecies } from "./petwise";

type DirectoryPet = {
  age_unit?: string | null;
  age_value?: number | null;
  lifecycle_status?: "active" | "deceased" | "archived" | null;
  sex?: "female" | "male" | "not_sure" | null;
  species?: "cat" | "dog" | null;
};

export function formatPetDirectoryMetadata(profile: DirectoryPet) {
  const species = profile.species === "cat" || profile.species === "dog" ? formatSpecies(profile.species) : "";
  const sex = profile.sex === "female" ? "Female" : profile.sex === "male" ? "Male" : "";
  const age = formatDirectoryAge(profile.age_value, profile.age_unit);
  const lifecycle = profile.lifecycle_status === "deceased"
    ? "In memory"
    : profile.lifecycle_status === "archived" ? "Archived" : "";

  return [species, sex, age, lifecycle].filter(Boolean).join(" · ");
}

function formatDirectoryAge(value: number | null | undefined, unit: string | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const normalizedUnit = unit === "months" ? "month" : "year";
  return `${Number.isInteger(value) ? value : Number(value.toFixed(1))} ${value === 1 ? normalizedUnit : `${normalizedUnit}s`}`;
}
