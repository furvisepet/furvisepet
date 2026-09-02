import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Account no longer loads or exposes Product country while stored data and APIs remain intact", () => {
  const accountPage = readFileSync("app/account/page.tsx", "utf8");
  const supabaseClient = readFileSync("app/lib/supabase.ts", "utf8");

  assert.doesNotMatch(accountPage, /Product country|Shopping region|product-country|selectedCountry/);
  assert.doesNotMatch(accountPage, /loadUserProfileForUser|detectAccountProductCountry|updateUserProductCountryForUser|getAccountCountrySourceLabel/);
  assert.match(supabaseClient, /country: "US" \| "CA" \| null/);
  assert.match(supabaseClient, /export async function updateUserProductCountryForUser/);
  const countryRoute = readFileSync("app/api/account/product-country/route.ts", "utf8");
  const countryModel = readFileSync("app/lib/account-country.ts", "utf8");
  assert.match(countryRoute, /\.upsert\(buildManualAccountCountryUpdate\(\{ country, userId: context\.userId \}\)/);
  assert.match(countryModel, /country_source: "manual"/);
});

test("signed-out account redirects before rendering account identity", () => {
  const accountPage = readFileSync("app/account/page.tsx", "utf8");
  const signedOutBranchStart = accountPage.indexOf('status !== "signedIn"');
  const identityStart = accountPage.indexOf('aria-labelledby="account-email-heading"');

  assert.ok(signedOutBranchStart >= 0);
  assert.ok(identityStart > signedOutBranchStart);
  assert.match(accountPage, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(accountPage, /Redirecting to sign in/);
});

test("Account details is identity-only inside the shared settings hierarchy", () => {
  const accountPage = readFileSync("app/account/page.tsx", "utf8");
  const shell = readFileSync("app/components/account-settings-shell.tsx", "utf8");
  const dataPrivacy = readFileSync("app/settings/data-privacy/page.tsx", "utf8");
  assert.match(accountPage, /AccountSettingsShell title="ACCOUNT DETAILS"/);
  assert.match(accountPage, /user\?\.email/);
  assert.doesNotMatch(accountPage, /Membership|Security|Privacy|Terms|Sign out|Delete account|idempotentClientFetch/);
  assert.match(shell, /Account details[\s\S]*Login & security[\s\S]*Data & privacy/);
  assert.doesNotMatch(shell, /Membership|Privacy Policy|Terms/);
  assert.match(dataPrivacy, /"\/api\/account\/export"/);
  assert.match(dataPrivacy, /"\/api\/account\/delete"/);
  assert.match(dataPrivacy, /deleteConfirmation !== "DELETE"/);
  assert.match(dataPrivacy, /data-ui="delete-account-confirmation"/);
  assert.doesNotMatch(accountPage, /rounded-3xl|shadow-\[/);
});

test("Results ignores product country and does not render a region product empty state", () => {
  const resultsPage = readFileSync("app/results/page.tsx", "utf8");

  assert.doesNotMatch(resultsPage, /loadUserProfileForUser\(user\)/);
  assert.doesNotMatch(resultsPage, /getActiveProductCountry/);
  assert.doesNotMatch(resultsPage, /accountCountryLoaded|accountProductCountry/);
  assert.doesNotMatch(resultsPage, /No region-verified product suggestion yet/);
  assert.doesNotMatch(resultsPage, /Furvise does not have a safe catalog match available for your region right now\./);
  assert.doesNotMatch(resultsPage, /You can change your product country in/);
});

test("urgent safety continues to render care-first Results UI without product copy", () => {
  const resultsPage = readFileSync("app/results/page.tsx", "utf8");

  assert.match(resultsPage, /const urgentVetAttention =/);
  assert.match(resultsPage, /UrgentCarePanel/);
  assert.match(resultsPage, /Safety first/);
  assert.doesNotMatch(resultsPage, /showProductRecommendations/);
  assert.doesNotMatch(resultsPage, /Products paused/);
});

test("privacy page includes approximate country copy", () => {
  const privacyPage = readFileSync("app/privacy/page.tsx", "utf8");
  const footer = readFileSync("app/components/app-footer.tsx", "utf8");

  assert.match(
    privacyPage,
    /We detect your approximate country to show relevant regional product suggestions\. You can\s+change this anytime in account settings\./,
  );
  assert.doesNotMatch(privacyPage, /coordinates|postal|city|IP address/);
  assert.match(footer, /href="\/privacy">Privacy<\/Link>/);
});
