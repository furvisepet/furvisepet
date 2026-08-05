import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const signedHeader = read("app/components/signed-in-header.tsx");
const homepage = read("app/components/homepage-client.tsx");
const brand = read("app/components/brand-mark.tsx");
const css = read("app/globals.css");
const login = read("app/login/page.tsx");
const primitives = read("app/components/product-primitives.tsx");
const ask = read("app/ask/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const pets = read("app/pets/page.tsx");

test("canonical logo source is preserved and rendered without a substitute", () => {
  const source = readFileSync(new URL("../public/brand/logo.png", import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex").toUpperCase(), "D24A7A73878FB4692918D140D69DC9D803281D53FF2704AC51B5720A782BECB6");
  assert.match(brand, /src=\{asset\}/);
  assert.match(brand, /objectFit: "contain"/);
  assert.doesNotMatch(brand, /furvise-mark|\.svg|filter/);
});

test("the permanent warm-light color system keeps the approved action hierarchy", () => {
  assert.match(css, /color-scheme: light/);
  assert.match(css, /--page-background: var\(--warm-canvas\)/);
  assert.match(css, /--surface-primary: var\(--card-background\)/);
  assert.match(css, /--surface-raised: var\(--raised-card-background\)/);
  assert.match(css, /--primary-action-background: var\(--warm-orange\)/);
  assert.match(css, /--secondary-action-background: var\(--warm-cream\)/);
  assert.doesNotMatch(css, /html\[data-theme|prefers-color-scheme|brand-dark-surface/);
  assert.doesNotMatch(css, /--surface-page: #000(?:000)?/i);
});

test("button hierarchy has explicit readable foregrounds and disabled states", () => {
  assert.match(primitives, /primary: "bg-\[var\(--action-primary\)\] text-\[var\(--text-inverse\)\]/);
  assert.match(primitives, /secondary: "border border-\[var\(--secondary-action-border\)\] bg-\[var\(--secondary-action\)\] text-\[var\(--secondary-action-text\)\]/);
  assert.match(primitives, /disabled:bg-\[var\(--disabled-surface\)\] disabled:text-\[var\(--disabled-text\)\]/);
  assert.match(css, /:focus-visible[\s\S]*outline: 3px solid var\(--focus\)/);
});

test("homepage has one hero, exactly three benefits, and authenticated CTA logic", () => {
  assert.match(homepage, /Everything about your pet, in one caring place\./);
  assert.match(homepage, /Takes about two minutes\./);
  for (const benefit of ["Remember what changed", "Ask when you are unsure", "Prepare for the vet"]) assert.equal(homepage.split(benefit).length - 1, 1);
  assert.doesNotMatch(homepage, />0[123]</);
  assert.match(homepage, /mode === "with-pet"[\s\S]*Go to Today[\s\S]*Ask about \{petName\}/);
  assert.match(homepage, /<AppFooter showSignIn=\{mode === "anonymous"\} \/>/);
});

test("Products is primary navigation, mobile More owns utilities, and Account stays account-only", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.match(desktop, /href: "\/shop", label: "Products"/);
  assert.match(header, /data-ui="mobile-more-container"[\s\S]*aria-label=\{mobileMoreOpen \? "Close More menu" : "Open More menu"\}[\s\S]*href="\/shop"[\s\S]*>Products<[\s\S]*accountMenuItems\.map/);
  assert.match(signedHeader, /href: "\/account"[\s\S]*label: "Account"/);
  assert.doesNotMatch(header, /Appearance|openAppearance/);
  assert.doesNotMatch(signedHeader, /\/shop|Browse products/);
  assert.match(signedHeader, /label: "Account"[\s\S]*label: signingOut \? "Signing out\.\.\." : "Sign out"/);
});

test("login and warm empty states keep the requested actions", () => {
  for (const copy of ["Welcome back", "Sign in to continue caring for your pets.", "Keep me signed in", "Forgot password?", "New to Furvise? Create account", "Your pets, notes, conversations, and Vet Visit Briefs stay private to your account."]) assert.match(login, new RegExp(copy.replace(/[?.]/g, "\\$&")));
  assert.doesNotMatch(login, /pet family care companion|role="tablist"|benefit-card/i);
  assert.match(history, /Add first update[\s\S]*<SecondaryButton[\s\S]*Ask about/);
  assert.match(pets, /Start \{name\}&apos;s care history[\s\S]*Add update[\s\S]*<SecondaryButton[\s\S]*Ask about \{name\}/);
  const starters = ask.slice(ask.indexOf("function EmptyConversation"), ask.indexOf("function UserMessage"));
  assert.match(starters, /data-ui="starter-question"/);
  assert.match(starters, /cursor-pointer[\s\S]*hover:bg-\[var\(--selection\)\]/);
});

test("primary visible source avoids formal mechanics and em dashes", () => {
  const source = [homepage, login, header, signedHeader, ask, history, pets].join("\n");
  for (const phrase of ["current curated collection", "care context", "your care space", "everything stays connected here", "practical guidance using profile and notes"]) assert.doesNotMatch(source, new RegExp(phrase, "i"));
  assert.match(source, /AI credit/);
  assert.doesNotMatch(source, /—/);
});
