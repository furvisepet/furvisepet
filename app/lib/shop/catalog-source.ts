import type { MockProduct, ProductCountry } from "../petwise";
import { isProductEligibleForCountry } from "../product-providers";

export type ShopProductSource = "catalog" | "static_fallback" | "mock";

export type ShopProductSourceResult = {
  products: MockProduct[];
  source: Exclude<ShopProductSource, "mock">;
};

export class ShopCatalogRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopCatalogRequestError";
    this.status = status;
  }
}

export async function loadCatalogFirstShopProducts({
  fetchImpl = fetch,
  fallbackProducts,
  petId,
  productCountry,
  query,
  token,
}: {
  fetchImpl?: typeof fetch;
  fallbackProducts(): MockProduct[];
  petId: string;
  productCountry: ProductCountry;
  query: string;
  token: string;
}): Promise<ShopProductSourceResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/shop/catalog", {
      body: JSON.stringify({ petId, productCountry, query }),
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    return staticFallback(fallbackProducts, productCountry);
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown; products?: unknown } | null;
  if (!response.ok) {
    if (response.status >= 500) return staticFallback(fallbackProducts, productCountry);
    const message = typeof payload?.error === "string"
      ? payload.error
      : response.status === 401 || response.status === 403
        ? "Please sign in again before searching products."
        : "Product guidance is temporarily unavailable.";
    throw new ShopCatalogRequestError(message, response.status);
  }

  const products = parseUsableCatalogProducts(payload?.products, productCountry);
  return products.length ? { products, source: "catalog" } : staticFallback(fallbackProducts, productCountry);
}

export function parseUsableCatalogProducts(value: unknown, productCountry: ProductCountry): MockProduct[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MockProduct => {
    if (!item || typeof item !== "object") return false;
    const product = item as Partial<MockProduct>;
    return product.active !== false
      && product.evidenceType === "catalog"
      && typeof product.id === "string"
      && typeof product.name === "string"
      && Array.isArray(product.species)
      && Array.isArray(product.availableCountries)
      && Array.isArray(product.concernTags)
      && Array.isArray(product.excludedIngredients)
      && typeof product.category === "string"
      && isProductEligibleForCountry(product as Pick<MockProduct, "availableCountries">, productCountry);
  });
}

function staticFallback(fallbackProducts: () => MockProduct[], productCountry: ProductCountry): ShopProductSourceResult {
  return {
    products: fallbackProducts().filter((product) =>
      product.active !== false &&
      product.evidenceType !== "demo" &&
      isProductEligibleForCountry(product, productCountry),
    ),
    source: "static_fallback",
  };
}
