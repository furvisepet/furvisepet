import { AiAdmissionError } from "./usage-guard/errors.ts";
// Exact IDs only. Never dispatch an unpriced alias or unreviewed snapshot.
// Exact and priced model IDs only. Full-size family members, aliases and
// unreviewed snapshots must fail before any request, retry, repair or review.
export const FURVISE_APPROVED_AI_MODELS = Object.freeze([
  "gpt-5.4-mini",
] as const);

export function requireApprovedAiModel(model: unknown): asserts model is string {
  if (typeof model !== "string" || !FURVISE_APPROVED_AI_MODELS.some(approved => approved === model)) {
    throw new AiAdmissionError("AI_TEMPORARILY_UNAVAILABLE", "unapproved_provider_model");
  }
}
