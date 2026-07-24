import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getCanonicalProductUrl,
  getProductLabelLinkInfo,
  getProductLinkInfo,
  isProductDocumentUrl,
  isValidProductPageUrl,
  isValidProductUrl,
} from "../app/lib/product-providers.ts";
import { staticRealProducts } from "../app/lib/products/static-products.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("canonical product URL uses the supported field priority", () => {
  assert.equal(
    getCanonicalProductUrl({
      affiliateUrl: "https://shop.example-retailer.test/product/affiliate",
      productPageUrl: "https://brand.test/products/page",
      verifiedProductPageUrl: "https://brand.test/products/verified",
      sourceUrl: "https://brand.test/products/source",
      retailerUrl: "https://retailer.test/products/item",
      productUrl: "https://brand.test/products/legacy",
    }),
    "https://shop.example-retailer.test/product/affiliate",
  );
  assert.equal(
    getCanonicalProductUrl({
      productPageUrl: "https://brand.test/products/page",
      verifiedProductPageUrl: "https://brand.test/products/verified",
      retailerUrl: "https://retailer.test/products/item",
      productUrl: "https://brand.test/products/legacy",
    }),
    "https://brand.test/products/page",
  );
  assert.equal(
    getCanonicalProductUrl({
      productPageUrl: "TBD",
      verifiedProductPageUrl: "https://brand.test/products/verified",
      sourceUrl: "https://brand.test/products/source",
      productUrl: "https://brand.test/products/legacy",
    }),
    "https://brand.test/products/verified",
  );
  assert.equal(
    getCanonicalProductUrl({
      sourceUrl: "https://brand.test/products/source",
      retailerUrl: "https://retailer.test/products/item",
      productUrl: "https://brand.test/products/legacy",
    }),
    "https://retailer.test/products/item",
  );
});

test("product URL validation rejects missing, non-http, local, and placeholder values", () => {
  for (const value of [
    "",
    "#",
    "todo",
    "TBD",
    "product-url",
    "ftp://brand.test/product",
    "javascript:alert(1)",
    "http://localhost:3000/product",
    "http://127.0.0.1/product",
    "https://example.com/product",
    "https://shop.example.com/product",
    "https://brand.test/products/product-url",
  ]) {
    assert.equal(isValidProductUrl(value), false, value);
  }
  assert.equal(isValidProductUrl("https://earthbath.com/products/hypoallergenic-shampoo"), true);
});

test("document URLs are valid references but never valid product pages", () => {
  for (const value of [
    "https://brand.test/labels/product.pdf",
    "https://brand.test/documents/product-facts",
    "https://brand.test/product-label-deck-file/item",
    "https://brand.test/products/guaranteed-analysis",
  ]) {
    assert.equal(isValidProductUrl(value), true, value);
    assert.equal(isProductDocumentUrl(value), true, value);
    assert.equal(isValidProductPageUrl(value), false, value);
  }

  assert.equal(isProductDocumentUrl("https://brand.test/products/salmon-dry-dog-food"), false);
  assert.equal(isValidProductPageUrl("https://brand.test/products/salmon-dry-dog-food"), true);
});

test("every curated product has a normal product page and audited label fields", () => {
  assert.equal(staticRealProducts.length, 20);
  const productsWithLabels = [];

  for (const product of staticRealProducts) {
    assert.equal(isValidProductPageUrl(product.verifiedProductPageUrl), true, product.id);
    assert.equal(isProductDocumentUrl(getCanonicalProductUrl(product)), false, product.id);
    const link = getProductLinkInfo(product);
    assert.equal(link?.variant, "link", product.id);
    assert.equal(link?.href, product.productPageUrl || product.verifiedProductPageUrl, product.id);

    if (product.labelUrl) {
      productsWithLabels.push(product.id);
      assert.equal(isProductDocumentUrl(product.labelUrl), true, product.id);
      assert.equal(getProductLabelLinkInfo(product)?.href, product.labelUrl, product.id);
    } else {
      assert.equal(getProductLabelLinkInfo(product), null, product.id);
    }
  }

  assert.deepEqual(productsWithLabels, [
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-dry",
    "purina-pro-plan-sensitive-skin-stomach-salmon-rice-wet",
  ]);
});

test("invalid or missing product URLs never produce a clickable link", () => {
  assert.equal(getProductLinkInfo({ evidenceType: "curated_static" }), null);
  assert.equal(
    getProductLinkInfo({
      evidenceType: "curated_static",
      verifiedProductPageUrl: "https://example.com/product",
      sourceUrl: "#",
      productUrl: "todo",
    }),
    null,
  );
});

test("label documents cannot become View product and remain available as View label", () => {
  const labelUrl = "https://brand.test/product-label-deck-file/salmon-food.pdf";
  const labelOnlyProduct = {
    evidenceType: "curated_static",
    labelUrl,
    sourceUrl: labelUrl,
    verifiedProductPageUrl: labelUrl,
  };

  assert.equal(getCanonicalProductUrl(labelOnlyProduct), null);
  assert.equal(getProductLinkInfo(labelOnlyProduct), null);
  assert.deepEqual(getProductLabelLinkInfo(labelOnlyProduct), {
    href: labelUrl,
    label: "View label",
    rel: "noopener noreferrer",
    target: "_blank",
    variant: "link",
  });

  assert.equal(
    getCanonicalProductUrl({
      verifiedProductPageUrl: labelUrl,
      productUrl: "https://brand.test/products/salmon-food",
    }),
    "https://brand.test/products/salmon-food",
  );
});

test("View product renders a validated accessible new-tab anchor", () => {
  const page = read("app/shop/page.tsx");
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));

  assert.match(productCard, /const productLink = getProductLinkInfo\(product\)/);
  assert.match(productCard, /const labelLink = getProductLabelLinkInfo\(product\)/);
  assert.match(productCard, /productLink\?\.variant === "link" \? \(/);
  assert.match(productCard, /<Link/);
  assert.match(productCard, /aria-label=\{`View \$\{product\.name\}`\}/);
  assert.match(productCard, /href=\{productLink\.href\}/);
  assert.match(productCard, /rel=\{productLink\.rel\}/);
  assert.match(productCard, /target=\{productLink\.target\}/);
  assert.match(productCard, /Product page unavailable/);
  assert.match(productCard, /labelLink\?\.variant === "link" \? \(/);
  assert.match(productCard, /aria-label=\{`View label for \$\{product\.name\}`\}/);
  assert.match(productCard, /href=\{labelLink\.href\}/);
  assert.match(productCard, /rel=\{labelLink\.rel\}/);
  assert.match(productCard, /target=\{labelLink\.target\}/);
  assert.match(productCard, />\s*View label\s*<\/Link>/);
  assert.doesNotMatch(productCard, /href=\{product\.productUrl \|\| "#"\}|href="#"/);
});

test("product links add no price or availability UI and Results stays product-free", () => {
  const page = read("app/shop/page.tsx");
  const results = read("app/results/page.tsx");
  const productCard = page.slice(page.indexOf("function ProductCard"), page.indexOf("function ProductFitExplanationPanel"));

  assert.doesNotMatch(productCard, /product\.price|live availability|in stock|best price/i);
  assert.doesNotMatch(results, /ProductCard|View product|Compare these|Price not provided/i);
  assert.match(productCard, /Ask product question/);
  assert.match(productCard, /Why this product\?/);
  assert.doesNotMatch(productCard, /[—–]/);
});
