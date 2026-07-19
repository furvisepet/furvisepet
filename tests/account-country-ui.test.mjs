import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("account settings displays and persists Product country manual override", () => {
  const accountPage = readFileSync("app/account/page.tsx", "utf8");

  assert.match(accountPage, /Product country/);
  assert.match(accountPage, /Used to show region-relevant product suggestions\. You can change this anytime\./);
  assert.match(accountPage, /<option value="CA">Canada<\/option>/);
  assert.match(accountPage, /<option value="US">United States<\/option>/);
  assert.match(accountPage, /updateUserProductCountryForUser\(selectedCountry, user\)/);
  assert.match(accountPage, /getAccountCountrySourceLabel/);
});

test("signed-out account redirects before rendering editable settings controls", () => {
  const accountPage = readFileSync("app/account/page.tsx", "utf8");
  const signedOutBranchStart = accountPage.indexOf('authStatus !== "signedIn"');
  const editableSettingsStart = accountPage.indexOf('<h2 className="text-lg font-semibold text-[var(--pw-heading)]">Product country</h2>');

  assert.ok(signedOutBranchStart >= 0);
  assert.ok(editableSettingsStart > signedOutBranchStart);
  assert.match(accountPage, /useRequireConfirmedSupabaseAuth\(\)/);
  assert.match(accountPage, /Redirecting to sign in/);
  assert.match(accountPage, /disabled=\{loading \|\| saving\}/);
});

test("Results reads account country and points region empty state to Account settings", () => {
  const resultsPage = readFileSync("app/results/page.tsx", "utf8");

  assert.match(resultsPage, /loadUserProfileForUser\(user\)/);
  assert.match(resultsPage, /getActiveProductCountry\(\{ accountCountry: accountProductCountry \}\)/);
  assert.match(resultsPage, /!accountCountryLoaded/);
  assert.match(resultsPage, /No region-verified product suggestion yet/);
  assert.match(resultsPage, /Furvise does not have a safe catalog match available for your region right now\./);
  assert.match(resultsPage, /You can change your product country in/);
  assert.match(resultsPage, /href="\/account"/);
});

test("urgent safety continues to suppress product recommendations in Results UI", () => {
  const resultsPage = readFileSync("app/results/page.tsx", "utf8");

  assert.match(resultsPage, /const urgentVetAttention =/);
  assert.match(resultsPage, /const showProductRecommendations =[\s\S]*!urgentVetAttention/);
  assert.match(resultsPage, /Products paused/);
});

test("privacy page includes approximate country copy", () => {
  const privacyPage = readFileSync("app/privacy/page.tsx", "utf8");
  const footer = readFileSync("app/components/homepage-client.tsx", "utf8");

  assert.match(
    privacyPage,
    /We detect your approximate country to show relevant regional product suggestions\. You can\s+change this anytime in account settings\./,
  );
  assert.doesNotMatch(privacyPage, /coordinates|postal|city|IP address/);
  assert.match(footer, /href: "\/privacy", label: "Privacy"/);
});
