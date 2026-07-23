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
  ]);

  for (const product of verified) {
    assert.equal(product.enrichmentStatus, "verified", product.id);
    assert.ok(product.verifiedIngredients?.length, product.id);
  }
});

test("partial enrichment keeps ingredientsVerified false when ingredient details are not applicable or incomplete", () => {
  const partial = staticRealProducts.filter((product) => product.enrichmentStatus === "partial");
  assert.deepEqual(partial.map((product) => product.id), ["furminator-cat-deshedding-tool"]);

  const furminator = partial[0];
  assert.equal(furminator.ingredientsVerified, false);
  assert.equal(furminator.verifiedIngredients, undefined);
  assert.ok(furminator.verifiedDirections);
  assert.ok(furminator.verifiedWarnings?.length);
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
