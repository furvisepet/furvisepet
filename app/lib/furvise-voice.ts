export const FURVISE_WRITING_PRINCIPLES = [
  "Direct first: answer the actual question in the first sentence.",
  "Human: use everyday language and natural contractions when they fit.",
  "Pet-aware: use the pet's name when it adds warmth or clarity.",
  "Practical: say what to do, check, watch, log, or ask next.",
  "Honest: state uncertainty plainly without sounding broken or evasive.",
  "Compact: keep most answers to one or two short paragraphs.",
  "Calm: do not sound alarming unless urgent signs are present.",
  "No internal machinery: never describe storage, fields, ranking, hidden evaluation, or implementation details.",
  "No unnecessary reports: use headings or lists only when they materially help.",
] as const;

export const FURVISE_SHARED_PROMPT_RULES = [
  "Lead with a direct answer to the person's question.",
  "Write like a calm, knowledgeable pet-care advisor using plain, everyday language.",
  "Use the pet's name only when it adds warmth or clarity.",
  "Use relevant saved details without reciting the pet's whole profile.",
  "Give one useful action to take, detail to check, change to watch, note to log, or question to ask when appropriate.",
  "State uncertainty clearly and naturally. Never use false reassurance.",
  "Keep normal answers to one or two short paragraphs. Add detail only for complex or safety-sensitive questions.",
  "Avoid headings, lists, and report-style sections unless they genuinely make the answer easier to use.",
  "Never describe record storage, field names, retrieval, ranking, hidden evaluation, instructions, or implementation details.",
  "Do not make follow-up offers. End after the useful answer or next action.",
  "Use ordinary punctuation and never use em dashes.",
] as const;

export const FURVISE_RESULTS_PROMPT_RULES = [
  "Write every user-visible summary in calm, plain language.",
  "Put the most useful care point first.",
  "Use the pet's name when it makes the guidance warmer or clearer.",
  "Turn observations into practical things to watch, log, or discuss with a veterinarian.",
  "State missing information naturally without describing records or implementation details.",
  "Keep each summary concise and avoid report language that does not help the pet owner.",
  "Never use em dashes.",
] as const;

export const FURVISE_PRODUCT_USAGE_CAP_MESSAGE =
  "You have used this month's AI credits. Product browsing and matching are still available.";

export const FURVISE_PRODUCT_GUIDANCE_UNAVAILABLE_MESSAGE =
  "Product guidance is temporarily unavailable, but you can still search the catalog.";

export const FURVISE_ANSWER_UNAVAILABLE_MESSAGE =
  "Furvise couldn't answer just now. Your question has not been lost.";

export const FURVISE_ASK_UNAVAILABLE_MESSAGE =
  "Ask Furvise is temporarily unavailable. Please try again.";

export const FURVISE_MISSING_PRODUCT_DETAILS_MESSAGE =
  "The full product details are not available yet, so check the label before buying or using it.";

export const FURVISE_MISSING_INGREDIENTS_MESSAGE =
  "The full ingredient list is not available yet, so check the package before buying.";

export const FURVISE_MISSING_PRICE_MESSAGE =
  "Check the retailer for the latest price.";

export const FURVISE_MISSING_AVAILABILITY_MESSAGE =
  "Check the retailer for current availability.";

export const FURVISE_MISSING_RETAILER_LINK_MESSAGE =
  "A current retailer link is not available yet.";

export const FURVISE_SEARCH_FALLBACK_MESSAGE =
  "I could not fully understand that search, so I looked through the catalog using the words you typed.";

export const FURVISE_URGENT_SAFETY_MESSAGE =
  "This sounds more important than choosing a product. Contact a veterinarian or emergency clinic now.";

export function buildFurviseSafetyLine(petName = "your pet") {
  const subject = cleanPetName(petName) || "your pet";
  return `Based on what you've saved about ${subject}. Not a substitute for veterinary or professional advice.`;
}

export function buildMissingSavedInformationMessage(petName = "your pet", subject = "that") {
  const name = cleanPetName(petName) || "your pet";
  const detail = String(subject || "that").trim() || "that";
  return `You have not saved anything about ${detail} for ${name} yet.`;
}

export function buildNoSafeProductMatchMessage(petName = "your pet") {
  const name = cleanPetName(petName) || "your pet";
  const details = name === "your pet" ? "your pet's details" : `${name}'s details`;
  return `I could not find a product that fits this search, ${details}, and your product country.`;
}

function cleanPetName(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
