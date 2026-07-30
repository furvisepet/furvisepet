import type { AiGuardFeature } from "./types";
import { getAiFeaturePolicy } from "./features";

export function getAiGuardConfig(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const callLimit = positiveInteger(env.FURVISE_AI_DAILY_CALL_LIMIT, production ? 0 : 1_000);
  const costLimitMicrodollars = parseUsdToMicrodollars(env.FURVISE_AI_DAILY_COST_LIMIT_USD) ?? (production ? 0 : 50_000_000);
  return {
    callLimit,
    configured: callLimit > 0 && costLimitMicrodollars > 0,
    costLimitMicrodollars,
    enabled: env.FURVISE_AI_ENABLED !== "false",
    operationTtlSeconds: 26 * 60 * 60,
    production,
  };
}

export function isAiFeatureEnabled(feature: AiGuardFeature, env: Record<string, string | undefined> = process.env) {
  return env[getAiFeaturePolicy(feature).envFlag] !== "false";
}

export function isAiMemoryExtractionEnabled(env: Record<string, string | undefined> = process.env) {
  return env.FURVISE_AI_MEMORY_EXTRACTION_ENABLED !== "false";
}

export function parseUsdToMicrodollars(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d{1,6})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const result = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
