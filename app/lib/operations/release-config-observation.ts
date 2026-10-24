import "server-only";

import { validateProductionConfiguration } from "./production-config";
import { getAuthAbuseConfig, isCaptchaDevelopmentBypassAllowed } from "../security/auth-abuse/config";
import { getAiGuardConfig, isAiFeatureEnabled } from "../ai/usage-guard/config";
import { isEarlyAccessFreeUnlockEnabled } from "../billing/plan-limits";
import { PUBLIC_V1_CAPABILITIES } from "../public-v1-capabilities";

// Observations, not a release approval. External bindings require independent
// authenticated platform/backend evidence, never key presence or a self hash.
export function observeReleaseConfiguration(env: Record<string, string | undefined> = process.env) {
  const environment = env.VERCEL_ENV;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  if (env.VERCEL !== "1" || env.NODE_ENV !== "production"
    || !["production", "preview"].includes(environment || "")
    || typeof deploymentId !== "string" || !/^dpl_[A-Za-z0-9]{8,64}$/.test(deploymentId)) return null;

  const requiredMaterial = validateProductionConfiguration(env);
  const abuse = getAuthAbuseConfig(env);
  const accounting = getAiGuardConfig(env);
  const checks = {
    requiredServerMaterialPresent: requiredMaterial.missing.length === 0,
    authAbuseEnabled: abuse.enabled,
    authAbuseMaterialConfigured: abuse.configured,
    captchaDevelopmentBypassOff: !isCaptchaDevelopmentBypassAllowed(env),
    askEnabled: accounting.enabled && isAiFeatureEnabled("ask", env),
    positiveDailyBudgetsConfigured: accounting.configured,
    serverPaywallBypassOff: !isEarlyAccessFreeUnlockEnabled(env),
    // Same exact activation flag as withAuthenticatedPreviewCapture.
    rawCaptureFlagOff: env.FURVISE_PREVIEW_CAPTURE_ENABLED !== "true",
    productionCaptureExcluded: environment === "production",
    publicAskWritesDisabled: PUBLIC_V1_CAPABILITIES.askMutations === false,
    publicCalculationsDisabled: PUBLIC_V1_CAPABILITIES.calculationExecution === false,
  };
  return {
    version: "release-config-observation.v1",
    ready: false,
    status: Object.entries(checks).every(([key, value]) => key === "productionCaptureExcluded" || value)
      ? "observed_incomplete" : "blocked",
    platformIdentity: { deploymentId, environment, independentlyVerified: false },
    checks,
    unresolved: {
      authenticatedBackendBinding: "unknown",
      schemaAndGrants: "unknown",
      atomicAccountingBinding: "unknown",
      deployedAuthCallbackAndOriginBinding: "unknown",
      builtClientPaywallBinding: "unknown",
      reviewedSourceAndPackageBinding: "unknown",
    },
  } as const;
}
