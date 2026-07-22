import { normalizeAvoidIngredientValues } from "./petwise";
import type { ProductCountry } from "./petwise";
import type { PetMemoryContext } from "./pet-memory";

export const SHOP_QUERY_CATEGORIES = [
  "Itchy skin",
  "Sensitive stomach",
  "Picky eating",
  "Weight management",
  "General wellness",
  "Grooming",
  "Other",
] as const;

export const SHOP_QUERY_SPECIES = ["dog", "cat", "unknown"] as const;
export const SHOP_QUERY_LIFE_STAGES = ["puppy", "adult", "senior", "kitten", "unknown"] as const;
export const SHOP_QUERY_CONFIDENCE = ["low", "medium", "high"] as const;

export type ShopQueryCategory = (typeof SHOP_QUERY_CATEGORIES)[number];
export type ShopQuerySpecies = (typeof SHOP_QUERY_SPECIES)[number];
export type ShopQueryLifeStage = (typeof SHOP_QUERY_LIFE_STAGES)[number];
export type ShopQueryConfidence = (typeof SHOP_QUERY_CONFIDENCE)[number];

export type ShopQueryInterpretation = {
  category: ShopQueryCategory;
  species: ShopQuerySpecies;
  queryText: string;
  normalizedSearchTerms: string[];
  explicitConstraints: {
    avoidIngredients: string[];
    requiredIngredients: string[];
    lifeStage: ShopQueryLifeStage | null;
    productForm: string | null;
    brand: string | null;
    budget: string | null;
    country: ProductCountry | null;
  };
  safetyFlags: {
    urgentCare: boolean;
    medicalTreatmentIntent: boolean;
  };
  confidence: ShopQueryConfidence;
};

export type ShopQueryInterpretationInput = {
  memory: PetMemoryContext;
  productCountry?: ProductCountry | null;
  query: string;
};

export const shopQueryInterpretationSystemPrompt = [
  "You interpret only a pet owner's shopping query for Furvise.",
  "Your job is only to classify the query and extract explicit constraints.",
  "Use the selected pet's saved profile and care context for context, but do not invent facts.",
  "Do not recommend products.",
  "Do not claim any catalog product exists, is suitable, safe, available, cheapest, best price, or vet-approved.",
  "Do not say safe for your pet.",
  "Catalog matching happens after you respond.",
  "Return only valid JSON matching the schema.",
  "No diagnosis.",
  "No treatment claims.",
  "No best product.",
  "Extract only explicit constraints from the query and saved context.",
  "If uncertain, lower confidence.",
  "If the query indicates urgent symptoms, set urgentCare true.",
  "If the query asks for medical treatment, cure, medication, or symptom treatment, set medicalTreatmentIntent true.",
  "The category must be exactly one of: Itchy skin, Sensitive stomach, Picky eating, Weight management, General wellness, Grooming, Other.",
  "The species must be dog, cat, or unknown. Use explicit query species when present; otherwise use the selected pet species when available.",
  "Country may reflect explicit query country or account product country metadata only. Do not interpret country as product existence.",
].join("\n");

export const shopQueryInterpretationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "species",
    "queryText",
    "normalizedSearchTerms",
    "explicitConstraints",
    "safetyFlags",
    "confidence",
  ],
  properties: {
    category: { type: "string", enum: SHOP_QUERY_CATEGORIES },
    species: { type: "string", enum: SHOP_QUERY_SPECIES },
    queryText: { type: "string" },
    normalizedSearchTerms: stringArraySchema(12),
    explicitConstraints: {
      type: "object",
      additionalProperties: false,
      required: [
        "avoidIngredients",
        "requiredIngredients",
        "lifeStage",
        "productForm",
        "brand",
        "budget",
        "country",
      ],
      properties: {
        avoidIngredients: stringArraySchema(12),
        requiredIngredients: stringArraySchema(8),
        lifeStage: {
          anyOf: [
            { type: "string", enum: SHOP_QUERY_LIFE_STAGES },
            { type: "null" },
          ],
        },
        productForm: nullableStringSchema(),
        brand: nullableStringSchema(),
        budget: nullableStringSchema(),
        country: {
          anyOf: [
            { type: "string", enum: ["US", "CA"] },
            { type: "null" },
          ],
        },
      },
    },
    safetyFlags: {
      type: "object",
      additionalProperties: false,
      required: ["urgentCare", "medicalTreatmentIntent"],
      properties: {
        urgentCare: { type: "boolean" },
        medicalTreatmentIntent: { type: "boolean" },
      },
    },
    confidence: { type: "string", enum: SHOP_QUERY_CONFIDENCE },
  },
} as const;

export function parseShopQueryInterpretation(value: unknown): ShopQueryInterpretation | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<ShopQueryInterpretation>;
  const constraints = draft.explicitConstraints;
  const safetyFlags = draft.safetyFlags;

  if (
    !isShopQueryCategory(draft.category) ||
    !isShopQuerySpecies(draft.species) ||
    typeof draft.queryText !== "string" ||
    !isStringArray(draft.normalizedSearchTerms) ||
    !constraints ||
    typeof constraints !== "object" ||
    !isStringArray(constraints.avoidIngredients) ||
    !isStringArray(constraints.requiredIngredients) ||
    !isNullableLifeStage(constraints.lifeStage) ||
    !isNullableString(constraints.productForm) ||
    !isNullableString(constraints.brand) ||
    !isNullableString(constraints.budget) ||
    !isNullableCountry(constraints.country) ||
    !safetyFlags ||
    typeof safetyFlags !== "object" ||
    typeof safetyFlags.urgentCare !== "boolean" ||
    typeof safetyFlags.medicalTreatmentIntent !== "boolean" ||
    !isShopQueryConfidence(draft.confidence)
  ) {
    return null;
  }

  return {
    category: draft.category,
    species: draft.species,
    queryText: normalizeDisplayText(draft.queryText).slice(0, 240),
    normalizedSearchTerms: uniqueNormalizedStrings(draft.normalizedSearchTerms).slice(0, 12),
    explicitConstraints: {
      avoidIngredients: normalizeAvoidIngredientValues(constraints.avoidIngredients)
        .map((value) => value.toLowerCase())
        .slice(0, 12),
      requiredIngredients: uniqueNormalizedStrings(constraints.requiredIngredients).slice(0, 8),
      lifeStage: constraints.lifeStage,
      productForm: normalizeNullableString(constraints.productForm),
      brand: normalizeNullableString(constraints.brand),
      budget: normalizeNullableString(constraints.budget),
      country: constraints.country,
    },
    safetyFlags: {
      urgentCare: safetyFlags.urgentCare,
      medicalTreatmentIntent: safetyFlags.medicalTreatmentIntent,
    },
    confidence: draft.confidence,
  };
}

export function buildFallbackShopQueryInterpretation({
  memory,
  productCountry = null,
  query,
}: ShopQueryInterpretationInput): ShopQueryInterpretation {
  const normalizedQuery = normalizeDisplayText(query);
  const terms = tokenizeShopQuery(normalizedQuery);
  const queryCategory = inferCategoryFromText(normalizedQuery);
  const category = queryCategory || inferCategoryFromMemory(memory) || "Other";
  const explicitSpecies = inferSpeciesFromText(normalizedQuery);
  const productForm = inferProductForm(normalizedQuery);
  const avoidIngredients = normalizeAvoidIngredientValues([
    ...memory.pet.avoidIngredients,
    ...memory.derived.knownAvoids,
    ...extractAvoidIngredients(normalizedQuery),
  ]).map((value) => value.toLowerCase());
  const requiredIngredients = uniqueNormalizedStrings(extractRequiredIngredients(normalizedQuery));
  const urgentCare = hasUrgentCareIntent(normalizedQuery) || memory.derived.safetyFlags.length > 0;
  const medicalTreatmentIntent = hasMedicalTreatmentIntent(normalizedQuery);

  return {
    category,
    species: explicitSpecies || memory.pet.species || "unknown",
    queryText: normalizedQuery,
    normalizedSearchTerms: terms.length ? terms : tokenizeShopQuery(productForm || normalizedQuery),
    explicitConstraints: {
      avoidIngredients,
      requiredIngredients,
      lifeStage: inferLifeStage(normalizedQuery),
      productForm,
      brand: inferBrand(normalizedQuery),
      budget: inferBudget(normalizedQuery),
      country: inferCountry(normalizedQuery) || productCountry || null,
    },
    safetyFlags: {
      urgentCare,
      medicalTreatmentIntent,
    },
    confidence: queryCategory || productForm || explicitSpecies ? "medium" : "low",
  };
}

export function getShopSearchTextFromInterpretation(
  interpretation: ShopQueryInterpretation | null,
  fallbackQuery: string,
) {
  const terms = interpretation?.normalizedSearchTerms || [];
  return terms.length > 0 ? terms.join(" ") : fallbackQuery;
}

export function getShopAvoidIngredientsFromInterpretation(
  interpretation: ShopQueryInterpretation | null,
) {
  return interpretation?.explicitConstraints.avoidIngredients || [];
}

export function buildShopInterpretationPromptInput({
  memory,
  productCountry,
  query,
}: ShopQueryInterpretationInput) {
  return {
    accountProductCountry: productCountry || null,
    query,
    selectedPet: {
      species: memory.pet.species || "unknown",
      mainConcern: memory.pet.mainConcern,
      avoidIngredients: memory.pet.avoidIngredients,
      currentFood: memory.pet.currentFood,
      wellnessGoal: memory.pet.wellnessGoal,
    },
    careContext: {
      recentChanges: memory.derived.recentChanges.slice(0, 6),
      recurringConcerns: memory.derived.recurringConcerns.slice(0, 6),
      knownAvoids: memory.derived.knownAvoids.slice(0, 8),
      safetyFlags: memory.derived.safetyFlags.slice(0, 6),
      missingContext: memory.derived.missingContext.slice(0, 6),
      summaryBullets: memory.derived.summaryBullets.slice(0, 6),
    },
    savedDetails: memory.savedDetails.slice(0, 8).map((detail) => ({
      label: detail.label,
      source: detail.source,
      value: detail.value,
    })),
  };
}

function stringArraySchema(maxItems: number) {
  return {
    type: "array",
    maxItems,
    items: { type: "string" },
  };
}

function nullableStringSchema() {
  return {
    anyOf: [
      { type: "string" },
      { type: "null" },
    ],
  };
}

function isShopQueryCategory(value: unknown): value is ShopQueryCategory {
  return SHOP_QUERY_CATEGORIES.includes(value as ShopQueryCategory);
}

function isShopQuerySpecies(value: unknown): value is ShopQuerySpecies {
  return SHOP_QUERY_SPECIES.includes(value as ShopQuerySpecies);
}

function isShopQueryConfidence(value: unknown): value is ShopQueryConfidence {
  return SHOP_QUERY_CONFIDENCE.includes(value as ShopQueryConfidence);
}

function isNullableLifeStage(value: unknown): value is ShopQueryLifeStage | null {
  return value === null || SHOP_QUERY_LIFE_STAGES.includes(value as ShopQueryLifeStage);
}

function isNullableCountry(value: unknown): value is ProductCountry | null {
  return value === null || value === "US" || value === "CA";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function normalizeNullableString(value: string | null) {
  if (value === null) return null;
  const normalized = normalizeDisplayText(value);
  return normalized || null;
}

function normalizeDisplayText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueNormalizedStrings(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => normalizeDisplayText(value).toLowerCase())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function tokenizeShopQuery(value: string) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "buy",
    "for",
    "get",
    "i",
    "my",
    "need",
    "pet",
    "please",
    "should",
    "something",
    "the",
    "to",
    "what",
    "with",
  ]);

  return uniqueNormalizedStrings(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/-/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 1 && !stopWords.has(term)),
  );
}

function inferCategoryFromMemory(memory: PetMemoryContext): ShopQueryCategory | null {
  const mainConcern = memory.pet.mainConcern;
  return SHOP_QUERY_CATEGORIES.includes(mainConcern as ShopQueryCategory)
    ? (mainConcern as ShopQueryCategory)
    : null;
}

function inferCategoryFromText(value: string): ShopQueryCategory | null {
  const text = value.toLowerCase();
  if (/\b(itch|itchy|skin|rash|redness|paw|paws|licking|coat)\b/.test(text)) return "Itchy skin";
  if (/\b(sensitive stomach|stomach|digest|digestion|vomit|diarrhea|loose stool|gas)\b/.test(text)) return "Sensitive stomach";
  if (/\b(picky|appetite|won't eat|wont eat|refuses food)\b/.test(text)) return "Picky eating";
  if (/\b(weight|overweight|calorie|calories|diet food)\b/.test(text)) return "Weight management";
  if (/\b(groom|grooming|shampoo|wipe|wipes|brush|comb|bath|deshed|shedding)\b/.test(text)) return "Grooming";
  if (/\b(dental|teeth|tooth|breath|wellness|supplement|vitamin)\b/.test(text)) return "General wellness";
  return null;
}

function inferSpeciesFromText(value: string): ShopQuerySpecies | null {
  const text = value.toLowerCase();
  if (/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return "cat";
  if (/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return "dog";
  return null;
}

function inferLifeStage(value: string): ShopQueryLifeStage | null {
  const text = value.toLowerCase();
  if (/\b(puppy|puppies)\b/.test(text)) return "puppy";
  if (/\b(kitten|kittens)\b/.test(text)) return "kitten";
  if (/\b(senior|older)\b/.test(text)) return "senior";
  if (/\b(adult)\b/.test(text)) return "adult";
  if (/\b(any age|unknown age)\b/.test(text)) return "unknown";
  return null;
}

function inferProductForm(value: string) {
  const text = value.toLowerCase();
  const forms = [
    "shampoo",
    "dental treats",
    "wet food",
    "dry food",
    "wipes",
    "comb",
    "brush",
    "supplement",
    "chews",
    "kibble",
    "treats",
    "food",
  ];
  return forms.find((form) => text.includes(form)) || null;
}

function inferBrand(value: string) {
  const match = value.match(/\bbrand\s+([a-z0-9][a-z0-9 '&.-]{1,40})/i);
  return match ? normalizeDisplayText(match[1]) : null;
}

function inferBudget(value: string) {
  const match = value.match(/\b(?:under|below|less than|up to)\s*\$?\s*(\d{1,4})(?:\s*dollars?)?\b/i);
  return match ? `under $${match[1]}` : null;
}

function inferCountry(value: string): ProductCountry | null {
  if (/\b(canada|canadian|\bca\b)\b/i.test(value)) return "CA";
  if (/\b(united states|usa|u\.s\.|us)\b/i.test(value)) return "US";
  return null;
}

function extractAvoidIngredients(value: string) {
  const matches = [...value.matchAll(/\b([a-z][a-z\s]{1,28}?)[-\s]?free\b/g)];
  const namedAvoids = ["chicken", "beef", "dairy", "egg", "eggs", "grain", "grains", "fish"].filter(
    (ingredient) => new RegExp(`\\b(no|avoid|without)\\s+${ingredient}\\b`, "i").test(value),
  );
  return [...matches.map((match) => match[1].trim()), ...namedAvoids];
}

function extractRequiredIngredients(value: string) {
  const matches = [...value.matchAll(/\b(?:with|contains?)\s+([a-z][a-z\s]{1,24})\b/g)];
  return matches.map((match) => match[1].trim());
}

function hasUrgentCareIntent(value: string) {
  return /\b(struggling to breathe|can't breathe|cannot breathe|trouble breathing|collapse|collapsed|seizure|poison|toxic|blood|severe pain|can't stand|cannot stand|emergency)\b/i.test(
    value,
  );
}

function hasMedicalTreatmentIntent(value: string) {
  return /\b(treat(?!s\b)|treatment|cure|heal|medicine|medication|medicated|antibiotic|pain relief|stop vomiting|fix diarrhea|infection)\b/i.test(
    value,
  );
}
