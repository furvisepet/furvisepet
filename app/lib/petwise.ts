import { staticRealProducts } from "./products/static-products";

export type AgeUnit = "months" | "years";
export type WeightUnit = "lb" | "kg";
export type PetSpecies = "dog" | "cat";

export type MainConcern =
  | "Itchy skin"
  | "Sensitive stomach"
  | "Picky eating"
  | "Weight management"
  | "General wellness"
  | "Grooming"
  | "Other";

export type InternalConcernTag =
  | "itchy_skin"
  | "sensitive_stomach"
  | "weight_management"
  | "picky_eating"
  | "general_wellness"
  | "grooming"
  | "paw_care"
  | "sensitive_skin"
  | "limited_ingredient"
  | "ear_care"
  | "dental_care"
  | "flea_tick_reminder"
  | "lick_prevention"
  | "probiotic_caution";

export type ProductCategory = "food" | "grooming" | "health_essentials";
export type WellnessGoal =
  | "nutrition"
  | "dental_care"
  | "grooming"
  | "activity"
  | "preventive_care"
  | "reminders"
  | "something_else";
export type NutritionGoal =
  | "compare_current_food"
  | "lower_cost"
  | "life_stage_fit"
  | "ingredient_concerns"
  | "picky_eating"
  | "sensitive_stomach"
  | "just_exploring";
export type RecommendationKind =
  | "product"
  | "care_action"
  | "reminder"
  | "vet_preparation"
  | "education";

export const PRODUCT_SOURCES = ["curated", "chewy_feed", "ca_retailer_feed"] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export type ProductCountry = "US" | "CA";
export type ProductVerificationSource = "brand_page" | "retailer_page" | "manual_review" | "feed";
export type ProductEnrichmentStatus = "none" | "partial" | "verified";

export type DogProfile = {
  name: string;
  species: PetSpecies | "";
  breed: string;
  age: string;
  ageUnit: AgeUnit;
  ageUnknown: boolean;
  weight: string;
  weightUnit: WeightUnit;
  weightUnknown: boolean;
  currentFood: string;
  currentFoodUnknown: boolean;
  mainConcern: MainConcern | "";
  otherConcern: string;
  avoidIngredients: string[];
  customAvoidIngredient: string;
  monthlyBudget: string;
  wellnessGoal?: WellnessGoal | "";
};

export type MockProduct = {
  id: string;
  name: string;
  brand?: string;
  shortDescription?: string;
  productTypeLabel?: string;
  category: ProductCategory;
  subcategory?: string;
  species: PetSpecies | "all";
  recommendationKind?: RecommendationKind;
  imageUrl?: string;
  affiliateUrl?: string;
  productPageUrl?: string;
  labelUrl?: string;
  productUrl?: string;
  retailerUrl?: string;
  sourceUrl?: string;
  verifiedProductPageUrl?: string;
  verifiedDescription?: string;
  verifiedIngredients?: string[];
  verifiedDirections?: string;
  verifiedWarnings?: string[];
  verificationSource?: ProductVerificationSource;
  enrichmentStatus?: ProductEnrichmentStatus;
  retailer?: string;
  price?: number;
  currency?: string;
  active?: boolean;
  source: ProductSource;
  ingredientsVerified: boolean;
  availableCountries: ProductCountry[];
  protein: string;
  tags?: string[];
  concernTags: InternalConcernTag[];
  excludedIngredients: string[];
  lifeStage: "puppy" | "adult" | "senior" | "all";
  bagPrice?: number;
  estimatedMonthlyCost?: number;
  evidenceType?: "demo" | "curated_static";
  ingredientHighlights?: string[];
  avoidIngredientKeywords?: string[];
  safetyNotes?: string;
  lastVerifiedAt?: string;
  priceVerifiedAt?: string;
  sourceNote?: string;
  whyItFitsTemplate?: string;
  whyItFits: string;
  whyCategoryFits: string;
  cautions: string;
};

export type Recommendation = {
  kind: RecommendationKind;
  label: "Best match" | "Best value" | "Closest option" | "Closest lower-cost option" | "Alternative" | "Review carefully";
  product: MockProduct | null;
  title?: string;
  category?: ProductCategory | "organization" | "preventive_care" | "education";
  matchedBecause?: string;
  note?: string;
  confidenceLabel?: RecommendationConfidenceLabel;
};

export type RecommendationConfidenceLabel =
  | "Strong match"
  | "Moderate match"
  | "Limited context"
  | "More details needed";

export type ProductFeedbackSignal = {
  product_id: string;
  feedback_type: string;
};

export type ConcernNormalizationInput = {
  possibleFactors?: string[];
  recommendedConcernTags?: string[];
  summary?: string;
  wellnessGoal?: WellnessGoal;
  wellnessGoalText?: string;
  nutritionGoal?: NutritionGoal;
};

export const STORAGE_KEY = "petwise:onboarding-draft";
export const ONBOARDING_MODE_STORAGE_KEY = "petwise:onboarding-mode";

export type OnboardingMode = "new" | "edit" | "recommend_existing";

export function normalizeOnboardingMode(value: string | null | undefined): OnboardingMode {
  if (value === "edit" || value === "recommend_existing") return value;
  return "new";
}

export function normalizeWellnessGoal(value: string | null | undefined): WellnessGoal | "" {
  if (
    value === "nutrition" ||
    value === "dental_care" ||
    value === "grooming" ||
    value === "activity" ||
    value === "preventive_care" ||
    value === "reminders" ||
    value === "something_else"
  ) {
    return value;
  }

  return "";
}

export const MAIN_CONCERN_OPTIONS = [
  "Itchy skin",
  "Sensitive stomach",
  "Picky eating",
  "Weight management",
  "General wellness",
  "Grooming",
  "Other",
] as const satisfies readonly MainConcern[];

export type MainConcernOption = (typeof MAIN_CONCERN_OPTIONS)[number];

export const avoidIngredientChips = [
  "Chicken",
  "Beef",
  "Dairy",
  "Egg",
  "Grains",
  "Fish",
  "None known",
];

export const initialProfile: DogProfile = {
  name: "",
  species: "",
  breed: "",
  age: "",
  ageUnit: "years",
  ageUnknown: false,
  weight: "",
  weightUnit: "lb",
  weightUnknown: false,
  currentFood: "",
  currentFoodUnknown: false,
  mainConcern: "",
  otherConcern: "",
  avoidIngredients: [],
  customAvoidIngredient: "",
  monthlyBudget: "",
};

const curatedProductMetadataDefaults: Pick<
  MockProduct,
  "availableCountries" | "ingredientsVerified" | "source"
> = {
  availableCountries: ["US"],
  ingredientsVerified: true,
  source: "curated",
};

export const mockProducts: MockProduct[] = ([
  {
    id: "cedar-salmon-skin",
    name: "Cedar & Tide Salmon Comfort",
    category: "food",
    species: "dog",
    protein: "Salmon",
    concernTags: ["itchy_skin", "sensitive_skin", "general_wellness"],
    excludedIngredients: ["fish", "grains"],
    lifeStage: "adult",
    bagPrice: 68,
    estimatedMonthlyCost: 92,
    whyItFits: "A fish-forward demo recipe positioned for skin-focused profiles and steady everyday nutrition.",
    whyCategoryFits: "Food can support skin-focused plans when the owner is comparing everyday diet options.",
    cautions: "Contains fish and grains.",
  },
  {
    id: "meadow-lamb-rice",
    name: "Meadow Path Lamb & Rice",
    category: "food",
    species: "dog",
    protein: "Lamb",
    concernTags: ["general_wellness", "picky_eating"],
    excludedIngredients: ["grains", "egg"],
    lifeStage: "all",
    bagPrice: 46,
    estimatedMonthlyCost: 58,
    whyItFits: "A simple demo lamb recipe with a lower estimated monthly cost for general feeding.",
    whyCategoryFits: "Food is the baseline category for daily nutrition and broad wellness support.",
    cautions: "Contains grains and egg.",
  },
  {
    id: "gentle-turkey-oat",
    name: "Gentle Porch Turkey Oat",
    category: "food",
    species: "dog",
    protein: "Turkey",
    concernTags: ["sensitive_stomach", "general_wellness"],
    excludedIngredients: ["grains"],
    lifeStage: "adult",
    bagPrice: 60,
    estimatedMonthlyCost: 78,
    whyItFits: "Designed as a mild demo option for profiles focused on digestion and familiar ingredients.",
    whyCategoryFits: "Food is prioritized for sensitive stomach profiles before optional care extras.",
    cautions: "Contains grains.",
  },
  {
    id: "peak-duck-pea",
    name: "Peak Bowl Duck & Pea",
    category: "food",
    species: "dog",
    protein: "Duck",
    concernTags: ["picky_eating", "sensitive_stomach", "limited_ingredient"],
    excludedIngredients: [],
    lifeStage: "adult",
    bagPrice: 74,
    estimatedMonthlyCost: 106,
    whyItFits: "A richer demo protein choice that can be useful when variety and appetite are the main concern.",
    whyCategoryFits: "Food fits appetite concerns because daily meals are the first product surface to evaluate.",
    cautions: "Contains peas.",
  },
  {
    id: "lean-rabbit-millet",
    name: "Lean Trail Rabbit Millet",
    category: "food",
    species: "dog",
    protein: "Rabbit",
    concernTags: ["weight_management", "general_wellness"],
    excludedIngredients: ["grains"],
    lifeStage: "adult",
    bagPrice: 64,
    estimatedMonthlyCost: 82,
    whyItFits: "A leaner fictional recipe scored for profiles where monthly value and weight management matter.",
    whyCategoryFits: "Food is prioritized for weight management because calorie control belongs in the daily diet plan.",
    cautions: "Contains grains.",
  },
  {
    id: "harbor-whitefish",
    name: "Harbor Light Whitefish",
    category: "food",
    species: "dog",
    protein: "Whitefish",
    concernTags: ["itchy_skin", "sensitive_skin", "picky_eating"],
    excludedIngredients: ["fish", "egg"],
    lifeStage: "all",
    bagPrice: 58,
    estimatedMonthlyCost: 74,
    whyItFits: "A fish-based demo food that scores well for skin-focused profiles unless fish is avoided.",
    whyCategoryFits: "Food can be part of skin-support shopping when ingredient preferences allow it.",
    cautions: "Contains fish and egg.",
  },
  {
    id: "prairie-pork-pumpkin",
    name: "Prairie Spoon Pork Pumpkin",
    category: "food",
    species: "dog",
    protein: "Pork",
    concernTags: ["sensitive_stomach", "weight_management"],
    excludedIngredients: [],
    lifeStage: "adult",
    bagPrice: 52,
    estimatedMonthlyCost: 66,
    whyItFits: "A moderate-cost fictional recipe with digestion and weight-management tags.",
    whyCategoryFits: "Food comes first for digestion and weight concerns because it is used every day.",
    cautions: "Contains legumes.",
  },
  {
    id: "sunny-chicken-barley",
    name: "Sunny Yard Chicken Barley",
    category: "food",
    species: "dog",
    protein: "Chicken",
    concernTags: ["general_wellness", "grooming"],
    excludedIngredients: ["chicken", "grains"],
    lifeStage: "all",
    bagPrice: 38,
    estimatedMonthlyCost: 48,
    whyItFits: "A budget-friendly demo option for broad wellness and coat-care routines.",
    whyCategoryFits: "Food supports general wellness as the main recurring product category.",
    cautions: "Contains chicken and grains.",
  },
  {
    id: "north-venison-lentil",
    name: "North Field Venison Lentil",
    category: "food",
    species: "dog",
    protein: "Venison",
    concernTags: ["itchy_skin", "sensitive_skin", "sensitive_stomach", "limited_ingredient"],
    excludedIngredients: [],
    lifeStage: "adult",
    bagPrice: 82,
    estimatedMonthlyCost: 118,
    whyItFits: "A premium fictional option using a less common protein for skin or digestion-focused profiles.",
    whyCategoryFits: "Food fits skin and stomach profiles when the product comparison is focused on daily diet.",
    cautions: "Contains lentils.",
  },
  {
    id: "moonlit-salmon-pate",
    name: "Moonlit Salmon Paté",
    category: "food",
    species: "cat",
    protein: "Salmon",
    concernTags: ["general_wellness", "picky_eating"],
    excludedIngredients: ["grains"],
    lifeStage: "all",
    bagPrice: 48,
    estimatedMonthlyCost: 62,
    whyItFits: "A cat-specific salmon paté demo recipe for owners comparing everyday food options.",
    whyCategoryFits: "Cat food is the baseline nutrition category for feline profiles.",
    cautions: "Contains fish.",
  },
  {
    id: "hearth-turkey-mousse",
    name: "Hearth Turkey Mousse",
    category: "food",
    species: "cat",
    protein: "Turkey",
    concernTags: ["sensitive_stomach", "general_wellness"],
    excludedIngredients: ["grains"],
    lifeStage: "adult",
    bagPrice: 44,
    estimatedMonthlyCost: 56,
    whyItFits: "A cat-specific turkey recipe for lower-cost comparison and routine feeding.",
    whyCategoryFits: "Cat food can be compared when the owner wants a lower-cost option.",
    cautions: "Contains poultry.",
  },
  {
    id: "soft-step-paw-wipes",
    name: "Soft Step Paw Wipes",
    category: "grooming",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["paw_care", "grooming", "itchy_skin", "sensitive_skin"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 16,
    estimatedMonthlyCost: 16,
    whyItFits: "Demo wipes for gently cleaning paws after walks when licking or paw irritation is part of the concern.",
    whyCategoryFits: "Grooming is prioritized for paw licking because cleaning and paw care are non-medication first steps.",
    cautions: "Stop use if irritation appears or worsens; ask a veterinarian about persistent redness, swelling, wounds, or pain.",
  },
  {
    id: "calm-coat-soothing-shampoo",
    name: "Calm Coat Soothing Shampoo",
    category: "grooming",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["grooming", "itchy_skin", "sensitive_skin"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 18,
    estimatedMonthlyCost: 9,
    whyItFits: "A fictional gentle shampoo option for skin-focused or grooming profiles.",
    whyCategoryFits: "Grooming fits itchy skin when the match is about bathing support, not treatment.",
    cautions: "Not a medicated shampoo. Avoid eyes and ears, and contact a veterinarian for severe or worsening itch.",
  },
  {
    id: "mellow-paw-balm",
    name: "Mellow Paw Balm",
    category: "grooming",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["paw_care", "grooming", "sensitive_skin"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 14,
    estimatedMonthlyCost: 14,
    whyItFits: "A demo balm positioned for dry paw pads and routine paw care.",
    whyCategoryFits: "Grooming fits paw care because the focus is surface comfort and protection, not medication.",
    cautions: "Use only as directed on the product label and prevent heavy licking of freshly applied balm.",
  },
  {
    id: "clear-ear-cleaner",
    name: "Clear Ear Cleaner",
    category: "grooming",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["grooming", "ear_care", "sensitive_skin"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 17,
    estimatedMonthlyCost: 9,
    whyItFits: "A fictional routine ear-cleaning product for grooming-focused profiles.",
    whyCategoryFits: "Grooming fits routine ear care when there are no urgent signs or suspected infection.",
    cautions: "Do not use for painful, swollen, bleeding, or foul-smelling ears without veterinary guidance.",
  },
  {
    id: "bright-bite-dental-chews",
    name: "Bright Bite Dental Chews",
    category: "health_essentials",
    species: "dog",
    protein: "Plant-based",
    concernTags: ["general_wellness", "dental_care"],
    excludedIngredients: [],
    lifeStage: "adult",
    bagPrice: 24,
    estimatedMonthlyCost: 24,
    whyItFits: "A demo dental chew item for general wellness routines.",
    whyCategoryFits: "Health essentials can support routine care habits when they stay non-medication and low-risk.",
    cautions: "Supervise chewing and choose an appropriate size. This is not dental treatment.",
  },
  {
    id: "gut-check-probiotic-note",
    name: "Gut Check Probiotic Caution Note",
    category: "health_essentials",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["sensitive_stomach", "probiotic_caution"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 0,
    estimatedMonthlyCost: 0,
    whyItFits: "A demo caution item that flags probiotic discussions for sensitive stomach profiles without recommending a supplement.",
    whyCategoryFits: "Health essentials appear cautiously after food options for digestion concerns.",
    cautions: "Discuss probiotic use with a veterinarian, especially if medication use, illness, or diet history is unclear. No dosage is recommended.",
  },
  {
    id: "comfy-guard-recovery-collar",
    name: "Comfy Guard Recovery Collar",
    category: "health_essentials",
    species: "dog",
    protein: "Not applicable",
    concernTags: ["paw_care", "lick_prevention", "sensitive_skin"],
    excludedIngredients: [],
    lifeStage: "all",
    bagPrice: 28,
    estimatedMonthlyCost: 28,
    whyItFits: "A fictional cone-style collar for lick prevention when a dog needs help leaving an area alone.",
    whyCategoryFits: "Health essentials can provide non-medication lick prevention while the owner monitors the concern.",
    cautions: "Not a treatment. Seek veterinary care for wounds, swelling, pain, discharge, or persistent licking.",
  },
] as Omit<MockProduct, "availableCountries" | "ingredientsVerified" | "source">[]).map(
  (product) => ({
    ...curatedProductMetadataDefaults,
    ...product,
  }),
);

export function normalizeProfile(value: unknown): DogProfile {
  if (!value || typeof value !== "object") return initialProfile;
  const draft = value as Partial<DogProfile>;
  const ageUnknown = Boolean(draft.ageUnknown);
  const weightUnknown = Boolean(draft.weightUnknown);
  const currentFoodUnknown = Boolean(draft.currentFoodUnknown);

  return {
    ...initialProfile,
    ...draft,
    species: normalizeSpecies(draft.species),
    ageUnit: draft.ageUnit === "months" ? "months" : "years",
    weightUnit: draft.weightUnit === "kg" ? "kg" : "lb",
    age: ageUnknown ? "" : draft.age ?? "",
    ageUnknown,
    weight: weightUnknown ? "" : draft.weight ?? "",
    weightUnknown,
    currentFood: currentFoodUnknown ? "" : draft.currentFood ?? "",
    currentFoodUnknown,
    avoidIngredients: Array.isArray(draft.avoidIngredients)
      ? normalizeAvoidIngredientValues(draft.avoidIngredients.filter((item): item is string => typeof item === "string"))
      : [],
  };
}

export function normalizeSpecies(value: unknown): PetSpecies | "" {
  return value === "dog" || value === "cat" ? value : "";
}

export function formatSpecies(value: PetSpecies | "" | null | undefined) {
  if (value === "dog") return "Dog";
  if (value === "cat") return "Cat";
  return "Species not provided";
}

export function formatPetDisplayName(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return "Unnamed pet";
  }

  return trimmed
    .split(/\s+/)
    .map((part) =>
      part
        .split(/([-'\u2019])/)
        .map((segment) => {
          if (!segment || segment === "-" || segment === "'" || segment === "\u2019") {
            return segment;
          }

          if (/^[A-Z]{1,2}$/.test(segment) || (/^[A-Z]/.test(segment) && /[a-z]/.test(segment))) {
            return segment;
          }

          const normalized = segment.toLowerCase();
          return `${normalized.slice(0, 1).toUpperCase()}${normalized.slice(1)}`;
        })
        .join(""),
    )
    .join(" ");
}

export function parsePositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return Number.NaN;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : Number.NaN;
}

export function normalizeIngredient(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function normalizeAvoidIngredientValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .flatMap((value) => normalizeAvoidIngredientInput(value))
    .filter((value) => {
      const key = normalizeIngredient(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeAvoidIngredientInput(value: string) {
  const trimmed = value.trim();
  const normalized = normalizeIngredient(trimmed);
  if (!normalized || isNoneKnown(normalized)) return [];

  const noIngredientMatch = normalized.match(/^(?:no|without|avoid)\s+(.+)$/);
  const ingredient = noIngredientMatch?.[1]?.trim();
  if (ingredient && !isNoneKnown(ingredient)) return [ingredient];

  return [trimmed];
}

export function productPassesAvoidIngredientFilter(product: MockProduct, avoids: string[]) {
  const normalizedAvoids = normalizeAvoidIngredientValues(avoids).map(normalizeIngredient).filter(Boolean);
  if (normalizedAvoids.length === 0) return true;

  const metadata = collectProductIngredientMetadata(product);
  if (metadata.some((value) => normalizedAvoids.some((avoid) => ingredientMatchesAvoid(value, avoid)))) {
    return false;
  }

  if (isIngestibleProduct(product) && !product.ingredientsVerified) {
    return false;
  }

  if (isIngestibleProduct(product) && hasInsufficientIngredientMetadata(product)) {
    return false;
  }

  return true;
}

export function isNoneKnown(value: string) {
  return [
    "n/a",
    "na",
    "no",
    "no allergies",
    "no known",
    "no known allergies",
    "none",
    "none known",
    "not sure",
    "nothing",
  ].includes(normalizeIngredient(value));
}

export function selectedConcern(profile: DogProfile) {
  if (profile.mainConcern === "Other") return profile.otherConcern.trim();
  return profile.mainConcern;
}

export function normalizeConcernTags(
  profile: DogProfile,
  analysis?: ConcernNormalizationInput | null,
): InternalConcernTag[] {
  const wellnessTags = tagsFromWellnessGoal(analysis);
  const directTags = [
    ...tagsFromKnownConcern(selectedConcern(profile)),
    ...(analysis?.recommendedConcernTags || []).flatMap(tagsFromKnownConcern),
    ...wellnessTags,
  ];
  const keywordText = [
    selectedConcern(profile),
    analysis?.wellnessGoalText,
    analysis?.summary,
    ...(analysis?.possibleFactors || []),
  ].join(" ");

  const keywordTags = tagsFromConcernKeywords(keywordText);
  const tags = mergeUniqueConcernTags([...directTags, ...keywordTags]);
  return tags.length > 0 ? tags : ["general_wellness"];
}

export function getBudget(profile: DogProfile) {
  const budget = parsePositiveNumber(profile.monthlyBudget);
  return Number.isFinite(budget) && budget > 0 ? budget : null;
}

export function getLifeStage(profile: DogProfile): "puppy" | "adult" | "senior" | "unknown" {
  if (profile.ageUnknown) return "unknown";
  const age = parsePositiveNumber(profile.age);
  if (!Number.isFinite(age)) return "unknown";
  const years = profile.ageUnit === "months" ? age / 12 : age;
  if (years < 1) return "puppy";
  if (years >= 8) return "senior";
  return "adult";
}

export function formatAge(profile: DogProfile) {
  if (profile.ageUnknown) return "I'm not sure";
  return profile.age.trim() ? `${profile.age.trim()} ${profile.ageUnit}` : "Not provided";
}

export function formatWeight(profile: DogProfile) {
  if (profile.weightUnknown) return "I'm not sure";
  return profile.weight.trim()
    ? `${profile.weight.trim()} ${profile.weightUnit}`
    : "Not provided";
}

export function formatBudget(profile: DogProfile) {
  const budget = getBudget(profile);
  return budget === null ? "Not provided" : `$${budget}/month`;
}

export function formatAvoidIngredients(profile: DogProfile) {
  return profile.avoidIngredients.length > 0
    ? profile.avoidIngredients.join(", ")
    : "None known";
}

export function buildRecommendations(
  profile: DogProfile,
  feedback: ProductFeedbackSignal[] = [],
  analysis?: ConcernNormalizationInput | null,
  products: MockProduct[] = staticRealProducts,
) {
  if (!profile.species) {
    return {
      recommendations: [],
      blockedReasons: ["missing_species"],
      emptyStateReason: "no_species",
      allConcernMatchesExceedBudget: false,
      closestSkinSupportOnly: false,
      establishedFoodWithoutNutritionConcern: false,
      generalWellnessNeedsFocus: false,
      hasBudgetValue: false,
      hardExclusionLimitedResults: false,
      nutritionFollowUpNeeded: false,
      speciesGate: true,
    };
  }

  // Recommendation pipeline stage 2: deterministic product matching over the selected catalog.
  const avoid = profile.avoidIngredients.map(normalizeIngredient);
  const wellnessGoal = analysis?.wellnessGoal;
  const nutritionGoal = analysis?.nutritionGoal;
  const normalizedConcernTags = normalizeConcernTags(profile, analysis);
  const normalizedConcernTagSet = new Set(normalizedConcernTags);
  const runtimeAllowedProducts = products.filter(isRuntimeSafeRecommendationProduct);
  const speciesCompatibleProducts = runtimeAllowedProducts.filter(
    (product) => product.active !== false && isSpeciesCompatibleProduct(product, profile.species),
  );
  const avoidFilteredProducts = speciesCompatibleProducts.filter((product) =>
    productPassesAvoidIngredientFilter(product, avoid),
  );
  const blockedReasons = [
    speciesCompatibleProducts.length === 0 ? "no_species_match" : "",
    speciesCompatibleProducts.length > avoidFilteredProducts.length ? "avoid_ingredients_removed_matches" : "",
  ].filter(Boolean);
  const categoryPriority = getCategoryPriority(profile, normalizedConcernTags);
  const generalWellnessNeedsFocus =
    !wellnessGoal && shouldAskGeneralWellnessFollowUp(profile, normalizedConcernTags);
  const establishedFoodWithoutNutritionConcern =
    hasEstablishedFood(profile) && !hasNutritionRecommendationReason(profile, normalizedConcernTags, analysis);

  if (generalWellnessNeedsFocus) {
    return {
      recommendations: [],
      blockedReasons,
      emptyStateReason: "needs_wellness_focus",
      allConcernMatchesExceedBudget: false,
      closestSkinSupportOnly: false,
      establishedFoodWithoutNutritionConcern,
      generalWellnessNeedsFocus: true,
      hasBudgetValue: false,
      hardExclusionLimitedResults: false,
      nutritionFollowUpNeeded: false,
      speciesGate: false,
    };
  }

  if (
    wellnessGoal === "nutrition" &&
    hasEstablishedFood(profile) &&
    !nutritionGoal &&
    !hasFeedingConcern(profile, analysis)
  ) {
    return {
      recommendations: [],
      blockedReasons,
      emptyStateReason: "needs_nutrition_focus",
      allConcernMatchesExceedBudget: false,
      closestSkinSupportOnly: false,
      establishedFoodWithoutNutritionConcern: true,
      generalWellnessNeedsFocus: false,
      hasBudgetValue: false,
      hardExclusionLimitedResults: false,
      nutritionFollowUpNeeded: true,
      speciesGate: false,
    };
  }

  if (wellnessGoal === "activity") {
    return buildNonProductResult([buildActivityCareAction(profile)], establishedFoodWithoutNutritionConcern);
  }

  if (wellnessGoal === "preventive_care") {
    return buildNonProductResult([buildPreventiveCareAction(profile)], establishedFoodWithoutNutritionConcern);
  }

  if (wellnessGoal === "reminders") {
    return buildNonProductResult([buildReminderAction(profile)], establishedFoodWithoutNutritionConcern);
  }

  if (
    wellnessGoal === "something_else" &&
    tagsFromConcernKeywords(analysis?.wellnessGoalText || "").length === 0
  ) {
    return buildNonProductResult([buildCustomWellnessEducation(profile, analysis?.wellnessGoalText || "")], establishedFoodWithoutNutritionConcern);
  }

  if (normalizedConcernTags.includes("flea_tick_reminder")) {
    return {
      recommendations: [buildFleaTickReminder(profile)],
      blockedReasons,
      emptyStateReason: undefined,
      allConcernMatchesExceedBudget: false,
      closestSkinSupportOnly: false,
      establishedFoodWithoutNutritionConcern,
      generalWellnessNeedsFocus: false,
      hasBudgetValue: false,
      hardExclusionLimitedResults: false,
      nutritionFollowUpNeeded: false,
      speciesGate: false,
    };
  }
  const skinSupportRequested = normalizedConcernTags.some((tag) =>
    ["itchy_skin", "sensitive_skin", "paw_care", "limited_ingredient"].includes(tag),
  );
  const budget = getBudget(profile);
  const lifeStage = getLifeStage(profile);
  const feedbackByProduct = groupProductFeedback(feedback);
  const excludedFeedbackIds = new Set(
    feedback
      .filter((item) => item.feedback_type === "avoid_product" || item.feedback_type === "did_not_work")
      .map((item) => item.product_id),
  );
  const tooExpensiveIds = new Set(
    feedback.filter((item) => item.feedback_type === "too_expensive").map((item) => item.product_id),
  );
  const workedProducts = avoidFilteredProducts.filter((product) =>
    feedbackByProduct.get(product.id)?.has("worked"),
  );
  const workedProteins = new Set(workedProducts.map((product) => normalizeIngredient(product.protein)));
  const workedConcernTags = new Set<InternalConcernTag>(
    workedProducts.flatMap((product) => product.concernTags),
  );

  const hardAllowedProducts = avoidFilteredProducts.filter(
    (product) =>
      (product.recommendationKind ?? "product") === "product" &&
      !excludedFeedbackIds.has(product.id) &&
      isAllowedForWellnessGoal(product, wellnessGoal) &&
      (product.category !== "food" || hasNutritionRecommendationReason(profile, normalizedConcernTags, analysis)),
  );
  const strictProducts = hardAllowedProducts;
  const needsReviewProducts: MockProduct[] = [];
  const strictProductIds = new Set(strictProducts.map((product) => product.id));
  const reviewFillProducts = needsReviewProducts.filter((product) => !strictProductIds.has(product.id));
  const hardExclusionLimitedResults = hardAllowedProducts.length < 3 && excludedFeedbackIds.size > 0;
  const lowerCostNutrition =
    analysis?.wellnessGoal === "nutrition" && analysis?.nutritionGoal === "lower_cost";

  const scoreProduct = (product: MockProduct, needsReview = false) => {
      const monthlyCost = getProductCostForRanking(product);
      const matchingConcernTags = product.concernTags.filter((tag) =>
        normalizedConcernTagSet.has(tag),
      );
      const concernMatch = matchingConcernTags.length > 0;
      const skinSupportMatch =
        skinSupportRequested &&
        product.concernTags.some((tag) =>
          ["itchy_skin", "sensitive_skin", "limited_ingredient"].includes(tag),
        );
      const budgetFit = budget === null || monthlyCost <= budget;
      const lifeStageFit =
        lifeStage === "unknown" || product.lifeStage === "all" || product.lifeStage === lifeStage;
      const priorityIndex = categoryPriority.indexOf(product.category);
      const categoryFitBoost =
        priorityIndex >= 0 ? (categoryPriority.length - priorityIndex) * 18 : 0;
      const budgetScoreBoost = lowerCostNutrition
        ? (budgetFit ? 80 : -20)
        : budgetFit
          ? 25
          : 0;
      const score =
        (concernMatch ? 60 : 0) +
        (skinSupportMatch ? 20 : 0) +
        categoryFitBoost +
        matchingConcernTags.length * 8 +
        budgetScoreBoost +
        (lifeStageFit ? 10 : 0) +
        (workedProteins.has(normalizeIngredient(product.protein)) ? 8 : 0) +
        (product.concernTags.some((tag) => workedConcernTags.has(tag)) ? 6 : 0) -
        (tooExpensiveIds.has(product.id) ? 40 : 0) -
        monthlyCost / 20 -
        (needsReview ? 50 : 0);

      return { product, score, concernMatch, budgetFit, needsReview };
  };

  const scored = strictProducts.map((product) => scoreProduct(product)).sort(sortScoredProducts);
  const recommendationPool = scored.some((item) => item.concernMatch)
    ? scored.filter((item) => item.concernMatch)
    : scored;

  const concernMatches = scored.filter((item) => item.concernMatch);
  const allConcernMatchesExceedBudget =
    budget !== null &&
    concernMatches.length > 0 &&
    concernMatches.every((item) => !item.budgetFit);

  const hasExactConcernMatch = concernMatches.length > 0;
  const selectedProducts = selectRecommendationProducts(
    recommendationPool,
    scored,
    categoryPriority,
  );
  const recommendations = selectedProducts.map((item, index) =>
    buildRecommendation(
      getRecommendationLabel(index, item, selectedProducts, analysis),
      item.product,
      profile,
      normalizedConcernTags,
      analysis,
    ),
  );

  if (recommendations.length < 3) {
    const usedRecommendationIds = new Set(recommendations.map((item) => item.product?.id));
    const reviewFill = reviewFillProducts
      .map((product) => scoreProduct(product, true))
      .sort(sortScoredProducts)
      .filter((item) => !usedRecommendationIds.has(item.product.id));

    reviewFill.slice(0, 3 - recommendations.length).forEach((item) => {
      recommendations.push({
        kind: "product",
        label: "Review carefully",
        product: item.product,
        matchedBecause: buildMatchedBecause(profile, item.product, normalizedConcernTags, analysis),
        note: "This option relaxes non-safety ranking preferences so the page can show another compatible product.",
        confidenceLabel: buildRecommendationConfidence(profile, normalizedConcernTags, analysis),
      });
    });
  }

  if (process.env.NODE_ENV !== "production") {
    console.info("[Furvise] Recommendation filtering", {
      hardExcludedCount: excludedFeedbackIds.size,
      tooExpensiveDemotedCount: tooExpensiveIds.size,
      strictEligibleCount: strictProducts.length,
      reviewFillCount: recommendations.filter((item) => item.label === "Review carefully").length,
    });
  }

  return {
    recommendations,
    blockedReasons,
    emptyStateReason:
      recommendations.length === 0
        ? blockedReasons.includes("avoid_ingredients_removed_matches")
          ? "avoid_ingredients_removed_matches"
          : blockedReasons.includes("no_species_match")
            ? "no_species_match"
            : "no_static_catalog_match"
        : undefined,
    allConcernMatchesExceedBudget,
    closestSkinSupportOnly: skinSupportRequested && !hasExactConcernMatch,
    establishedFoodWithoutNutritionConcern,
    generalWellnessNeedsFocus: false,
    hasBudgetValue: scored.some((item) => item.budgetFit),
    hardExclusionLimitedResults,
    nutritionFollowUpNeeded: false,
    speciesGate: false,
  };
}

type ScoredProduct = {
  product: MockProduct;
  score: number;
  concernMatch: boolean;
  budgetFit: boolean;
  needsReview: boolean;
};

function getCategoryPriority(
  profile: DogProfile,
  normalizedConcernTags: InternalConcernTag[],
): ProductCategory[] {
  const concernText = normalizeConcernText(selectedConcern(profile));
  const hasTag = (tag: InternalConcernTag) => normalizedConcernTags.includes(tag);
  const lickingConcern = /\b(excessive\s+)?(licking|lick|chewing paws?|chew paws?)\b/.test(
    concernText,
  );

  if (hasTag("paw_care") || lickingConcern) {
    return hasNutritionRecommendationReason(profile, normalizedConcernTags)
      ? ["grooming", "food", "health_essentials"]
      : ["grooming", "health_essentials"];
  }

  if (hasTag("itchy_skin") || hasTag("sensitive_skin")) {
    return hasNutritionRecommendationReason(profile, normalizedConcernTags) ? ["food", "grooming"] : ["grooming"];
  }

  if (hasTag("sensitive_stomach")) {
    return ["food"];
  }

  if (hasTag("grooming") || hasTag("ear_care")) {
    return ["grooming"];
  }

  if (hasTag("weight_management")) {
    return ["food"];
  }

  return [];
}

function selectRecommendationProducts(
  preferredPool: ScoredProduct[],
  fallbackPool: ScoredProduct[],
  categoryPriority: ProductCategory[],
) {
  const selected: ScoredProduct[] = [];
  const usedIds = new Set<string>();
  const shouldMixCategories =
    categoryPriority.includes("grooming") || categoryPriority.includes("health_essentials");

  if (shouldMixCategories) {
    categoryPriority.forEach((category) => {
      if (selected.length >= 3) return;
      const candidate = preferredPool.find(
        (item) => item.product.category === category && !usedIds.has(item.product.id),
      );
      if (!candidate) return;
      selected.push(candidate);
      usedIds.add(candidate.product.id);
    });
  }

  [...preferredPool, ...fallbackPool].forEach((item) => {
    if (selected.length >= 3 || usedIds.has(item.product.id)) return;
    selected.push(item);
    usedIds.add(item.product.id);
  });

  return selected.slice(0, 3);
}

function getRecommendationLabel(
  index: number,
  item: ScoredProduct,
  selectedProducts: ScoredProduct[],
  analysis?: ConcernNormalizationInput | null,
): Recommendation["label"] {
  if (analysis?.wellnessGoal === "nutrition" && analysis.nutritionGoal === "lower_cost" && !item.budgetFit) {
    return "Closest option";
  }
  if (index === 0) return "Best match";
  if (
    index === 1 &&
    item.budgetFit &&
    selectedProducts.some(
      (selectedItem) =>
        selectedItem.product.id !== item.product.id &&
        getProductCostForRanking(selectedItem.product) > getProductCostForRanking(item.product),
    )
  ) {
    return "Best value";
  }
  if (
    index === 1 &&
    selectedProducts[0] &&
    getProductCostForRanking(item.product) < getProductCostForRanking(selectedProducts[0].product)
  ) {
    return "Closest lower-cost option";
  }
  return "Alternative";
}

function sortScoredProducts(a: ScoredProduct, b: ScoredProduct) {
  return (
    b.score - a.score ||
    getProductCostForRanking(a.product) - getProductCostForRanking(b.product)
  );
}

function getProductCostForRanking(product: MockProduct) {
  return product.estimatedMonthlyCost ?? product.price ?? product.bagPrice ?? 999;
}

function isRuntimeSafeRecommendationProduct(product: MockProduct) {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    product.evidenceType === "curated_static" &&
    Boolean(product.productUrl) &&
    !/demo|mock|fictional/i.test(`${product.id} ${product.name} ${product.productUrl}`)
  );
}

function collectProductIngredientMetadata(product: MockProduct) {
  return [
    product.name,
    product.protein,
    product.cautions,
    ...product.excludedIngredients,
    ...(product.avoidIngredientKeywords || []),
    ...(product.ingredientHighlights || []),
    ...(product.tags || []),
  ].map(normalizeIngredient).filter(Boolean);
}

function ingredientMatchesAvoid(value: string, avoid: string) {
  if (!value || !avoid) return false;
  if (value.includes(avoid) || avoid.includes(value)) return true;
  if (avoid === "chicken" && /\b(poultry|chicken meal|chicken fat|chicken by-product)\b/.test(value)) {
    return true;
  }
  if (avoid === "poultry" && /\bchicken\b/.test(value)) return true;
  return false;
}

function isIngestibleProduct(product: MockProduct) {
  const text = `${product.category} ${product.subcategory || ""} ${product.tags?.join(" ") || ""}`.toLowerCase();
  return /\b(food|treat|chew|dental_treat|edible|nutrition)\b/.test(text);
}

function hasInsufficientIngredientMetadata(product: MockProduct) {
  return (
    product.excludedIngredients.length === 0 &&
    (product.avoidIngredientKeywords || []).length === 0 &&
    (product.ingredientHighlights || []).length === 0 &&
    normalizeIngredient(product.protein) === "not applicable"
  );
}

function groupProductFeedback(feedback: ProductFeedbackSignal[]) {
  const grouped = new Map<string, Set<string>>();
  feedback.forEach((item) => {
    const current = grouped.get(item.product_id) || new Set<string>();
    current.add(item.feedback_type);
    grouped.set(item.product_id, current);
  });
  return grouped;
}

function buildRecommendation(
  label: Recommendation["label"],
  product: MockProduct,
  profile: DogProfile,
  normalizedConcernTags: InternalConcernTag[],
  analysis?: ConcernNormalizationInput | null,
): Recommendation {
  return {
    kind: "product",
    label,
    product,
    matchedBecause: buildMatchedBecause(profile, product, normalizedConcernTags, analysis),
    confidenceLabel: buildRecommendationConfidence(profile, normalizedConcernTags, analysis),
  };
}

function buildMatchedBecause(
  profile: DogProfile,
  product: MockProduct,
  normalizedConcernTags: InternalConcernTag[],
  analysis?: ConcernNormalizationInput | null,
) {
  const concern = selectedConcern(profile).trim();
  const concernLabel = concern ? concern.toLowerCase() : "this concern";
  const productTagSet = new Set(product.concernTags);
  const nutritionGoal = analysis?.nutritionGoal;

  if (
    normalizedConcernTags.some((tag) => tag === "itchy_skin" || tag === "sensitive_skin" || tag === "paw_care") &&
    (productTagSet.has("itchy_skin") ||
      productTagSet.has("sensitive_skin") ||
      productTagSet.has("paw_care") ||
      productTagSet.has("limited_ingredient"))
  ) {
    return `Based on your profile: ${concernLabel} was reported, and this is a skin or paw-care category option.`;
  }

  if (normalizedConcernTags.includes("sensitive_stomach") && productTagSet.has("sensitive_stomach")) {
    return `Based on your profile: ${concernLabel} was reported, and this is a digestive-support category option.`;
  }

  if (normalizedConcernTags.includes("weight_management") && productTagSet.has("weight_management")) {
    return `Based on your profile: ${concernLabel} was reported, and this is a weight-management category option.`;
  }

  if (normalizedConcernTags.includes("picky_eating") && productTagSet.has("picky_eating")) {
    return `Based on your profile: ${concernLabel} was reported, and this is an appetite or food-preference category option.`;
  }

  if (normalizedConcernTags.includes("grooming") && productTagSet.has("grooming")) {
    return `Based on your profile: ${concernLabel} was reported, and this is a grooming category option.`;
  }

  if (normalizedConcernTags.includes("ear_care") && productTagSet.has("ear_care")) {
    return `Based on your profile: ${concernLabel} was reported, and this is a routine ear-care category option.`;
  }

  if (normalizedConcernTags.includes("dental_care") && productTagSet.has("dental_care")) {
    return `Based on your profile: ${concernLabel} was reported, and this is a routine dental-care category option.`;
  }

  if (analysis?.wellnessGoal === "nutrition") {
    if (nutritionGoal === "lower_cost") {
      return "Based on your nutrition goal and care budget.";
    }

    if (nutritionGoal === "compare_current_food") {
      return "Based on your nutrition goal. Furvise is comparing the current food you recorded.";
    }

    if (nutritionGoal === "life_stage_fit") {
      return "Based on your nutrition goal and life stage.";
    }

    if (nutritionGoal === "ingredient_concerns") {
      return "Based on your nutrition goal and recorded ingredient avoids.";
    }

    if (nutritionGoal === "picky_eating") {
      return "Based on your nutrition goal and the appetite concern you selected.";
    }

    if (nutritionGoal === "sensitive_stomach") {
      return "Based on your nutrition goal and the digestive concern you selected.";
    }

    if (nutritionGoal === "just_exploring") {
      return "Limited context. Nutrition goal selected, but no feeding issue was reported.";
    }

    return "Limited context. Nutrition goal selected, but no feeding issue was reported.";
  }

  if (
    normalizedConcernTags.includes("flea_tick_reminder") &&
    productTagSet.has("flea_tick_reminder")
  ) {
    return `Based on your profile: ${concernLabel} was reported, and this is a reminder, not a retail product.`;
  }

  if (
    normalizedConcernTags.includes("probiotic_caution") &&
    productTagSet.has("probiotic_caution")
  ) {
    return `More details needed: ${concernLabel} was reported, so Furvise is not suggesting supplement use or dosage.`;
  }

  return "General category option. No additional symptoms were reported.";
}

function buildRecommendationConfidence(
  profile: DogProfile,
  normalizedConcernTags: InternalConcernTag[],
  analysis?: ConcernNormalizationInput | null,
): RecommendationConfidenceLabel {
  if (!profile.species) return "More details needed";
  if (!selectedConcern(profile)) return "More details needed";
  const unknownCount = [profile.ageUnknown, profile.weightUnknown, profile.currentFoodUnknown].filter(Boolean).length;
  if (unknownCount >= 2) return "Limited context";
  if (analysis?.wellnessGoal === "nutrition") {
    if (analysis.nutritionGoal === "compare_current_food" || analysis.nutritionGoal === "just_exploring") {
      return "Limited context";
    }

    if (
      analysis.nutritionGoal === "lower_cost" ||
      analysis.nutritionGoal === "life_stage_fit" ||
      analysis.nutritionGoal === "ingredient_concerns"
    ) {
      return profile.avoidIngredients.length === 0 || profile.weightUnknown
        ? "Moderate match"
        : "Strong match";
    }

    if (
      analysis.nutritionGoal === "picky_eating" ||
      analysis.nutritionGoal === "sensitive_stomach"
    ) {
      return unknownCount > 0 ? "Moderate match" : "Strong match";
    }
  }
  if (normalizedConcernTags.includes("general_wellness")) return "Limited context";
  if (profile.avoidIngredients.length === 0 || profile.weightUnknown) return "Moderate match";
  return "Strong match";
}

function hasEstablishedFood(profile: DogProfile) {
  return !profile.currentFoodUnknown && Boolean(profile.currentFood.trim());
}

function hasNutritionRecommendationReason(
  profile: DogProfile,
  normalizedConcernTags: InternalConcernTag[],
  analysis?: ConcernNormalizationInput | null,
) {
  const text = normalizeConcernText(`${selectedConcern(profile)} ${profile.otherConcern}`);
  return (
    (analysis?.wellnessGoal === "nutrition" && Boolean(analysis.nutritionGoal)) ||
    normalizedConcernTags.some((tag) =>
      ["sensitive_stomach", "picky_eating", "weight_management", "limited_ingredient"].includes(tag),
    ) ||
    /\b(food|feeding|diet|kibble|wet food|recipe|protein|ingredient|allerg|stomach|vomit|diarrhea|weight|calorie|budget)\b/.test(
      text,
    ) ||
    profile.avoidIngredients.length > 0
  );
}

function hasFeedingConcern(profile: DogProfile, analysis?: ConcernNormalizationInput | null) {
  const text = normalizeConcernText(
    `${selectedConcern(profile)} ${profile.otherConcern} ${analysis?.wellnessGoalText || ""}`,
  );
  return /\b(food|feeding|diet|kibble|wet food|recipe|protein|ingredient|allerg|stomach|vomit|diarrhea|weight|calorie|budget|cost)\b/.test(
    text,
  );
}

export function isSpeciesCompatibleProduct(
  product: Pick<MockProduct, "category" | "species">,
  species: PetSpecies | "" | null | undefined,
) {
  if (!species) return false;
  return product.species === species;
}

export function hasSpeciesCompatibleFoodProducts(
  species: PetSpecies | "" | null | undefined,
  products: Pick<MockProduct, "category" | "species">[] = mockProducts,
) {
  return products.some(
    (product) => product.category === "food" && isSpeciesCompatibleProduct(product, species),
  );
}

function shouldAskGeneralWellnessFollowUp(
  profile: DogProfile,
  normalizedConcernTags: InternalConcernTag[],
) {
  return (
    normalizeConcernText(selectedConcern(profile)) === "general wellness" &&
    normalizedConcernTags.length === 1 &&
    normalizedConcernTags[0] === "general_wellness"
  );
}

function buildNonProductResult(
  recommendations: Recommendation[],
  establishedFoodWithoutNutritionConcern: boolean,
) {
  return {
    recommendations,
    blockedReasons: [],
    emptyStateReason: undefined,
    allConcernMatchesExceedBudget: false,
    closestSkinSupportOnly: false,
    establishedFoodWithoutNutritionConcern,
    generalWellnessNeedsFocus: false,
    hasBudgetValue: false,
    hardExclusionLimitedResults: false,
    nutritionFollowUpNeeded: false,
    speciesGate: false,
  };
}

function buildFleaTickReminder(profile: DogProfile): Recommendation {
  return {
    kind: "reminder",
    label: "Best match",
    product: null,
    title: "Set a prevention reminder",
    category: "preventive_care",
    matchedBecause:
      "Based on your profile: a reminder or prevention planning need was reported. This is an organization item, not a retail product or medication recommendation.",
    note:
      "Track the next prevention discussion or calendar date and ask your veterinarian which prevention plan fits your pet.",
    confidenceLabel: buildRecommendationConfidence(profile, ["flea_tick_reminder"]),
  };
}

function buildActivityCareAction(profile: DogProfile): Recommendation {
  return {
    kind: "care_action",
    label: "Best match",
    product: null,
    title: "Plan an activity routine check-in",
    category: "organization",
    matchedBecause:
      "Based on your profile: activity was selected as the wellness goal. Furvise is suggesting a care action, not a medical product.",
    note:
      "Track walks, play, rest, and appetite for a few days so routine changes are easier to compare.",
    confidenceLabel: buildRecommendationConfidence(profile, ["general_wellness"]),
  };
}

function buildPreventiveCareAction(profile: DogProfile): Recommendation {
  return {
    kind: "education",
    label: "Best match",
    product: null,
    title: "Review routine preventive care",
    category: "preventive_care",
    matchedBecause:
      "Based on your profile: preventive care was selected as the wellness goal. This is education and planning, not medication or parasite treatment.",
    note:
      "Use this to prepare questions for your veterinarian about routine exams, dental checks, vaccines, and prevention schedules.",
    confidenceLabel: buildRecommendationConfidence(profile, ["general_wellness"]),
  };
}

function buildReminderAction(profile: DogProfile): Recommendation {
  return {
    kind: "reminder",
    label: "Best match",
    product: null,
    title: "Create a care reminder",
    category: "organization",
    matchedBecause:
      "Based on your profile: reminders were selected as the wellness goal. This is an organization item, not a retail product.",
    note:
      "Choose one recurring care task to track, such as grooming, dental checks, preventive-care appointments, or routine updates.",
    confidenceLabel: buildRecommendationConfidence(profile, ["general_wellness"]),
  };
}

function buildCustomWellnessEducation(profile: DogProfile, text: string): Recommendation {
  const focus = text.trim();
  return {
    kind: "education",
    label: "Review carefully",
    product: null,
    title: "More details needed",
    category: "education",
    matchedBecause: focus
      ? `More details needed: "${focus}" needs a clearer care category before Furvise suggests products.`
      : "More details needed: Furvise needs a clearer care category before suggesting products.",
    note:
      "Try naming the area you want help with, such as nutrition, dental care, grooming, activity, preventive care, or reminders.",
    confidenceLabel: buildRecommendationConfidence(profile, ["general_wellness"]),
  };
}

function isAllowedForWellnessGoal(product: MockProduct, wellnessGoal?: WellnessGoal) {
  if (wellnessGoal === "dental_care") return product.concernTags.includes("dental_care");
  if (wellnessGoal === "grooming") return product.category === "grooming";
  if (wellnessGoal === "nutrition") return product.category === "food";
  return true;
}

function tagsFromWellnessGoal(analysis?: ConcernNormalizationInput | null): InternalConcernTag[] {
  if (!analysis?.wellnessGoal) return [];
  if (analysis.wellnessGoal === "dental_care") return ["dental_care"];
  if (analysis.wellnessGoal === "grooming") return ["grooming"];
  if (analysis.wellnessGoal === "nutrition") {
    if (analysis.nutritionGoal === "picky_eating") return ["picky_eating"];
    if (analysis.nutritionGoal === "sensitive_stomach") return ["sensitive_stomach"];
    if (analysis.nutritionGoal === "ingredient_concerns") return ["limited_ingredient"];
    if (analysis.nutritionGoal === "lower_cost") return ["general_wellness"];
    if (analysis.nutritionGoal === "compare_current_food") return ["general_wellness"];
    if (analysis.nutritionGoal === "life_stage_fit") return ["general_wellness"];
    if (analysis.nutritionGoal === "just_exploring") return ["general_wellness"];
    return [];
  }
  if (analysis.wellnessGoal === "reminders") return ["flea_tick_reminder"];
  if (analysis.wellnessGoal === "something_else") return tagsFromConcernKeywords(analysis.wellnessGoalText || "");
  return ["general_wellness"];
}

function tagsFromKnownConcern(value: string): InternalConcernTag[] {
  const normalized = normalizeConcernText(value);
  const knownConcernTags: Record<string, InternalConcernTag[]> = {
    "general wellness": ["general_wellness"],
    "general_wellness": ["general_wellness"],
    grooming: ["grooming"],
    "itchy skin": ["itchy_skin", "sensitive_skin"],
    "itchy_skin": ["itchy_skin", "sensitive_skin"],
    "limited ingredient": ["limited_ingredient"],
    "limited_ingredient": ["limited_ingredient"],
    "ear care": ["ear_care"],
    "ear_care": ["ear_care"],
    "dental care": ["dental_care"],
    "dental_care": ["dental_care"],
    "flea tick reminder": ["flea_tick_reminder"],
    "flea_tick_reminder": ["flea_tick_reminder"],
    "paw care": ["paw_care"],
    "paw_care": ["paw_care"],
    "picky eating": ["picky_eating"],
    "picky_eating": ["picky_eating"],
    "sensitive skin": ["sensitive_skin"],
    "sensitive_skin": ["sensitive_skin"],
    "sensitive stomach": ["sensitive_stomach"],
    "sensitive_stomach": ["sensitive_stomach"],
    "probiotic caution": ["probiotic_caution"],
    "probiotic_caution": ["probiotic_caution"],
    "weight management": ["weight_management"],
    "weight_management": ["weight_management"],
  };

  return knownConcernTags[normalized] || [];
}

function tagsFromConcernKeywords(value: string): InternalConcernTag[] {
  const normalized = normalizeConcernText(value);
  const tags: InternalConcernTag[] = [];

  if (
    /\b(licking|lick|paws?|chewing paws?|scratching|redness|rash|skin|itching|itchy|itches)\b/.test(
      normalized,
    )
  ) {
    tags.push("itchy_skin", "sensitive_skin", "paw_care");
  }

  if (/\b(vomiting|vomit|diarrhea|loose stools?|gas|stomach)\b/.test(normalized)) {
    tags.push("sensitive_stomach");
  }

  if (/\b(overweight|weight|fat|calories|calorie)\b/.test(normalized)) {
    tags.push("weight_management");
  }

  if (/\b(picky|refuses food|wont eat|won't eat|will not eat)\b/.test(normalized)) {
    tags.push("picky_eating");
  }

  if (/\b(shampoo|smell|odor|odour|coat|shedding|grooming)\b/.test(normalized)) {
    tags.push("grooming");
  }

  if (/\b(ear|ears|earwax|ear care|ear cleaner)\b/.test(normalized)) {
    tags.push("grooming", "ear_care");
  }

  if (/\b(dental|teeth|tooth|chews?|breath)\b/.test(normalized)) {
    tags.push("dental_care");
  }

  if (/\b(flea|fleas|tick|ticks|prevention reminder|reminder)\b/.test(normalized)) {
    tags.push("flea_tick_reminder");
  }

  if (/\b(probiotic|supplement)\b/.test(normalized)) {
    tags.push("probiotic_caution");
  }

  return mergeUniqueConcernTags(tags);
}

function normalizeConcernText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function mergeUniqueConcernTags(values: InternalConcernTag[]) {
  const seen = new Set<InternalConcernTag>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}
