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
const today = read("app/dashboard/page.tsx");
const pets = read("app/pets/page.tsx");
const history = read("app/components/care-log-workspace.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const account = read("app/account/page.tsx");

test("desktop and mobile headers share the approved brand without duplicating it in bottom navigation", () => {
  assert.match(brand, /FURVISE_BRAND_ASSET = "\/brand\/logo\.png"/);
  assert.match(header, /data-ui="app-header"/);
  assert.match(header, /<BrandMark priority size=\{32\} \/>/);
  assert.match(header, /hidden items-center justify-self-center lg:flex[\s\S]*aria-label="Primary navigation"/);
  assert.match(header, /aria-label="Mobile navigation"[\s\S]*data-ui="mobile-bottom-navigation"/);
  const bottomNavigation = header.slice(header.indexOf('aria-label="Mobile navigation"'));
  assert.doesNotMatch(bottomNavigation, /BrandMark|FURVISE_BRAND_ASSET|furvise-logo/);
  assert.match(header, />Account</);
});

test("navigation destinations and order remain unchanged with a non-color active indicator", () => {
  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  const mobile = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  for (const [source, labels] of [[desktop, ["Today", "Pets", "History", "Ask", "Products"]], [mobile, ["Today", "History", "Ask", "Pets", "Products"]]]) {
    let cursor = -1;
    for (const label of labels) {
      const next = source.indexOf(`label: "${label}"`);
      assert.ok(next > cursor, `${label} stays in route order`);
      cursor = next;
    }
  }
  assert.match(header, /aria-current=\{isActive\(item\.href\) \? "page" : undefined\}/);
  assert.match(header, /data-active-indicator=\{isActive\(item\.href\) \? "background"/);
});

test("mobile bottom navigation is edge aligned, safe-area aware, and paired with content clearance", () => {
  assert.match(header, /fixed inset-x-0 bottom-0/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.match(header, /grid-cols-5/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*24px/);
  assert.match(css, /\.app-mobile-nav-clearance[\s\S]*var\(--mobile-nav-clearance\)/);
  assert.match(css, /\.app-sticky-composer[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)/);
  assert.match(appPage, /app-mobile-nav-clearance/);
});

test("semantic page-shell presets exist and every requested surface uses its mapped preset", () => {
  for (const [preset, width] of [["reading", "1180"], ["standard", "1180"], ["today", "1180"], ["wide", "1180"], ["marketing", "1240"]]) {
    assert.match(primitives, new RegExp(`${preset}: "max-w-\\[${width}px\\]"`));
  }
  assert.match(primitives, /pageShellGutters = "px-5 sm:px-8 lg:px-10 xl:px-12"/);
  assert.match(today, /<AppPage layout="workspace" shell="today">/);
  assert.match(pets, /<AppPage layout="workspace" shell="standard">/);
  assert.match(history, /<AppPage layout="workspace" shell="reading">/);
  assert.match(ask, /<AppPage layout="focused" shell="reading">/);
  assert.match(products, /<AppPage layout="focused" shell="wide">/);
  assert.match(account, /<AppPage shell="reading">/);
  assert.match(homepage, /preset="marketing"/);
  assert.match(accountAccess, /preset="reading"/);
});

test("PageHeader supports shared titles and independent action slots", () => {
  assert.match(primitives, /export function PageHeader/);
  assert.match(primitives, /primaryAction\?: ReactNode/);
  assert.match(primitives, /secondaryAction\?: ReactNode/);
  assert.match(primitives, /data-ui="page-header-actions"/);
  for (const source of [today, pets, history, ask, products, account]) assert.match(source, /<PageHeader/);
});

test("orange action governance keeps repeated Pets and product-card actions secondary", () => {
  const petRows = pets.slice(pets.indexOf("function PetStartHistory"));
  assert.doesNotMatch(petRows, /<PrimaryButton[^>]*>Add update/);
  assert.match(petRows, /<SoftButton[^>]*>Add update/);
  assert.match(pets, /actions=\{profiles\.length \? <PrimaryButton[^>]*>Add pet/);
  assert.match(products, /disabled=\{!canSearch\}[\s\S]*>\s*Search/);
  assert.match(products, /bg-\[var\(--secondary-action\)\][\s\S]*Ask product question/);
});

test("surface balance reserves sage while navigation, composer, search, and footer use warm neutral surfaces", () => {
  assert.match(css, /--navigation-background: var\(--warm-cream\)/);
  assert.match(css, /--footer-background: var\(--raised-neutral\)/);
  assert.match(css, /--ghost-action-hover: var\(--raised-neutral\)/);
  assert.match(ask, /app-sticky-composer[\s\S]*bg-\[var\(--surface-primary\)\]/);
  assert.match(products, /bg-\[var\(--surface-primary\)\][\s\S]*onSubmit=\{submitSearch\}/);
  assert.match(footer, /data-ui="app-footer"[\s\S]*preset=\{shell\}/);
});

test("footer is compact, shell aligned, and uses the canonical logo component", () => {
  assert.match(homepage, /<AppFooter showSignIn=\{visibleMode === "anonymous"\} \/>/);
  assert.match(footer, /<BrandMark size=\{24\} \/>/);
  assert.match(footer, /href="\/privacy">Privacy/);
  assert.match(footer, /href="\/terms">Terms/);
  assert.match(footer, /border-t border-\[var\(--border-subtle\)\]/);
});

test("theme switching stays removed and protected brand assets remain byte-identical", () => {
  const expected = {
    "public/brand/logo.png": "D24A7A73878FB4692918D140D69DC9D803281D53FF2704AC51B5720A782BECB6",
    "app/favicon.ico": "6E33AAE904FB4A5A8EBC6CE15EE8846C692F154B92FB0EEAC3278B0351444557",
  };
  for (const [path, digest] of Object.entries(expected)) assert.equal(hash(path), digest, `${path} must not change`);
  const combined = [css, header, read("app/layout.tsx")].join("\n");
  assert.doesNotMatch(combined, /data-theme|prefers-color-scheme|theme switch|dark:/i);
});
