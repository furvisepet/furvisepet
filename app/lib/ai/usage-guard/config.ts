import { isAiEnabled } from "../availability.ts";
import type { AiGuardFeature } from "./types";
import { getAiFeaturePolicy } from "./features";

export function getAiGuardConfig(env: Record<string, string | undefined> = process.env, providerAdmission = false) {
  const production = env.NODE_ENV === "production";
  const callLimit = positiveInteger(env.FURVISE_AI_DAILY_CALL_LIMIT, production ? 0 : 1_000);
  const costLimitMicrodollars = parseUsdToMicrodollars(env.FURVISE_AI_DAILY_COST_LIMIT_USD) ?? (production ? 0 : 50_000_000);
  // Same opt-in funded circuit breaker and abuse protections on preview and production.
  // This is NOT a global daily user/provider-call quota. Production remains separately gated.
  const launchProtection = providerAdmission && env.FURVISE_AI_LAUNCH_PROTECTION_ENABLED === "true";
  const fundedLimitMicrodollars = launchProtection
    ? (parseUsdToMicrodollars(env.FURVISE_AI_FUNDED_CEILING_USD) ?? 0) : 0;
  const productionApproved = env.VERCEL_ENV !== "production"
    || env.FURVISE_AI_PRODUCTION_LAUNCH_APPROVED === "true";
  const qualificationMode = !launchProtection && providerAdmission && (env.FURVISE_AI_QUALIFICATION_MODE === "true" || (env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "release/journal-first-20261116"));
  // A qualification deployment has no budget unless an explicit aggregate ceiling is set.
  const requestedQualificationLimit = qualificationMode ? (parseUsdToMicrodollars(env.FURVISE_AI_QUALIFICATION_TOTAL_COST_LIMIT_USD) ?? 0) : 0;
  const qualificationLimitMicrodollars = qualificationMode && requestedQualificationLimit <= 5_000_000 ? requestedQualificationLimit : 0;
  return {
    // Shared funded protection is deployable only with explicit switches;
    // old qualification remains scoped to the approved preview branch.
    wholeAskQualification: env.FURVISE_AI_WHOLE_ASK_RESERVATION_ENABLED === "true" &&
      (launchProtection && productionApproved ||
        qualificationMode && env.VERCEL_ENV === "preview"
        && env.VERCEL_GIT_COMMIT_REF === "release/journal-first-20261116"),
    launchProtection, fundedLimitMicrodollars, qualificationMode, qualificationLimitMicrodollars,
    callLimit,
    configured: launchProtection ? fundedLimitMicrodollars > 0 && productionApproved
      : callLimit > 0 && costLimitMicrodollars > 0,
    costLimitMicrodollars,
    enabled: isAiEnabled(env) && productionApproved,
    operationTtlSeconds: 26 * 60 * 60,
    production,
  };
}

export function isAiFeatureEnabled(feature: AiGuardFeature, env: Record<string, string | undefined> = process.env) {
  return env[getAiFeaturePolicy(feature).envFlag] !== "false";
}

export function isAiMemoryExtractionEnabled(env: Record<string, string | undefined> = process.env) {
  return isAiEnabled(env) && env.FURVISE_AI_MEMORY_EXTRACTION_ENABLED !== "false";
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
