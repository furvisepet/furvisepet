import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Shop route renders protected query-first product discovery", () => {
  const source = read("app/shop/page.tsx");

  assert.match(source, /export default function ShopPage/);
  assert.match(source, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(source, /Shop carefully/);
  assert.match(source, /Search product ideas using your pet&apos;s saved context/);
  assert.match(source, /Pet/);
  assert.match(source, /Search/);
  assert.match(source, /MIN_SHOP_QUERY_LENGTH/);
  assert.match(source, /submittedQuery/);
  assert.match(source, /What are you shopping for\?/);
  assert.match(source, /Choose a pet and search for something specific, like shampoo, dental treats, or chicken-free food\./);
  assert.match(source, /requestedPetId/);
  assert.match(source, /profileRows\.find\(\(profile\) => profile\.id === requestedPetId\)/);
  assert.match(source, /setInvalidPetParam\(Boolean\(requestedPetId && !requestedProfile\)\)/);
});

test("Shop entry points link to pet-scoped Shop without inline product displays", () => {
  const dashboard = read("app/dashboard/page.tsx");
  const petProfile = read("app/pets/[id]/page.tsx");

  assert.match(dashboard, /href=\{`\/shop\?petId=\$\{encodeURIComponent\(selectedProfile\.id\)\}`\}/);
  assert.match(dashboard, /Shop for \{selectedPetName\}/);
  assert.match(dashboard, /Search carefully using \{selectedPetName\}&apos;s saved context\./);
  assert.doesNotMatch(dashboard, /ProductCard|Top matches|best price|live availability/i);

  assert.match(petProfile, /const shopHref = `\/shop\?petId=\$\{encodeURIComponent\(profile\.id\)\}`;/);
  assert.match(petProfile, /Shop for \{name\}/);
  assert.doesNotMatch(petProfile, /Top matches|best price|live availability/i);
});

test("Shop search uses static curated catalog filters and no OpenAI or live import path", () => {
  const source = read("app/lib/shop.ts");
  const productSearch = read("app/lib/shop/product-search.ts");
  const page = read("app/shop/page.tsx");

  assert.match(source, /staticRealProducts/);
  assert.match(source, /filterAndRankShopProducts/);
  assert.match(productSearch, /isProductAllowedForRuntime/);
  assert.match(productSearch, /isShopSpeciesCompatibleProduct/);
  assert.match(productSearch, /productPassesAvoidIngredientFilter/);
  assert.match(productSearch, /isProductEligibleForCountry/);
  assert.match(productSearch, /passesShopIngredientVerification/);
  assert.match(productSearch, /productMatchesShopQuery/);
  assert.match(productSearch, /sourceNote/);
  assert.match(page, /loadUserProfileForUser/);
  assert.match(page, /getActiveProductCountry/);
  assert.doesNotMatch(source + page, /openai|chewy|scrape|affiliate|feed/i);
});

test("Shop safety and empty states use modest non-commercial copy", () => {
  const source = read("app/shop/page.tsx");
  const results = read("app/results/page.tsx");

  assert.match(source, /Product shopping is hidden for now/);
  assert.match(source, /This pet has urgent care signs\. Contact a veterinarian or emergency clinic before shopping for products\./);
  assert.match(source, /No ingredient-verified match yet/);
  assert.match(source, /Furvise does not have an ingredient-verified catalog match for that search and your saved avoid ingredients right now\./);
  assert.match(source, /Check the selected pet/);
  assert.match(source, /This search appears to be for a different species than the selected pet\./);
  assert.match(source, /No careful match yet/);
  assert.match(source, /Furvise does not have a safe catalog match for that search, pet context, and region right now\./);
  assert.match(source, /No region-verified match yet/);
  assert.match(source, /Furvise does not have a catalog match available for your product country right now\. You can change product country in Account settings\./);
  assert.match(source, /Some matches may be hidden because of saved avoid ingredients\./);
  assert.match(source, /Curated product/);
  assert.match(source, /Region-verified catalog match/);
  assert.match(source, /Matches species and search/);
  assert.match(source, /Ingredients verified/);
  assert.match(source, /Ingredients not fully verified/);
  assert.match(source, /Price not provided/);
  assert.match(source, /Ingredient details are not fully verified\./);

  assert.doesNotMatch(source + results, /best price|cheapest|live availability|vet-approved|guaranteed/i);
  assert.doesNotMatch(results, /ProductCard|Curated product|Region-verified catalog match|Price not provided/);
});

test("Results remains care-only after Shop is introduced", () => {
  const results = read("app/results/page.tsx");

  assert.doesNotMatch(results, /ProductCard|Top matches|No region-verified product suggestion yet|catalog match|Curated product|Region-verified catalog match|Price not provided|View product|Why this may fit/i);
  assert.doesNotMatch(results, /best available alternative|try these anyway|showing similar products from another country/i);
  assert.match(results, /Care summary/);
  assert.match(results, /What to log next/);
  assert.match(results, /What to ask the vet/);
  assert.match(results, /Furvise summarizes saved context and turns it into care notes you can log or discuss with your vet\./);
  assert.match(results, /FURVISE_SAFETY_LINE|FURVISE_URGENT_SAFETY_MESSAGE/);
});

test("Shop stays query-first with pet preselect and no auto-rendered products", () => {
  const page = read("app/shop/page.tsx");
  const loadEffect = page.slice(page.indexOf("async function load()"), page.indexOf("}, [authStatus, authUser, configError, requestedPetId]") );
  const submitSearch = page.slice(page.indexOf("function submitSearch"), page.indexOf("function resetInterpretation"));
  const inputMarkup = page.slice(page.indexOf("<input"), page.indexOf("</label>", page.indexOf("<input")));
  const searchResultMemo = page.slice(page.indexOf("const searchResult = useMemo"), page.indexOf("const showAvoidNote"));

  assert.match(loadEffect, /const requestedProfile = requestedPetId/);
  assert.match(loadEffect, /setSelectedPetId\(nextSelectedPetId\)/);
  assert.doesNotMatch(loadEffect, /setSubmittedQuery|interpretSubmittedQuery|searchStaticRealShopProducts/);
  assert.match(submitSearch, /event\.preventDefault\(\)/);
  assert.match(submitSearch, /if \(nextQuery\.length < MIN_SHOP_QUERY_LENGTH \|\| !selectedPetId\) return/);
  assert.match(submitSearch, /setSubmittedQuery\(nextQuery\)/);
  assert.match(submitSearch, /interpretSubmittedQuery\(\{/);
  assert.match(inputMarkup, /onChange=\{\(event\) => setQueryInput\(event\.target\.value\)\}/);
  assert.doesNotMatch(inputMarkup, /interpretSubmittedQuery|fetch\("\/api\/shop\/interpret-query"/);
  assert.match(searchResultMemo, /submittedQuery\.trim\(\)/);
  assert.match(page, /emptyState === "no_query"/);
  assert.match(page, /What are you shopping for\?/);
});
