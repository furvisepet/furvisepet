import type { PetMemoryContext } from "../pet-memory";
import { getProductSpeciesLabel, type MockProduct } from "../petwise";
import type { ShopQueryInterpretation } from "../shop-query";
import { buildVerifiedProductFields } from "./product-fit-explanation";

export type ShopProductQuestionConfidence = "low" | "medium" | "high";

export type ShopProductQuestionSections = {
  directAnswer: string;
  whyItMayFit: string;
  checkBeforeBuying: string[];
  howToUse: string;
  whenToAskVet: string;
  bottomLine: string;
};

export type ShopProductQuestionAnswer = {
  answer: string;
  sections: ShopProductQuestionSections;
  whatFurviseKnows: string[];
  whatIsMissing: string[];
  safetyNote: string;
  confidence: ShopProductQuestionConfidence;
};

export type ShopProductQuestionInput = {
  interpretation?: ShopQueryInterpretation | null;
  memory: PetMemoryContext;
  product: MockProduct;
  query: string;
  question: string;
};

export type ShopProductQuestionIntent = "product_related" | "product_adjacent" | "clearly_off_topic";

export type ShopProductQuestionIntentClassification = {
  hasOffTopicPart: boolean;
  intent: ShopProductQuestionIntent;
  reason: string;
};

export const shopProductQuestionSystemPrompt = [
  "You answer one shopper follow-up question about one already-filtered pet product.",
  "Return strict JSON only.",
  "Use only the selected pet context, current shopping query, verified product fields, enriched verified product details, and current product card data provided in the input.",
  "Do not use general internet knowledge or memory about the product.",
  "Do not invent product facts, prices, availability, ingredients, sizes, directions, warnings, or claims.",
  "If verified ingredient details are missing or ingredientsVerified is false, mention that ingredient details are not fully verified and tell the user to review the label.",
  "Never claim guaranteed safety, vet approval, treatment, cure, diagnosis, or that a product is best.",
  "Do not say safe for the pet.",
  "Do not diagnose.",
  "Return sections for schema compatibility, but make directAnswer the only shopper-facing answer.",
  "Make directAnswer stand alone. Keep it to one or two short paragraphs, under 90 words when possible, and preserve honest uncertainty.",
  "Only include label details, directions, or broader shopping checks when they directly answer the question.",
  "Answer broad buyer doubts when they are about the selected product, including taste, size, age, breed, water, symptoms, reactions, comparison, or whether the pet may like it.",
  "If the shopper's wording is messy, assume it is about the selected product unless it is clearly unrelated.",
  "The answer summary must be 120 words or fewer.",
  "Do not use em dashes.",
  "Do not mention AI, signals, catalog tags, catalog fields, provided data, database fields, or internal matching logic.",
  "Make directAnswer casual and shopper-friendly. Avoid robotic phrasing, internal terminology, and formal uncertainty wording.",
  "For category mismatch questions, answer plainly with wording like Yes, as a shampoo or No, this is more for dental care.",
  "safetyNote must exactly match the requiredSafetyNote.",
].join("\n");

export const shopProductQuestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "sections", "whatFurviseKnows", "whatIsMissing", "safetyNote", "confidence"],
  properties: {
    answer: { type: "string" },
    sections: {
      type: "object",
      additionalProperties: false,
      required: ["directAnswer", "whyItMayFit", "checkBeforeBuying", "howToUse", "whenToAskVet", "bottomLine"],
      properties: {
        directAnswer: { type: "string" },
        whyItMayFit: { type: "string" },
        checkBeforeBuying: stringArraySchema(6),
        howToUse: { type: "string" },
        whenToAskVet: { type: "string" },
        bottomLine: { type: "string" },
      },
    },
    whatFurviseKnows: stringArraySchema(6),
    whatIsMissing: stringArraySchema(6),
    safetyNote: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
} as const;

export function buildProductQuestionSafetyNote(petName: string) {
  return `Based on what you've saved about ${petName || "this pet"}. Not a substitute for vet or professional advice.`;
}

export function buildShopProductQuestionPromptInput({
  interpretation = null,
  memory,
  product,
  query,
  question,
}: ShopProductQuestionInput) {
  return {
    requiredSafetyNote: buildProductQuestionSafetyNote(memory.pet.name || "this pet"),
    question,
    query: {
      category: interpretation?.category || null,
      normalizedSearchTerms: interpretation?.normalizedSearchTerms || [],
      queryText: query,
    },
    selectedPet: {
      avoidIngredients: memory.pet.avoidIngredients,
      name: memory.pet.name,
      species: memory.pet.species,
    },
    product: {
      ...buildVerifiedProductFields(product),
      currentCardData: {
        cautions: product.cautions || null,
        productType: getProductTypeLabel(product),
      },
    },
  };
}

export function parseShopProductQuestionAnswer(
  value: unknown,
  petName: string,
): ShopProductQuestionAnswer | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<ShopProductQuestionAnswer>;
  const safetyNote = buildProductQuestionSafetyNote(petName);

  if (
    typeof draft.answer !== "string" ||
    draft.safetyNote !== safetyNote ||
    (draft.confidence !== undefined && !isConfidence(draft.confidence))
  ) {
    return null;
  }

  if (hasForbiddenProductQuestionCopy(draft.answer)) return null;
  const answer = normalizeAnswer(draft.answer);
  if (!answer || hasForbiddenProductQuestionCopy(answer)) return null;
  const sections = normalizeProductQuestionSections(draft.sections, answer);
  if (!sections) return null;

  return {
    answer,
    confidence: isConfidence(draft.confidence) ? draft.confidence : "low",
    sections,
    safetyNote,
    whatFurviseKnows: isStringArray(draft.whatFurviseKnows) ? normalizeList(draft.whatFurviseKnows).slice(0, 6) : [],
    whatIsMissing: isStringArray(draft.whatIsMissing) ? normalizeList(draft.whatIsMissing).slice(0, 6) : [],
  };
}

export function buildFallbackShopProductQuestionAnswer({
  interpretation,
  memory,
  product,
  query,
  question,
}: ShopProductQuestionInput): ShopProductQuestionAnswer {
  const petName = memory.pet.name || "this pet";
  const missing = getMissingProductFacts(product, question);
  const known = getKnownProductFacts(product);
  const sections = buildFallbackSections({ interpretation, memory, product, query, question });
  return {
    answer: sections.directAnswer,
    confidence: product.ingredientsVerified && product.verifiedIngredients?.length ? "medium" : "low",
    sections,
    safetyNote: buildProductQuestionSafetyNote(petName),
    whatFurviseKnows: known,
    whatIsMissing: missing,
  };
}

export function isOffTopicShopProductQuestion(question: string) {
  return classifyShopProductQuestionIntent(question).intent === "clearly_off_topic";
}

export function classifyShopProductQuestionIntent(question: string): ShopProductQuestionIntentClassification {
  const normalizedQuestion = question.trim().toLowerCase();
  if (!normalizedQuestion) {
    return { hasOffTopicPart: false, intent: "clearly_off_topic", reason: "empty_question" };
  }

  const hasOffTopicPart = clearlyOffTopicPattern.test(normalizedQuestion);
  const hasProductTopic = productTopicPattern.test(normalizedQuestion) ||
    productUsePattern.test(normalizedQuestion) ||
    productSymptomPattern.test(normalizedQuestion) ||
    productComparisonPattern.test(normalizedQuestion);
  const hasAdjacentTopic = productAdjacentPattern.test(normalizedQuestion);

  if (hasProductTopic && hasOffTopicPart) {
    return { hasOffTopicPart: true, intent: "product_adjacent", reason: "mixed_product_and_off_topic" };
  }
  if (hasAdjacentTopic) {
    return { hasOffTopicPart, intent: "product_adjacent", reason: "product_adjacent_topic" };
  }
  if (hasProductTopic) {
    return { hasOffTopicPart: false, intent: "product_related", reason: "product_topic" };
  }
  if (hasOffTopicPart) {
    return { hasOffTopicPart: true, intent: "clearly_off_topic", reason: "off_topic_only" };
  }
  return { hasOffTopicPart: false, intent: "product_related", reason: "assumed_product_context" };
}

export function buildOffTopicShopProductQuestionAnswer({
  memory,
}: {
  memory: PetMemoryContext;
}): ShopProductQuestionAnswer {
  const petName = memory.pet.name || "this pet";
  const directAnswer = `I can help with this product, like ingredients, directions, warnings, taste, size, or whether it fits ${petName}.`;
  return {
    answer: directAnswer,
    confidence: "low",
    sections: {
      directAnswer,
      whyItMayFit: "",
      checkBeforeBuying: [],
      howToUse: "",
      whenToAskVet: "",
      bottomLine: "",
    },
    safetyNote: buildProductQuestionSafetyNote(petName),
    whatFurviseKnows: [],
    whatIsMissing: [],
  };
}

export function hasForbiddenProductQuestionCopy(value: string) {
  return /[\u2014]|\b(guaranteed|guaranteed safe|safe|best|vet-approved|cure|diagnos(?:e|is)|AI|signals|catalog tags|catalog fields|catalog match|region-verified|region verified|curated|data source|provided data|provided product data|database fields|ingredientsVerified|itchy_skin|sensitive_skin|owner_observation)\b/i.test(
    value,
  );
}

const clearlyOffTopicPattern = /\b(good dog|good boy|good girl|tell me a joke|joke|weather|thinking|go to the gym|should i go|movie|capital of|homework|math|resume|who won|game|sports|stock price|translate|generate image|make an image|coding|javascript|python|typescript|react bug)\b/;
const productTopicPattern = /\b(label|package|packaging|ingredient|ingredients|contains|fragrance|flavour|flavor|taste|tasty|smell|texture|picky|hate|hates|dislike|eat|eats|eating|food|treat|treats|shampoo|grooming|groom|bath|brush|comb|flea|dental|teeth|tooth|mouth|gum|gums|breath|chew|chewing|swallow|swallowing|water|dry|mix|transition|serve|serving|give|use|using|used|apply|direction|directions|often|daily|night|morning|walk|size|weight|calorie|calories|age|puppy|adult|senior|breed|species|german shepherd|allerg|allergy|sensitive|reaction|irritation|side effect|vomit|vomiting|diarrhea|stool|scratch|scratching|lick|licking|ears|coat|shedding|skin|paw|paws|itch|itchy|warning|warnings|avoid|watch|missing|lamb|chicken|beef|fish|pork|turkey)\b/;
const productUsePattern = /\b(how much|how many|how long|how often|can i (use|give|serve|feed|apply|mix)|can we (use|give|serve|feed|apply|mix)|should i (buy|use|give|serve|feed|apply|mix)|should we (buy|use|give|serve|feed|apply|mix)|will this|would this|is this|is it|too hard|too soft|too small|too big|weight range|age range)\b/;
const productSymptomPattern = /\b(worse|worsen|make .* worse|react|reacted|upset stomach|stomach upset|throw up|loose stool|redness|swollen|swelling|pain|odor|odour|infection|fleas?|allergies|sensitivity)\b/;
const productComparisonPattern = /\b(compare|comparison|better than|instead of|versus|vs\.?|should i buy|worth buying|enough for|replace|with other)\b/;
const productAdjacentPattern = /\b(too small|too big|too hard|too soft|make him fat|make her fat|at night|after (a )?walk|with other|ate chicken|had chicken|too old|too young|puppy|adult|senior|german shepherd)\b/;

function buildFallbackSections({
  interpretation,
  memory,
  product,
  query,
  question,
}: ShopProductQuestionInput): ShopProductQuestionSections {
  const petName = memory.pet.name || "this pet";
  const normalizedQuestion = question.toLowerCase();
  const questionIntent = classifyShopProductQuestionIntent(question);
  const displayName = getProductDisplayName(product);
  const productType = getProductTypeLabel(product);
  const isGrooming = product.category === "grooming";
  const isShampoo = product.subcategory === "shampoo" || productType.includes("shampoo");
  const isDental = product.subcategory === "dental_treat" || /\bdental\b/i.test(product.tags?.join(" ") || "");
  const isFood = product.category === "food";
  const isFoodOrTreat = product.category === "food" || Boolean(product.subcategory?.includes("treat"));
  const missingQuestion = /\b(missing|not know|not verified|unverified|ingredient list verified|ingredient verified|verified ingredient)\b/.test(normalizedQuestion);
  const ingredientQuestion = /\b(ingredient|ingredients|contains|fragrance|oil|dye|allerg|allergy|sensitive|label)\b/.test(normalizedQuestion);
  const useQuestion = /\b(use|apply|direction|how|often|size|introduce|give|serve|serving|water|dry|eat|eating|mix|transition|daily|night|morning|walk)\b/.test(normalizedQuestion);
  const warningQuestion = /\b(watch|warning|avoid|problem|irritation|worse|worsen|reaction|side effect|vomit|vomiting|diarrhea|stool|scratch|scratching|licking)\b/.test(normalizedQuestion);
  const speciesQuestion = /\b(german shepherd|breed|species|listed for|for dogs?|for cats?|can this be used on|can i use this on|can we use this on)\b/.test(normalizedQuestion);
  const itchyQuestion = /\bitch|itchy|paw|paws|licking|sensitive skin|skin\b/.test(normalizedQuestion);
  const dentalQuestion = /\b(teeth|tooth|dental|mouth|gum|gums|breath)\b/.test(normalizedQuestion);
  const foodComparisonQuestion = /\bfood|treat|supplement|better than|instead of\b/.test(normalizedQuestion);
  const noTeethQuestion = /\b(no teeth|without teeth|missing teeth|teeths)\b/.test(normalizedQuestion);
  const tasteQuestion = /\b(taste|flavour|flavor|like it|will .* like|eat it|will .* eat|picky|weird|texture|smell)\b/.test(normalizedQuestion);
  const preferenceQuestion = /\b(hate|hates|dislike|doesn't like|does not like|won't eat|will not eat|refuses?|picky|lamb|chicken|beef|fish|pork|turkey)\b/.test(normalizedQuestion);
  const ageSizeQuestion = /\b(size|weight|too small|too big|too hard|too soft|age|puppy|adult|senior|too old|too young|weight range|age range|make .* fat)\b/.test(normalizedQuestion);
  const compareQuestion = /\b(compare|comparison|better than|instead of|versus|vs\.?|should i buy|worth buying|enough for|replace)\b/.test(normalizedQuestion);
  const reactionQuestion = /\b(worse|worsen|reaction|react|side effect|vomit|vomiting|diarrhea|stool|scratch|scratching|lick|licking|itch|itching|paw|paws|skin|ears|redness|swelling|swollen|upset stomach|stomach upset)\b/.test(normalizedQuestion);
  const productPositioning = getProductPositioning(product);
  const shoppingNeed = getShoppingNeedText(query, interpretation);
  const missing = getMissingProductFacts(product, question);
  const warnings = product.verifiedWarnings?.length ? formatList(product.verifiedWarnings.slice(0, 2)) : "";
  const speciesLabel = getProductSpeciesLabel(product, true);
  const dentalItchyQuestion = isDental && itchyQuestion && /\b(dental|paw|paws|itch|itchy|worse|worsen)\b/.test(normalizedQuestion);
  const shampooDentalQuestion = isShampoo && dentalQuestion;
  const waterQuestion = /\b(water|without water|dry)\b/.test(normalizedQuestion);
  const mixedProductQuestion = questionIntent.intent === "product_adjacent" && questionIntent.hasOffTopicPart;

  const directAnswer = normalizeAnswer(
    mixedProductQuestion
      ? buildMixedProductQuestionDirectAnswer({ isDental, isFood, isShampoo, petName, productType })
      : missingQuestion
      ? missing.length
        ? `Furvise is missing ${formatList(missing)} for ${displayName}. You can still compare it, but check the label before buying or using.`
        : `Furvise has the key label details for ${displayName}. Review the package before using it for ${petName}.`
      : shampooDentalQuestion
        ? noTeethQuestion
          ? `Yes, as a shampoo. Teeth do not really matter here because this is used on the coat and skin, not chewed or eaten. Keep it away from the eyes and mouth, rinse well, and stop using it if irritation appears.`
          : `Yes, as a shampoo. It can be used for washing a pet, but it will not help sensitive teeth because it is not a dental product. For ${petName}, I'd treat it as a grooming product only. Follow the label directions, keep it away from the mouth and eyes, and stop using it if irritation appears.`
      : ingredientQuestion
        ? product.ingredientsVerified && product.verifiedIngredients?.length
          ? `Yes, Furvise has verified ingredients for ${displayName}: ${formatList(product.verifiedIngredients.slice(0, 6))}. Still check the label before using it for ${petName}.`
          : `Furvise does not have the full verified ingredient list for ${displayName} yet. Check the label before buying or using it for ${petName}.`
      : isShampoo && noTeethQuestion
        ? `Yes, as a shampoo. Teeth do not really matter here because this is used on the coat and skin, not chewed or eaten. Keep it away from the eyes and mouth, rinse well, and stop using it if irritation appears.`
      : isFood && waterQuestion
        ? `You can usually serve dry pet food dry if the package directions allow it, but it should not replace water. Keep fresh water available for ${petName} whenever eating. Follow the package directions for portions and transition gradually if this is new food. If ${petName} has trouble chewing, swallowing, vomiting, or a medical diet plan, ask a veterinarian.`
      : dentalItchyQuestion
        ? `No, not for itchy paws. This is a dental treat, so it is meant for chewing and dental care, not skin or paw irritation. If ${petName} has itchy paws, look at grooming, allergy, flea, or vet-care options instead. Check the treat label before giving it, especially if ${petName} has food sensitivities.`
      : preferenceQuestion
        ? getPreferenceQuestionDirectAnswer({ displayName, isDental, isFood, isFoodOrTreat, isShampoo, normalizedQuestion, petName, product, productType })
      : tasteQuestion
        ? getTasteQuestionDirectAnswer({ isDental, isFood, isFoodOrTreat, isShampoo, petName, productType })
      : isShampoo && itchyQuestion
        ? `It may be worth considering as a gentle bath-time option, but it is not medical care for itchy paws. Some pets can still react to shampoos, so check the label first and stop using it if ${petName} gets more red, itchy, or uncomfortable.`
      : reactionQuestion
        ? getReactionQuestionDirectAnswer({ isDental, isFood, isShampoo, petName, product })
      : ageSizeQuestion
        ? getAgeSizeQuestionDirectAnswer({ isDental, isFood, isShampoo, petName, product, productType })
      : speciesQuestion
        ? `Yes, this is listed for ${speciesLabel}, so it may be considered for ${petName} if the label directions fit and ${petName} tolerates the product. Check the label before use and stop if irritation appears.`
      : useQuestion
        ? getUseQuestionDirectAnswer({ displayName, isDental, isFood, isShampoo, petName, product })
      : warningQuestion
        ? warnings
          ? `For ${displayName}, I would watch for label warnings such as: ${warnings}.`
          : `I do not have label warnings for ${displayName} yet, so review the label before using it for ${petName}.`
      : compareQuestion || foodComparisonQuestion
        ? getCompareQuestionDirectAnswer({ displayName, isDental, isFood, isGrooming, petName, productType })
        : `${displayName} can be considered for ${petName} as a ${getProductSpeciesLabel(product)} ${productType} if the label fits your needs and ${petName} tolerates it.`,
  );

  const whyItMayFit = normalizeAnswer(
    isShampoo && itchyQuestion
      ? `A shampoo may make sense when paw itching is related to dirt, dryness, or general coat and skin irritation. It is less useful if the itching is linked to allergies, fleas, infection, pain, or a food reaction.`
      : isDental
        ? `It may fit a dental-care shopping need when you want a chewing product for routine dental support, but it should not replace dental care from a professional.`
        : isFoodOrTreat
          ? `It may fit when the product type and label line up with ${petName}'s saved food context, avoid ingredients, and the current search for ${shoppingNeed}.`
          : productPositioning
            ? `${productPositioning} That can fit a ${shoppingNeed} search when you want a ${productType} rather than food, treats, or supplements.`
            : `It may fit when you want a ${productType} for ${shoppingNeed} and the label directions fit ${petName}.`,
  );

  const checkBeforeBuying = buildCheckBeforeBuyingList({ memory, product });
  const howToUse = buildHowToUseText(product);
  const whenToAskVet = buildWhenToAskVetText({ product, isShampoo, itchyQuestion, petName });
  const bottomLine = normalizeAnswer(
    isShampoo && itchyQuestion
      ? `Bottom line: this is a reasonable shampoo to compare for mild itchy-paw grooming support, but it should not replace care for a recurring or worsening skin problem.`
      : `Bottom line: this is a reasonable ${productType} to compare if the label checks out, but treat it as product support for ${petName}, not a fix for an unknown health concern.`,
  );

  return {
    directAnswer,
    whyItMayFit,
    checkBeforeBuying,
    howToUse,
    whenToAskVet,
    bottomLine,
  };
}

function getUseQuestionDirectAnswer({
  displayName,
  isDental,
  isFood,
  isShampoo,
  petName,
  product,
}: {
  displayName: string;
  isDental: boolean;
  isFood: boolean;
  isShampoo: boolean;
  petName: string;
  product: MockProduct;
}) {
  if (isFood) {
    const directionText = product.verifiedDirections ? `Follow the label directions: ${product.verifiedDirections}` : "Follow the package directions.";
    return `${directionText} Keep fresh water available whenever ${petName} eats, transition gradually if this is a new food, and ask a veterinarian if ${petName} has vomiting, trouble chewing or swallowing, or a medical diet plan.`;
  }
  if (isDental) {
    const directionText = product.verifiedDirections ? `Follow the label directions: ${product.verifiedDirections}` : "Follow the package directions.";
    return `${directionText} Supervise chewing, choose the correct size or weight range, keep fresh water available, and do not use it as a replacement for professional dental care.`;
  }
  if (isShampoo) {
    return product.verifiedDirections
      ? `Follow the label directions: ${product.verifiedDirections} Use it on the coat and skin, keep it away from the eyes and mouth, rinse well, and stop using it if irritation appears.`
      : `Follow the package directions. Use this shampoo on the coat and skin, keep it away from the eyes and mouth, rinse well, and stop using it if irritation appears.`;
  }
  return product.verifiedDirections
    ? `Follow the label directions: ${product.verifiedDirections}`
    : `I do not have label directions for ${displayName} yet, so follow the package directions before using it for ${petName}.`;
}

function buildMixedProductQuestionDirectAnswer({
  isDental,
  isFood,
  isShampoo,
  petName,
  productType,
}: {
  isDental: boolean;
  isFood: boolean;
  isShampoo: boolean;
  petName: string;
  productType: string;
}) {
  if (isFood) {
    return `I can't judge whether ${petName} is a good dog from here, but for the product part: this is dog food, so check the label, introduce it slowly, and watch for stomach upset or itching.`;
  }
  if (isDental) {
    return `I can't judge whether ${petName} is a good dog from here, but for the product part: this is a dental treat, so check the size range, supervise chewing, and watch for stomach upset or trouble chewing.`;
  }
  if (isShampoo) {
    return `I can't judge whether ${petName} is a good dog from here, but for the product part: this is a shampoo, so use it on the coat and skin only, rinse well, and stop if irritation appears.`;
  }
  return `I can't judge that part from here, but for the product part: this is a ${productType}, so check the label directions and warnings before using it for ${petName}.`;
}

function getTasteQuestionDirectAnswer({
  isDental,
  isFood,
  isFoodOrTreat,
  isShampoo,
  petName,
  productType,
}: {
  isDental: boolean;
  isFood: boolean;
  isFoodOrTreat: boolean;
  isShampoo: boolean;
  petName: string;
  productType: string;
}) {
  if (isShampoo) {
    return `Taste should not matter much here because this is a shampoo, not something ${petName} should eat. Use it on the coat and skin only, keep it away from the mouth and eyes, rinse well, and stop if irritation appears.`;
  }
  if (isDental) {
    return `${petName} may or may not like it. For a dental treat, I would check the flavor, size range, calories, and chewing directions first, then supervise the first few uses.`;
  }
  if (isFood || isFoodOrTreat) {
    return `${petName} may or may not like it. The taste depends on what ${petName} is used to eating. Start with a small amount mixed into the current food and watch whether ${petName} eats normally, picks around it, or gets an upset stomach.`;
  }
  return `${petName} may or may not like it. Since this is a ${productType}, check the label for flavor, scent, texture, directions, and warnings before using it.`;
}

function getPreferenceQuestionDirectAnswer({
  displayName,
  isDental,
  isFood,
  isFoodOrTreat,
  isShampoo,
  normalizedQuestion,
  petName,
  product,
  productType,
}: {
  displayName: string;
  isDental: boolean;
  isFood: boolean;
  isFoodOrTreat: boolean;
  isShampoo: boolean;
  normalizedQuestion: string;
  petName: string;
  product: MockProduct;
  productType: string;
}) {
  if (isShampoo) {
    return `If ${petName} dislikes a smell or feel, introduce this shampoo carefully during a calm bath. Use it on the coat and skin only, keep it away from the mouth and eyes, rinse well, and stop if irritation appears.`;
  }

  const dislikedIngredients = findMentionedIngredients(normalizedQuestion);
  if (dislikedIngredients.length && product.ingredientsVerified && product.verifiedIngredients?.length) {
    const ingredientText = product.verifiedIngredients.join(" ").toLowerCase();
    const present = dislikedIngredients.filter((ingredient) => ingredientText.includes(ingredient));
    if (present.length) {
      return `${petName} may not like this if ${petName} already avoids ${formatList(present)}. ${displayName} has ${formatList(present)} in the verified ingredients Furvise has, so I would compare a different option and still check the label.`;
    }
    return `I do not see ${formatList(dislikedIngredients)} in the verified ingredients Furvise has for ${displayName}, but check the current label before buying. ${petName} may still dislike the taste, so try a small amount first and watch appetite and stomach comfort.`;
  }

  if (isFood || isFoodOrTreat) {
    return `${petName} may or may not like it, especially if ${petName} is picky or already dislikes a similar flavor. Check the label first, introduce a small amount slowly, and watch whether ${petName} eats normally or gets an upset stomach.`;
  }
  if (isDental) {
    return `${petName} may or may not like it. For a dental treat, check the flavor, ingredients, calories, and size range first, then supervise the first few chews.`;
  }
  return `${petName} may or may not like this ${productType}. Check the label for ingredients, flavor, scent, texture, directions, and warnings before using it.`;
}

function getReactionQuestionDirectAnswer({
  isDental,
  isFood,
  isShampoo,
  petName,
  product,
}: {
  isDental: boolean;
  isFood: boolean;
  isShampoo: boolean;
  petName: string;
  product: MockProduct;
}) {
  if (isShampoo) {
    return `Furvise cannot know that for sure. Some pets can react to shampoos, so check the label and watch ${petName} after bathing. Stop if redness, licking, scratching, or discomfort gets worse.`;
  }
  if (isFood) {
    return `Furvise cannot know that for sure. Check the ingredients, follow the package directions, and introduce it slowly. Watch for appetite changes, vomiting, diarrhea, stool changes, itching, scratching, or licking.`;
  }
  if (isDental) {
    return `Furvise cannot know that for sure. Check the ingredients, size range, and chewing directions first. Supervise ${petName} and stop using it if chewing trouble, vomiting, diarrhea, itching, or discomfort appears.`;
  }
  const warningText = product.verifiedWarnings?.length ? ` Label warnings include: ${formatList(product.verifiedWarnings.slice(0, 2))}.` : "";
  return `Furvise cannot know that for sure. Check the label before using it for ${petName} and watch for any reaction or discomfort.${warningText}`;
}

function getAgeSizeQuestionDirectAnswer({
  isDental,
  isFood,
  isShampoo,
  petName,
  product,
  productType,
}: {
  isDental: boolean;
  isFood: boolean;
  isShampoo: boolean;
  petName: string;
  product: MockProduct;
  productType: string;
}) {
  const lifeStageText = product.lifeStage === "all" ? "all life stages" : `${product.lifeStage} pets`;
  if (isDental) {
    return product.verifiedDirections
      ? `Check the size and weight range first. For this dental treat, follow the label directions: ${product.verifiedDirections} Supervise chewing and choose a different size if the label does not fit ${petName}.`
      : `Check the size and weight range first. For this dental treat, follow the package directions, supervise chewing, and choose a different size if the label does not fit ${petName}.`;
  }
  if (isFood) {
    return `Check the package life-stage and feeding directions first. This product is listed for ${lifeStageText}, so confirm that matches ${petName}'s age, weight, and health context before serving it.`;
  }
  if (isShampoo) {
    return `For a shampoo, size and age matter less than the label directions and skin condition. Use it only if the label fits ${petName}, keep it away from the eyes and mouth, and stop if irritation appears.`;
  }
  return `Check the label for size, weight, and age guidance before using this ${productType} for ${petName}.`;
}

function getCompareQuestionDirectAnswer({
  displayName,
  isDental,
  isFood,
  isGrooming,
  petName,
  productType,
}: {
  displayName: string;
  isDental: boolean;
  isFood: boolean;
  isGrooming: boolean;
  petName: string;
  productType: string;
}) {
  if (isFood) {
    return `${displayName} may be worth comparing if you want a food option for ${petName}. I would check the ingredients, calories, feeding directions, transition guidance, and anything ${petName} should avoid before buying.`;
  }
  if (isDental) {
    return `${displayName} may be worth comparing for routine dental chewing, but it should not replace brushing or professional dental care. Check the size range, calories, ingredients, and supervision directions first.`;
  }
  if (isGrooming) {
    return `${displayName} may be worth comparing as a grooming option, not as food, dental care, flea treatment, or medical care. Review the label before using it for ${petName}.`;
  }
  return `${displayName} may be worth comparing as a ${productType} if the label fits ${petName}'s needs. Check ingredients, directions, warnings, and size details before buying.`;
}

function findMentionedIngredients(normalizedQuestion: string) {
  return ["lamb", "chicken", "beef", "fish", "pork", "turkey"].filter((ingredient) =>
    new RegExp(`\\b${ingredient}\\b`).test(normalizedQuestion),
  );
}

function buildCheckBeforeBuyingList({
  memory,
  product,
}: {
  memory: PetMemoryContext;
  product: MockProduct;
}) {
  const checks = [
    product.ingredientsVerified && product.verifiedIngredients?.length
      ? `Listed ingredients: ${formatList(product.verifiedIngredients.slice(0, 6))}`
      : "Full ingredient list",
    "Directions for how often to use it",
    "Warnings about irritated or broken skin",
  ];
  const avoids = normalizeList(memory.pet.avoidIngredients || []);
  if (avoids.length > 0) {
    checks.push(`Any ingredient ${memory.pet.name || "this pet"} has reacted to before, including ${formatList(avoids.slice(0, 3))}`);
  } else {
    checks.push(`Any ingredient ${memory.pet.name || "this pet"} has reacted to before`);
  }
  return normalizeList(checks).slice(0, 6);
}

function buildHowToUseText(product: MockProduct) {
  if (!product.verifiedDirections) {
    return "Furvise does not have verified label directions yet, so follow the package directions.";
  }
  return normalizeAnswer(`Follow the label directions: ${product.verifiedDirections}`);
}

function buildWhenToAskVetText({
  isShampoo,
  itchyQuestion,
  petName,
  product,
}: {
  isShampoo: boolean;
  itchyQuestion: boolean;
  petName: string;
  product: MockProduct;
}) {
  const verifiedStopWarning = product.verifiedWarnings?.find((warning) => /stop|discontinue|veterinarian|irritation/i.test(warning));
  if (isShampoo || itchyQuestion) {
    return normalizeAnswer(
      `Contact a veterinarian if ${petName} has open sores, swelling, bleeding, strong odor, constant licking, pain, or worsening irritation.`,
    );
  }
  if (verifiedStopWarning) return normalizeAnswer(verifiedStopWarning);
  return normalizeAnswer(`Ask a veterinarian if symptoms are severe, worsening, painful, recurring, or do not improve with routine care.`);
}

function getProductPositioning(product: MockProduct) {
  if (product.verifiedDescription) return normalizeAnswer(product.verifiedDescription);
  if (product.whyItFits) return normalizeAnswer(product.whyItFits);
  return "";
}

function getShoppingNeedText(query: string, interpretation?: ShopQueryInterpretation | null) {
  const terms = interpretation?.normalizedSearchTerms?.length
    ? interpretation.normalizedSearchTerms.slice(0, 3).join(", ")
    : query.trim();
  return terms || "this product";
}

function getKnownProductFacts(product: MockProduct) {
  return normalizeList([
    `${getProductDisplayName(product)} is listed as a ${getProductTypeLabel(product)}.`,
    `Made for ${getProductSpeciesLabel(product, true)}.`,
    product.verifiedDescription ? "Verified description is available." : "",
    product.ingredientsVerified && product.verifiedIngredients?.length
      ? "Verified ingredients are available."
      : "Full ingredient details are not fully verified.",
    product.verifiedDirections ? "Verified directions are available." : "",
    product.verifiedWarnings?.length ? "Verified warnings are available." : "",
  ]);
}

function getMissingProductFacts(product: MockProduct, question: string) {
  const missing = [
    !product.verifiedDescription ? "Verified product details" : "",
    !product.ingredientsVerified || !product.verifiedIngredients?.length ? "Full verified ingredient list" : "",
    !product.verifiedDirections ? "Verified directions for use" : "",
    !product.verifiedWarnings?.length ? "Verified warnings from the product label" : "",
  ];
  if (/\b(size|weight|ounces|oz|count)\b/i.test(question)) missing.push("Verified size details from the product label");
  return normalizeList(missing);
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

function isConfidence(value: unknown): value is ShopProductQuestionConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function normalizeProductQuestionSections(value: unknown, fallbackDirectAnswer: string): ShopProductQuestionSections | null {
  if (!value || typeof value !== "object") {
    return buildMinimalProductQuestionSections(fallbackDirectAnswer);
  }
  const draft = value as Partial<ShopProductQuestionSections>;
  const directAnswer = typeof draft.directAnswer === "string" ? draft.directAnswer : fallbackDirectAnswer;
  const whyItMayFit = typeof draft.whyItMayFit === "string" ? draft.whyItMayFit : "";
  const checkBeforeBuying = isStringArray(draft.checkBeforeBuying) ? draft.checkBeforeBuying : [];
  const howToUse = typeof draft.howToUse === "string" ? draft.howToUse : "";
  const whenToAskVet = typeof draft.whenToAskVet === "string" ? draft.whenToAskVet : "";
  const bottomLine = typeof draft.bottomLine === "string" ? draft.bottomLine : "";

  const rawSectionText = [
    directAnswer,
    whyItMayFit,
    ...checkBeforeBuying,
    howToUse,
    whenToAskVet,
    bottomLine,
  ].join(" ");
  if (hasForbiddenProductQuestionCopy(rawSectionText)) return null;

  const sections = {
    directAnswer: normalizeCompactAnswer(directAnswer),
    whyItMayFit: normalizeAnswer(whyItMayFit),
    checkBeforeBuying: normalizeList(checkBeforeBuying).slice(0, 6),
    howToUse: normalizeAnswer(howToUse),
    whenToAskVet: normalizeAnswer(whenToAskVet),
    bottomLine: normalizeAnswer(bottomLine),
  };

  const sectionText = [
    sections.directAnswer,
    sections.whyItMayFit,
    ...sections.checkBeforeBuying,
    sections.howToUse,
    sections.whenToAskVet,
    sections.bottomLine,
  ].join(" ");
  if (
    !sections.directAnswer ||
    hasForbiddenProductQuestionCopy(sectionText)
  ) {
    return null;
  }

  return sections;
}

function buildMinimalProductQuestionSections(directAnswer: string): ShopProductQuestionSections | null {
  if (!directAnswer || hasForbiddenProductQuestionCopy(directAnswer)) return null;
  return {
    directAnswer: normalizeCompactAnswer(directAnswer),
    whyItMayFit: "",
    checkBeforeBuying: [],
    howToUse: "",
    whenToAskVet: "",
    bottomLine: "",
  };
}

function normalizeAnswer(value: string) {
  return firstWords(toUserFacingText(value), 180);
}

function normalizeCompactAnswer(value: string) {
  return firstWords(toUserFacingText(value), 90);
}

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => toUserFacingText(value))
    .filter((value) => {
      if (!value || seen.has(value.toLowerCase())) return false;
      seen.add(value.toLowerCase());
      return true;
    });
}

function toUserFacingText(value: string) {
  return value
    .replace(/\u2014/g, ", ")
    .replace(/\bowner_observation\b/gi, "saved note")
    .replace(/\bitchy_skin\b/gi, "itchy skin")
    .replace(/\bsensitive_skin\b/gi, "sensitive skin")
    .replace(/\bingredientsVerified\b/gi, "ingredient status")
    .replace(/\s+/g, " ")
    .trim();
}

function firstWords(value: string, maxWords: number) {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value : `${words.slice(0, maxWords).join(" ")}.`;
}

function getProductTypeLabel(product: MockProduct) {
  const category = humanizeToken(product.category);
  const subcategory = product.subcategory ? humanizeToken(product.subcategory) : "";
  if (category === "grooming" && subcategory === "shampoo") return "grooming shampoo";
  if (subcategory && !category.includes(subcategory)) return `${category} ${subcategory}`;
  return subcategory || category || "product";
}

function getProductDisplayName(product: MockProduct) {
  if (!product.brand || product.name.toLowerCase().includes(product.brand.toLowerCase())) return product.name;
  return `${product.brand} ${product.name}`;
}

function humanizeToken(value: string) {
  return value.replace(/_/g, " ").toLowerCase().trim();
}

function formatList(values: string[]) {
  const normalized = normalizeList(values);
  if (normalized.length <= 1) return normalized[0] || "";
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(", ")}, and ${normalized[normalized.length - 1]}`;
}

