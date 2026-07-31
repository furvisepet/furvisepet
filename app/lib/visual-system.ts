const PET_ACCENT_TOKENS = [
  "var(--accent-sage)",
  "var(--soft-sage)",
] as const;

const CARE_CATEGORY_SURFACES: Record<
  string,
  { accent: string; surface: string; text: string }
> = {
  food: { accent: "var(--accent-apricot)", surface: "var(--pw-category-food-surface)", text: "var(--pw-category-text)" },
  grooming: { accent: "var(--accent-sage)", surface: "var(--pw-category-grooming-surface)", text: "var(--pw-category-text)" },
  symptom: { accent: "var(--accent-rose)", surface: "var(--pw-category-health-surface)", text: "var(--pw-category-text)" },
  medication: { accent: "var(--accent-lavender)", surface: "var(--pw-category-health-surface)", text: "var(--pw-category-text)" },
  vet_visit: { accent: "var(--accent-yellow)", surface: "var(--pw-category-vet-surface)", text: "var(--pw-category-text)" },
  behavior: { accent: "var(--accent-sage)", surface: "var(--pw-category-routine-surface)", text: "var(--pw-category-text)" },
  activity: { accent: "var(--accent-sky)", surface: "var(--pw-category-product-surface)", text: "var(--pw-category-text)" },
  general: { accent: "var(--accent-sage)", surface: "var(--pw-category-routine-surface)", text: "var(--pw-category-text)" },
};

export function getPetAccent(seed: string) {
  const hash = [...seed].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
  return PET_ACCENT_TOKENS[hash % PET_ACCENT_TOKENS.length];
}

export function getCareCategoryVisual(category: string) {
  return CARE_CATEGORY_SURFACES[category] ?? CARE_CATEGORY_SURFACES.general;
}
