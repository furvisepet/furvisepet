import type { MockProduct } from "../../petwise";
import type {
  ParsedIngestionRecord,
  ProductIngestionAdapter,
  ProductIngestionAdapterInput,
} from "../types";

export class InternalCuratedProductIngestionAdapter implements ProductIngestionAdapter {
  readonly provider = "internal_curated";
  readonly sourceType = "manual" as const;

  async parse(input: ProductIngestionAdapterInput): Promise<ParsedIngestionRecord[]> {
    if (!Array.isArray(input.body)) throw new Error("Internal curated input must be an array.");
    return (input.body as MockProduct[]).map((product, index) => ({
      product: {
        brandName: product.brand || product.retailer || null,
        categoryName: product.category,
        countryCodes: product.availableCountries,
        description: product.verifiedDescription || product.shortDescription || null,
        directions: product.verifiedDirections ? [product.verifiedDirections] : [],
        externalId: product.id,
        images: product.imageUrl ? [{ altText: product.name, imageUrl: product.imageUrl, isPrimary: true }] : [],
        ingredients: product.verifiedIngredients || [],
        offers: product.availableCountries.map((countryCode) => ({
          affiliateUrl: product.affiliateUrl,
          availability: "unknown",
          countryCode,
          currencyCode: product.currency || (countryCode === "CA" ? "CAD" : "USD"),
          destinationUrl: product.productPageUrl || product.verifiedProductPageUrl || product.productUrl,
          externalProductId: product.id,
          priceAmount: product.price ?? product.bagPrice,
          retailerName: product.retailer || product.brand,
        })),
        productName: product.name,
        productType: product.subcategory || product.productTypeLabel || product.category,
        rawPayload: structuredClone(product) as unknown as Record<string, unknown>,
        shortDescription: product.shortDescription || null,
        sourceMetadata: { ingredientsComplete: product.ingredientsVerified, lastVerifiedAt: product.lastVerifiedAt || null },
        sourceUrl: product.sourceUrl || product.verifiedProductPageUrl || product.productPageUrl || null,
        speciesCodes: product.species,
        subcategoryName: product.subcategory || null,
        variants: [{ name: "Default" }],
        warnings: product.verifiedWarnings || [],
      },
      rowNumber: index + 1,
    }));
  }
}
