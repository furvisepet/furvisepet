import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { MOBILE_NAVIGATION_ITEMS } from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const utility = read("app/components/account-utility.tsx");
const appHeader = read("app/components/app-header.tsx");
const homepage = read("app/components/homepage-client.tsx");
const settingsShell = read("app/components/account-settings-shell.tsx");
const account = read("app/account/page.tsx");
const security = read("app/settings/security/page.tsx");
const dataPrivacy = read("app/settings/data-privacy/page.tsx");
const membership = read("app/membership/page.tsx");

test("one shared account utility owns the same menu on homepage and application pages", () => {
  assert.match(homepage, /<AccountUtility email=\{email\} \/>/);
  assert.match(appHeader, /<AccountUtility email=\{accountEmail\} \/>/);
  assert.match(utility, /aria-label="Open account menu"/);
  assert.match(utility, /email\?\.trim\(\)\.slice\(0, 1\)\.toUpperCase\(\)/);
  assert.match(utility, /href="\/account" label="Account settings"/);
  assert.match(utility, /href="\/membership" label="Membership"/);
  assert.match(utility, /href="\/privacy" label="Privacy"/);
  assert.match(utility, /href="\/terms" label="Terms"/);
  assert.match(utility, /signOutOfFurvise\(client\)/);
  assert.doesNotMatch(utility, /href="\/settings\/security"|label="Security"|href="\/shop"|Products/);
});

test("desktop and mobile product navigation exclude Account", () => {
  const primary = appHeader.slice(appHeader.indexOf("export const APP_NAV_ITEMS"), appHeader.indexOf("const MOBILE_NAV_ITEMS"));
  assert.match(primary, /Today[\s\S]*Pets[\s\S]*History[\s\S]*Ask/);
  assert.doesNotMatch(primary, /Account|Membership|Products/);
  assert.deepEqual(MOBILE_NAVIGATION_ITEMS.map(({ label }) => label), ["Today", "History", "Ask", "Pets"]);
});

test("Account Settings has exactly three categories and Account details is identity-only", () => {
  const labels = [...settingsShell.matchAll(/href: "[^"]+", label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(labels, ["Account details", "Login & security", "Data & privacy"]);
  assert.match(settingsShell, /data-ui="desktop-settings-navigation"/);
  assert.match(settingsShell, /data-ui="mobile-settings-navigation"/);
  assert.match(account, /title="ACCOUNT DETAILS"/);
  assert.match(account, /Email address[\s\S]*user\?\.email/);
  assert.doesNotMatch(account, /country|Membership|Privacy|Terms|Sign out|Delete account/i);
});

test("Login and security exposes actionable provider states without changing password authority", () => {
  assert.match(security, /title="LOGIN & SECURITY"/);
  assert.match(security, /Manage how you sign in to Furvise\./);
  assert.match(security, /label="Google"[\s\S]*googleConnected \? "Connected" : "Not connected"/);
  assert.match(security, /client\.auth\.linkIdentity/);
  assert.match(security, /label="Email & password"[\s\S]*emailPasswordUser \? "Connected" : "Not set up"/);
  assert.match(security, /href="\/forgot-password\?mode=setup">Set up/);
  assert.match(security, /setShowPasswordForm\(true\)/);
  assert.match(security, /data-ui="change-password-form"/);
  assert.match(security, /TurnstileChallenge/);
  assert.match(security, /process\.env\.NODE_ENV === "production" && !captchaToken/);
});

test("Data and privacy moves only the real export and deletion controls", () => {
  assert.match(dataPrivacy, /title="DATA & PRIVACY"/);
  assert.match(dataPrivacy, /DOWNLOAD YOUR DATA/);
  assert.match(dataPrivacy, /"\/api\/account\/export"/);
  assert.match(dataPrivacy, /DELETE ACCOUNT/);
  assert.match(dataPrivacy, /"\/api\/account\/delete"/);
  assert.match(dataPrivacy, /deleteConfirmation !== "DELETE"/);
  assert.match(dataPrivacy, /data-ui="delete-account-confirmation"/);
  assert.doesNotMatch(dataPrivacy, /cookie dashboard|training opt-out|sharing preferences|device history/i);
});

test("Membership uses consumer pricing cards and isolates internal testing access", () => {
  assert.match(membership, /Choose the plan that fits how much Furvise you use\./);
  assert.match(membership, /data-ui="membership-plan-cards"/);
  assert.match(membership, /lg:grid-cols-2/);
  assert.match(membership, /A simple way to start with Furvise\./);
  assert.match(membership, /More room for the pets you care for\./);
  assert.match(membership, /membership\.billingPresentation\.priceLabel/);
  assert.match(membership, /isInternalQa \? \([\s\S]*<InternalAccessCard[\s\S]*\) : \([\s\S]*data-ui="membership-plan-cards"/);
  assert.doesNotMatch(membership, /paywall_free|paywall_paid|Compare plans|Care history and tracking|same reasoning and safety standards/i);
});

test("reset surfaces contain no legacy orange styling", () => {
  const sources = [utility, settingsShell, account, security, dataPrivacy, membership].join("\n");
  assert.doesNotMatch(sources, /#C9560C|#F47A22|#FA8A36|#EF6E17|warm-orange|orange/i);
});
