import { INGESTION_LIMITS } from "./constants.ts";
import type { NormalizedIngestionProduct, ValidationIssue, ValidationResult } from "./types";

const ISO_COUNTRY_CODES = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "),
);

const FALLBACK_CURRENCIES = new Set(
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWL".split(" "),
);

export function validateNormalizedProduct(
  product: NormalizedIngestionProduct,
  options: { supportedSpecies?: Iterable<string> } = {},
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const supportedSpecies = new Set(options.supportedSpecies || ["dog", "cat"]);
  required(product.productName, "productName", "missing_product_name", "Product name is required.", errors);
  required(product.brandName, "brandName", "missing_brand", "Brand name is required.", errors);

  if (!product.speciesCodes.length) issue(errors, "speciesCodes", "missing_species", "At least one supported species is required.");
  product.speciesCodes.forEach((code, index) => {
    if (!supportedSpecies.has(code)) issue(errors, `speciesCodes[${index}]`, "unsupported_species", `Species code ${code} is not supported.`);
  });
  const unsupported = Array.isArray(product.sourceMetadata.unsupportedSpeciesValues)
    ? product.sourceMetadata.unsupportedSpeciesValues
    : [];
  unsupported.forEach((value, index) => issue(errors, `speciesCodes[${index}]`, "unsupported_species", `Species value ${String(value)} could not be mapped.`));

  if (!product.countryCodes.length) issue(errors, "countryCodes", "missing_country", "At least one country market is required.");
  product.countryCodes.forEach((code, index) => {
    if (!ISO_COUNTRY_CODES.has(code)) issue(errors, `countryCodes[${index}]`, "invalid_country", "Use a valid ISO country code.");
  });

  if (!product.category.categorySlug) issue(warnings, "category", "unmapped_category", "The source category needs manual mapping before publication.");
  validateOptionalUrl(product.sourceUrl, "sourceUrl", errors);
  const imageUrls = new Set<string>();
  let primaryImages = 0;
  product.images.forEach((image, index) => {
    const field = `images[${index}].imageUrl`;
    if (!isDisplayableProductImageUrl(image.imageUrl)) issue(errors, field, "invalid_product_image", "Use a non-placeholder HTTPS product image URL.");
    else {
      const normalizedUrl = new URL(image.imageUrl).href;
      if (imageUrls.has(normalizedUrl)) issue(errors, field, "duplicate_product_image", "Product image URLs must be unique within a record.");
      imageUrls.add(normalizedUrl);
    }
    if (image.isPrimary) primaryImages += 1;
  });
  if (primaryImages > 1) issue(errors, "images", "multiple_primary_images", "Only one product image may be primary.");
  product.offers.forEach((offer, index) => {
    required(offer.retailerName, `offers[${index}].retailerName`, "missing_retailer", "Retailer name is required for an offer.", errors);
    validateRequiredUrl(offer.destinationUrl, `offers[${index}].destinationUrl`, errors);
    validateOptionalUrl(offer.affiliateUrl, `offers[${index}].affiliateUrl`, errors);
    if (!ISO_COUNTRY_CODES.has(offer.countryCode)) issue(errors, `offers[${index}].countryCode`, "invalid_country", "Use a valid ISO country code.");
    if (!isIsoCurrency(offer.currencyCode)) issue(errors, `offers[${index}].currencyCode`, "invalid_currency", "Use a valid ISO currency code.");
    validateMoney(offer.priceAmount, `offers[${index}].priceAmount`, errors);
    validateMoney(offer.originalPriceAmount, `offers[${index}].originalPriceAmount`, errors);
    if (offer.availabilityStatus === "unknown") issue(warnings, `offers[${index}].availabilityStatus`, "unknown_availability", "Offer availability is unknown.");
  });

  const variantIdentifiers = new Set<string>();
  product.variants.forEach((variant, index) => {
    if (variant.packageQuantity !== null && variant.packageQuantity <= 0) {
      issue(errors, `variants[${index}].packageQuantity`, "impossible_package_quantity", "Package quantity must be greater than zero.");
    }
    if (variant.sizeValue !== null && (!/^\d+(?:\.\d+)?$/.test(variant.sizeValue) || Number(variant.sizeValue) <= 0)) {
      issue(errors, `variants[${index}].sizeValue`, "invalid_size", "Size must be greater than zero.");
    }
    for (const [label, identifier] of [["sku", variant.sku], ["gtin", variant.gtin]] as const) {
      if (!identifier) continue;
      const key = `${label}:${identifier.toLowerCase()}`;
      if (variantIdentifiers.has(key)) issue(errors, `variants[${index}].${label}`, "duplicate_variant_identifier", `Variant ${label.toUpperCase()} is duplicated in this record.`);
      variantIdentifiers.add(key);
    }
  });

  validateLengths(product, errors);
  if (!product.images.length) issue(warnings, "images", "missing_image", "No product image was supplied.");
  if (!product.ingredients.length) issue(warnings, "ingredients", "missing_ingredients", "No ingredient list was supplied.");
  if (!product.directions.length) issue(warnings, "directions", "missing_directions", "No directions were supplied.");
  if (!product.warnings.length) issue(warnings, "warnings", "missing_warnings", "No warning text was supplied.");
  if (!product.offers.some((offer) => offer.priceAmount !== null)) issue(warnings, "offers", "missing_price", "No current price was supplied.");
  if (!product.gtin && !product.variants.some((variant) => variant.gtin)) issue(warnings, "gtin", "missing_gtin", "No GTIN was supplied.");
  if (!product.manufacturerProductCode) issue(warnings, "manufacturerProductCode", "missing_manufacturer_code", "No manufacturer product code was supplied.");
  const formulaFields = Array.isArray(product.sourceMetadata.formulaLikeFields) ? product.sourceMetadata.formulaLikeFields : [];
  formulaFields.forEach((field) => issue(warnings, String(field), "spreadsheet_formula_prefix", "The source cell begins with a spreadsheet formula character and must be escaped in exports."));
  return { errors, publishable: errors.length === 0, warnings };
}

export function isSafeHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isDisplayableProductImageUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname) return false;
    const lower = `${url.pathname}${url.search}`.toLowerCase();
    if (/(?:placeholder|tracking|spacer|transparent|blank|pixel)/.test(lower)) return false;
    if (/[?&](?:w|width|h|height)=1(?:&|$)/.test(lower)) return false;
    return true;
  } catch {
    return false;
  }
}

function validateLengths(product: NormalizedIngestionProduct, errors: ValidationIssue[]) {
  const values = [product.productName, product.brandName, product.description, product.shortDescription, product.productType];
  values.forEach((value, index) => {
    if (value && value.length > INGESTION_LIMITS.maxStringLength) issue(errors, `text[${index}]`, "string_too_long", `Text exceeds ${INGESTION_LIMITS.maxStringLength} characters.`);
  });
}

function validateMoney(value: string | null, field: string, errors: ValidationIssue[]) {
  if (value === null) return;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) issue(errors, field, value.startsWith("-") ? "negative_price" : "invalid_price", value.startsWith("-") ? "Price must be zero or greater." : "Price must be a decimal with at most two places.");
}

function validateRequiredUrl(value: string, field: string, errors: ValidationIssue[]) {
  if (!value) issue(errors, field, "missing_url", "A destination URL is required.");
  else if (!isSafeHttpUrl(value)) issue(errors, field, "invalid_url", "Use a valid HTTP or HTTPS URL.");
}

function validateOptionalUrl(value: string | null, field: string, errors: ValidationIssue[]) {
  if (value && !isSafeHttpUrl(value)) issue(errors, field, "invalid_url", "Use a valid HTTP or HTTPS URL.");
}

function isIsoCurrency(value: string) {
  try {
    const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [];
    return supported.length ? supported.includes(value) : FALLBACK_CURRENCIES.has(value);
  } catch {
    return FALLBACK_CURRENCIES.has(value);
  }
}

function required(value: string, field: string, code: string, message: string, issues: ValidationIssue[]) {
  if (!value) issue(issues, field, code, message);
}
function issue(issues: ValidationIssue[], field: string, code: string, message: string) { issues.push({ code, field, message }); }
