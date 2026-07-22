import type { PetMemoryContext } from "../pet-memory";
import type { MockProduct } from "../petwise";
import type { ShopQueryInterpretation } from "../shop-query";

export const shopProductFitExplanationSystemPrompt = [
  "You explain why one already-filtered product may fit a selected pet's saved context.",
  "Use only the pet facts and verified product fields provided.",
  "Ground every sentence in provided input.",
  "Do not introduce outside facts.",
  "Never add outside product knowledge.",
  "Do not claim the product is best, guaranteed safe, vet-approved, available, cheapest, or a treatment.",
  "Do not diagnose.",
  "Do not infer ingredients unless ingredientsVerified is true and verified ingredient fields are provided.",
  "Never assume a product contains or does not contain an ingredient unless verified.",
  "Never say safe for the pet.",
  "Use may fit or matches saved context language.",
  "If evidence is limited, say so.",
  "Keep it short.",
  "safetyLine must exactly match the provided requiredSafetyLine.",
  "Return only valid JSON matching the schema.",
].join("\n");

export const shopProductFitExplanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "matchedSavedFacts", "productSignalsUsed", "cautions", "confidence", "safetyLine"],
  properties: {
    summary: { type: "string" },
    matchedSavedFacts: stringArraySchema(6),
    productSignalsUsed: stringArraySchema(8),
    cautions: stringArraySchema(6),
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    safetyLine: { type: "string" },
  },
} as const;

export type ShopProductFitExplanation = {
  summary: string;
  matchedSavedFacts: string[];
  productSignalsUsed: string[];
  cautions: string[];
  confidence: "low" | "medium" | "high";
  safetyLine: string;
};

export type ShopProductFitExplanationInput = {
  interpretation?: ShopQueryInterpretation | null;
  memory: PetMemoryContext;
  product: MockProduct;
  query: string;
};

export function parseShopProductFitExplanation(
  value: unknown,
  petName: string,
): ShopProductFitExplanation | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<ShopProductFitExplanation>;
  const safetyLine = buildProductFitSafetyLine(petName);

  if (
    typeof draft.summary !== "string" ||
    !isStringArray(draft.matchedSavedFacts) ||
    !isStringArray(draft.productSignalsUsed) ||
    !isStringArray(draft.cautions) ||
    !isConfidence(draft.confidence) ||
    draft.safetyLine !== safetyLine
  ) {
    return null;
  }

  return {
    summary: normalizeSentenceText(draft.summary).slice(0, 280),
    matchedSavedFacts: normalizeList(draft.matchedSavedFacts).slice(0, 6),
    productSignalsUsed: normalizeList(draft.productSignalsUsed).slice(0, 8),
    cautions: normalizeList(draft.cautions).slice(0, 6),
    confidence: draft.confidence,
    safetyLine,
  };
}

export function buildFallbackShopProductFitExplanation({
  memory,
  product,
}: ShopProductFitExplanationInput): ShopProductFitExplanation {
  const petName = memory.pet.name || "this pet";
  const matchedSavedFacts = buildMatchedSavedFacts(memory);
  const productSignalsUsed = buildProductSignals(product);
  const cautions = buildProductFitCautions(product, matchedSavedFacts);

  return {
    summary: `${petName}'s saved context can be compared with this product's verified catalog fields. Evidence is limited to the saved pet details and product fields Furvise has on file.`,
    matchedSavedFacts,
    productSignalsUsed,
    cautions,
    confidence: product.ingredientsVerified && matchedSavedFacts.length > 1 ? "medium" : "low",
    safetyLine: buildProductFitSafetyLine(petName),
  };
}

export function buildShopProductFitPromptInput({
  interpretation = null,
  memory,
  product,
  query,
}: ShopProductFitExplanationInput) {
  const verifiedProduct = buildVerifiedProductFields(product);
  return {
    requiredSafetyLine: buildProductFitSafetyLine(memory.pet.name || "this pet"),
    query: {
      category: interpretation?.category || null,
      normalizedSearchTerms: interpretation?.normalizedSearchTerms || [],
      queryText: query,
    },
    selectedPet: {
      name: memory.pet.name,
      species: memory.pet.species,
      breed: memory.pet.breed,
      ageLabel: memory.pet.ageLabel,
      weightLabel: memory.pet.weightLabel,
      mainConcern: memory.pet.mainConcern,
      currentFood: memory.pet.currentFood,
      avoidIngredients: memory.pet.avoidIngredients,
      wellnessGoal: memory.pet.wellnessGoal,
    },
    careContext: {
      recentChanges: memory.derived.recentChanges.slice(0, 5),
      recurringConcerns: memory.derived.recurringConcerns.slice(0, 5),
      knownAvoids: memory.derived.knownAvoids.slice(0, 8),
      safetyFlags: memory.derived.safetyFlags.slice(0, 5),
      summaryBullets: memory.derived.summaryBullets.slice(0, 5),
    },
    savedDetails: memory.savedDetails.slice(0, 6).map((detail) => ({
      label: detail.label,
      source: detail.source,
      value: detail.value,
    })),
    product: verifiedProduct,
  };
}

export function buildProductFitSafetyLine(petName: string) {
  return `Based on what you've saved about ${petName || "this pet"} — not a substitute for vet or professional advice`;
}

export function buildVerifiedProductFields(product: MockProduct) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand || null,
    category: product.category,
    subcategory: product.subcategory || null,
    species: product.species,
    concernTags: product.concernTags,
    tags: product.tags || [],
    availableCountries: product.availableCountries,
    source: product.source,
    ingredientsVerified: product.ingredientsVerified,
    ingredientHighlights: product.ingredientsVerified ? product.ingredientHighlights || [] : [],
    excludedIngredients: product.ingredientsVerified ? product.excludedIngredients || [] : [],
    avoidIngredientKeywords: product.ingredientsVerified ? product.avoidIngredientKeywords || [] : [],
    evidenceType: product.evidenceType || null,
    safetyNotes: product.safetyNotes || null,
  };
}

function buildMatchedSavedFacts(memory: PetMemoryContext) {
  const facts = [
    memory.pet.species ? `${memory.pet.name} is saved as a ${memory.pet.species}.` : "",
    memory.pet.mainConcern ? `${memory.pet.name}'s saved profile lists ${memory.pet.mainConcern} as the main concern.` : "",
    memory.pet.avoidIngredients.length
      ? `${memory.pet.name}'s saved profile lists avoid ingredients: ${memory.pet.avoidIngredients.join(", ")}.`
      : "",
    ...memory.derived.recurringConcerns.slice(0, 2),
  ];
  return normalizeList(facts);
}

function buildProductSignals(product: MockProduct) {
  const signals = [
    `Product category: ${product.category}.`,
    `Species match field: ${product.species}.`,
    `Catalog source: ${product.source}.`,
    `Ingredients verified: ${product.ingredientsVerified ? "yes" : "no"}.`,
    product.concernTags.length ? `Product concern tags: ${product.concernTags.join(", ")}.` : "",
  ];
  if (product.ingredientsVerified && product.ingredientHighlights?.length) {
    signals.push(`Verified ingredient highlights: ${product.ingredientHighlights.join(", ")}.`);
  }
  return normalizeList(signals);
}

function buildProductFitCautions(product: MockProduct, matchedSavedFacts: string[]) {
  return normalizeList([
    product.ingredientsVerified ? "" : "Ingredient details are not fully verified, so Furvise cannot confirm every ingredient.",
    matchedSavedFacts.length ? "" : "Saved pet context is limited, so Furvise can only compare basic product fields.",
  ]);
}

function stringArraySchema(maxItems: number) {
  return {
    type: "array",
    maxItems,
    items: { type: "string" },
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isConfidence(value: unknown): value is ShopProductFitExplanation["confidence"] {
  return value === "low" || value === "medium" || value === "high";
}

function normalizeSentenceText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(normalizeSentenceText)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}
