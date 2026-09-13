import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const signedHeader = read("app/components/signed-in-header.tsx");
const accountUtility = read("app/components/account-utility.tsx");
const homepage = read("app/components/homepage-client.tsx");
const brand = read("app/components/brand-mark.tsx");
const css = read("app/globals.css");
const login = read("app/login/page.tsx");
const primitives = read("app/components/product-primitives.tsx");
const ask = read("app/ask/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const pets = read("app/pets/page.tsx");

test("canonical brand masters are preserved and rendered without substitutes", () => {
  const approved = [
    ["furvise-logo.svg", "15103E452559F4F29B0492A6731782ECD680992F62798BE95DDC7ABA544F3B00"],
    ["furvise-wordmark.svg", "5CE60B7D3134B5AAF00F4A4A799F46443A9EB0FD23B04724A545AD15F7C248B8"],
    ["furvise-heron.svg", "5BC3424AFD22BBA0391D302494C506455DF9EF3A2221525C32A033E8DDA0DD0B"],
  ];
  for (const [file, hash] of approved) {
    const source = readFileSync(new URL(`../public/brand/${file}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex").toUpperCase(), hash);
  }
  assert.match(brand, /src=\{FURVISE_WORDMARK_ASSET\}/);
  assert.match(brand, /src=\{FURVISE_MASCOT_ASSET\}/);
  assert.match(brand, /objectFit: "contain"/);
  assert.doesNotMatch(brand, /furvise-mark|logo-header-v1|\/brand\/logo\.png|App(?:%20| )icon|filter/i);
});

test("the permanent warm-light color system keeps the approved action hierarchy", () => {
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--page-background: var\(--warm-canvas\)/);
  assert.match(css, /--surface-primary: var\(--card-background\)/);
  assert.match(css, /--surface-raised: var\(--raised-card-background\)/);
  assert.match(css, /--primary-action-background: var\(--deep-forest\)/);
  assert.match(css, /--primary-action-foreground: var\(--warm-cream\)/);
  assert.match(css, /--secondary-action-background: var\(--warm-cream\)/);
  assert.doesNotMatch(css, /html\[data-theme|prefers-color-scheme|brand-dark-surface/);
  assert.doesNotMatch(css, /--surface-page: #000(?:000)?/i);
});

test("button hierarchy has explicit readable foregrounds and disabled states", () => {
  assert.match(primitives, /primary: "bg-\[var\(--action-primary\)\] text-\[var\(--text-inverse\)\]/);
  assert.match(primitives, /secondary: "border border-\[var\(--secondary-action-border\)\] bg-\[var\(--secondary-action\)\] text-\[var\(--secondary-action-text\)\]/);
  assert.match(primitives, /disabled:bg-\[var\(--disabled-surface\)\] disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(css, /:focus-visible[\s\S]*outline: 2px solid var\(--focus\)/);
});

test("homepage has six viewport story screens and authenticated CTA logic", () => {
  assert.match(homepage, /aria-label="Remember what matters\."/);
  assert.doesNotMatch(homepage, /Takes about two minutes\./);
  for (const benefit of ["PETS CHANGE.", "ONE STORY.", "WHEN YOU NEED IT,", "YOUR PET&apos;S STORY", "START WITH"]) assert.equal(homepage.split(benefit).length - 1, 1);
  assert.match(homepage, /secondaryCopy="You don't have to track everything\. Use Furvise when something matters\."/);
  assert.doesNotMatch(homepage, /id="track-less"/);
  assert.doesNotMatch(homepage, />0[123]</);
  assert.match(homepage, /mode === "anonymous"[\s\S]*href: NEW_PET_LOGIN_PATH, label: "Get started"/);
  assert.match(homepage, /mode === "no-pets"[\s\S]*href: NEW_PET_ONBOARDING_PATH, label: "Add your pet"/);
  assert.match(homepage, /href: "\/today", label: "Go to Today"/);
  assert.match(homepage, /<MarketingFooter showSignIn=\{visibleMode === "anonymous"\} signedIn=\{signedIn\} \/>/);
});

test("Products is absent from primary navigation while the shared account utility owns account actions", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.doesNotMatch(desktop, /\/shop|Products/);
  assert.match(header, /<AccountUtility email=\{accountEmail\} \/>/);
  assert.doesNotMatch(header, /href="\/shop"[\s\S]*>Products/);
  assert.match(accountUtility, /href="\/account" label="Account settings"/);
  assert.doesNotMatch(header, /Appearance|openAppearance/);
  assert.doesNotMatch(signedHeader, /\/shop|Browse products/);
  assert.match(accountUtility, /Account settings[\s\S]*Membership[\s\S]*Privacy[\s\S]*Terms[\s\S]*Sign out/);
});

test("login and warm empty states keep the requested actions", () => {
  for (const copy of ["Welcome back", "Enter your password", "Forgot password?", "New to Furvise? Create account"]) assert.match(login, new RegExp(copy.replace(/[?.]/g, "\\$&")));
  assert.doesNotMatch(login, /Sign in to pick up where you left off\./);
  assert.doesNotMatch(login, /Keep me signed in|Your pets, notes, conversations, and Vet Visit Briefs stay private to your account\./);
  assert.doesNotMatch(login, /pet family care companion|role="tablist"|benefit-card/i);
  assert.match(history, /Add first update[\s\S]*<SecondaryButton[\s\S]*Ask about/);
  assert.match(pets, /No pets here yet\.[\s\S]*Start with the pet you want Furvise to remember\.[\s\S]*ADD YOUR PET/);
  const starters = ask.slice(ask.indexOf("function EmptyConversation"), ask.indexOf("function UserMessage"));
  assert.match(starters, /data-ui="starter-question"/);
  assert.match(starters, /cursor-pointer[\s\S]*hover:bg-\[var\(--suggested-question-hover\)\]/);
});

test("primary visible source avoids formal mechanics and em dashes", () => {
  const source = [homepage, login, header, signedHeader, ask, history, pets].join("\n");
  for (const phrase of ["current curated collection", "care context", "your care space", "everything stays connected here", "practical guidance using profile and notes"]) assert.doesNotMatch(source, new RegExp(phrase, "i"));
  assert.match(source, /AI credit/);
  assert.doesNotMatch(source, /—/);
});
