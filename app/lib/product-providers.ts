import type {
  ConcernNormalizationInput,
  DogProfile,
  MockProduct,
  ProductFeedbackSignal,
  ProductCategory,
  ProductCountry,
  RecommendationKind,
} from "./petwise";
import { mockProducts, normalizeSpecies } from "./petwise";
import {
  normalizeAccountProductCountry,
  resolveActiveAccountProductCountry,
} from "./account-country";
import { staticRealProducts } from "./products/static-products";

export type ProductSearchContext = {
  analysis?: ConcernNormalizationInput | null;
  feedback?: ProductFeedbackSignal[];
  productCountry?: ProductCountry;
  profile: DogProfile;
};

export type ProductProviderId = "mock" | "static_real" | "disabled_live";
export type ProductProviderMode = "mock" | "static_real";

export type ProductProvider = {
  enabled: boolean;
  id: ProductProviderId;
  label: string;
  normalizeProduct(rawProduct: unknown): MockProduct | null;
  rankProducts(products: MockProduct[], context: ProductSearchContext): MockProduct[];
  searchProducts(context: ProductSearchContext): MockProduct[];
};

export type ProductLinkInfo =
  | {
      href: string;
      label: "View product";
      rel: "noopener noreferrer";
      target: "_blank";
      variant: "link";
    }
  | {
      href: null;
      label: "Product reference";
      variant: "demo";
    }
  | null;

export function getDisplayProductPriceLabel(
  product: Pick<MockProduct, "bagPrice" | "currency" | "price" | "priceVerifiedAt">,
) {
  if (!product.priceVerifiedAt) return "Not provided";
  const price = product.price ?? product.bagPrice ?? null;
  return typeof price === "number" && Number.isFinite(price)
    ? `${product.currency || "USD"} ${price}`
    : "Not provided";
}

export const mockProvider: ProductProvider = {
  enabled: true,
  id: "mock",
  label: "Development product recommendations",
  normalizeProduct(rawProduct: unknown) {
    if (!rawProduct || typeof rawProduct !== "object") return null;
    const product = rawProduct as Partial<MockProduct>;
    if (!product.id || !product.name || !product.category) return null;

    const species = normalizeSpecies(product.species);
    const concernTags = Array.isArray(product.concernTags) ? product.concernTags : [];
    const excludedIngredients = Array.isArray(product.excludedIngredients)
      ? product.excludedIngredients
      : [];
    const bagPrice = typeof product.bagPrice === "number" ? product.bagPrice : product.price;
    const price = typeof product.price === "number" ? product.price : product.bagPrice;
    const estimatedMonthlyCost =
      typeof product.estimatedMonthlyCost === "number"
        ? product.estimatedMonthlyCost
        : typeof product.price === "number"
          ? product.price
          : typeof product.bagPrice === "number"
            ? product.bagPrice
            : undefined;
    const normalized: MockProduct = {
      ...product,
      active: product.active ?? true,
      brand: product.brand?.trim() || deriveBrand(product.name),
      category: product.category as ProductCategory,
      subcategory: product.subcategory,
      concernTags,
      excludedIngredients,
      lifeStage: product.lifeStage || "all",
      recommendationKind: normalizeRecommendationKind(product.recommendationKind),
      species: species || "all",
      tags: normalizeTags(product.tags, product),
      currency: product.currency || "USD",
      evidenceType: product.evidenceType || "demo",
      ingredientHighlights: Array.isArray(product.ingredientHighlights)
        ? product.ingredientHighlights
        : [],
      availableCountries: normalizeAvailableCountries(product.availableCountries),
      avoidIngredientKeywords: Array.isArray(product.avoidIngredientKeywords)
        ? product.avoidIngredientKeywords
        : [],
      safetyNotes: product.safetyNotes,
      lastVerifiedAt: product.lastVerifiedAt,
      priceVerifiedAt: product.priceVerifiedAt,
      sourceNote: product.sourceNote,
      price,
      estimatedMonthlyCost,
      whyItFits: product.whyItFits || "",
      whyCategoryFits: product.whyCategoryFits || "",
      cautions: product.cautions || "",
      whyItFitsTemplate: product.whyItFitsTemplate || product.whyItFits || "",
      bagPrice,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      retailer: product.retailer,
      id: product.id,
      name: product.name,
      protein: product.protein || "Not applicable",
    };

    return normalized;
  },
  rankProducts(products, context) {
    return rankByFeedback(products, context.feedback || []);
  },
  searchProducts(context) {
    return mockProducts
      .map((product) => this.normalizeProduct(product))
      .filter((product): product is MockProduct => Boolean(product))
      .filter((product) => isProductAllowedForRuntime(product, "mock"))
      .filter((product) => product.active !== false)
      .filter((product) => isSpeciesCompatibleProduct(product, context.profile.species));
  },
};

export const staticRealProvider: ProductProvider = {
  enabled: true,
  id: "static_real",
  label: "Curated real product recommendations",
  normalizeProduct: mockProvider.normalizeProduct,
  rankProducts(products, context) {
    return rankByFeedback(products, context.feedback || []);
  },
  searchProducts(context) {
    const activeProductCountry = context.productCountry || getActiveProductCountry();
    return staticRealProducts
      .map((product) => this.normalizeProduct(product))
      .filter((product): product is MockProduct => Boolean(product))
      .filter((product) => isProductAllowedForRuntime(product, "static_real"))
      .filter((product) => product.active !== false)
      .filter((product) => isSpeciesCompatibleProduct(product, context.profile.species))
      .filter((product) => isProductEligibleForCountry(product, activeProductCountry));
  },
};

export const disabledLiveProvider: ProductProvider = {
  enabled: false,
  id: "disabled_live",
  label: "Product provider unavailable",
  normalizeProduct() {
    return null;
  },
  rankProducts() {
    return [];
  },
  searchProducts() {
    return [];
  },
};

export function resolveProductProviderMode({
  nextPublicProductProvider = process.env.NEXT_PUBLIC_PRODUCT_PROVIDER,
  nodeEnv = process.env.NODE_ENV,
  productProvider = process.env.PRODUCT_PROVIDER,
}: {
  nextPublicProductProvider?: string | null;
  nodeEnv?: string;
  productProvider?: string | null;
} = {}): ProductProviderMode {
  if (nodeEnv === "production") return "static_real";

  const configured = productProvider || nextPublicProductProvider || "";
  if (configured === "mock" || configured === "static_real") return configured;
  return "static_real";
}

export function getConfiguredProductProvider(
  value?: string | null,
  nodeEnv = process.env.NODE_ENV,
) {
  const mode = resolveProductProviderMode({
    nodeEnv,
    productProvider:
      value === undefined ? process.env.PRODUCT_PROVIDER : value,
    nextPublicProductProvider: value === undefined ? process.env.NEXT_PUBLIC_PRODUCT_PROVIDER : "",
  });
  return mode === "mock" ? mockProvider : staticRealProvider;
}

export function isProductAllowedForRuntime(
  product: Pick<MockProduct, "evidenceType" | "id" | "productUrl">,
  providerMode: ProductProviderMode,
  nodeEnv = process.env.NODE_ENV,
) {
  if (nodeEnv !== "production") return true;
  if (providerMode !== "static_real") return false;
  return Boolean(
    product.id &&
      product.productUrl &&
      product.evidenceType === "curated_static" &&
      !/demo|mock|fictional/i.test(`${product.id} ${product.productUrl}`),
  );
}

export function getActiveProductCountry({
  accountCountry,
  nextPublicProductCountry = process.env.NEXT_PUBLIC_PRODUCT_COUNTRY,
  productCountry = process.env.PRODUCT_COUNTRY,
}: {
  accountCountry?: string | null;
  nextPublicProductCountry?: string | null;
  productCountry?: string | null;
} = {}): ProductCountry {
  return resolveActiveAccountProductCountry({
    accountCountry,
    nextPublicProductCountry,
    productCountry,
  });
}

export function normalizeProductCountry(value?: string | null): ProductCountry | null {
  return normalizeAccountProductCountry(value);
}

export function normalizeAvailableCountries(value: unknown): ProductCountry[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeProductCountry(String(item))).filter((item): item is ProductCountry => Boolean(item)))];
}

export function isProductEligibleForCountry(
  product: Pick<MockProduct, "availableCountries">,
  country: ProductCountry,
) {
  return Boolean(product.availableCountries?.includes(country));
}

export function hasStaticRealProductsExcludedByCountry(
  species: DogProfile["species"] | null | undefined,
  country: ProductCountry = getActiveProductCountry(),
) {
  const preCountryProducts = staticRealProducts
    .map((product) => staticRealProvider.normalizeProduct(product))
    .filter((product): product is MockProduct => Boolean(product))
    .filter((product) => isProductAllowedForRuntime(product, "static_real"))
    .filter((product) => product.active !== false)
    .filter((product) => isSpeciesCompatibleProduct(product, species));

  return preCountryProducts.length > 0 && preCountryProducts.every((product) => !isProductEligibleForCountry(product, country));
}

export function isSpeciesCompatibleProduct(
  product: Pick<MockProduct, "category" | "recommendationKind" | "species" | "tags">,
  species: DogProfile["species"] | null | undefined,
) {
  if (!species) return false;
  return product.species === species;
}

export function hasSpeciesCompatibleFoodProducts(
  species: DogProfile["species"] | null | undefined,
  products: Pick<MockProduct, "category" | "recommendationKind" | "species" | "tags">[] = staticRealProducts,
) {
  return products.some((product) => product.category === "food" && isSpeciesCompatibleProduct(product, species));
}

export function getProductLinkInfo(product: Pick<MockProduct, "evidenceType" | "productUrl">): ProductLinkInfo {
  if (product.productUrl) {
    return {
      href: product.productUrl,
      label: "View product",
      rel: "noopener noreferrer",
      target: "_blank",
      variant: "link",
    };
  }

  if (product.evidenceType !== "demo") return null;

  return {
    href: null,
    label: "Product reference",
    variant: "demo",
  };
}

function normalizeTags(tags: string[] | undefined, product: Partial<MockProduct>) {
  const sourceTags = tags ?? [];
  const fallbackTags = [
    product.category,
    product.species,
    product.brand,
    product.recommendationKind,
  ].filter((value): value is string => Boolean(value));
  return [...new Set([...sourceTags, ...fallbackTags])];
}

function normalizeRecommendationKind(value: RecommendationKind | undefined): RecommendationKind {
  return value || "product";
}

function deriveBrand(name: string) {
  return name.split(/\s+/).slice(0, 2).join(" ") || "Furvise";
}

function rankByFeedback(products: MockProduct[], feedback: ProductFeedbackSignal[]) {
  if (feedback.length === 0) return products;
  const feedbackByProduct = new Map<string, Set<string>>();
  feedback.forEach((item) => {
    const existing = feedbackByProduct.get(item.product_id) || new Set<string>();
    existing.add(item.feedback_type);
    feedbackByProduct.set(item.product_id, existing);
  });

  const score = (product: MockProduct) => {
    const productFeedback = feedbackByProduct.get(product.id);
    if (!productFeedback) return 0;
    return (
      (productFeedback.has("worked") ? 20 : 0) +
      (productFeedback.has("saved") ? 5 : 0) +
      (productFeedback.has("tried") ? 3 : 0) -
      (productFeedback.has("too_expensive") ? 15 : 0) -
      (productFeedback.has("did_not_work") ? 40 : 0) -
      (productFeedback.has("avoid_product") ? 100 : 0)
    );
  };

  return [...products].sort((left, right) => score(right) - score(left));
}
