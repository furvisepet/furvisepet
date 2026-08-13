import type { FurviseMemoryRow } from "./intelligence/types.ts";
import { calculateMemoryFreshness, type FreshnessStatus } from "./intelligence/memory-freshness/calculate-memory-freshness.ts";
import type { DogMemoryRow } from "./supabase.ts";
import { normalizeKnownPreferenceMemory, preferenceTargetIdentity } from "./intelligence/preference-semantics.ts";

export type RememberedDetail = {
  id: string;
  source: "canonical" | "legacy";
  subject: "pet" | "owner";
  fact: string;
  editableValue: string;
  category: string;
  freshness: FreshnessStatus;
  needsConfirmation: boolean;
  lastConfirmedAt: string;
};

export type RememberedDetails = {
  pet: RememberedDetail[];
  owner: RememberedDetail[];
  all: RememberedDetail[];
};

const hiddenCategories = new Set(["diagnosis", "medication", "symptom", "temporary symptom"]);

export function buildRememberedDetails({
  canonical,
  legacy = [],
  now = new Date(),
  petName,
}: {
  canonical: FurviseMemoryRow[];
  legacy?: DogMemoryRow[];
  now?: Date;
  petName: string;
}): RememberedDetails {
  const projectedCanonical = projectEffectiveCanonicalMemories(canonical, petName, now);
  const current = projectedCanonical.flatMap((memory) => {
    if (!isVisibleCanonicalMemory(memory, now)) return [];
    const freshness = calculateMemoryFreshness(memory, now);
    const subject = projectedSubject(memory, petName);
    if (!subject) return [];
    return [{
      id: memory.id,
      source: "canonical" as const,
      subject,
      fact: formatCanonicalMemory(memory, petName),
      editableValue: factValueText(memory.fact_value),
      category: formatCategory(memory.category),
      freshness: freshness.freshnessStatus,
      needsConfirmation: freshness.needsConfirmation || freshness.freshnessStatus === "aging",
      lastConfirmedAt: memory.last_confirmed_at,
    }];
  });
  const seen = new Set(current.map((memory) => normalizeText(memory.fact)));
  const seenSemantics = new Set(projectedCanonical.map((memory) => semanticIdentity(memory, petName)).filter(Boolean));
  const compatible = legacy.flatMap((memory) => {
    const fact = memory.text.replace(/\s+/g, " ").trim();
    const semantics = semanticIdentityFromText(fact, petName, memory.dog_profile_id);
    if (!fact || hiddenCategories.has((memory.type || "").toLowerCase().trim()) || seen.has(normalizeText(fact))
      || Boolean(semantics && seenSemantics.has(semantics))) return [];
    seen.add(normalizeText(fact));
    return [{
      id: memory.id,
      source: "legacy" as const,
      subject: "pet" as const,
      fact,
      editableValue: fact,
      category: formatCategory(memory.type || "detail"),
      freshness: "fresh" as const,
      needsConfirmation: false,
      lastConfirmedAt: memory.created_at,
    }];
  });
  const all = [...current, ...compatible].sort((a, b) => Date.parse(b.lastConfirmedAt) - Date.parse(a.lastConfirmedAt));
  return { all, pet: all.filter((memory) => memory.subject === "pet"), owner: all.filter((memory) => memory.subject === "owner") };
}

export function isVisibleCanonicalMemory(memory: FurviseMemoryRow, now = new Date()) {
  if (memory.status !== "active") return false;
  if (memory.freshness_class === "episode_bound" || memory.freshness_class === "short_lived") return false;
  if (memory.durability === "temporary" || hiddenCategories.has(memory.category.toLowerCase().trim())) return false;
  return calculateMemoryFreshness(memory, now).freshnessStatus !== "expired";
}

export function formatCanonicalMemory(memory: FurviseMemoryRow, petName: string) {
  const value = factValueText(memory.fact_value);
  const key = compact(memory.fact_key);
  if (key === "prefersdentalchewtexture") return `${petName} prefers ${value.replace(/^softer\b/i, "soft")}`;
  if (key === "preferredstore" || key === "preferredretailer") return `You usually shop at ${value}`;
  if (key === "productbudgetpreference" || key === "budgetpreference") {
    const clearer = value.replace(/unless there is a much better option/i, "unless there is a clearly better option");
    return `You prefer products ${clearer}`;
  }
  const food = foodPreferenceSemantics(memory, petName);
  if (food) return `${petName} ${food.polarity === "avoid" ? "dislikes" : "prefers"} ${food.object}.`;
  if (sleepingArrangement(key)) return `${petName} sleeps ${sleepingPhrase(value)}.`;
  if (memory.subject_type === "owner") return `You shared this preference: ${sentenceValue(value)}`;
  return `${petName}: ${sentenceValue(value)}`;
}

function factValueText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "value", "name", "preference"]) {
      if (typeof record[key] === "string") return record[key].trim();
    }
  }
  return "a remembered detail";
}

function formatCategory(value: string) {
  const category = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return category ? category[0].toUpperCase() + category.slice(1) : "Detail";
}

function normalizeText(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function projectEffectiveCanonicalMemories(memories: FurviseMemoryRow[], petName: string, now: Date) {
  const ordered = memories.filter((memory) => isVisibleCanonicalMemory(memory, now))
    .sort((left, right) => Date.parse(right.last_confirmed_at) - Date.parse(left.last_confirmed_at));
  const seen = new Set<string>();
  const replacedIdentities = new Set<string>();
  return ordered.filter((memory) => {
    const identity = semanticIdentity(memory, petName);
    const semantics = foodPreferenceSemantics(memory, petName);
    if (identity && seen.has(identity)) return false;
    if (identity && semantics?.polarity === "prefer" && replacedIdentities.has(identity)) return false;
    if (identity) seen.add(identity);
    if (semantics && isExplicitCorrection(memory.source_excerpt || "")) {
      for (const replaced of explicitlyReplacedFoodObjects(memory.source_excerpt || "", petName)) {
        replacedIdentities.add(preferenceTargetIdentity({ ...semantics, object: normalizeText(replaced) }));
      }
    }
    return true;
  });
}

function projectedSubject(memory: FurviseMemoryRow, petName: string): "pet" | "owner" | null {
  if (memory.subject_type === "pet") return memory.pet_id ? "pet" : null;
  const key = compact(memory.fact_key);
  if (!key.startsWith("petfoodpreference")) return "owner";
  const petKey = compact(petName);
  return petKey && key.includes(petKey) ? "pet" : null;
}

function semanticIdentity(memory: FurviseMemoryRow, petName: string) {
  const food = foodPreferenceSemantics(memory, petName);
  if (food) return preferenceTargetIdentity(food);
  const key = compact(memory.fact_key);
  if (sleepingArrangement(key)) return `${projectedSubject(memory, petName)}:sleeping_arrangement`;
  return `${projectedSubject(memory, petName)}:${key}:${normalizeText(factValueText(memory.fact_value))}`;
}

function semanticIdentityFromText(value: string, petName: string, petId: string) {
  const semantic = normalizeKnownPreferenceMemory({
    subjectType: "pet", subjectId: petId, factKey: "food_preference", factValue: value, petName,
  });
  return semantic ? preferenceTargetIdentity(semantic) : null;
}

function foodPreferenceSemantics(memory: FurviseMemoryRow, petName: string) {
  const subject = projectedSubject(memory, petName);
  if (!subject) return null;
  return normalizeKnownPreferenceMemory({
    subjectType: subject,
    subjectId: subject === "pet" ? memory.pet_id || `legacy-name:${compact(petName)}` : null,
    factKey: memory.fact_key,
    factValue: memory.fact_value,
    petName,
  });
}

function sleepingArrangement(key: string) {
  return key.includes("sleepingarrangement") || key.includes("sleeparrangement");
}

function sleepingPhrase(value: string) {
  const clean = value.replace(/[.!]+$/, "").trim();
  if (/^(?:in|on|at|under|near)\b/i.test(clean)) return clean;
  if (/^(?:a|an|the)\b/i.test(clean)) return `in ${clean}`;
  return `in ${/^[aeiou]/i.test(clean) ? "an" : "a"} ${clean}`;
}

function sentenceValue(value: string) {
  const clean = value.replace(/[.!]+$/, "").trim();
  return `${clean || "a remembered detail"}.`;
}

function compact(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function isExplicitCorrection(value: string) { return /\b(?:actually|instead|correction|not anymore|no longer)\b/i.test(value); }
function explicitlyReplacedFoodObjects(value: string, petName: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const subject = `(?:${escapeRegex(petName)}|he|she|they|my pet)`;
  const patterns = [
    new RegExp(`${subject}\\s+(?:doesn't|does not|no longer)\\s+like\\s+([^,.!?;]+)`, "ig"),
    /instead\s+of\s+([^,.!?;]+)/ig,
  ];
  return patterns.flatMap((pattern) => [...normalized.matchAll(pattern)].map((match) => match[1].trim()));
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
