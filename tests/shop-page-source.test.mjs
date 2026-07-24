import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Shop route renders protected query-first product discovery", () => {
  const source = read("app/shop/page.tsx");
  const shell = read("app/components/app-page.tsx");
  const nav = read("app/components/signed-in-header.tsx");

  assert.match(source, /export default function ShopPage/);
  assert.match(source, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(source, /<AppPage width="wide">/);
  assert.match(shell, /width\?: "default" \| "wide"/);
  assert.match(shell, /max-w-\[92rem\]/);
  assert.match(source, /grid min-w-0 gap-6 lg:grid-cols-\[minmax\(22\.5rem,26\.25rem\)_minmax\(0,1fr\)\] xl:gap-8/);
  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,0\.82fr\)_minmax\(0,1\.18fr\)\]/);
  assert.match(source, /Products/);
  assert.match(source, /Search product ideas using your pet&apos;s saved context/);
  assert.match(nav, /label: "Products"/);
  assert.doesNotMatch(nav, /label: "Shop"/);
  assert.match(source, /Pet/);
  assert.match(source, /Search products/);
  assert.match(source, /MIN_SHOP_QUERY_LENGTH/);
  assert.match(source, /submittedQuery/);
  assert.match(source, /What are you shopping for\?/);
  assert.match(source, /Choose a pet and search for something specific, like shampoo, dental treats, or chicken-free food\./);
  for (const topSearchChip of ["shampoo", "dental treats", "food", "treats", "grooming", "itchy skin", "sensitive stomach", "flea comb", "chicken-free food", "grooming wipes"]) {
    assert.match(source, new RegExp(`"${topSearchChip}"`));
  }
  assert.match(source, /requestedPetId/);
  assert.match(source, /profileRows\.find\(\(profile\) => profile\.id === requestedPetId\)/);
  assert.match(source, /setInvalidPetParam\(Boolean\(requestedPetId && !requestedProfile\)\)/);
});

test("Products renders a compact result count and cards without compare UI", () => {
  const source = read("app/shop/page.tsx");
  const shopResults = source.slice(
    source.indexOf("function ShopResults"),
    source.indexOf("function ProductCard"),
  );

  assert.match(shopResults, /<div className="grid min-w-0 gap-4">/);
  assert.match(shopResults, /formatProductResultCount\(products\.length\)/);
  assert.match(shopResults, /products\.map\(\(product\) => \(/);
  assert.match(shopResults, /<ProductCard/);
  assert.doesNotMatch(shopResults, /compare|comparison/i);
  assert.doesNotMatch(source, /ProductComparisonPanel|Compare these products|product-comparison/);
});

test("Shop entry points link to pet-scoped Shop without inline product displays", () => {
  const dashboard = read("app/dashboard/page.tsx");
  const petProfile = read("app/pets/[id]/page.tsx");

  assert.match(dashboard, /href=\{`\/shop\?petId=\$\{encodeURIComponent\(selectedProfile\.id\)\}`\}/);
  assert.match(dashboard, /Products for \{selectedPetName\}/);
  assert.match(dashboard, /Search carefully using \{selectedPetName\}&apos;s saved context\./);
  assert.doesNotMatch(dashboard, /ProductCard|Top matches|best price|live availability/i);

  assert.match(petProfile, /const shopHref = `\/shop\?petId=\$\{encodeURIComponent\(profile\.id\)\}`;/);
  assert.match(petProfile, /Products for \{name\}/);
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
  assert.doesNotMatch(source + page, /openai|chewy|scrape|affiliate|feed ingestion|retailer feed/i);
});

test("Shop safety and empty states use modest non-commercial copy", () => {
  const source = read("app/shop/page.tsx");
  const results = read("app/results/page.tsx");
  const productCard = source.slice(source.indexOf("function ProductCard"), source.indexOf("function ProductFitExplanationPanel"));

  assert.match(source, /Product shopping is hidden for now/);
  assert.match(source, /This pet has urgent care signs\. Contact a veterinarian or emergency clinic before shopping for products\./);
  assert.match(source, /No verified ingredient match yet/);
  assert.match(source, /Furvise does not have a product that fits that search and your saved avoid ingredients right now\./);
  assert.match(source, /Check the selected pet/);
  assert.match(source, /This search appears to be for a different species than the selected pet\./);
  assert.match(source, /No careful match yet/);
  assert.match(source, /Furvise does not have a careful product option for that search, pet context, and country right now\./);
  assert.match(source, /No product for this country yet/);
  assert.match(source, /Furvise does not have a product available for your product country right now\. You can change product country in Account settings\./);
  assert.doesNotMatch(source, /curated catalog|ingredient-verified catalog match|catalog match available|region-verified|careful catalog match/);
  assert.match(source, /Some matches may be hidden because of saved avoid ingredients\./);
  assert.match(productCard, /product\.brand \|\| product\.retailer \|\| "Product"/);
  assert.match(productCard, /getProductCardDescription\(product\)/);
  assert.match(productCard, /getProductTypeLine\(product\)/);
  assert.match(productCard, /labelCheckNote = !product\.ingredientsVerified \? "Check the label before buying or using\." : ""/);
  assert.match(productCard, /getProductCardCaution\(product\)/);
  assert.doesNotMatch(productCard, /ProductCardDetails|ProductCardDetailList|Good for|Not for|Check first|verifiedIngredients|verifiedDirections/);
  assert.doesNotMatch(source, /ProductCardDetailList heading="Good for"|ProductCardDetailList heading="Not for"|ProductCardDetailList heading="Check first"/);
  assert.match(source, /A fragrance-free \$\{speciesLabel\} shampoo for routine baths, with a gentle formula aimed at sensitive or itchy skin\./);
  assert.match(source, /formatProductCardDescription\(product\.verifiedDescription\)/);
  assert.match(source, /\.replace\(\/\\bpositioned for\\b\/gi, "made for"\)/);
  assert.doesNotMatch(productCard, /searches|catalog search|positioned for|signals|verified fields|provided data/i);
  assert.match(source, /Not medical care\. Stop use if irritation appears or worsens\./);
  assert.doesNotMatch(source, /helps itchy paws|good for sensitive dogs|for skin irritation/i);
  assert.match(productCard, /View product/);
  assert.match(productCard, /Why this product\?/);
  assert.match(productCard, /Ask product question/);
  assert.match(productCard, /const \[openPanel, setOpenPanel\] = useState<"why" \| "ask" \| null>\(null\)/);
  assert.match(productCard, /askPanelOpen \? \(/);
  assert.match(productCard, /<ProductQuestionPanel/);
  assert.doesNotMatch(productCard, /<textarea|questionChips\.map|answer\.sections\.directAnswer|<ProductQuestionUsageCounter/);
  for (const internalLabel of [
    "Curated product",
    "Region-verified catalog match",
    "Matches species and search",
    "Ingredients verified",
    "Ingredients not fully verified",
    "Ingredient details verified",
    "Price not provided",
  ]) {
    assert.doesNotMatch(productCard, new RegExp(internalLabel));
  }
  assert.equal((productCard.match(/Check the label before buying or using\./g) || []).length, 1);
  assert.doesNotMatch(productCard, /getDisplayProductPriceLabel|priceLabel|product\.price|Price /);

  assert.doesNotMatch(source + results, /best price|cheapest|live availability|vet-approved|guaranteed|\bcure\b/i);
  assert.doesNotMatch(results, /ProductCard|Curated product|Region-verified catalog match|Price not provided/);
});

test("Results remains care-only after Shop is introduced", () => {
  const results = read("app/results/page.tsx");

  assert.doesNotMatch(results, /ProductCard|Top matches|No region-verified product suggestion yet|catalog match|Curated product|Region-verified catalog match|Price not provided|View product|Why this product\?/i);
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
