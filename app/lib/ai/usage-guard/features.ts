import { ASK_MAX_OUTPUT_TOKENS } from "../ask-provider";
import { OPENAI_OUTPUT_LIMITS } from "../config";
import type { AiFeaturePolicy, AiGuardFeature } from "./types";

export const AI_FEATURE_POLICIES: Record<AiGuardFeature, AiFeaturePolicy> = {
  ask: policy("ask", "FURVISE_AI_ASK_ENABLED", 20_000, 80_000, ASK_MAX_OUTPUT_TOKENS, 2),
  care_plan: policy("care_plan", "FURVISE_AI_CARE_PLAN_ENABLED", 12_000, 48_000, OPENAI_OUTPUT_LIMITS.analysis, 1),
  product_explanation: policy("product_explanation", "FURVISE_AI_PRODUCTS_ENABLED", 12_000, 48_000, 360, 1),
  product_query: policy("product_query", "FURVISE_AI_PRODUCTS_ENABLED", 12_000, 48_000, 520, 1),
  product_question: policy("product_question", "FURVISE_AI_PRODUCTS_ENABLED", 12_000, 48_000, 650, 1),
  safety_followup: policy("safety_followup", "FURVISE_AI_SAFETY_FOLLOWUP_ENABLED", 12_000, 48_000, 650, 1),
  vet_brief: policy("vet_brief", "FURVISE_AI_VET_BRIEF_ENABLED", 40_000, 160_000, 1_800, 1),
};

export function getAiFeaturePolicy(feature: AiGuardFeature) { return AI_FEATURE_POLICIES[feature]; }

function policy(feature: AiGuardFeature, envFlag: string, maxInputTokens: number, maxInputCharacters: number, maxOutputTokens: number, maximumProviderCalls: number): AiFeaturePolicy {
  return { envFlag, feature, maxInputCharacters, maxInputTokens, maxOutputTokens, maximumProviderCalls };
}
