import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex").toUpperCase();
const header = read("app/components/app-header.tsx");
const brand = read("app/components/brand-mark.tsx");
const footer = read("app/components/app-footer.tsx");
const homepage = read("app/components/homepage-client.tsx");
const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");
const accountAccess = read("app/components/account-access.tsx");
const css = read("app/globals.css");
const today = read("app/today/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/history-archive.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const account = read("app/account/page.tsx");
const accountShell = read("app/components/account-settings-shell.tsx");
const accountUtility = read("app/components/account-utility.tsx");

test("desktop and mobile headers share the approved brand without duplicating it in bottom navigation", () => {
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/furvise-logo\.svg"/);
  assert.match(header, /data-ui="app-header"/);
  assert.match(header, /className="homepage-full-logo"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.match(header, /homepage-header-navigation-zone[\s\S]*aria-label="Primary navigation"/);
  assert.match(header, /aria-label="Mobile navigation"[\s\S]*data-ui="mobile-bottom-navigation"/);
  const bottomNavigation = header.slice(header.indexOf('aria-label="Mobile navigation"'));
  assert.doesNotMatch(bottomNavigation, /BrandMark|FURVISE_BRAND_ASSET|furvise-logo/);
  assert.match(header, /<AccountUtility email=\{accountEmail\} \/>/);
  assert.match(accountUtility, /aria-label="Open account menu"/);
});

test("navigation destinations and order remain unchanged with a non-color active indicator", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  const mobile = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  for (const [source, labels] of [[desktop, ["Today", "Pets", "History", "Ask"]], [mobile, ["Today", "History", "Ask", "Pets"]]]) {
    let cursor = -1;
    for (const label of labels) {
      const next = source.indexOf(`label: "${label}"`);
      assert.ok(next > cursor, `${label} stays in route order`);
      cursor = next;
    }
  }
  assert.match(header, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(header, /data-active-indicator=\{isActive\(item\.href\) \? "underline"/);
});

test("mobile bottom navigation is edge aligned, safe-area aware, and paired with content clearance", () => {
  assert.match(header, /fixed inset-x-0 bottom-0/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.match(header, /grid-cols-4/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*24px/);
  assert.match(css, /\.app-mobile-nav-clearance[\s\S]*var\(--mobile-nav-clearance\)/);
  assert.match(css, /\.app-sticky-composer[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(appPage, /app-mobile-nav-clearance/);
});

test("semantic page-shell presets exist and every requested surface uses its mapped preset", () => {
  for (const [preset, width] of [["reading", "1180"], ["standard", "1180"], ["today", "1180"], ["wide", "1180"], ["marketing", "1240"]]) {
    assert.match(primitives, new RegExp(`${preset}: "max-w-\\[${width}px\\]"`));
  }
  assert.match(primitives, /appPageContainer = "box-border mx-auto w-\[calc\(100%_-_2\.5rem\)\] max-w-\[1180px\] sm:w-\[calc\(100%_-_4rem\)\] lg:w-\[calc\(100%_-_6rem\)\]"/);
  assert.match(today, /<AppPage layout="workspace" shell="today">/);
  assert.match(pets, /<AppPage layout="workspace" shell="standard">/);
  assert.match(history, /<AppPage layout="workspace" shell="wide">/);
  assert.match(ask, /<AppPage layout="focused" shell="reading">/);
  assert.match(products, /<AppPage layout="focused" shell="wide">/);
  assert.match(account, /<AccountSettingsShell/);
  assert.match(accountShell, /<AppPage shell="reading">/);
  assert.match(homepage, /homepage-wide-shell/);
  assert.match(accountAccess, /preset="reading"/);
});

test("PageHeader supports shared titles and independent action slots", () => {
  assert.match(primitives, /export function PageHeader/);
  assert.match(primitives, /primaryAction\?: ReactNode/);
  assert.match(primitives, /secondaryAction\?: ReactNode/);
  assert.match(primitives, /data-ui="page-header-actions"/);
  for (const source of [today, pets, history, ask, accountShell]) assert.match(source, /<PageHeader/);
  assert.match(history, /eyebrow="HISTORY"[\s\S]*title="Find something you've saved\."/);
  assert.match(today, /data-ui="today-present-file"/);
  assert.match(products, /aria-labelledby="products-coming-soon-title"[\s\S]*<h1[\s\S]*id="products-coming-soon-title"/);
});

test("shared and homepage footers are compact, shell aligned, and use approved logo treatments", () => {
  assert.match(homepage, /<MarketingFooter showSignIn=\{visibleMode === "anonymous"\} signedIn=\{signedIn\} \/>/);
  assert.match(homepage, /data-ui="homepage-marketing-footer"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.doesNotMatch(homepage, /<BrandMark/);
  assert.match(footer, /<BrandMark size=\{24\} \/>/);
  assert.match(footer, /href="\/privacy">Privacy/);
  assert.match(footer, /href="\/terms">Terms/);
  assert.match(footer, /border-t border-\[var\(--border-subtle\)\]/);
});

test("theme switching stays removed and protected brand assets remain byte-identical", () => {
  const expected = {
    "public/brand/furvise-logo.svg": "15103E452559F4F29B0492A6731782ECD680992F62798BE95DDC7ABA544F3B00",
    "public/brand/furvise-wordmark.svg": "5CE60B7D3134B5AAF00F4A4A799F46443A9EB0FD23B04724A545AD15F7C248B8",
    "public/brand/furvise-heron.svg": "5BC3424AFD22BBA0391D302494C506455DF9EF3A2221525C32A033E8DDA0DD0B",
    "app/favicon.ico": "7645741D1A690C78A6A235C21FB57B93533AB2C86BE3437F8AB28180497220E3",
  };
  for (const [path, digest] of Object.entries(expected)) assert.equal(hash(path), digest, `${path} must not change`);
  const combined = [css, header, read("app/layout.tsx")].join("\n");
  assert.doesNotMatch(combined, /data-theme|prefers-color-scheme|theme switch|dark:/i);
});
