import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex").toUpperCase();
const css = read("app/globals.css");
const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");
const header = read("app/components/app-header.tsx");
const pets = read("app/pets/page.tsx");
const today = read("app/today/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const account = read("app/account/page.tsx");
const homepage = read("app/components/homepage-client.tsx");
const overflow = read("app/components/pet-overflow-menu.tsx");

test("one semantic Primary mapping owns orange action states", () => {
  assert.equal((css.match(/--primary-action-background:/g) || []).length, 1);
  assert.match(css, /--primary-action-background: var\(--warm-orange\);/);
  assert.match(css, /--primary-action-foreground: var\(--primary-ink\);/);
  assert.match(css, /--action-primary: var\(--primary-action\);/);
  assert.match(primitives, /primary: "bg-\[var\(--action-primary\)\][\s\S]*hover:bg-\[var\(--action-primary-hover\)\][\s\S]*active:bg-\[var\(--action-primary-active\)\]"/);
  assert.match(primitives, /disabled:bg-\[var\(--disabled-surface\)\][\s\S]*disabled:text-\[var\(--disabled-text\)\]/);
});

test("Soft is pale sage, restrained, and does not share Primary elevation", () => {
  assert.match(css, /--soft-action: var\(--pale-sage\);/);
  assert.match(css, /--soft-action-hover: var\(--soft-sage\);/);
  assert.match(primitives, /soft: "[^"]*bg-\[var\(--soft-action\)\][^"]*shadow-none/);
  assert.doesNotMatch(primitives.match(/soft: "([^"]+)"/)?.[1] || "", /action-primary|warm-orange|shadow-surface/);
});

test("Pets uses variants for its complete action hierarchy without page color recipes", () => {
  assert.match(pets, /actions=\{profiles\.length \? <PrimaryButton[^>]*>Add pet<\/PrimaryButton>/);
  const summary = pets.slice(pets.indexOf("function PetSummary"));
  const careHistory = pets.slice(pets.indexOf("function PetStartHistory"), pets.indexOf("function PetHistoryDepth"));
  assert.match(summary, /<SoftButton[^>]*>Add update<\/SoftButton>/);
  assert.match(summary, /<SecondaryButton[^>]*>Ask about \{name\}<\/SecondaryButton>/);
  assert.match(summary, /<TextAction[^>]*>Open profile<\/TextAction>/);
  assert.match(careHistory, /<SoftButton[^>]*>Add update<\/SoftButton>/);
  assert.match(careHistory, /<SecondaryButton[^>]*>Ask about \{name\}<\/SecondaryButton>/);
  assert.doesNotMatch(pets, /bg-(?:orange|green|sage)|bg-\[var\(--(?:pw-primary|action-primary|soft-action|sage|soft-sage|warm-orange)\)\]|#[0-9a-f]{3,8}/i);
});

test("one shared mobile clearance covers every requested app surface", () => {
  assert.match(css, /--mobile-nav-height: 4\.25rem;/);
  assert.match(css, /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*24px/);
  assert.match(css, /\.app-mobile-nav-clearance \{\s*padding-bottom: var\(--mobile-nav-clearance\);/);
  assert.match(appPage, /<main className="app-mobile-nav-clearance/);
  for (const source of [today, pets, history, ask, products, account]) assert.match(source, /<AppPage/);
  assert.doesNotMatch(homepage, /app-mobile-nav-clearance/);
});

test("Pets actions, Ask composer, and overflow all clear the bottom navigation", () => {
  assert.match(pets, /<AppPage layout="workspace" shell="standard">/);
  assert.match(ask, /app-sticky-composer sticky/);
  assert.match(css, /\.app-sticky-composer[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(overflow, /data-ui='mobile-bottom-navigation'/);
  assert.match(overflow, /navigationTop - VIEWPORT_GUTTER/);
});

test("More contains Account controls and has complete dismissal behavior", () => {
  const more = header.slice(header.indexOf('data-ui="mobile-more-container"'), header.indexOf('{isHomepage && resolvedAuthState'));
  assert.match(more, /data-ui="mobile-more-menu"/);
  assert.doesNotMatch(more, /href="\/shop"[\s\S]*>Products<\/Link>/);
  assert.match(more, /accountMenuItems\.map[\s\S]*href=\{item\.href\}/);
  assert.match(header, /document\.addEventListener\("click", handleOutsideClick\)/);
  assert.match(header, /event\.key !== "Escape"/);
  assert.match(header, /mobileMoreButtonRef\.current\?\.focus\(\)/);
  assert.match(more, /top-\[calc\(100%\+0\.5rem\)\]/);
  assert.match(more, /aria-expanded=\{mobileMoreOpen\}/);
});

test("navigation order, desktop active treatment, and brand assets stay protected", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  for (const label of ["Today", "Pets", "History", "Ask"]) assert.ok(desktop.includes(`label: "${label}"`));
  assert.doesNotMatch(desktop, /Products|\/shop/);
  assert.match(header, /data-active-indicator=\{isActive\(item\.href\) \? "underline"/);
  assert.doesNotMatch(header, /isActive\(item\.href\) \? "[^"]*bg-\[var\(--selected-background\)\]/);
  assert.equal(hash("public/brand/furvise-logo.svg"), "15103E452559F4F29B0492A6731782ECD680992F62798BE95DDC7ABA544F3B00");
  assert.equal(hash("app/favicon.ico"), "617E8F6A24067E937ECAFD8C8A8DE735BF4BAC546B0378F0220C884F88C952DB");
});
