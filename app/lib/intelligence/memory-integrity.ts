import type { IntelligenceLearning, FurviseMemoryRow } from "./types.ts";

export type MemoryScope = "pet" | "user";
export type MemoryKind = "behavior" | "preference" | "routine" | "diet" | "temperament" | "other";
export type MemoryProvenance = "owner_reported" | "explicit_preference" | "explicit_remember_request";
export type SupportedPreferenceKey = "preferred_language" | "preferred_units" | "communication_style" | "preferred_retailer" | "monthly_pet_supply_budget";

export type TypedMemoryCandidate = {
  scope: MemoryScope;
  kind: MemoryKind;
  content: string;
  provenance: MemoryProvenance;
  subjectId: string | null;
  factKey: string;
  sourceExcerpt: string;
};

export type MemoryCandidateDecision =
  | { accepted: true; candidate: TypedMemoryCandidate; learning: IntelligenceLearning }
  | { accepted: false; reason: string };

type MemorySemanticShape = Pick<FurviseMemoryRow,
  "category" | "fact_key" | "fact_value" | "pet_id" | "subject_type">;
type StoredMemoryShape = MemorySemanticShape & Pick<FurviseMemoryRow, "source_excerpt">;

const machineScalar = /^(?:true|false|null|undefined|yes|no|active|inactive|archived|deceased|dead|passed away|unknown|pending|confirmed|resolved|rejected|approved)$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const standaloneNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const serializedStructure = /^(?:\{[\s\S]*\}|\[[\s\S]*\])$/;
const lifecycleKey = /(?:^|_)(?:lifecycle|lifecycle_status|status|death_reported|deceased|deceased_at|archived|archived_at|active|lifecycle_changed_at)(?:$|_)/i;
const authoritativeProfileKey = /^(?:species|breed|sex|age|age_value|age_unit|weight|weight_value|weight_unit|selected_pet|pet_id|user_id)$/i;
const machineKey = /(?:^|_)(?:request_id|attempt_id|route_type|safety_level|requires_followup|has_concern|confirmation_state|action_status|selected_pet)(?:$|_)/i;
const lifecycleCategory = /^(?:lifecycle|profile_lifecycle|pet_status|status)$/i;
const nonMemoryCategory = /^(?:symptom|diagnosis|medication|care|care_history|current_state|temporary_state|application_action|classifier|safety)$/i;
const explicitRemember = /\b(?:remember|save|keep (?:this|that) in mind|note for later)\b/i;
const preferenceKey = /(?:preference|preferred|prefers|likes|dislikes|avoid|language|communication_style|units|retailer|budget|spending_limit)/i;
const supportedPreferenceCategories = new Set([
  "communicationpreference", "ownerpreference", "preference", "preferences", "userpreference",
]);
const supportedShoppingPreferenceCategories = new Set(["budgetpreference", "ownerpreference", "preference", "preferences", "retailerpreference", "shopping", "shoppingpreference", "userpreference"]);
const supportedLanguageNames = new Set([
  "arabic", "bengali", "catalan", "chinese", "czech", "danish", "dutch", "english", "finnish",
  "french", "german", "greek", "hebrew", "hindi", "hungarian", "indonesian", "italian", "japanese",
  "korean", "malay", "norwegian", "persian", "polish", "portuguese", "punjabi", "romanian", "russian",
  "spanish", "swedish", "tagalog", "thai", "turkish", "ukrainian", "urdu", "vietnamese",
]);
const communicationStyleDescriptors = new Set([
  "brief", "calm", "casual", "concise", "detailed", "direct", "friendly", "gentle", "practical",
  "short", "simple", "thorough", "warm",
]);
const communicationStyleGrammar = new Set([
  "and", "answer", "answers", "be", "communication", "concise", "friendly", "i", "keep", "me", "more",
  "my", "please", "prefer", "prefers", "response", "responses", "style", "the", "to", "tone", "want",
  "wants", ...communicationStyleDescriptors,
]);
const ordinaryLowValue = /\b(?:sleeps? on (?:my|the) (?:head|pillow|bed)|wants? attention|follows? me around|ordinary play|plays? with|one[- ]off hiss|affectionate)\b/i;
const uncertainty = ["sometimes", "usually", "often", "occasionally", "may", "might", "possibly", "recently", "seems", "appears"] as const;

const lifecycleIdentifierWords = [
  ["active"], ["inactive"], ["archived"], ["archived", "at"], ["deceased"], ["deceased", "at"],
  ["death", "reported"], ["lifecycle"], ["lifecycle", "changed", "at"], ["lifecycle", "status"], ["status"],
  ["pending"], ["confirmed"], ["resolved"], ["rejected"], ["approved"],
] as const;
const profileIdentifierWords = [
  ["species"], ["breed"], ["sex"], ["age"], ["age", "value"], ["age", "unit"],
  ["weight"], ["weight", "value"], ["weight", "unit"], ["pet", "id"], ["user", "id"],
] as const;
const machineIdentifierWords = [
  ["request", "id"], ["attempt", "id"], ["route", "type"], ["safety", "level"],
  ["requires", "followup"], ["has", "concern"], ["has", "behavior", "change"],
  ["confirmation", "state"], ["action", "status"], ["selected", "pet"],
] as const;
const nonMemoryCategoryWords = [
  ["symptom"], ["diagnosis"], ["medication"], ["care"], ["care", "history"],
  ["current", "state"], ["temporary", "state"], ["application", "action"], ["classifier"], ["safety"],
] as const;

export function prepareTypedMemoryCandidate(
  learning: IntelligenceLearning,
  currentMessage: string,
  authorizedPetIds: readonly string[],
  options: { explicitPreferenceIntent?: boolean } = {},
): MemoryCandidateDecision {
  const preference = prepareSupportedPreference(learning, currentMessage, options.explicitPreferenceIntent === true);
  if (preference.matched && !preference.accepted) return rejected(preference.reason);
  const governedLearning = preference.matched && preference.accepted ? preference.learning : learning;
  const factKey = normalizeKey(governedLearning.factKey);
  const category = normalizeKey(governedLearning.category);
  if (!factKey) return rejected("empty_fact_key");
  if (isLifecycleOrAuthoritativeState(category, factKey, governedLearning.factValue)) return rejected("authoritative_state_is_not_memory");
  if (isMachineIdentifier(factKey)) return rejected("machine_state_is_not_memory");
  if (isNonMemoryCategory(category)) return rejected("wrong_persistence_destination");
  if (governedLearning.subjectType === "pet" && governedLearning.subjectId && !authorizedPetIds.includes(governedLearning.subjectId)) return rejected("wrong_pet");
  if (governedLearning.subjectType === "pet" && !governedLearning.subjectId && authorizedPetIds.length !== 1) return rejected("ambiguous_pet");
  if (governedLearning.subjectType === "owner" && !preference.matched) return rejected("owner_facts_require_preference_storage");

  const semantic = semanticContent(governedLearning.factValue, factKey, category);
  if (!semantic.content) return rejected(semantic.reason || "non_semantic_machine_value");
  if (!hasHumanSemanticContent(semantic.content, factKey, category)) return rejected("memory_lacks_human_semantic_content");
  if (!governedLearning.sourceExcerpt.trim() || !includesEvidence(currentMessage, governedLearning.sourceExcerpt)) return rejected("source_excerpt_not_explicit");
  const kind = memoryKind(category, factKey);
  if (kind !== "preference" && !preservesUncertainty(governedLearning.sourceExcerpt, semantic.content)) return rejected("owner_uncertainty_not_preserved");
  if (!explicitRemember.test(currentMessage) && ordinaryLowValue.test(`${governedLearning.sourceExcerpt} ${semantic.content}`)) return rejected("low_value_everyday_observation");

  const scope = governedLearning.subjectType === "pet" ? "pet" : "user";
  const provenance: MemoryProvenance = explicitRemember.test(currentMessage)
    ? "explicit_remember_request"
    : kind === "preference" ? "explicit_preference" : "owner_reported";
  const content = cleanContent(semantic.content);
  return {
    accepted: true,
    candidate: {
      scope, kind, content, provenance,
      subjectId: scope === "pet" ? governedLearning.subjectId || authorizedPetIds[0] || null : null,
      factKey,
      sourceExcerpt: cleanContent(governedLearning.sourceExcerpt),
    },
    learning: {
      ...governedLearning,
      subjectId: scope === "pet" ? governedLearning.subjectId || authorizedPetIds[0] || null : null,
      factKey,
      factValue: content,
      sourceExcerpt: cleanContent(governedLearning.sourceExcerpt),
    },
  };
}

export function isEligibleStoredMemory(memory: StoredMemoryShape) {
  const factKey = normalizeKey(memory.fact_key);
  const category = normalizeKey(memory.category);
  if (isLifecycleOrAuthoritativeState(category, factKey, memory.fact_value) || isMachineIdentifier(factKey) || isNonMemoryCategory(category)) return false;
  if (memory.subject_type === "pet" && !memory.pet_id) return false;
  if (memory.subject_type === "owner" && !isSupportedStoredPreference(memory)) return false;
  const semantic = semanticContent(memory.fact_value, factKey, category);
  return Boolean(semantic.content && hasHumanSemanticContent(semantic.content, factKey, category));
}

export function supportedPreferenceDecision(input: {
  category: string;
  factKey: string;
  factValue: unknown;
  sourceExcerpt: string;
  currentMessage: string;
  subjectType: "pet" | "owner";
}) {
  const learning = {
    ...input,
    subjectId: null,
    confidence: 1,
    importance: "high" as const,
    durability: "durable" as const,
    action: "create" as const,
  };
  return prepareSupportedPreference(learning, input.currentMessage);
}

export function isEligibleLegacyMemory(memory: { type?: string | null; text?: string | null }) {
  const text = cleanContent(memory.text || "");
  const terms = text.split(/\s+/).filter(Boolean);
  return invalidLegacyMemoryReason(memory) === null && (terms.length >= 2 || terms.length === 1 && preferenceKey.test(memory.type || ""));
}

export function invalidLegacyMemoryReason(memory: { type?: string | null; text?: string | null }) {
  const type = normalizeKey(memory.type || "");
  const text = cleanContent(memory.text || "");
  if (!text) return "empty_fact";
  if (lifecycleCategory.test(type) || lifecycleKey.test(type) || matchesIdentifierForm(type, lifecycleIdentifierWords)
    || authoritativeProfileKey.test(type) || matchesIdentifierForm(type, profileIdentifierWords)) return "authoritative_state_is_not_memory";
  if (isMachineIdentifier(type)) return "machine_state_is_not_memory";
  if (isNonMemoryCategory(type)) return "wrong_persistence_destination";
  if (machineScalar.test(text)) return "raw_status_or_boolean";
  if (uuid.test(text)) return "machine_identifier";
  if (standaloneNumber.test(text)) return "standalone_number";
  if (serializedStructure.test(text)) return "serialized_structure";
  const legacyPreferenceKey = supportedPreferenceKey(type);
  if (legacyPreferenceKey && !isSupportedPreferenceValue(legacyPreferenceKey, text)) return "invalid_preference_value";
  return null;
}

export function memoryDisplayContent(memory: MemorySemanticShape) {
  const semantic = semanticContent(memory.fact_value, normalizeKey(memory.fact_key || ""), normalizeKey(memory.category || ""));
  return semantic.content ? cleanContent(semantic.content) : "";
}

export function areMemorySemanticsEquivalent(
  left: MemorySemanticShape,
  right: MemorySemanticShape,
) {
  if (left.subject_type !== right.subject_type || left.pet_id !== right.pet_id) return false;
  const leftKind = memoryKind(normalizeKey(left.category), normalizeKey(left.fact_key));
  const rightKind = memoryKind(normalizeKey(right.category), normalizeKey(right.fact_key));
  if (leftKind !== rightKind) return false;
  const leftContent = memoryDisplayContent(left);
  const rightContent = memoryDisplayContent(right);
  if (!leftContent || !rightContent) return false;
  const leftTokens = semanticTokens(leftContent);
  const rightTokens = semanticTokens(rightContent);
  if (leftTokens.size < 2 || rightTokens.size < 2) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const coverage = overlap / Math.min(leftTokens.size, rightTokens.size);
  return coverage >= 0.8 && overlap >= 2;
}

export function invalidStoredMemoryReason(memory: StoredMemoryShape) {
  const factKey = normalizeKey(memory.fact_key);
  const category = normalizeKey(memory.category);
  if (isLifecycleOrAuthoritativeState(category, factKey, memory.fact_value)) return "authoritative_state_is_not_memory";
  if (isMachineIdentifier(factKey)) return "machine_state_is_not_memory";
  if (isNonMemoryCategory(category)) return "wrong_persistence_destination";
  const semantic = semanticContent(memory.fact_value, factKey, category);
  return semantic.content ? null : semantic.reason || "non_semantic_machine_value";
}

function semanticContent(value: unknown, factKey: string, category: string): { content: string | null; reason?: string } {
  if (typeof value === "string") {
    const content = cleanContent(value);
    if (!content) return { content: null, reason: "empty_fact" };
    if (machineScalar.test(content)) return { content: null, reason: "raw_status_or_boolean" };
    if (uuid.test(content)) return { content: null, reason: "machine_identifier" };
    if (standaloneNumber.test(content)) return { content: null, reason: "standalone_number" };
    if (serializedStructure.test(content)) return { content: null, reason: "serialized_structure" };
    if (isMachineAssignment(content)) return { content: null, reason: "non_semantic_machine_value" };
    return { content };
  }
  if (value && typeof value === "object" && !Array.isArray(value) && preferenceKey.test(`${factKey} ${category}`)) {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["conceptKey", "object", "preference", "value"].includes(key))) return { content: null, reason: "untyped_object" };
    const nested = record.object && typeof record.object === "object" && !Array.isArray(record.object)
      ? record.object as Record<string, unknown> : null;
    if (nested && Object.keys(nested).some((key) => !["amount", "name", "text", "value"].includes(key))) return { content: null, reason: "untyped_object" };
    const raw = record.value ?? nested?.value ?? nested?.text ?? nested?.name ?? nested?.amount;
    if ((typeof raw !== "string" && typeof raw !== "number") || !String(raw).trim()) return { content: null, reason: "untyped_object" };
    const object = cleanContent(String(raw));
    if (machineScalar.test(object) || uuid.test(object) || (standaloneNumber.test(object) && !/(?:budget|spending|limit)/i.test(`${factKey} ${category}`))) {
      return { content: null, reason: "non_semantic_machine_value" };
    }
    return { content: `${record.preference === "avoid" ? "dislikes" : "prefers"} ${object}` };
  }
  return { content: null, reason: Array.isArray(value) ? "array_value" : value === null ? "null_value" : `${typeof value}_value` };
}

function prepareSupportedPreference(
  learning: IntelligenceLearning,
  currentMessage: string,
  explicitPreferenceIntent = false,
): { matched: false } | { matched: true; accepted: false; reason: string } | { matched: true; accepted: true; learning: IntelligenceLearning } {
  const key = supportedPreferenceKey(learning.factKey);
  if (!key) return { matched: false };
  if (learning.subjectType !== "owner") return { matched: true, accepted: false, reason: "preference_scope_mismatch" };
  if (!isSupportedPreferenceCategory(key, learning.category)) {
    return { matched: true, accepted: false, reason: "preference_domain_mismatch" };
  }
  if (typeof learning.factValue !== "string" || !isSupportedPreferenceValue(key, learning.factValue)) {
    return { matched: true, accepted: false, reason: "invalid_preference_value" };
  }
  if (!explicitPreferenceIntent && !hasExplicitPreferenceIntent(key, currentMessage, learning.factValue)) {
    return { matched: true, accepted: false, reason: "preference_intent_not_explicit" };
  }
  return {
    matched: true,
    accepted: true,
    learning: {
      ...learning,
      subjectType: "owner",
      subjectId: null,
      category: "communication_preference",
      factKey: key,
      durability: "durable",
    },
  };
}

function isSupportedStoredPreference(memory: StoredMemoryShape) {
  const key = supportedPreferenceKey(memory.fact_key);
  return Boolean(
    key
      && isSupportedPreferenceCategory(key, memory.category)
      && isSupportedPreferenceValue(key, memory.fact_value),
  ) || isLegacyOwnerPetFoodCompatibility(memory);
}

function supportedPreferenceKey(value: string): SupportedPreferenceKey | null {
  const key = canonicalMemoryIdentifier(value);
  if (["preferredlanguage", "languagepreference", "responselanguage", "replylanguage"].includes(key)) return "preferred_language";
  if (["preferredunits", "unitpreference", "unitspreference"].includes(key)) return "preferred_units";
  if (["communicationstyle", "communicationpreference", "responsestyle", "writingstyle"].includes(key)) return "communication_style";
  if (["preferredretailer", "preferredstore", "petfoodstorepreference", "retailerpreference", "storepreference"].includes(key)) return "preferred_retailer";
  if (["monthlypetsupplybudget", "monthlypetsupplyspendinglimit", "petsuppliesmonthlybudgetlimit", "productbudgetpreference", "spendinglimit"].includes(key)) return "monthly_pet_supply_budget";
  return null;
}

function isSupportedPreferenceCategory(key: SupportedPreferenceKey, category: string) {
  const canonical = canonicalMemoryIdentifier(category);
  return key === "preferred_retailer" || key === "monthly_pet_supply_budget"
    ? supportedShoppingPreferenceCategories.has(canonical)
    : supportedPreferenceCategories.has(canonical);
}

function isSupportedPreferenceValue(key: SupportedPreferenceKey, value: unknown) {
  if (typeof value !== "string" && key !== "preferred_retailer" && key !== "monthly_pet_supply_budget") return false;
  const clean = typedPreferenceScalar(value);
  if (!clean || clean.length > 100 || machineScalar.test(clean) || uuid.test(clean) || serializedStructure.test(clean)) return false;
  const normalized = normalizeEvidence(clean);
  if (key === "preferred_language") {
    if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,2}$/i.test(clean)) return true;
    return supportedLanguageNames.has(normalized.replace(/ language$/, ""));
  }
  if (key === "preferred_units") {
    return /^(?:metric|imperial|si|us customary|uk imperial|metric units|imperial units|kilograms?|kg|pounds?|lbs?)$/i.test(normalized);
  }
  if (key === "preferred_retailer") {
    const retailer = typedPreferenceScalar(value);
    if (!retailer || retailer.length > 80 || uuid.test(retailer) || serializedStructure.test(retailer) || machineScalar.test(retailer)) return false;
    const words = retailer.match(/[\p{L}\p{N}][\p{L}\p{N}'&.-]*/gu) || [];
    return words.length >= 1 && words.length <= 8;
  }
  if (key === "monthly_pet_supply_budget") {
    const budget = typedPreferenceScalar(value);
    return Boolean(budget && budget.length <= 100 && (
      /(?:[$€£]\s*\d|\d\s*(?:usd|cad|eur|gbp|dollars?|euros?|pounds?)|\b(?:budget|under|up to|maximum|max)\b)/i.test(budget)
      || typeof value === "object" && standaloneNumber.test(budget)
    ));
  }
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.some((word) => communicationStyleDescriptors.has(word))
    && words.every((word) => communicationStyleGrammar.has(word));
}

function hasExplicitPreferenceIntent(key: SupportedPreferenceKey, message: string, value: string) {
  const normalizedMessage = normalizeEvidence(message);
  const normalizedValue = normalizeEvidence(value).replace(/ language$/, "");
  if (!normalizedMessage || !normalizedValue) return false;
  if (key === "preferred_language") {
    return normalizedMessage.includes(normalizedValue)
      && /\b(?:answer|keep|language|prefer|remember|reply|respond|speak|switch|use)\b/.test(normalizedMessage);
  }
  if (key === "preferred_units") {
    const unitFamily = /metric|si|kilogram|kg/.test(normalizedValue) ? /\b(?:metric|si|kilograms?|kg)\b/
      : /\b(?:imperial|customary|pounds?|lbs?)\b/;
    return unitFamily.test(normalizedMessage)
      && /\b(?:metric|imperial|unit|units|kilogram|kilograms|pound|pounds|prefer|remember|switch|use)\b/.test(normalizedMessage);
  }
  if (key === "preferred_retailer") {
    return normalizedMessage.includes(normalizedValue)
      && /\b(?:buy|prefer|remember|retailer|shop|store)\b/.test(normalizedMessage);
  }
  if (key === "monthly_pet_supply_budget") {
    const amount = normalizedValue.match(/\d+(?:\.\d+)?/)?.[0];
    return Boolean(amount && normalizedMessage.includes(amount))
      && /\b(?:budget|cost|limit|maximum|prefer|remember|spend|under|up to)\b/.test(normalizedMessage);
  }
  const descriptorStems = normalizedValue.split(/\s+/).filter((word) => communicationStyleDescriptors.has(word)).map((word) => word.slice(0, Math.min(word.length, 6)));
  return descriptorStems.some((stem) => normalizedMessage.includes(stem))
    && /\b(?:answer|answers|brief|communication|concise|concisely|detailed|direct|friendly|prefer|remember|response|responses|short|style|tone)\b/.test(normalizedMessage);
}

function typedPreferenceScalar(value: unknown) {
  if (typeof value === "string") return cleanContent(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["object", "preference", "value"].includes(key))) return "";
  const nested = record.object && typeof record.object === "object" && !Array.isArray(record.object)
    ? record.object as Record<string, unknown> : null;
  if (nested && Object.keys(nested).some((key) => !["amount", "name", "text", "value"].includes(key))) return "";
  const raw = record.value ?? nested?.value ?? nested?.text ?? nested?.name ?? nested?.amount;
  return typeof raw === "string" || typeof raw === "number" ? cleanContent(String(raw)) : "";
}

function isLegacyOwnerPetFoodCompatibility(memory: StoredMemoryShape) {
  const key = canonicalMemoryIdentifier(memory.fact_key);
  if (!key.startsWith("petfoodpreference")) return false;
  const content = typedPreferenceScalar(memory.fact_value);
  return Boolean(content && content.length <= 100 && !machineScalar.test(content) && !uuid.test(content) && !serializedStructure.test(content));
}

function isLifecycleOrAuthoritativeState(category: string, factKey: string, value: unknown) {
  if (lifecycleCategory.test(category) || matchesIdentifierForm(category, lifecycleIdentifierWords)
    || lifecycleKey.test(factKey) || matchesIdentifierForm(factKey, lifecycleIdentifierWords)
    || authoritativeProfileKey.test(factKey) || matchesIdentifierForm(factKey, profileIdentifierWords)) return true;
  return typeof value === "string" && machineScalar.test(cleanContent(value)) && /(?:status|state|lifecycle|profile)/i.test(`${category} ${factKey}`);
}

function isMachineIdentifier(value: string) {
  return machineKey.test(value) || matchesIdentifierForm(value, machineIdentifierWords);
}

function isNonMemoryCategory(value: string) {
  return nonMemoryCategory.test(value) || matchesIdentifierForm(value, nonMemoryCategoryWords);
}

function isMachineAssignment(value: string) {
  const match = value.match(/^\s*([\p{L}][\p{L}\p{N}_. -]{0,80})\s*[:=]\s*(true|false|null|undefined|yes|no|active|inactive|archived|deceased|dead|unknown|pending|confirmed|resolved|rejected|approved)\.?\s*$/iu);
  return Boolean(match && (
    isMachineIdentifier(match[1])
    || matchesIdentifierForm(match[1], lifecycleIdentifierWords)
    || matchesIdentifierForm(match[1], profileIdentifierWords)
  ));
}

function hasHumanSemanticContent(content: string, factKey: string, category: string) {
  const terms = content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  if (terms.length >= 2) return true;
  return terms.length === 1 && preferenceKey.test(`${factKey} ${category}`) && !machineScalar.test(content);
}

function preservesUncertainty(source: string, content: string) {
  const sourceText = source.toLowerCase();
  const contentText = content.toLowerCase();
  const markers = uncertainty.filter((marker) => new RegExp(`\\b${marker}\\b`, "i").test(sourceText));
  if (!markers.length) return true;
  return markers.some((marker) => new RegExp(`\\b${marker}\\b`, "i").test(contentText));
}

function memoryKind(category: string, factKey: string): MemoryKind {
  const value = `${category} ${factKey}`;
  if (/temperament|personality/.test(value)) return "temperament";
  if (/prefer|food|diet|nutrition|retailer|budget|language|communication|unit/.test(value)) return /food|diet|nutrition/.test(value) ? "diet" : "preference";
  if (/routine|schedule/.test(value)) return "routine";
  if (/behavior|behaviour|sensitivity|fear|startle|flinch|anxiety/.test(value)) return "behavior";
  return "other";
}

function semanticTokens(value: string) {
  const synonyms: Record<string, string> = {
    approached: "approach", approaches: "approach", approaching: "approach",
    fast: "quick", faster: "quick", quickly: "quick",
    flinch: "startle", flinches: "startle", flinched: "startle", startled: "startle", startles: "startle",
    dislike: "avoid", dislikes: "avoid", avoids: "avoid",
    prefer: "prefer", prefers: "prefer", preferred: "prefer",
  };
  const ignored = new Set(["a", "an", "and", "at", "be", "her", "him", "his", "is", "it", "its", "pet", "she", "he", "the", "they", "to", "when"]);
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) || [])
    .map((token) => synonyms[token] || token.replace(/(?:ing|ed|s)$/i, ""))
    .filter((token) => token.length > 2 && !ignored.has(token)));
}

function includesEvidence(message: string, excerpt: string) {
  const full = normalizeEvidence(message);
  const part = normalizeEvidence(excerpt);
  return part.length >= 2 && full.includes(part);
}

function normalizeEvidence(value: string) { return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(); }
export function normalizeMemoryIdentifier(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function canonicalMemoryIdentifier(value: string) {
  return normalizeMemoryIdentifier(value).replace(/_/g, "");
}

function matchesIdentifierForm(value: string, groups: ReadonlyArray<ReadonlyArray<string>>) {
  const candidate = canonicalMemoryIdentifier(value);
  return groups.some((words) => {
    const canonical = words.join("");
    if (candidate === canonical) return true;
    const missing = canonical.length - candidate.length;
    return missing > 0 && missing <= words.length && isSubsequence(candidate, canonical);
  });
}

function isSubsequence(candidate: string, canonical: string) {
  let candidateIndex = 0;
  for (let index = 0; index < canonical.length && candidateIndex < candidate.length; index += 1) {
    if (canonical[index] === candidate[candidateIndex]) candidateIndex += 1;
  }
  return candidateIndex === candidate.length;
}

function normalizeKey(value: string) { return normalizeMemoryIdentifier(value); }
function cleanContent(value: string) { return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500); }
function rejected(reason: string): MemoryCandidateDecision { return { accepted: false, reason }; }
