import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveBillingPresentationForMarket } from "../app/lib/billing/billing-presentation.ts";
import { shouldManageExistingSubscription } from "../app/lib/billing/launch-plans.ts";

const read = (path) => readFileSync(path, "utf8");
const page = read("app/membership/page.tsx");
const account = read("app/account/page.tsx");
const entitlementsRoute = read("app/api/account/entitlements/route.ts");
const checkout = read("app/api/billing/checkout/route.ts");
const portal = read("app/api/billing/portal/route.ts");

test("Membership is a private Furvise page without decorative pricing artwork", () => {
  const layout = read("app/membership/layout.tsx");
  assert.match(layout, /createPrivatePageMetadata\("Membership"\)/);
  assert.match(layout, /PrivateRouteLayout/);
  assert.match(page, /title="MEMBERSHIP"/);
  assert.match(page, /Choose the plan that fits how much Furvise you use\./);
  assert.doesNotMatch(page, /paywall_free|paywall_paid|next\/image/);
});

test("Membership remains independent from the Account Settings hierarchy", () => {
  assert.doesNotMatch(page, /AccountSettingsShell|href="\/account"/);
  assert.doesNotMatch(page, /searchParams.*(?:return|redirect|next)|router\.(?:push|replace)\([^)]*searchParams/);
});

test("Free and Plus show canonical Ask allowances and remaining usage without new accounting", () => {
  assert.match(page, /FREE_ASK_ALLOWANCE/);
  assert.match(page, /PLUS_ASK_ALLOWANCE/);
  assert.match(page, /`\$\{FREE_ASK_ALLOWANCE\} Ask each month`/);
  assert.match(page, /`\$\{PLUS_ASK_ALLOWANCE\} Ask each month`/);
  assert.match(page, /const remaining = Math\.min\(limit, Math\.max\(0, usage\.remaining\)\)/);
  assert.match(page, /Ask remaining/);
  assert.match(page, /get_my_ask_allowance_status|\/api\/account\/entitlements/);
  assert.doesNotMatch(page, /reserve_ai_credit|complete_ai_credit|ai_usage_events/);
});

test("Membership billing actions preserve checkout, recovery, portal, confirmation, and cancellation behavior", () => {
  assert.match(page, /const billingDestination = isPlus \|\| shouldManageExistingSubscription\(subscriptionStatus\) \? "portal" : "checkout"/);
  for (const status of ["active", "past_due", "unpaid", "paused", "incomplete", "trialing"]) {
    assert.equal(shouldManageExistingSubscription(status), true, status);
  }
  for (const status of ["none", "canceled", "incomplete_expired"]) {
    assert.equal(shouldManageExistingSubscription(status), false, status);
  }
  assert.match(page, /Your payment needs attention\./);
  assert.match(page, /Your Plus payment is still overdue\./);
  assert.match(page, /Your Plus payment could not be recovered\./);
  assert.match(page, /Your Plus setup is not finished yet\./);
  assert.match(page, /Your Furvise subscription is paused\./);
  assert.match(page, /onClick=\{\(\) => void openBilling\(billingDestination\)\}/);
  assert.match(page, /Upgrade to Plus/);
  assert.match(page, /Manage billing/);
  assert.match(page, /We&apos;re confirming your Furvise Plus subscription/);
  assert.match(page, /Plus will appear after Stripe confirms the subscription/);
  assert.match(page, /title: "Your cancellation is scheduled\."[\s\S]*Plus remains available through/);
  assert.match(page, /Refresh status/);
  assert.match(page, /entitlements\.accessRole === "internal_qa"/);
  assert.match(page, /isInternalQa \? \([\s\S]*<InternalAccessCard/);
  assert.match(page, /Testing access is separate from consumer billing/);
});

test("Account details does not duplicate Membership pricing or state", () => {
  assert.doesNotMatch(account, /href="\/membership"|\/api\/account\/entitlements|Internal testing access|Furvise Plus/);
  assert.doesNotMatch(account, /openBilling\(|Manage billing|Upgrade to Plus|CA\$5\.49|US\$5\.49/);
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
  assert.match(checkout, /resolveTargetOrigin\(request\)/);
  assert.match(checkout, /resolveBillingPresentation\(\{ headers: request\.headers, projectedCurrency: null \}\)/);
  assert.match(checkout, /claimPlusCheckoutSingleFlight\(admin, context\.userId, applicationOrigin, checkoutCurrency\)/);
  assert.match(checkout, /currency: singleFlight\.checkout_currency/);
  assert.match(checkout, /cancel_url: `\$\{singleFlight\.return_origin\}\/membership\?checkout=cancelled`/);
  assert.match(checkout, /success_url: `\$\{singleFlight\.return_origin\}\/membership\?checkout=success`/);
  assert.match(portal, /return_url: `\$\{applicationOrigin\}\/membership`/);
  assert.match(checkout, /line_items: \[\{ price: priceId, quantity: 1 \}\]/);
  assert.match(checkout, /getPlusPriceId\(process\.env\)/);
  assert.doesNotMatch(checkout, /request\.json\(|searchParams\.get\(/);
  assert.doesNotMatch(page, /STRIPE_PLUS_PRICE_ID|priceId|currency.*fetch|body:.*currency/);
});

test("Membership is available from the account menu and quota recovery links", () => {
  assert.match(read("app/components/account-utility.tsx"), /href="\/membership" label="Membership"/);
  assert.match(read("app/components/ask-usage-notice.tsx"), /href="\/membership">Upgrade to Plus/);
  assert.match(read("app/components/pet-limit-screen.tsx"), /href="\/membership">See plan options/);
  assert.match(read("app/ask/page.tsx"), /href="\/membership">Upgrade to Plus/);
});

test("consumer plans use two responsive pricing cards with no duplicate comparison surface", () => {
  assert.match(page, /aria-label="Furvise membership plans"/);
  assert.match(page, /data-ui="membership-plan-cards"/);
  assert.match(page, /lg:grid-cols-2/);
  assert.doesNotMatch(page, /Compare plans|membership-comparison|<table/);
  assert.doesNotMatch(page, /overflow-x-auto/);
});

test("Membership is protected and intentionally non-indexable", () => {
  assert.match(read("app/lib/security/private-routes.ts"), /"\/membership"/);
  assert.match(read("app/membership/layout.tsx"), /createPrivatePageMetadata\("Membership"\)/);
  assert.match(read("app/robots.ts"), /"\/membership"/);
});

test("Membership uses the canonical authenticated shell without becoming a bottom-nav destination", () => {
  const navigation = read("app/lib/navigation/mobile-navigation.ts");
  assert.match(navigation, /AUTHENTICATED_APP_NAVIGATION_PREFIXES[\s\S]*"\/membership"/);
  assert.match(navigation, /MORE_ROUTE_PREFIXES = \[[^\]]*"\/membership"/);
  assert.doesNotMatch(navigation, /MOBILE_NAVIGATION_ITEMS = \[[\s\S]*href: "\/membership"/);
});
