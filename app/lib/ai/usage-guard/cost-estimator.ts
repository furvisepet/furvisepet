import type { AiModelPrice, ProviderUsage } from "./types";

export const AI_MODEL_PRICING: Record<string, AiModelPrice> = {
  "gpt-5.4-mini": {
    cachedInputMicrodollarsPerMillionTokens: 75_000,
    effectiveDate: "2026-07-29",
    inputMicrodollarsPerMillionTokens: 750_000,
    model: "gpt-5.4-mini",
    outputMicrodollarsPerMillionTokens: 4_500_000,
    source: "Operator-verified OpenAI Standard pricing: https://developers.openai.com/api/docs/pricing",
  },
};

export function getModelPrice(model: string) { return AI_MODEL_PRICING[model] || null; }

export function estimateProviderCostMicrodollars(model: string, usage: ProviderUsage) {
  const price = getModelPrice(model);
  if (!price) return null;
  const cached = Math.max(0, Math.min(usage.inputTokens, usage.cachedInputTokens || 0));
  const uncached = Math.max(0, usage.inputTokens - cached);
  return ceilDiv(uncached * price.inputMicrodollarsPerMillionTokens, 1_000_000)
    + ceilDiv(cached * (price.cachedInputMicrodollarsPerMillionTokens ?? price.inputMicrodollarsPerMillionTokens), 1_000_000)
    + ceilDiv(Math.max(0, usage.outputTokens) * price.outputMicrodollarsPerMillionTokens, 1_000_000);
}

export function estimateInputTokens(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 3));
}

function ceilDiv(value: number, divisor: number) { return Math.ceil(value / divisor); }
