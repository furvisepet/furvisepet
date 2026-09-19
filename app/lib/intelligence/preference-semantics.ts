export type PreferencePolarity = "prefer" | "avoid";

export type NormalizedPreferenceSemantic = {
  subjectType: "pet" | "owner";
  subjectId: string | null;
  role: "food_preference";
  object: string;
  polarity: PreferencePolarity;
};

type PreferenceMemoryShape = {
  subjectType: "pet" | "owner";
  subjectId: string | null;
  factKey: string;
  factValue: unknown;
  canonicalConceptKey?: string | null;
  petName?: string | null;
};

export type PreferenceLearningShape = PreferenceMemoryShape & { sourceExcerpt: string };
export type StoredPreferenceShape = PreferenceMemoryShape & { id: string };

/**
 * Normalizes only governed food-preference concepts and explicitly supported
 * legacy food-memory keys. It deliberately performs no fuzzy matching.
 */
export function normalizeKnownPreferenceMemory(input: PreferenceMemoryShape): NormalizedPreferenceSemantic | null {
  const key = normalizeKey(input.factKey);
  const canonical = normalizeKey(input.canonicalConceptKey || "");
  if (!isKnownFoodPreferenceKey(key, canonical)) return null;

  const structured = objectValue(input.factValue);
  const raw = structured.value ?? (typeof input.factValue === "string" ? input.factValue : null);
  if (raw === null) return null;
  const parsed = parseKnownFoodPreferenceValue(String(raw), input.petName || null);
  const object = normalizePreferenceObject(parsed.object, key);
  if (!object) return null;
  const polarity = structured.polarity
    ?? (key === "dislikesfood" || key === "foodavoid" || key === "foodavoidance" || parsed.polarity === "avoid" ? "avoid" : "prefer");
  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    role: "food_preference",
    object,
    polarity,
  };
}

export function preferenceTargetIdentity(semantic: NormalizedPreferenceSemantic) {
  return `${semantic.subjectType}:${semantic.subjectId || "owner"}:${semantic.role}:${semantic.object}`;
}

export function preferenceSemanticIdentity(semantic: NormalizedPreferenceSemantic) {
  return `${preferenceTargetIdentity(semantic)}:${semantic.polarity}`;
}

export function historicalPreferenceTargetIdentity(input: PreferenceMemoryShape) {
  if (normalizeKey(input.factKey) !== "previouspreferredfood" || input.subjectType !== "pet" || !input.subjectId) return null;
  const raw = objectValue(input.factValue).value ?? (typeof input.factValue === "string" ? input.factValue : null);
  const object = raw === null ? "" : normalizeObject(String(raw));
  return object ? preferenceTargetIdentity({ subjectType: "pet", subjectId: input.subjectId, role: "food_preference", object, polarity: "prefer" }) : null;
}

export function planPreferenceSupersession(
  learnings: readonly PreferenceLearningShape[],
  stored: readonly StoredPreferenceShape[],
) {
  const targets = new Set<string>();
  for (const learning of learnings) {
    const historicalTarget = historicalPreferenceTargetIdentity(learning);
    if (historicalTarget) targets.add(historicalTarget);
    const semantic = normalizeKnownPreferenceMemory(learning);
    if (!semantic || semantic.subjectType !== "pet" || !semantic.subjectId) continue;
    if (semantic.polarity === "avoid") targets.add(preferenceTargetIdentity(semantic));
    if (semantic.polarity === "prefer") {
      for (const object of explicitlyReplacedPreferenceValues(learning.sourceExcerpt)) {
        targets.add(preferenceTargetIdentity({ ...semantic, object }));
      }
    }
  }
  return stored.flatMap((row) => {
    const semantic = normalizeKnownPreferenceMemory(row);
    return semantic?.polarity === "prefer" && targets.has(preferenceTargetIdentity(semantic)) ? [row.id] : [];
  });
}

function isKnownFoodPreferenceKey(key: string, canonical: string) {
  return canonical === "food_preference"
    || key === "likesfood"
    || key === "dislikesfood"
    || key === "foodprefer"
    || key === "foodpreference"
    || key === "foodavoid"
    || key === "foodavoidance"
    || key === "food_preference"
    || key === "preferredfood"
    || key === "treatpreference"
    || key === "treat_preference"
    || key.startsWith("food_preference_")
    || key.startsWith("treat_preference_")
    || key.startsWith("petfoodpreference");
}

function objectValue(value: unknown): { value: string | null; polarity: PreferencePolarity | null } {
  if (!value || typeof value !== "object") return { value: null, polarity: null };
  const record = value as Record<string, unknown>;
  return {
    value: typeof record.value === "string" ? record.value : null,
    polarity: record.preference === "avoid" ? "avoid" : record.preference === "prefer" ? "prefer" : null,
  };
}

function parseKnownFoodPreferenceValue(value: string, petName: string | null) {
  const clean = value.normalize("NFKC").replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();
  const subject = petName ? `(?:${escapeRegex(petName)}|he|she|they|it)` : "[\\p{L}\\p{N}'-]+";
  const match = new RegExp(`^(?:${subject}\\s+)?(doesn't like|does not like|dislikes?|avoids?|likes?|prefers?)\\s+(.+)$`, "iu").exec(clean);
  if (!match) return { object: clean, polarity: null as PreferencePolarity | null };
  return {
    object: match[2],
    polarity: /^(?:doesn't like|does not like|dislike|avoid)/i.test(match[1]) ? "avoid" as const : "prefer" as const,
  };
}

function normalizeObject(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizePreferenceObject(value: string, key: string) {
  const normalized = normalizeObject(value).replace(/\s+anymore$/, "").trim();
  return /^treat_?preference(?:_|$)/.test(key)
    ? normalized.replace(/\s+(?:(?:dog|cat)\s+)?treats?$/, "").trim()
    : normalized;
}

function explicitlyReplacedPreferenceValues(value: string) {
  const patterns = [
    /(?:doesn't|does not|no longer)\s+like\s+([^,.!?;]+)/ig,
    /instead\s+of\s+([^,.!?;]+)/ig,
    /used\s+to\s+(?:like|prefer)\s+([^,.!?;]+?)(?:\s+but\s+now\b|[.!?]|$)/ig,
  ];
  return patterns.flatMap((pattern) => [...value.matchAll(pattern)].map((match) => normalizeObject(match[1])));
}

function normalizeKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
