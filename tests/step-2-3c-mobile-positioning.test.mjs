import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const appPage = read("app/components/app-page.tsx");
const header = read("app/components/app-header.tsx");
const ask = read("app/ask/page.tsx");
const overflow = read("app/components/pet-overflow-menu.tsx");
const accountUtility = read("app/components/account-utility.tsx");
const pageSources = [
  "app/today/page.tsx",
  "app/pets/page.tsx",
  "app/components/care-log-workspace.tsx",
  "app/ask/page.tsx",
  "app/shop/page.tsx",
  "app/components/homepage-client.tsx",
].map(read).join("\n");

test("shared mobile navigation geometry owns height, safe area, clearance, and sticky gap", () => {
  assert.match(css, /--mobile-nav-height: 4\.25rem;/);
  assert.match(css, /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /--mobile-sticky-gap: var\(--space-3\);/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*24px/);
  assert.match(header, /h-\[var\(--mobile-nav-expanded-height\)\]/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
});

test("the shared app shell supplies mobile nav clearance and restores desktop spacing", () => {
  assert.match(appPage, /<main className="app-mobile-nav-clearance/);
  assert.match(css, /\.app-mobile-nav-clearance \{\s*padding-bottom: var\(--mobile-nav-clearance\);/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.app-mobile-nav-clearance \{\s*padding-bottom: var\(--space-12\);/);
});

test("Ask composer is mobile-sticky above nav while preserving its prior desktop states", () => {
  assert.match(ask, /app-sticky-composer sticky \$\{hasThread \? "lg:sticky" : "lg:relative"\}/);
  assert.match(css, /\.app-sticky-composer \{[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*var\(--mobile-sticky-gap\)/);
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]*\.app-sticky-composer \{\s*bottom: var\(--space-3\);/);
  assert.match(ask, /data-ui="ask-composer-region"[\s\S]*<Composer[\s\S]*Furvise helps keep your pet&apos;s story together\. It does not replace veterinary care/);
});

test("pages do not duplicate mobile navigation clearance geometry", () => {
  assert.doesNotMatch(pageSources, /(?:4\.25rem|safe-area-inset-bottom|mobile-nav-height\))[^\]]*\+\s*(?:1\.5rem|24px)/);
  assert.equal((pageSources.match(/app-mobile-nav-clearance/g) || []).length, 0, "page components rely on AppPage while the marketing homepage has no app navigation clearance");
});

test("the account utility keeps account controls above navigation without exposing Products", () => {
  assert.doesNotMatch(accountUtility, /href="\/shop"|Products/);
  assert.match(accountUtility, /href="\/account" label="Account settings"/);
  assert.match(header, /z-\[var\(--z-bottom-navigation\)\]/);
  assert.match(accountUtility, /id=\{menuId\} role="menu"/);
  assert.match(accountUtility, /z-\[var\(--z-popover\)\]/);
  assert.match(overflow, /z-\[var\(--z-popover\)\]/);
  assert.match(overflow, /navigationTop - VIEWPORT_GUTTER/);
  assert.match(css, /--z-sticky-controls: 20;[\s\S]*--z-bottom-navigation: 30;[\s\S]*--z-popover: 40;/);
});
