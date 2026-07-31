import type {
  CATALOG_MARKET_STATUSES,
  CATALOG_OFFER_AVAILABILITY,
  CATALOG_PRODUCT_STATUSES,
  CATALOG_SUITABILITY_TYPES,
} from "./constants";

export type CatalogProductStatus = (typeof CATALOG_PRODUCT_STATUSES)[number];
export type CatalogMarketStatus = (typeof CATALOG_MARKET_STATUSES)[number];
export type CatalogOfferAvailability = (typeof CATALOG_OFFER_AVAILABILITY)[number];
export type CatalogSuitabilityType = (typeof CATALOG_SUITABILITY_TYPES)[number];

export type CatalogBrand = {
  id: string;
  name: string;
  slug: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  parentId: string | null;
  slug: string;
};

export type CatalogSpecies = {
  code: string;
  id: string;
  name: string;
  suitabilityType: CatalogSuitabilityType;
};

export type CatalogMarket = {
  countryCode: string;
  lastVerifiedAt: string | null;
  status: CatalogMarketStatus;
};

export type CatalogVariant = {
  flavor: string | null;
  gtin: string | null;
  id: string;
  isDefault: boolean;
  name: string;
  packageQuantity: number | null;
  sizeUnit: string | null;
  sizeValue: string | null;
  sku: string | null;
};

export type CatalogImage = {
  altText: string | null;
  id: string;
  imageUrl: string;
  isPrimary: boolean;
  position: number;
  variantId: string | null;
};

export type CatalogOffer = {
  affiliateUrl: string | null;
  availabilityStatus: CatalogOfferAvailability;
  countryCode: string;
  currencyCode: string;
  destinationUrl: string;
  id: string;
  isActive: boolean;
  originalPriceAmount: string | null;
  priceAmount: string | null;
  publicUrl: string;
  retailer: CatalogBrand;
  variantId: string | null;
};

export type CatalogIngredient = {
  canonicalName: string | null;
  id: string;
  isActiveIngredient: boolean | null;
  labelName: string;
  position: number | null;
  variantId: string | null;
};

export type CatalogWarning = {
  id: string;
  text: string;
  type: string;
  variantId: string | null;
};

export type CatalogDirection = {
  id: string;
  text: string;
  type: string;
  variantId: string | null;
};

export type CatalogProductSummary = {
  advisorSummary: string | null;
  brand: CatalogBrand;
  category: CatalogCategory;
  categoryRationale: string | null;
  cautions: string | null;
  concernTags: string[];
  defaultImageUrl: string | null;
  id: string;
  ingredientListComplete: boolean;
  lifeStage: "puppy" | "kitten" | "adult" | "senior" | "all";
  markets: CatalogMarket[];
  name: string;
  offers: CatalogOffer[];
  primaryProtein: string | null;
  productType: string;
  searchTags: string[];
  shortDescription: string | null;
  slug: string;
  species: CatalogSpecies[];
  status: CatalogProductStatus;
};

export type CatalogProductDetail = CatalogProductSummary & {
  description: string | null;
  directions: CatalogDirection[];
  images: CatalogImage[];
  ingredients: CatalogIngredient[];
  variants: CatalogVariant[];
  warnings: CatalogWarning[];
};

export type CatalogProduct = CatalogProductDetail;

export type CatalogProductPage = {
  items: CatalogProductSummary[];
  nextCursor: string | null;
};

export type GetCatalogProductsInput = {
  active?: boolean;
  category?: string | null;
  countryCode: string;
  cursor?: string | null;
  limit?: number;
  speciesCode: string;
  textQuery?: string | null;
};
