import { normalizeProfile, parsePositiveNumber } from "./petwise";
import type { DogProfile } from "./petwise";

export type AnalysisConfidence = "low" | "moderate" | "high";
export type VetUrgency = "none" | "routine" | "soon" | "urgent";
export type SafetyFollowupDecision = "show_products" | "pause_products" | "urgent_vet";
export type SafetyFollowupUrgency = "none" | "soon" | "urgent";
export type MemorySuggestionType = "profile_fact" | "owner_observation" | "preference";
export type MemorySuggestionConfidence = "verified" | "owner_reported" | "inferred";

export type PetWiseAnalysis = {
  confirmedFacts: string[];
  ownerReportedObservations: string[];
  possibleFactors: string[];
  missingInformation: string[];
  recommendedConcernTags: string[];
  temporaryAvoidIngredients: string[];
  vetAttention: {
    needed: boolean;
    urgency: VetUrgency;
    reason: string;
  };
  confidence: AnalysisConfidence;
  memorySuggestions: {
    type: MemorySuggestionType;
    text: string;
    confidence: MemorySuggestionConfidence;
  }[];
  summary: string;
};

export type StoredAnalysisResult =
  | {
      status: "available";
      analysis: PetWiseAnalysis;
      updatedAt?: string;
    }
  | {
      status: "incomplete_profile";
      message: string;
      missingFields: string[];
      updatedAt?: string;
    }
  | {
      status: "unavailable";
      message: string;
      updatedAt?: string;
    };

export const ANALYSIS_STORAGE_KEY = "petwise:ai-analysis";

export type SafetyFollowupAnswer = {
  question: string;
  answer: string;
};

export type SafetyFollowupResult = {
  decision: SafetyFollowupDecision;
  urgency: SafetyFollowupUrgency;
  summary: string;
  reasons: string[];
  safeToShowProducts: boolean;
  productCautionLabel: string;
  memorySuggestions: {
    type: MemorySuggestionType;
    text: string;
    confidence: MemorySuggestionConfidence;
  }[];
};

export type AnalysisMemoryContext = {
  type: string | null;
  text: string;
  confidence: string | null;
  source: string | null;
};

const confidenceValues: AnalysisConfidence[] = ["low", "moderate", "high"];
const urgencyValues: VetUrgency[] = ["none", "routine", "soon", "urgent"];
const safetyFollowupDecisionValues: SafetyFollowupDecision[] = [
  "show_products",
  "pause_products",
  "urgent_vet",
];
const safetyFollowupUrgencyValues: SafetyFollowupUrgency[] = ["none", "soon", "urgent"];
const memoryTypeValues: MemorySuggestionType[] = [
  "profile_fact",
  "owner_observation",
  "preference",
];
const memoryConfidenceValues: MemorySuggestionConfidence[] = [
  "verified",
  "owner_reported",
  "inferred",
];

export const analysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "confirmedFacts",
    "ownerReportedObservations",
    "possibleFactors",
    "missingInformation",
    "recommendedConcernTags",
    "temporaryAvoidIngredients",
    "vetAttention",
    "confidence",
    "memorySuggestions",
    "summary",
  ],
  properties: {
    confirmedFacts: stringArraySchema(8),
    ownerReportedObservations: stringArraySchema(8),
    possibleFactors: stringArraySchema(8),
    missingInformation: stringArraySchema(8),
    recommendedConcernTags: stringArraySchema(5),
    temporaryAvoidIngredients: stringArraySchema(8),
    vetAttention: {
      type: "object",
      additionalProperties: false,
      required: ["needed", "urgency", "reason"],
      properties: {
        needed: { type: "boolean" },
        urgency: { type: "string", enum: urgencyValues },
        reason: { type: "string" },
      },
    },
    confidence: { type: "string", enum: confidenceValues },
    memorySuggestions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "confidence"],
        properties: {
          type: { type: "string", enum: memoryTypeValues },
          text: { type: "string" },
          confidence: { type: "string", enum: memoryConfidenceValues },
        },
      },
    },
    summary: { type: "string" },
  },
} as const;

export const safetyFollowupJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "urgency",
    "summary",
    "reasons",
    "safeToShowProducts",
    "productCautionLabel",
    "memorySuggestions",
  ],
  properties: {
    decision: { type: "string", enum: safetyFollowupDecisionValues },
    urgency: { type: "string", enum: safetyFollowupUrgencyValues },
    summary: { type: "string" },
    reasons: stringArraySchema(6),
    safeToShowProducts: { type: "boolean" },
    productCautionLabel: { type: "string" },
    memorySuggestions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "confidence"],
        properties: {
          type: { type: "string", enum: memoryTypeValues },
          text: { type: "string" },
          confidence: { type: "string", enum: memoryConfidenceValues },
        },
      },
    },
  },
} as const;

export function validateDogProfileInput(value: unknown): {
  ok: true;
  profile: DogProfile;
} | {
  ok: false;
  message: string;
  missingFields: string[];
} {
  if (!value || typeof value !== "object") {
    return {
      ok: false,
      message: "Furvise needs a main concern before AI analysis can run.",
      missingFields: ["profile"],
    };
  }

  const profile = normalizeProfile(value);
  const missingFields: string[] = [];
  if (!profile.name.trim()) missingFields.push("name");
  if (!profile.species) missingFields.push("species");
  if (!profile.ageUnknown) {
    const age = parsePositiveNumber(profile.age);
    if (!profile.age.trim() || !Number.isFinite(age) || age < 0) {
      missingFields.push("age");
    }
  }
  if (!profile.mainConcern) missingFields.push("main_concern");
  if (profile.mainConcern === "Other" && !profile.otherConcern.trim()) {
    missingFields.push("other_concern");
  }

  if (missingFields.length > 0) {
    return {
      ok: false,
      message: "Furvise needs name, species, age, and a main concern before AI analysis can run.",
      missingFields,
    };
  }

  return { ok: true, profile };
}

export function parseAnalysis(value: unknown): PetWiseAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<PetWiseAnalysis>;
  const confidence = draft.confidence;
  const urgency = draft.vetAttention?.urgency;

  if (
    !isStringArray(draft.confirmedFacts) ||
    !isStringArray(draft.ownerReportedObservations) ||
    !isStringArray(draft.possibleFactors) ||
    !isStringArray(draft.missingInformation) ||
    !isStringArray(draft.recommendedConcernTags) ||
    !isStringArray(draft.temporaryAvoidIngredients) ||
    !draft.vetAttention ||
    typeof draft.vetAttention !== "object" ||
    typeof draft.vetAttention.needed !== "boolean" ||
    !isVetUrgency(urgency) ||
    typeof draft.vetAttention.reason !== "string" ||
    !isAnalysisConfidence(confidence) ||
    !Array.isArray(draft.memorySuggestions) ||
    typeof draft.summary !== "string"
  ) {
    return null;
  }

  const memorySuggestions = draft.memorySuggestions.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const suggestion = item as PetWiseAnalysis["memorySuggestions"][number];
    return (
      memoryTypeValues.includes(suggestion.type) &&
      typeof suggestion.text === "string" &&
      memoryConfidenceValues.includes(suggestion.confidence) &&
      isUsefulMemorySuggestion(suggestion.text)
    );
  });

  return {
    confirmedFacts: draft.confirmedFacts,
    ownerReportedObservations: draft.ownerReportedObservations,
    possibleFactors: draft.possibleFactors,
    missingInformation: draft.missingInformation,
    recommendedConcernTags: draft.recommendedConcernTags,
    temporaryAvoidIngredients: draft.temporaryAvoidIngredients,
    vetAttention: {
      needed: draft.vetAttention.needed,
      urgency,
      reason: draft.vetAttention.reason,
    },
    confidence,
    memorySuggestions,
    summary: draft.summary,
  };
}

export function parseSafetyFollowupResult(value: unknown): SafetyFollowupResult | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<SafetyFollowupResult>;

  if (
    !isSafetyFollowupDecision(draft.decision) ||
    !isSafetyFollowupUrgency(draft.urgency) ||
    typeof draft.summary !== "string" ||
    !isStringArray(draft.reasons) ||
    typeof draft.safeToShowProducts !== "boolean" ||
    typeof draft.productCautionLabel !== "string" ||
    !Array.isArray(draft.memorySuggestions)
  ) {
    return null;
  }

  if (draft.decision !== "show_products" && draft.safeToShowProducts) return null;
  if (draft.decision === "show_products" && !draft.safeToShowProducts) return null;
  if (draft.decision === "urgent_vet" && draft.urgency !== "urgent") return null;
  if (draft.decision === "pause_products" && draft.urgency === "none") return null;

  const memorySuggestions = draft.memorySuggestions.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const suggestion = item as SafetyFollowupResult["memorySuggestions"][number];
    return (
      memoryTypeValues.includes(suggestion.type) &&
      typeof suggestion.text === "string" &&
      memoryConfidenceValues.includes(suggestion.confidence) &&
      isUsefulMemorySuggestion(suggestion.text)
    );
  });

  return {
    decision: draft.decision,
    urgency: draft.urgency,
    summary: draft.summary,
    reasons: draft.reasons,
    safeToShowProducts: draft.safeToShowProducts,
    productCautionLabel: draft.productCautionLabel,
    memorySuggestions,
  };
}

export function parseStoredAnalysis(value: unknown): StoredAnalysisResult | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<StoredAnalysisResult>;
  const updatedAt =
    "updatedAt" in draft && typeof draft.updatedAt === "string" ? draft.updatedAt : undefined;
  if (draft.status === "available") {
    const analysis = parseAnalysis(draft.analysis);
    return analysis ? { status: "available", analysis, ...(updatedAt ? { updatedAt } : {}) } : null;
  }
  if (
    draft.status === "incomplete_profile" &&
    typeof draft.message === "string" &&
    Array.isArray(draft.missingFields)
  ) {
    return {
      status: "incomplete_profile",
      message: draft.message,
      missingFields: draft.missingFields.filter(
        (field): field is string => typeof field === "string",
      ),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }
  if (draft.status === "unavailable" && typeof draft.message === "string") {
    return { status: "unavailable", message: draft.message, ...(updatedAt ? { updatedAt } : {}) };
  }
  return null;
}

export function stampStoredAnalysisResult(
  result: StoredAnalysisResult,
  date = new Date(),
): StoredAnalysisResult {
  return { ...result, updatedAt: date.toISOString() };
}

export function parseAnalysisMemoryContext(value: unknown): AnalysisMemoryContext[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const draft = item as Partial<AnalysisMemoryContext>;
      if (typeof draft.text !== "string" || !draft.text.trim()) return null;
      return {
        type: typeof draft.type === "string" ? draft.type : null,
        text: draft.text,
        confidence: typeof draft.confidence === "string" ? draft.confidence : null,
        source: typeof draft.source === "string" ? draft.source : null,
      };
    })
    .filter((item): item is AnalysisMemoryContext => item !== null);
}

export function buildAnalysisMatcherProfile(
  profile: DogProfile,
  analysis: PetWiseAnalysis | null,
): DogProfile {
  if (!analysis) return profile;

  return {
    ...profile,
    avoidIngredients: mergeUnique([
      ...profile.avoidIngredients,
      ...analysis.temporaryAvoidIngredients,
    ]),
  };
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

function isAnalysisConfidence(value: unknown): value is AnalysisConfidence {
  return confidenceValues.includes(value as AnalysisConfidence);
}

function isVetUrgency(value: unknown): value is VetUrgency {
  return urgencyValues.includes(value as VetUrgency);
}

function isSafetyFollowupDecision(value: unknown): value is SafetyFollowupDecision {
  return safetyFollowupDecisionValues.includes(value as SafetyFollowupDecision);
}

function isSafetyFollowupUrgency(value: unknown): value is SafetyFollowupUrgency {
  return safetyFollowupUrgencyValues.includes(value as SafetyFollowupUrgency);
}

function mergeUnique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function isUsefulMemorySuggestion(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized) return false;

  const weakPatterns = [
    /\b(name|species|breed|age|weight|current food|budget|main concern|avoidances?)\s+(is|are|:)\b/,
    /\b(dog|cat)\s+profile\b/,
    /\bage\s+(is\s+)?(unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bweight\s+(is\s+)?(unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bcurrent food\s+(is\s+)?(unknown|not known|not sure|i'?m not sure|missing|not provided|unspecified)\b/,
    /\bfood\s+(is\s+)?(unknown|not known|not sure|i'?m not sure|missing|not provided|unspecified)\b/,
    /\bbreed\s+(is\s+)?(mixed\s*\/?\s*unknown|unknown|not known|not sure|missing|not provided|unspecified)\b/,
    /\bmixed\s*\/\s*unknown\b/,
  ];

  return !weakPatterns.some((pattern) => pattern.test(normalized));
}
