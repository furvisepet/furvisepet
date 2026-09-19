import type { ProductCountry } from "./petwise";

export type AccountCountrySource = "detected" | "manual" | "env_default";

export type AccountCountryProfile = {
  country: string | null;
  country_source: string | null;
  country_detected_at?: string | null;
  country_updated_at?: string | null;
};

export type CountryDetectionDecision = {
  country: ProductCountry;
  countrySource: AccountCountrySource;
  shouldWrite: boolean;
};

export function normalizeAccountProductCountry(value?: string | null): ProductCountry | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "US" || normalized === "CA") return normalized;
  return null;
}

export function normalizeAccountCountrySource(value?: string | null): AccountCountrySource | null {
  if (value === "detected" || value === "manual" || value === "env_default") return value;
  return null;
}

export function resolveActiveAccountProductCountry({
  accountCountry,
  nextPublicProductCountry = process.env.NEXT_PUBLIC_PRODUCT_COUNTRY,
  productCountry = process.env.PRODUCT_COUNTRY,
}: {
  accountCountry?: string | null;
  nextPublicProductCountry?: string | null;
  productCountry?: string | null;
} = {}): ProductCountry {
  return (
    normalizeAccountProductCountry(accountCountry) ||
    normalizeAccountProductCountry(productCountry) ||
    normalizeAccountProductCountry(nextPublicProductCountry) ||
    // Temporary fallback is US because the current curated catalog is US-only. Revisit when verified CA catalog entries are added.
    "US"
  );
}

export function detectCountryFromRequestHeaders(headers: Headers): ProductCountry | null {
  return normalizeAccountProductCountry(headers.get("x-vercel-ip-country"));
}

export function decideAccountCountryDetection({
  currentProfile,
  detectedCountry,
  nextPublicProductCountry = process.env.NEXT_PUBLIC_PRODUCT_COUNTRY,
  productCountry = process.env.PRODUCT_COUNTRY,
}: {
  currentProfile?: AccountCountryProfile | null;
  detectedCountry?: ProductCountry | null;
  nextPublicProductCountry?: string | null;
  productCountry?: string | null;
}): CountryDetectionDecision {
  const existingCountry = normalizeAccountProductCountry(currentProfile?.country);
  const existingSource = normalizeAccountCountrySource(currentProfile?.country_source);

  if (existingCountry) {
    return {
      country: existingCountry,
      countrySource: existingSource || "detected",
      shouldWrite: false,
    };
  }

  if (detectedCountry) {
    return {
      country: detectedCountry,
      countrySource: "detected",
      shouldWrite: true,
    };
  }

  return {
    country: resolveActiveAccountProductCountry({
      nextPublicProductCountry,
      productCountry,
    }),
    countrySource: "env_default",
    shouldWrite: true,
  };
}

export function buildManualAccountCountryUpdate({
  country,
  now = new Date().toISOString(),
  userId,
}: {
  country: string;
  now?: string;
  userId: string;
}) {
  const normalizedCountry = normalizeAccountProductCountry(country);
  if (!normalizedCountry) throw new Error("Choose Canada or United States.");

  return {
    country: normalizedCountry,
    country_source: "manual" as const,
    country_updated_at: now,
    user_id: userId,
  };
}

export function getAccountCountrySourceLabel(source?: string | null) {
  if (source === "manual") return "Set manually";
  if (source === "detected") return "Detected from approximate country";
  if (source === "env_default") return "Using default product country";
  return "";
}
