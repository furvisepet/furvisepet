import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Products remains protected, pet-scoped, and query-first", () => {
  const page = read("app/shop/page.tsx");
  assert.match(page, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(page, /requestedPetId/);
  assert.match(page, /setSelectedPetId\(nextSelectedPetId\)/);
  assert.match(page, /function submitSearch/);
  assert.match(page, /setSubmittedQuery\(nextQuery\)/);
  assert.match(page, /if \(nextQuery\.length < MIN_SHOP_QUERY_LENGTH \|\| !selectedPetId\) return/);
  assert.match(page, /What are you looking for\?/);
  assert.match(page, /title=\{`Products for \$\{selectedPetName \|\| "your pet"\}`\}/);
});

test("Products uses one wide neutral search and the four approved categories", () => {
  const page = read("app/shop/page.tsx");
  assert.match(page, /rounded-2xl border border-\[var\(--line\)\] bg-\[var\(--surface-primary\)\]/);
  assert.match(page, /\["Food", "Dental", "Grooming", "Skin and coat"\]/);
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(22\.5rem/);
  assert.doesNotMatch(page, /Product country:|Product AI included this month|Search carefully using/);
});

test("Products keeps bounded catalog loading and deterministic filtering", () => {
  const page = read("app/shop/page.tsx");
  const shop = read("app/lib/shop.ts");
  const productSearch = read("app/lib/shop/product-search.ts");
  assert.match(page, /fetch\("\/api\/shop\/catalog"/);
  assert.match(page, /searchShopProducts\(\{/);
  assert.match(shop, /filterAndRankShopProducts/);
  assert.match(productSearch, /isProductAllowedForRuntime/);
  assert.match(productSearch, /productPassesAvoidIngredientFilter/);
  assert.match(productSearch, /isProductEligibleForCountry/);
});

test("Results remains product-free", () => {
  const results = read("app/results/page.tsx");
  assert.doesNotMatch(results, /ProductCard|View product|Why this product\?|best price|live availability/i);
  assert.match(results, /Care summary/);
  assert.match(results, /What to log next/);
  assert.match(results, /What to ask the vet/);
});

test("Products keeps deterministic urgent and ingredient safety states", () => {
  const page = read("app/shop/page.tsx");
  assert.match(page, /Product shopping is hidden for now/);
  assert.match(page, /FURVISE_URGENT_SAFETY_MESSAGE/);
  assert.match(page, /No verified ingredient match yet/);
  assert.match(page, /buildNoSafeProductMatchMessage\(selectedPetName\)/);
  assert.doesNotMatch(page, /vet-approved|guaranteed|\bcure\b/i);
});
