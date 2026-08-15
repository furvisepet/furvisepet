import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { resolveBillingPresentationForMarket } from "../app/lib/billing/billing-presentation.ts";
import { canUseSameSiteNavigationHistory } from "../app/lib/navigation/safe-back.ts";

const read = (path) => readFileSync(path, "utf8");
const page = read("app/membership/page.tsx");
const account = read("app/account/page.tsx");
const entitlementsRoute = read("app/api/account/entitlements/route.ts");
const checkout = read("app/api/billing/checkout/route.ts");
const portal = read("app/api/billing/portal/route.ts");

test("Membership is a private Furvise page with the supplied plan artwork", () => {
  const layout = read("app/membership/layout.tsx");
  assert.match(layout, /createPrivatePageMetadata\("Membership"\)/);
  assert.match(layout, /PrivateRouteLayout/);
  assert.match(page, /title="Membership"/);
  assert.match(page, /Choose the plan that gives you the right amount of room to ask, track, and care for your pets\./);
  assert.match(page, /image="\/images\/paywall_free\.png"/);
  assert.match(page, /image="\/images\/paywall_paid\.png"/);
  assert.match(page, /import Image from "next\/image"/);
  for (const asset of ["public/images/paywall_free.png", "public/images/paywall_paid.png"]) {
    assert.equal(existsSync(asset), true, `${asset} exists`);
    assert.doesNotThrow(() => execFileSync("git", ["ls-files", "--error-unmatch", asset], { stdio: "pipe" }), `${asset} is deployment-tracked`);
  }
});

test("Membership Back uses only usable same-site history and otherwise falls back to Account", () => {
  assert.match(page, />←<\/span> Back/);
  assert.match(page, /canUseSameSiteNavigationHistory\(\{/);
  assert.match(page, /router\.back\(\)/);
  assert.match(page, /router\.push\("\/account"\)/);
  assert.doesNotMatch(page, /searchParams.*(?:return|redirect|next)|router\.(?:push|replace)\([^)]*searchParams/);
  assert.equal(canUseSameSiteNavigationHistory({ currentOrigin: "https://furvise.com", currentPathname: "/membership", historyLength: 2, referrer: "https://furvise.com/account" }), true);
  assert.equal(canUseSameSiteNavigationHistory({ currentOrigin: "https://furvise.com", currentPathname: "/membership", historyLength: 2, referrer: "https://example.com/sale" }), false);
  assert.equal(canUseSameSiteNavigationHistory({ currentOrigin: "https://furvise.com", currentPathname: "/membership", historyLength: 1, referrer: "" }), false);
});

test("Free and Plus show canonical Ask allowances and remaining usage without new accounting", () => {
  assert.match(page, /FREE_ASK_ALLOWANCE, PLUS_ASK_ALLOWANCE/);
  assert.match(page, /8 Ask per month/);
  assert.match(page, /55 thoughtful Ask messages every month/);
  assert.match(page, /const used = Math\.max\(0, limit - remaining\)/);
  assert.match(page, /Ask remaining/);
  assert.match(page, /get_my_ask_allowance_status|\/api\/account\/entitlements/);
  assert.doesNotMatch(page, /reserve_ai_credit|complete_ai_credit|ai_usage_events/);
});

test("Membership billing actions preserve checkout, portal, confirmation, and cancellation behavior", () => {
  assert.match(page, /openBilling\(isPlus \? "portal" : "checkout"\)/);
  assert.match(page, /Upgrade to Furvise Plus/);
  assert.match(page, /Manage billing/);
  assert.match(page, /We&apos;re confirming your Furvise Plus subscription/);
  assert.match(page, /Plus will appear after Stripe confirms the subscription/);
  assert.match(page, /Your cancellation is scheduled\. Plus remains available through/);
  assert.match(page, /Refresh status/);
  assert.match(page, /entitlements\.accessRole === "internal_qa"/);
  assert.match(page, /Consumer billing actions are hidden for internal testing access/);
});

test("Account contains no Membership or paywall presentation", () => {
  assert.doesNotMatch(account, />Membership<\/h2>|href="\/membership"|\/api\/account\/entitlements/);
  assert.doesNotMatch(account, /askUsage|entitlements|id="plans"|openBilling\(|Manage billing|Upgrade to Plus|CA\$5\.49|US\$5\.49/);
});

test("localized billing presentation shows exactly one supported market price", () => {
  const ca = resolveBillingPresentationForMarket({
    projectedCurrency: null,
    serverFallback: "US",
    trustedPlatformCountry: "CA",
  });
  const us = resolveBillingPresentationForMarket({
    projectedCurrency: null,
    serverFallback: "CA",
    trustedPlatformCountry: "US",
  });
  assert.deepEqual(ca, { currency: "CAD", market: "CA", priceLabel: "CA$5.49/month", source: "platform_geo" });
  assert.deepEqual(us, { currency: "USD", market: "US", priceLabel: "US$5.49/month", source: "platform_geo" });
  assert.doesNotMatch(ca.priceLabel, /US\$/);
  assert.doesNotMatch(us.priceLabel, /CA\$/);
  assert.doesNotMatch(page, /CA\$5\.49|US\$5\.49/);
  assert.match(page, /membership\.billingPresentation\.priceLabel/);
});

test("active Plus projected currency takes precedence over current location", () => {
  const cadTraveler = resolveBillingPresentationForMarket({
    projectedCurrency: "cad",
    serverFallback: "US",
    trustedPlatformCountry: "US",
  });
  const usdTraveler = resolveBillingPresentationForMarket({
    projectedCurrency: "usd",
    serverFallback: "CA",
    trustedPlatformCountry: "CA",
  });
  assert.deepEqual(cadTraveler, { currency: "CAD", market: "CA", priceLabel: "CA$5.49/month", source: "stripe_projection" });
  assert.deepEqual(usdTraveler, { currency: "USD", market: "US", priceLabel: "US$5.49/month", source: "stripe_projection" });

  const route = read("app/api/account/entitlements/route.ts");
  const admin = read("app/lib/billing/billing-admin.ts");
  assert.match(route, /entitlements\.billingPlan === "plus"[\s\S]*getProjectedBillingCurrencyForUser\(createOperationsAdminClient\(\), context\.userId\)/);
  assert.match(route, /resolveBillingPresentation\(\{ headers: request\.headers, projectedCurrency \}\)/);
  assert.doesNotMatch(route, /stripe_customer_id|stripe_subscription_id|checkout_price_id|last_stripe_event/);
  const currencyReader = admin.slice(admin.indexOf("export async function getProjectedBillingCurrencyForUser"), admin.indexOf("export async function registerBillingCustomer"));
  assert.match(currencyReader, /\.select\("stripe_currency"\)/);
  assert.doesNotMatch(currencyReader, /stripe_customer_id|stripe_subscription_id|checkout_price_id|last_stripe_event/);
});

test("billing display market is server-controlled and separate from Product Country", () => {
  const serverFallback = resolveBillingPresentationForMarket({
    projectedCurrency: null,
    serverFallback: "CA",
    trustedPlatformCountry: null,
  });
  assert.equal(serverFallback.market, "CA");
  assert.match(entitlementsRoute, /resolveBillingPresentation\(\{ headers: request\.headers, projectedCurrency \}\)/);
  const marketResolver = read("app/lib/billing/billing-market.ts");
  assert.match(marketResolver, /import "server-only"/);
  assert.match(marketResolver, /env\.VERCEL === "1"[\s\S]*env\.VERCEL_ENV === "production"[\s\S]*headers\.get\("x-vercel-id"\)/);
  assert.doesNotMatch(marketResolver, /user_profiles|account-country|Product Country|searchParams|request\.json/);
  assert.doesNotMatch(page, /product-country|selectedCountry|currency\s*:/);
});

test("checkout and portal return to Membership without client-selected price or currency", () => {
  assert.match(checkout, /cancel_url: `\$\{applicationOrigin\}\/membership\?checkout=cancelled`/);
  assert.match(checkout, /success_url: `\$\{applicationOrigin\}\/membership\?checkout=success`/);
  assert.match(portal, /return_url: `\$\{applicationOrigin\}\/membership`/);
  assert.match(checkout, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
  assert.match(checkout, /getPlusPriceId\(process\.env\)/);
  assert.doesNotMatch(checkout, /request\.json\(|searchParams\.get\(|currency\s*:/);
  assert.doesNotMatch(page, /STRIPE_PLUS_PRICE_ID|priceId|currency.*fetch|body:.*currency/);
});

test("Membership is available from the account menu and quota recovery links", () => {
  assert.match(read("app/components/signed-in-header.tsx"), /href: "\/membership",\s*label: "Membership"/);
  assert.match(read("app/components/ask-usage-notice.tsx"), /href="\/membership">Upgrade to Plus/);
  assert.match(read("app/components/pet-limit-screen.tsx"), /href="\/membership">See plan options/);
  assert.match(read("app/ask/page.tsx"), /href="\/membership">Upgrade to Plus/);
});

test("plan comparison is stacked on mobile and tabular without clipping on larger screens", () => {
  assert.match(page, /data-ui="mobile-membership-comparison"/);
  assert.match(page, /mt-5 grid gap-3 sm:hidden/);
  assert.match(page, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
  assert.match(page, /data-ui="desktop-membership-comparison"/);
  assert.match(page, /hidden overflow-hidden[\s\S]*sm:block/);
  assert.doesNotMatch(page, /overflow-x-auto/);
});

test("Membership is protected and intentionally non-indexable", () => {
  assert.match(read("app/lib/security/private-routes.ts"), /"\/membership"/);
  assert.match(read("app/membership/layout.tsx"), /createPrivatePageMetadata\("Membership"\)/);
  assert.match(read("app/robots.ts"), /"\/membership"/);
});
