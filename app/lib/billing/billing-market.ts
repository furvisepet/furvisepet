import "server-only";
import { resolveBillingPresentationForMarket, type BillingPresentation } from "./billing-presentation";

export type { BillingPresentation } from "./billing-presentation";

export function resolveBillingPresentation({
  env = process.env,
  headers,
  projectedCurrency,
}: {
  env?: Record<string, string | undefined>;
  headers: Headers;
  projectedCurrency?: string | null;
}): BillingPresentation {
  const trustedPlatformCountry = env.VERCEL === "1"
    && (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview")
    && headers.get("x-vercel-id")
    ? headers.get("x-vercel-ip-country")
    : null;
  return resolveBillingPresentationForMarket({
    projectedCurrency,
    serverFallback: env.FURVISE_BILLING_DISPLAY_MARKET,
    trustedPlatformCountry,
  });
}
