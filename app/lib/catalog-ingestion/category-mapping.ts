import type { CategoryMapping } from "./types";

export const CATEGORY_MAPPINGS: Readonly<Record<string, { categorySlug: string; subcategorySlug: string | null }>> = {
  "brush": { categorySlug: "grooming", subcategorySlug: "brushes" },
  "brushes": { categorySlug: "grooming", subcategorySlug: "brushes" },
  "conditioner": { categorySlug: "grooming", subcategorySlug: "conditioner" },
  "dental": { categorySlug: "dental", subcategorySlug: null },
  "dental care": { categorySlug: "dental", subcategorySlug: null },
  "dental chews": { categorySlug: "dental", subcategorySlug: null },
  "dog shampoo": { categorySlug: "grooming", subcategorySlug: "shampoo" },
  "dry adult dog food": { categorySlug: "food", subcategorySlug: "dry-food" },
  "dry cat food": { categorySlug: "food", subcategorySlug: "dry-food" },
  "dry dog food": { categorySlug: "food", subcategorySlug: "dry-food" },
  "dry food": { categorySlug: "food", subcategorySlug: "dry-food" },
  "ear care": { categorySlug: "ear-care", subcategorySlug: null },
  "ear cleaner": { categorySlug: "ear-care", subcategorySlug: null },
  "food": { categorySlug: "food", subcategorySlug: null },
  "grooming": { categorySlug: "grooming", subcategorySlug: null },
  "grooming wipes": { categorySlug: "grooming", subcategorySlug: "grooming-wipes" },
  "health essentials": { categorySlug: "health-essentials", subcategorySlug: null },
  "nail care": { categorySlug: "grooming", subcategorySlug: "nail-care" },
  "paw care": { categorySlug: "paw-care", subcategorySlug: null },
  "shampoo": { categorySlug: "grooming", subcategorySlug: "shampoo" },
  "supplement": { categorySlug: "supplements", subcategorySlug: null },
  "supplements": { categorySlug: "supplements", subcategorySlug: null },
  "veterinary diet": { categorySlug: "food", subcategorySlug: "veterinary-diet" },
  "wet cat food": { categorySlug: "food", subcategorySlug: "wet-food" },
  "wet dog food": { categorySlug: "food", subcategorySlug: "wet-food" },
  "wet food": { categorySlug: "food", subcategorySlug: "wet-food" },
};

export function mapSourceCategory(category: string | null, subcategory: string | null): CategoryMapping {
  const sourceCategory = normalizeMappingKey(category);
  const sourceSubcategory = normalizeMappingKey(subcategory);
  const mapping = CATEGORY_MAPPINGS[sourceSubcategory || ""] || CATEGORY_MAPPINGS[sourceCategory || ""];
  return {
    categorySlug: mapping?.categorySlug || null,
    sourceCategory: category,
    sourceSubcategory: subcategory,
    subcategorySlug: mapping?.subcategorySlug || null,
  };
}

function normalizeMappingKey(value: string | null) {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") || null;
}
