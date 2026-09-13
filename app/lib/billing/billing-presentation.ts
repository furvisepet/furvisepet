export type BillingDisplayMarket = "CA" | "US";

export type BillingPresentation = {
  currency: "CAD" | "USD";
  market: BillingDisplayMarket;
  priceLabel: "CA$5.49/month" | "US$5.49/month";
  source: "platform_geo" | "server_default" | "stripe_projection";
};

export function resolveBillingPresentationForMarket({
  projectedCurrency,
  serverFallback,
  trustedPlatformCountry,
}: {
  projectedCurrency?: string | null;
  serverFallback?: string | null;
  trustedPlatformCountry?: string | null;
}): BillingPresentation {
  const projectedMarket = normalizeProjectedCurrency(projectedCurrency);
  const platformMarket = normalizeBillingMarket(trustedPlatformCountry);
  const market = projectedMarket || platformMarket || normalizeBillingMarket(serverFallback) || "US";
  const source = projectedMarket ? "stripe_projection" : platformMarket ? "platform_geo" : "server_default";
  return market === "CA"
    ? { currency: "CAD", market, priceLabel: "CA$5.49/month", source }
    : { currency: "USD", market, priceLabel: "US$5.49/month", source };
}

function normalizeBillingMarket(value?: string | null): BillingDisplayMarket | null {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "CA" || normalized === "US" ? normalized : null;
}

function normalizeProjectedCurrency(value?: string | null): BillingDisplayMarket | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "cad" ? "CA" : normalized === "usd" ? "US" : null;
}
