export type PostCreatePet = {
  ageExplicitlyUnknown: boolean;
  age_unit: string | null;
  age_value: number | null;
  breed: string | null;
  breedExplicitlyUnknown: boolean;
  id: string;
  name: string;
  routine_note: string | null;
  sex: "female" | "male" | "not_sure" | null;
  species: "dog" | "cat";
  weightExplicitlyUnknown: boolean;
  weight_unit: string | null;
  weight_value: number | null;
};

export type PetKnowledgeRow = readonly [label: string, value: string];

export function buildPetKnowledgeRows(pet: PostCreatePet): PetKnowledgeRow[] {
  const rows: PetKnowledgeRow[] = [
    ["Species", pet.species === "cat" ? "Cat" : "Dog"],
  ];
  const age = formatMeasurement(pet.age_value, pet.age_unit);
  const weight = formatMeasurement(pet.weight_value, pet.weight_unit);
  if (age) rows.push(["Age", age]);
  else if (pet.ageExplicitlyUnknown) rows.push(["Age", "Not sure"]);
  if (pet.sex) rows.push(["Sex", pet.sex === "not_sure" ? "Not sure" : title(pet.sex)]);
  if (pet.breed?.trim()) rows.push(["Breed", pet.breed.trim()]);
  else if (pet.breedExplicitlyUnknown) rows.push(["Breed", "Not sure"]);
  if (weight) rows.push(["Weight", weight]);
  else if (pet.weightExplicitlyUnknown) rows.push(["Weight", "Not sure"]);
  if (pet.routine_note?.trim()) rows.push(["Note", pet.routine_note.trim()]);
  return rows;
}

export function getPetObjectPronoun(sex: PostCreatePet["sex"]) {
  if (sex === "female") return "her";
  if (sex === "male") return "him";
  return "them";
}

export function buildDurableFileCloser(pet: PostCreatePet) {
  return `This is ${pet.name}'s file. When something changes, add it or ask — Furvise keeps it with ${getPetObjectPronoun(pet.sex)}, not as a one-off chat.`;
}

function formatMeasurement(value: number | null, unit: string | null) {
  if (value === null) return "";
  const normalizedUnit = unit?.trim() || "";
  if (!normalizedUnit) return String(value);
  const displayUnit = value === 1 && normalizedUnit.endsWith("s") ? normalizedUnit.slice(0, -1) : normalizedUnit;
  return `${value} ${displayUnit}`;
}

function title(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
