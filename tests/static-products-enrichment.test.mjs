import assert from "node:assert/strict";
import test from "node:test";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

const curatedProductIds = [
  "hills-science-diet-adult-dog-chicken-barley",
  "purina-cat-chow-complete-chicken",
  "hills-science-diet-adult-cat-chicken",
  "earthbath-oatmeal-aloe-shampoo",
  "greenies-original-regular-dog-dental-treats",
  "furminator-cat-deshedding-tool",
  "earthbath-hypoallergenic-shampoo",
  "earthbath-hypoallergenic-grooming-wipes",
  "earthbath-green-tea-awapuhi-grooming-wipes",
  "earthbath-oatmeal-aloe-grooming-wipes",
  "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
  "purina-pro-plan-sensitive-skin-stomach-salmon-rice-wet",
  "greenies-original-teenie-dog-dental-treats",
  "greenies-fresh-regular-dog-dental-treats",
  "furminator-medium-dog-short-hair-deshedding-tool",
  "furminator-grooming-rake",
  "furminator-nail-grinder",
  "furminator-nail-clippers",
  "furminator-large-soft-slicker-brush",
  "furminator-large-firm-slicker-brush",
];

test("static curated products are audited and enriched with verified source metadata", () => {
  assert.deepEqual(staticRealProducts.map((product) => product.id), curatedProductIds);

  for (const product of staticRealProducts) {
    assert.equal(product.source, "curated");
    assert.equal(product.evidenceType, "curated_static");
    assert.equal(product.lastVerifiedAt, "2026-07-23");
    assert.ok(product.verifiedProductPageUrl, product.id);
    assert.ok(product.verifiedDescription, product.id);
    assert.ok(product.verifiedDirections, product.id);
    assert.ok(product.verifiedWarnings?.length, product.id);
    assert.ok(product.verificationSource, product.id);
    assert.ok(product.enrichmentStatus, product.id);
    assert.ok(product.shortDescription, product.id);
    assert.ok(product.productTypeLabel, product.id);
    assert.ok(product.availableCountries.length, product.id);
  }
});

test("ingredientsVerified true requires verifiedIngredients", () => {
  const verified = staticRealProducts.filter((product) => product.ingredientsVerified);
  assert.deepEqual(verified.map((product) => product.id), [
    "hills-science-diet-adult-dog-chicken-barley",
    "purina-cat-chow-complete-chicken",
    "hills-science-diet-adult-cat-chicken",
    "earthbath-oatmeal-aloe-shampoo",
    "greenies-original-regular-dog-dental-treats",
    "earthbath-hypoallergenic-shampoo",
    "earthbath-hypoallergenic-grooming-wipes",
    "earthbath-green-tea-awapuhi-grooming-wipes",
    "earthbath-oatmeal-aloe-grooming-wipes",
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-wet",
    "greenies-original-teenie-dog-dental-treats",
    "greenies-fresh-regular-dog-dental-treats",
  ]);

  for (const product of verified) {
    assert.equal(product.enrichmentStatus, "verified", product.id);
    assert.ok(product.verifiedIngredients?.length, product.id);
  }
});

test("partial enrichment keeps ingredientsVerified false when ingredient details are not applicable or incomplete", () => {
  const partial = staticRealProducts.filter((product) => product.enrichmentStatus === "partial");
  assert.deepEqual(partial.map((product) => product.id), [
    "furminator-cat-deshedding-tool",
    "furminator-medium-dog-short-hair-deshedding-tool",
    "furminator-grooming-rake",
    "furminator-nail-grinder",
    "furminator-nail-clippers",
    "furminator-large-soft-slicker-brush",
    "furminator-large-firm-slicker-brush",
  ]);

  for (const product of partial) {
    assert.equal(product.ingredientsVerified, false);
    assert.equal(product.verifiedIngredients, undefined);
    assert.ok(product.verifiedDirections);
    assert.ok(product.verifiedWarnings?.length);
  }
});

test("curated catalog IDs are unique and products do not carry prices", () => {
  assert.equal(new Set(curatedProductIds).size, curatedProductIds.length);
  assert.equal(staticRealProducts.length, 20);

  for (const product of staticRealProducts) {
    assert.equal(product.price, undefined, product.id);
    assert.equal(product.bagPrice, undefined, product.id);
    assert.equal(product.estimatedMonthlyCost, undefined, product.id);
  }
});

test("Earthbath enrichment uses verified label fields and not name-derived ingredients", () => {
  const earthbath = staticRealProducts.find((product) => product.id === "earthbath-oatmeal-aloe-shampoo");
  assert.ok(earthbath);
  assert.equal(earthbath.ingredientsVerified, true);
  assert.deepEqual(earthbath.verifiedIngredients, [
    "Purified water",
    "Renewable plant-derived and coconut-based cleansers",
    "Colloidal oatmeal",
    "Aloe vera",
    "Vitamins A, B, D, and E",
    "Panthenol",
    "Citric acid",
    "Phenoxyethanol",
  ]);
  assert.match(earthbath.verifiedDirections || "", /90 seconds/);
  assert.match(earthbath.verifiedWarnings?.join(" ") || "", /eye contact/);
});
test("verified catalog fields avoid restricted commercial and medical claims", () => {
  const forbidden = /\b(best|guaranteed|safe|vet-approved|cure)\b|\u2014/i;

  for (const product of staticRealProducts) {
    const text = [
      product.verifiedDescription,
      ...(product.verifiedIngredients || []),
      product.verifiedDirections,
      ...(product.verifiedWarnings || []),
      product.sourceNote,
      product.cautions,
      product.whyItFits,
      product.whyCategoryFits,
    ].filter(Boolean).join(" ");
    assert.doesNotMatch(text, forbidden, product.id);
  }
});
