import { AiAdmissionError } from "./usage-guard/errors.ts";
// Exact IDs only. Never dispatch an unpriced alias or unreviewed snapshot.
// Legacy non-5.4 IDs remain accepted by isolated offline test fixtures;
// production admission separately requires a verified price.
export const FURVISE_APPROVED_AI_MODELS = Object.freeze([
  "gpt-6-luna",
  "gpt-6.1-terra",
  "gpt-5-mini",
  "gpt-4.1-mini",
] as const);

export function requireApprovedAiModel(model: unknown): asserts model is string {
  if (typeof model !== "string" || !FURVISE_APPROVED_AI_MODELS.some(approved => approved === model)) {
    throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unapproved_provider_model");
  }
}
