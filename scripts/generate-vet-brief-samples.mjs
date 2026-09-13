import { mkdir, writeFile } from "node:fs/promises";
import { buildVetBriefDraft } from "../app/lib/vet-brief/builder.ts";
import { generateVetBriefPdf } from "../app/lib/vet-brief/pdf.ts";
import { getVetBriefFilename } from "../app/lib/vet-brief/schema.ts";

const generatedAt = "2026-07-24T12:00:00Z";
const baseProfile = {
  id: "sample-pet",
  user_id: "sample-owner",
  name: "Rocky",
  species: "dog",
  breed: "Labrador Retriever",
  age_value: 4,
  age_unit: "years",
  weight_value: 31,
  weight_unit: "kg",
  current_food: "Salmon kibble",
  main_concern: "General wellness",
  wellness_goal: "general_wellness",
  avoid_ingredients: [],
  monthly_budget: null,
  created_at: generatedAt,
  updated_at: generatedAt,
};

const samples = [
  {
    name: "complete-profile",
    profile: baseProfile,
    reasonForVisit: "Routine visit and review of recent scratching.",
    entries: [entry("c1", "symptom", "2026-07-10", "Scratching after dinner", "Owner noticed mild scratching after dinner.", "mild"), entry("c2", "medication", "2026-07-12", "Fish oil supplement", "Owner gave the saved label amount.")],
  },
  {
    name: "sparse-profile",
    profile: { ...baseProfile, name: "Milo", breed: null, age_value: null, age_unit: null, weight_value: null, weight_unit: null, current_food: null },
    reasonForVisit: "Not recorded",
    entries: [],
  },
  {
    name: "multi-week-timeline",
    profile: { ...baseProfile, name: "Luna" },
    reasonForVisit: "Review a multi-week paw-licking concern.",
    entries: Array.from({ length: 18 }, (_, index) => entry(`t${index}`, "symptom", `2026-07-${String(index + 1).padStart(2, "0")}`, `Paw licking update ${index + 1}`, `Owner reported paw licking update ${index + 1}.`, index % 3 === 0 ? "mild" : null)),
  },
  {
    name: "food-change-concern",
    profile: { ...baseProfile, name: "Bailey", current_food: "Turkey recipe" },
    reasonForVisit: "Discuss appetite and stool after a recorded food change.",
    entries: [entry("f1", "food", "2026-07-03", "Changed food", "Switched from chicken kibble to turkey recipe."), entry("f2", "symptom", "2026-07-06", "Stool change", "Owner noticed softer stool after dinner.")],
  },
  {
    name: "routine-wellness",
    profile: { ...baseProfile, name: "Cooper", main_concern: "General wellness" },
    reasonForVisit: "Routine annual wellness visit.",
    entries: [entry("w1", "activity", "2026-07-01", "Daily walks", "Owner reported regular daily walks."), entry("w2", "vet_visit", "2026-06-20", "Previous routine visit", "Saved care history notes a routine visit.")],
  },
];

await mkdir("output/pdf", { recursive: true });
for (const sample of samples) {
  const { document } = buildVetBriefDraft({ profile: sample.profile, careEntries: sample.entries, memories: [], from: "2026-06-01", to: "2026-07-24", reasonForVisit: sample.reasonForVisit, generatedAt });
  const bytes = await generateVetBriefPdf(document);
  const filename = getVetBriefFilename(`${document.pet.name}-${sample.name}`, generatedAt);
  await writeFile(`output/pdf/${filename}`, bytes);
}

function entry(id, category, date, title, note, severity = null) {
  return { id, user_id: "sample-owner", pet_profile_id: "sample-pet", category, title, note, severity, occurred_at: `${date}T12:00:00Z`, created_at: `${date}T12:00:00Z`, updated_at: `${date}T12:00:00Z` };
}
