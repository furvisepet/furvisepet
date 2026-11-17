import type { AiModelPrice, ProviderUsage } from "./types";

export const AI_MODEL_PRICING: Record<string, AiModelPrice> = {
  "gpt-6-luna": {
    cachedInputMicrodollarsPerMillionTokens: 10_000,
    effectiveDate: "2026-11-16",
    inputMicrodollarsPerMillionTokens: 100_000,
    model: "gpt-6-luna",
    outputMicrodollarsPerMillionTokens: 500_000,
    source: "Official OpenAI Standard pricing: https://developers.openai.com/api/docs/models/gpt-6-luna",
  },
  "gpt-6.1-terra": {
    cachedInputMicrodollarsPerMillionTokens: 50_000,
    effectiveDate: "2026-11-16",
    inputMicrodollarsPerMillionTokens: 1_000_000,
    model: "gpt-6.1-terra",
    outputMicrodollarsPerMillionTokens: 5_000_000,
    source: "Official OpenAI Standard pricing: https://developers.openai.com/api/docs/models/gpt-6.1-terra",
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
