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
export type ShopQueryInterpretationValidationResult =
  | { errors: []; interpretation: ShopQueryInterpretation; ok: true }
  | { errors: string[]; interpretation: null; ok: false };

export class ShopQueryInterpretationValidationError extends Error {
  errors: string[];
  rawValue: unknown;

  constructor(errors: string[], rawValue: unknown) {
    super(`OpenAI returned invalid Furvise shop query interpretation data: ${errors.join("; ")}`);
    this.name = "ShopQueryInterpretationValidationError";
    this.errors = errors;
    this.rawValue = rawValue;
  }
}

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

const shopGroomingSynonymSignalsByTerm: Record<string, string[]> = {
  hair: ["grooming", "shampoo", "wipes", "brush", "comb"],
  fur: ["grooming", "shampoo", "wipes", "brush", "comb"],
  coat: ["grooming", "shampoo", "wipes", "brush", "comb"],
  shedding: ["brush", "comb"],
  smell: ["shampoo", "wipes"],
  dirty: ["shampoo", "wipes"],
  bath: ["shampoo", "wash", "wipes"],
  wash: ["shampoo", "wash", "wipes"],
};

export const SHOP_GROOMING_SYNONYM_SOURCE_TERMS = Object.keys(shopGroomingSynonymSignalsByTerm);

export function getShopGroomingSynonymSearchTerms(value: string) {
  return uniqueNormalizedStrings(
    tokenizeShopQuery(value)
      .map(normalizeGroomingSynonymSourceTerm)
      .flatMap((term) => shopGroomingSynonymSignalsByTerm[term] || []),
  );
}

export function hasShopGroomingSynonymIntent(value: string) {
  return getShopGroomingSynonymSearchTerms(value).length > 0;
}

export function getShopSkinGroomingSearchTerms(value: string) {
  const normalized = normalizeVagueShopQuery(value);
  if (!/\b(itch|itchy|itches|itching|skin|paw|paws|licking|rash|redness)\b/.test(normalized)) return [];
  return uniqueNormalizedStrings(["itchy", "skin", "grooming", "shampoo", "sensitive skin shampoo", "paw"]);
}

const vagueShopQueryWords = new Set([
  "anything",
  "something",
  "stuff",
  "thing",
  "things",
  "product",
  "products",
  "help",
  "item",
  "items",
  "idk",
]);
const vagueShopQueryStopWords = new Set(["a", "an", "for", "i", "im", "my", "need", "please", "the", "to", "want", "with"]);

export function isVagueShopQueryWithoutSignal(value: string) {
  const normalized = normalizeVagueShopQuery(value);
  if (!normalized) return false;
  if (hasSpecificShopQuerySignal(normalized)) return false;
  if (/^(?:i\s+(?:am\s+|m\s+)?)?not\s+sure$/.test(normalized)) return true;
  if (/^i\s+(?:do\s+not|don'?t)\s+know$/.test(normalized)) return true;

  const tokens = normalized.replace(/'/g, "").split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.some((token) => vagueShopQueryWords.has(token)) && tokens.every((token) =>
    vagueShopQueryWords.has(token) || vagueShopQueryStopWords.has(token),
  );
}

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
  const result = validateShopQueryInterpretation(value);
  return result.ok ? result.interpretation : null;
}

export function validateShopQueryInterpretation(value: unknown): ShopQueryInterpretationValidationResult {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { errors: ["root must be an object"], interpretation: null, ok: false };
  }

  const draft = value as Partial<ShopQueryInterpretation>;
  const constraints = draft.explicitConstraints as Partial<ShopQueryInterpretation["explicitConstraints"]> | undefined;
  const safetyFlags = draft.safetyFlags as Partial<ShopQueryInterpretation["safetyFlags"]> | undefined;

  if (!isShopQueryCategory(draft.category)) {
    errors.push(`category must be one of: ${SHOP_QUERY_CATEGORIES.join(", ")}`);
  }
  if (!isShopQuerySpecies(draft.species)) {
    errors.push(`species must be one of: ${SHOP_QUERY_SPECIES.join(", ")}`);
  }
  if (typeof draft.queryText !== "string") {
    errors.push("queryText must be a string");
  }
  collectStringArrayErrors(errors, "normalizedSearchTerms", draft.normalizedSearchTerms);

  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) {
    errors.push("explicitConstraints must be an object");
  } else {
    collectStringArrayErrors(errors, "explicitConstraints.avoidIngredients", constraints.avoidIngredients);
    collectStringArrayErrors(errors, "explicitConstraints.requiredIngredients", constraints.requiredIngredients);
    if (!isNullableLifeStage(constraints.lifeStage)) {
      errors.push(`explicitConstraints.lifeStage must be null or one of: ${SHOP_QUERY_LIFE_STAGES.join(", ")}`);
    }
    if (!isNullableString(constraints.productForm)) {
      errors.push("explicitConstraints.productForm must be null or a string");
    }
    if (!isNullableString(constraints.brand)) {
      errors.push("explicitConstraints.brand must be null or a string");
    }
    if (!isNullableString(constraints.budget)) {
      errors.push("explicitConstraints.budget must be null or a string");
    }
    if (!isNullableCountry(constraints.country)) {
      errors.push("explicitConstraints.country must be null, US, or CA");
    }
  }

  if (!safetyFlags || typeof safetyFlags !== "object" || Array.isArray(safetyFlags)) {
    errors.push("safetyFlags must be an object");
  } else {
    if (typeof safetyFlags.urgentCare !== "boolean") {
      errors.push("safetyFlags.urgentCare must be a boolean");
    }
    if (typeof safetyFlags.medicalTreatmentIntent !== "boolean") {
      errors.push("safetyFlags.medicalTreatmentIntent must be a boolean");
    }
  }

  if (!isShopQueryConfidence(draft.confidence)) {
    errors.push(`confidence must be one of: ${SHOP_QUERY_CONFIDENCE.join(", ")}`);
  }

  if (errors.length > 0 || !constraints || !safetyFlags) {
    return { errors, interpretation: null, ok: false };
  }

  return {
    errors: [],
    interpretation: {
      category: draft.category as ShopQueryCategory,
      species: draft.species as ShopQuerySpecies,
      queryText: normalizeDisplayText(draft.queryText as string).slice(0, 240),
      normalizedSearchTerms: uniqueNormalizedStrings(draft.normalizedSearchTerms as string[]).slice(0, 12),
      explicitConstraints: {
        avoidIngredients: normalizeAvoidIngredientValues(constraints.avoidIngredients as string[])
          .map((item) => item.toLowerCase())
          .slice(0, 12),
        requiredIngredients: uniqueNormalizedStrings(constraints.requiredIngredients as string[]).slice(0, 8),
        lifeStage: constraints.lifeStage as ShopQueryLifeStage | null,
        productForm: normalizeNullableString(constraints.productForm as string | null),
        brand: normalizeNullableString(constraints.brand as string | null),
        budget: normalizeNullableString(constraints.budget as string | null),
        country: constraints.country as ProductCountry | null,
      },
      safetyFlags: {
        urgentCare: safetyFlags.urgentCare as boolean,
        medicalTreatmentIntent: safetyFlags.medicalTreatmentIntent as boolean,
      },
      confidence: draft.confidence as ShopQueryConfidence,
    },
    ok: true,
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
  const groomingSynonymTerms = getShopGroomingSynonymSearchTerms(normalizedQuery);
  const skinGroomingTerms = getShopSkinGroomingSearchTerms(normalizedQuery);
  const memoryCategory = inferCategoryFromMemory(memory);
  const category =
    !urgentCare && !medicalTreatmentIntent && groomingSynonymTerms.length > 0
      ? "Grooming"
      : (urgentCare || medicalTreatmentIntent) && groomingSynonymTerms.length > 0 && queryCategory === "Grooming"
        ? memoryCategory || "Other"
        : queryCategory || memoryCategory || "Other";
  const normalizedSearchTerms = uniqueNormalizedStrings([
    ...(terms.length ? terms : tokenizeShopQuery(productForm || normalizedQuery)),
    ...groomingSynonymTerms,
    ...skinGroomingTerms,
  ]);

  return {
    category,
    species: explicitSpecies || memory.pet.species || "unknown",
    queryText: normalizedQuery,
    normalizedSearchTerms,
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

function collectStringArrayErrors(errors: string[], path: string, value: unknown) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  if (!value.every((item) => typeof item === "string")) {
    errors.push(`${path} must contain only strings`);
  }
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

function normalizeVagueShopQuery(value: string) {
  return normalizeDisplayText(value)
    .toLowerCase()
    .replace(/[�`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSpecificShopQuerySignal(value: string) {
  return Boolean(
    inferCategoryFromText(value) ||
      inferProductForm(value) ||
      getShopGroomingSynonymSearchTerms(value).length > 0 ||
      extractAvoidIngredients(value).length > 0 ||
      extractRequiredIngredients(value).length > 0 ||
      hasUrgentCareIntent(value) ||
      hasMedicalTreatmentIntent(value),
  );
}

function normalizeGroomingSynonymSourceTerm(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "hairs") return "hair";
  if (normalized === "smells") return "smell";
  if (normalized === "washes" || normalized === "washed" || normalized === "washing") return "wash";
  if (normalized === "baths" || normalized === "bathe" || normalized === "bathed" || normalized === "bathing") return "bath";
  return normalized;
}

function inferCategoryFromMemory(memory: PetMemoryContext): ShopQueryCategory | null {
  const mainConcern = memory.pet.mainConcern;
  return SHOP_QUERY_CATEGORIES.includes(mainConcern as ShopQueryCategory)
    ? (mainConcern as ShopQueryCategory)
    : null;
}

function inferCategoryFromText(value: string): ShopQueryCategory | null {
  const text = value.toLowerCase();
  if (/\b(itch|itchy|itches|itching|skin|rash|redness|paw|paws|licking)\b/.test(text)) return "Itchy skin";
  if (/\b(sensitive stomach|stomach|digest|digestion|vomit|diarrhea|loose stool|gas)\b/.test(text)) return "Sensitive stomach";
  if (/\b(picky|appetite|won't eat|wont eat|refuses food)\b/.test(text)) return "Picky eating";
  if (/\b(weight|overweight|calorie|calories|diet food)\b/.test(text)) return "Weight management";
  if (/\b(groom|grooming|shampoo|wipe|wipes|brush|comb|bath|wash|deshed|shedding|hair|hairs|fur|coat|smell|smells|dirty)\b/.test(text)) return "Grooming";
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
