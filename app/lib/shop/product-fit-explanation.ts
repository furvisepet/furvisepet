import type { PetMemoryContext } from "../pet-memory";
import type { MockProduct } from "../petwise";
import type { ShopQueryInterpretation } from "../shop-query";

export const shopProductFitExplanationSystemPrompt = [
  "You write concise product advisor copy for one already-filtered pet product.",
  "Make the explanation product-first, benefit-focused, simple, and honest.",
  "Use only the selected pet name, selected pet species, shopping search, verified product fields, and ingredientsVerified status.",
  "Do not introduce outside facts.",
  "Never add outside product knowledge.",
  "Do not claim the product is best, guaranteed safe, vet-approved, available, cheapest, a cure, or a treatment.",
  "Do not diagnose.",
  "Do not infer ingredients unless ingredientsVerified is true and verified ingredient fields are provided.",
  "Never assume a product contains or does not contain an ingredient unless verified.",
  "Never say safe for the pet.",
  "Write at most two short paragraphs, 80-110 words maximum.",
  "Do not use bullets, section labels, or internal reasoning language.",
  "Do not include assistant-style follow-up offers like If you want, I can, I can help, ask me, or let me know.",
  "Do not mention AI, signals, catalog tags, database fields, provided product data, saved context includes, or Furvise used.",
  "Do not output internal values like owner_observation, itchy_skin, sensitive_skin, or ingredientsVerified.",
  "If ingredientsVerified is false, do not repeat a full missing-ingredient warning. Use one brief label-review sentence.",
  "safetyLine must exactly match the provided requiredSafetyLine.",
  "Return only valid JSON matching the schema.",
].join("\n");

export const shopProductFitExplanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["bodyParagraphs", "confidence", "safetyLine"],
  properties: {
    bodyParagraphs: stringArraySchema(2),
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    safetyLine: { type: "string" },
  },
} as const;

export type ShopProductFitExplanation = {
  bodyParagraphs: string[];
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
    !isStringArray(draft.bodyParagraphs) ||
    !isConfidence(draft.confidence) ||
    draft.safetyLine !== safetyLine
  ) {
    return null;
  }

  const bodyParagraphs = normalizeBodyParagraphs(draft.bodyParagraphs);
  if (bodyParagraphs.length === 0) return null;

  return {
    bodyParagraphs,
    confidence: draft.confidence,
    safetyLine,
  };
}

export function buildFallbackShopProductFitExplanation({
  interpretation = null,
  memory,
  product,
  query,
}: ShopProductFitExplanationInput): ShopProductFitExplanation {
  return {
    bodyParagraphs: buildSalesBodyParagraphs({ interpretation, memory, product, query }),
    confidence: product.ingredientsVerified && hasSavedSkinOrPawContext(memory) ? "medium" : "low",
    safetyLine: buildProductFitSafetyLine(memory.pet.name || "this pet"),
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
    },
    careContext: {
      hasSavedSkinOrPawContext: hasSavedSkinOrPawContext(memory),
      safetyFlags: memory.derived.safetyFlags.slice(0, 5),
    },
    product: verifiedProduct,
  };
}

export function buildProductFitSafetyLine(petName: string) {
  return `Based on what you've saved about ${petName || "this pet"}. Not a substitute for vet or professional advice.`;
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
    ingredientsVerified: product.ingredientsVerified,
    ingredientStatus: product.ingredientsVerified ? "verified" : "not fully verified",
    verifiedDescription: product.verifiedDescription || null,
    verifiedIngredients: product.ingredientsVerified && product.verifiedIngredients?.length
      ? product.verifiedIngredients
      : [],
    verifiedDirections: product.verifiedDirections || null,
    verifiedWarnings: product.verifiedWarnings || [],
    verifiedProductPageUrl: product.verifiedProductPageUrl || product.sourceUrl || null,
    enrichmentStatus: product.enrichmentStatus || "none",
    verificationSource: product.verificationSource || null,
    ingredientHighlights: product.ingredientsVerified ? product.ingredientHighlights || [] : [],
    excludedIngredients: product.ingredientsVerified ? product.excludedIngredients || [] : [],
    avoidIngredientKeywords: product.ingredientsVerified ? product.avoidIngredientKeywords || [] : [],
    humanProductType: getProductTypeLabel(product),
    humanUseTerms: getProductUseTerms(product),
  };
}

function buildSalesBodyParagraphs({
  interpretation,
  memory,
  product,
  query,
}: {
  interpretation: ShopQueryInterpretation | null;
  memory: PetMemoryContext;
  product: MockProduct;
  query: string;
}) {
  const petName = memory.pet.name || "this pet";
  const displayName = getProductDisplayName(product);
  const productType = getProductTypeLabel(product);
  const useTerms = getProductUseTerms(product);
  const useText = useTerms.length ? formatList(useTerms.slice(0, 2)) : getProductBenefit(product);
  const shoppingNeed = getShoppingNeed(query, interpretation);
  const reactionProductLabel = product.category === "grooming" ? "grooming products" : "similar products";
  const isShampoo = product.category === "grooming" && product.subcategory === "shampoo";
  if (isShampoo) {
    const speciesLabel = product.species === "all" ? "pet" : product.species;
    return normalizeBodyParagraphs([
      `${displayName} may make sense for ${petName} because it is a ${speciesLabel} shampoo for routine bathing and gentle coat cleaning. It is a better fit for grooming questions than dental, food, or flea concerns.`,
      `Review the label before using it, especially if ${petName} has sensitive skin or has reacted to shampoos before. Stop using it if irritation appears or worsens.`,
    ]);
  }
  const firstParagraph = normalizeParagraph(
    `${displayName} is a ${productType} for ${petName}. It may be worth comparing for ${useText} when shopping for ${shoppingNeed}.`,
  );
  const secondParagraph = normalizeParagraph(
    product.ingredientsVerified
      ? `Review the label and directions before using it, especially if ${petName} has reacted to ${reactionProductLabel} before.`
      : `Review the label before using, especially if ${petName} has reacted to ${reactionProductLabel} before.`,
  );
  return normalizeBodyParagraphs([firstParagraph, secondParagraph]);
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

function normalizeBodyParagraphs(values: string[]) {
  return normalizeList(values.map((value) => firstSentences(toUserFacingText(value), 3)))
    .slice(0, 2)
    .filter((value) => !hasBlockedCopy(value));
}

function normalizeParagraph(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(normalizeParagraph)
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function toUserFacingText(value: string) {
  return removeAssistantOfferSentences(normalizeParagraph(value))
    .replace(/\bBased on what you['’]ve saved about [^.]+\.?\s*Not a substitute for vet or professional advice\.?/gi, "")
    .replace(/\u2014/g, ", ")
    .replace(
      /\bFurvise does not have the full verified ingredient list yet,?\s*so\s*(?:check|review) the label before (?:buying or )?using it\.?/gi,
      "Review the label before using.",
    )
    .replace(/\bowner_observation\b/gi, "saved note")
    .replace(/\bitchy_skin\b/gi, "itchy skin")
    .replace(/\bsensitive_skin\b/gi, "sensitive skin")
    .replace(/\bpaw_care\b/gi, "paw care")
    .replace(/\bgeneral_wellness\b/gi, "general wellness")
    .replace(/\bdental_care\b/gi, "dental care")
    .replace(/\bconcern tags\b/gi, "product positioning")
    .replace(/\bcatalog tags\b/gi, "product positioning")
    .replace(/\bcatalog signals\b/gi, "product details")
    .replace(/\bsignals\b/gi, "details")
    .replace(/\bprovided product data\b/gi, "product details")
    .replace(/\bingredientsVerified\s*:\s*false\b/gi, "Ingredient details are not fully verified")
    .replace(/\bingredientsVerified\s*:\s*true\b/gi, "Ingredient details are verified");
}

function hasBlockedCopy(value: string) {
  return /\b(owner_observation|itchy_skin|sensitive_skin|ingredientsVerified|catalog tags|provided product data|signals|AI|Furvise used|saved context includes|best|guaranteed|safe|vet-approved|cure|If you want|I can help|ask me|let me know)\b/i.test(
    value,
  );
}

function removeAssistantOfferSentences(value: string) {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences
    .filter((sentence) => !/\b(if you want|i can help|ask me|let me know)\b/i.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentences(value: string, maxSentences: number) {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences.slice(0, maxSentences).join(" ").replace(/\s+/g, " ").trim();
}

function getProductTypeLabel(product: MockProduct) {
  const category = humanizeToken(product.category);
  const subcategory = product.subcategory ? humanizeToken(product.subcategory) : "";
  if (category === "grooming" && subcategory === "shampoo") return "grooming shampoo";
  if (subcategory && !category.includes(subcategory)) return `${category} ${subcategory}`;
  return subcategory || category || "catalog product";
}

function getProductDisplayName(product: MockProduct) {
  if (!product.brand || product.name.toLowerCase().includes(product.brand.toLowerCase())) return product.name;
  return `${product.brand} ${product.name}`;
}

function getProductUseTerms(product: MockProduct) {
  const text = [
    product.name,
    product.subcategory,
    ...product.concernTags,
    ...(product.tags || []),
  ].join(" ");
  const terms = [
    /\b(sensitive skin|sensitive_skin)\b/i.test(text) ? "sensitive-skin care" : "",
    /\bfragrance[-\s]?free\b/i.test(text) ? "fragrance-free bathing" : "",
    /\b(itchy skin|itchy_skin)\b/i.test(text) ? "itchy-skin care" : "",
    /\bdental\b/i.test(text) ? "dental care" : "",
  ];
  return normalizeList(terms);
}

function getProductBenefit(product: MockProduct) {
  const text = `${product.name} ${product.category} ${product.subcategory || ""} ${(product.tags || []).join(" ")}`;
  if (/\b(shampoo|bath|wash)\b/i.test(text)) return "gentle bath support";
  if (/\b(dental|teeth|tooth|breath|oral)\b/i.test(text)) return "dental care support";
  if (product.category === "food") return "mealtime support";
  return "the shopper's current product need";
}

function getShoppingNeed(query: string, interpretation: ShopQueryInterpretation | null) {
  const text = `${query} ${interpretation?.category || ""} ${interpretation?.normalizedSearchTerms.join(" ") || ""}`.toLowerCase();
  if (/\b(paw|paws|itch|itchy|itching|skin)\b/.test(text)) return "mild itching or coat care";
  if (/\b(shampoo|bath|wash|fur|coat|hair|grooming)\b/.test(text)) return "bath-time or coat care";
  if (/\b(dental|teeth|tooth|breath|oral)\b/.test(text)) return "dental care";
  if (/\b(food|stomach|picky|weight|chicken free)\b/.test(text)) return "mealtime support";
  return "current search";
}

function humanizeToken(value: string) {
  return normalizeParagraph(value.replace(/_/g, " ").replace(/fragrance free/gi, "fragrance-free").toLowerCase());
}

function formatList(values: string[]) {
  const normalized = normalizeList(values);
  if (normalized.length <= 1) return normalized[0] || "";
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(", ")}, and ${normalized[normalized.length - 1]}`;
}

function hasSavedSkinOrPawContext(memory: PetMemoryContext) {
  const text = [
    memory.pet.mainConcern,
    ...memory.pet.importantNotes,
    ...memory.derived.recentChanges,
    ...memory.derived.recurringConcerns,
    ...memory.derived.summaryBullets,
    ...memory.savedDetails.flatMap((detail) => [detail.label, detail.value]),
    ...memory.timeline.recentEntries.flatMap((entry) => [entry.category, entry.title, entry.detail || ""]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(paw|paws|skin|itch|itchy|itching|scratch|scratching|irritation)\b/.test(text);
}
