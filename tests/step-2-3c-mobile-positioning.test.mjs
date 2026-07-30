import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");
const appPage = read("app/components/app-page.tsx");
const header = read("app/components/app-header.tsx");
const ask = read("app/ask/page.tsx");
const overflow = read("app/components/pet-overflow-menu.tsx");
const pageSources = [
  "app/dashboard/page.tsx",
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
  assert.match(header, /h-\[var\(--mobile-nav-height\)\]/);
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
  assert.match(ask, /data-ui="ask-composer-region"[\s\S]*<Composer[\s\S]*Furvise organizes care information and does not replace a veterinarian/);
});

test("pages do not duplicate mobile navigation clearance geometry", () => {
  assert.doesNotMatch(pageSources, /(?:4\.25rem|safe-area-inset-bottom|mobile-nav-height\)[^\]]*\+\s*(?:1\.5rem|24px))/);
  assert.equal((pageSources.match(/app-mobile-nav-clearance/g) || []).length, 1, "only the exceptional authenticated homepage applies the shared helper directly");
});

test("More keeps Products and account controls above navigation", () => {
  const more = header.slice(header.indexOf('data-ui="mobile-more-menu"'));
  assert.match(more, /href="\/shop"[\s\S]*>Products<\/Link>/);
  assert.match(more, /accountMenuItems\.map[\s\S]*href=\{item\.href\}/);
  assert.match(header, /z-\[var\(--z-bottom-navigation\)\]/);
  assert.match(header, /data-ui="mobile-more-menu"[\s\S]*role="menu"/);
  assert.match(header, /z-\[var\(--z-popover\)\]/);
  assert.match(overflow, /z-\[var\(--z-popover\)\]/);
  assert.match(overflow, /navigationTop - VIEWPORT_GUTTER/);
  assert.match(css, /--z-sticky-controls: 20;[\s\S]*--z-bottom-navigation: 30;[\s\S]*--z-popover: 40;/);
});
