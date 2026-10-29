import "server-only";
import { getAiGuardConfig, isAiFeatureEnabled, isAiMemoryExtractionEnabled } from "../ai/usage-guard/config";
import { isAuthCaptchaEnabled } from "../auth-captcha-policy";
import { isGoogleAuthEnabled } from "../auth-identity";

/** Owner-only in-process predicates; caller independently verifies the expected public project.
 * No backend/schema/grant probe, readiness, credential validation or spend admission. */
export function ownerConfigurationSemantics(
  env: Record<string, string | undefined> = process.env,
  expectedBackendProject?: string,
) {
  const guard = getAiGuardConfig(env);
  let backend: URL | null = null;
  try {
    const parsed = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password
      && !parsed.port && parsed.pathname === "/" && !parsed.search && !parsed.hash) backend = parsed;
  } catch { /* Report a predicate; never echo malformed configuration. */ }
  return {
    schemaVersion: 1,
    scope: "config-semantics",
    notReadinessDecision: true,
    productionContext: env.VERCEL_ENV === "production",
    previewContext: env.VERCEL_ENV === "preview",
    nodeProduction: env.NODE_ENV === "production",
    ai: {
      enabled: guard.enabled,
      dailyLimitsConfigured: guard.configured,
      ask: isAiFeatureEnabled("ask", env),
      carePlan: isAiFeatureEnabled("care_plan", env),
      products: isAiFeatureEnabled("product_query", env),
      vetBrief: isAiFeatureEnabled("vet_brief", env),
      safetyFollowup: isAiFeatureEnabled("safety_followup", env),
      memoryExtraction: isAiMemoryExtractionEnabled(env),
    },
    auth: {
      captchaEnabled: isAuthCaptchaEnabled(env),
      googleEnabled: isGoogleAuthEnabled(env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED ?? ""),
    },
    backend: {
      publicUrlWellFormed: backend !== null,
      expectedProjectMatches: expectedBackendProject && /^[a-z0-9]{20}$/.test(expectedBackendProject)
        ? backend?.hostname === `${expectedBackendProject}.supabase.co`
        : null,
    },
  };
}
