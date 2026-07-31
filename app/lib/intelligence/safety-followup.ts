import type { SafetyFollowupResult } from "../ai-analysis";
import type { IntelligenceSafetyLevel } from "./types";

export type IntelligenceSafetyFollowup = {
  safetyLevel: IntelligenceSafetyLevel;
  summary: string;
  reasoningSummary: string;
  immediateAction: string | null;
  watchFor: string[];
  followUpQuestions: string[];
  shoppingSuppressed: boolean;
  confidence: "low" | "medium" | "high";
};

const safetyLevels = ["routine", "monitor", "urgent", "emergency", "recently_resolved"] as const;
const confidenceLevels = ["low", "medium", "high"] as const;

export const intelligenceSafetyFollowupJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["safetyLevel", "summary", "reasoningSummary", "immediateAction", "watchFor", "followUpQuestions", "shoppingSuppressed", "confidence"],
  properties: {
    safetyLevel: { type: "string", enum: safetyLevels },
    summary: { type: "string" },
    reasoningSummary: { type: "string" },
    immediateAction: { type: ["string", "null"] },
    watchFor: { type: "array", maxItems: 6, items: { type: "string" } },
    followUpQuestions: { type: "array", maxItems: 3, items: { type: "string" } },
    shoppingSuppressed: { type: "boolean" },
    confidence: { type: "string", enum: confidenceLevels },
  },
} as const;

export function parseIntelligenceSafetyFollowup(value: unknown): IntelligenceSafetyFollowup | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<IntelligenceSafetyFollowup>;
  if (!safetyLevels.includes(draft.safetyLevel as IntelligenceSafetyLevel)
    || typeof draft.summary !== "string" || !draft.summary.trim()
    || typeof draft.reasoningSummary !== "string"
    || !(typeof draft.immediateAction === "string" || draft.immediateAction === null)
    || !isStringArray(draft.watchFor) || !isStringArray(draft.followUpQuestions)
    || typeof draft.shoppingSuppressed !== "boolean"
    || !confidenceLevels.includes(draft.confidence as IntelligenceSafetyFollowup["confidence"])) return null;
  return {
    safetyLevel: draft.safetyLevel as IntelligenceSafetyLevel,
    summary: draft.summary.trim(),
    reasoningSummary: draft.reasoningSummary.trim(),
    immediateAction: draft.immediateAction?.trim() || null,
    watchFor: draft.watchFor.slice(0, 6),
    followUpQuestions: draft.followUpQuestions.slice(0, 3),
    shoppingSuppressed: draft.shoppingSuppressed,
    confidence: draft.confidence as IntelligenceSafetyFollowup["confidence"],
  };
}

export function adaptSafetyFollowupToLegacy(value: IntelligenceSafetyFollowup): SafetyFollowupResult {
  const urgent = value.safetyLevel === "urgent" || value.safetyLevel === "emergency";
  const paused = value.shoppingSuppressed && !urgent;
  return {
    decision: urgent ? "urgent_vet" : paused ? "pause_products" : "show_products",
    urgency: urgent ? "urgent" : paused || value.safetyLevel === "monitor" ? "soon" : "none",
    summary: value.summary,
    reasons: [value.reasoningSummary, value.immediateAction || "", ...value.watchFor].filter(Boolean).slice(0, 6),
    safeToShowProducts: !value.shoppingSuppressed,
    productCautionLabel: value.shoppingSuppressed ? "Care guidance comes first" : "Review for your pet",
    memorySuggestions: [],
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
