import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(new URL(`../${path}`, import.meta.url)))
    .digest("hex")
    .toUpperCase();
const css = read("app/globals.css");
const header = read("app/components/app-header.tsx");
const brand = read("app/components/brand-mark.tsx");
const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const menu = read("app/components/pet-overflow-menu.tsx");
test("Products uses dedicated full-bleed responsive artwork", () => {
  assert.match(
    primitives,
    /mobileTitleClass[\s\S]*text-\[2\.125rem\][\s\S]*text-\[2\.25rem\]/
  );
  assert.match(
    primitives,
    /leading-\[1\.08\][\s\S]*md:text-\[2\.625rem\]/
  );
  assert.match(
    primitives,
    /supportingText[\s\S]*text-base[\s\S]*sm:text-lg/
  );
  assert.match(
    css,
    /body[\s\S]*font-size: 16px;[\s\S]*line-height: 1\.5;/
  );
  assert.match(
    products,
    /src: "\/images\/products_page\/products_mobile\.png"/
  );
  assert.match(
    products,
    /src: "\/images\/products_page\/products_desktop\.png"/
  );
  assert.match(
    products,
    /media="\(min-width: 1024px\)"[\s\S]*srcSet=\{desktopImage\.srcSet\}/
  );
  assert.match(
    products,
    /fixed inset-x-0 bottom-0 top-\[4\.25rem\]/
  );
  assert.match(
    products,
    /lg:top-\[4\.25rem\]/
  );
  assert.match(
    products,
    /overflow-hidden/
  );
  assert.match(
    products,
    /<picture className="absolute inset-0">[\s\S]*<img[\s\S]*object-cover object-center[\s\S]*<\/picture>/
  );
  assert.match(
    products,
    /className="sr-only"[\s\S]*Products coming soon/
  );
  assert.doesNotMatch(products, /comingsoon_bg\.jpg/);
  assert.doesNotMatch(products, /products_mobile\.jpg/);
  assert.doesNotMatch(
    products,
    /A smarter way to choose|Personalized picks|backdrop-blur|rounded-\[1\.35rem\]/
  );
});
test("mobile header has a compact safe-area-aware height and responsive approved logo sizing", () => {
  assert.match(header, /homepage-wide-shell homepage-header-grid/);
  assert.match(header, /className="homepage-full-logo"[\s\S]*src="\/brand\/furvise-logo\.svg"/);
  assert.match(
    brand,
    /if \(showName\)[\s\S]*columnGap: "6px"[\s\S]*width: `calc\(\$\{responsiveSize\} \* 4\)`/
  );
  assert.match(brand, /src=\{FURVISE_WORDMARK_ASSET\}[\s\S]*src=\{FURVISE_MASCOT_ASSET\}/);
  assert.match(brand, /height: responsiveSize,[\s\S]*width: responsiveSize,/);
  assert.match(read("app/globals.css"), /\.homepage-header-grid \{[\s\S]*height: 3\.5rem;[\s\S]*@media \(max-width: 479px\) \{[\s\S]*height: 3\.375rem/);
  assert.match(
    brand,
    /var\(--brand-mark-size, \$\{size\}px\)/
  );
});
test("one stable bottom-navigation height drives safe-area clearance and composer offset", () => {
  assert.match(css, /--mobile-nav-height: 4\.25rem;/);
  assert.match(
    css,
    /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\);/
  );
  assert.match(
    css,
    /--mobile-nav-clearance: calc\([\s\S]*24px/
  );
  assert.match(
    header,
    /h-\[var\(--mobile-nav-expanded-height\)\]/
  );
  assert.match(
    header,
    /pb-\[var\(--mobile-nav-safe-area\)\]/
  );
  assert.match(
    css,
    /\.app-mobile-nav-clearance[\s\S]*var\(--mobile-nav-clearance\)/
  );
  assert.match(
    css,
    /--mobile-sticky-gap: var\(--space-3\);/
  );
  assert.match(
    css,
    /\.app-sticky-composer[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*var\(--mobile-sticky-gap\)/
  );
  assert.match(appPage, /app-mobile-nav-clearance/);
});
test("mobile navigation order and labels remain stable during scrolling", () => {
  const mobile = header.slice(
    header.indexOf("const MOBILE_NAV_ITEMS"),
    header.indexOf("export function AppHeader")
  );
  let cursor = -1;
  for (const label of ["Today", "History", "Ask", "Pets"]) {
    const next = mobile.indexOf(`label: "${label}"`);
    assert.ok(next > cursor, `${label} stays in route order`);
    cursor = next;
  }
  assert.match(header, /text-\[0\.6875rem\]/);
  assert.match(
    header,
    /data-active-indicator=\{active \? "icon-capsule"/
  );
  assert.match(
    header,
    /<span className=\{askCompactNavigation \? "sr-only" : "block whitespace-nowrap"\}>\{item\.label\}<\/span>/
  );
  assert.doesNotMatch(
    header,
    /mobileNavigationState|hideLabel|addEventListener\("scroll"/
  );
});
test("Ask keeps composer and disclaimer in one nav-aware sticky region", () => {
  assert.match(
    ask,
    /app-sticky-composer sticky[\s\S]*data-ui="ask-composer-region"/
  );
  assert.match(
    ask,
    /<Composer[\s\S]*Furvise helps keep your pet&apos;s story together\. It does not replace veterinary care/
  );
  assert.match(
    ask,
    /textarea[\s\S]*text-base[\s\S]*PrimaryButton[\s\S]*type="submit"/
  );
});
test("pet overflow placement is viewport and bottom-navigation aware", () => {
  assert.match(menu, /getBoundingClientRect\(\)/);
  assert.match(menu, /getClientRects\(\)\.length/);
  assert.match(menu, /data-ui='mobile-bottom-navigation'/);
  assert.match(menu, /placement: MenuPlacement/);
  assert.match(
    menu,
    /roomBelow >= menuHeight \+ MENU_GAP \? "below" : "above"/
  );
  assert.match(
    menu,
    /data-placement=\{position\.placement\}/
  );
  assert.match(menu, /pointerdown/);
  assert.match(menu, /event\.key !== "Escape"/);
});
test("semantic z-index levels preserve the requested hierarchy", () => {
  const levels = [
    ["--z-page-content", "0"],
    ["--z-sticky-controls", "20"],
    ["--z-bottom-navigation", "30"],
    ["--z-popover", "40"],
    ["--z-dialog", "50"],
    ["--z-critical-overlay", "60"],
  ];
  for (const [token, value] of levels) {
    assert.match(css, new RegExp(`${token}: ${value};`));
  }
  assert.match(
    header,
    /z-\[var\(--z-bottom-navigation\)\]/
  );
  assert.match(
    menu,
    /z-\[var\(--z-popover\)\]/
  );
  assert.match(
    primitives,
    /z-\[var\(--z-dialog\)\]/
  );
});
test("desktop navigation remains hidden below 1024px and brand assets remain unchanged", () => {
  assert.match(
    header,
    /homepage-header-navigation-zone[\s\S]*aria-label="Primary navigation"/
  );
  assert.match(read("app/globals.css"), /@media \(max-width: 1023px\)[\s\S]*\.homepage-header-navigation-zone \{[\s\S]*display: none/);
  assert.match(
    header,
    /data-ui="mobile-bottom-navigation"/
  );
  assert.match(header, /lg:hidden/);
  assert.equal(
    brand.match(/FURVISE_BRAND_ASSET = "([^"]+)"/)?.[1],
    "/brand/furvise-logo.svg"
  );
  assert.equal(
    hash("public/brand/furvise-logo.svg"),
    "15103E452559F4F29B0492A6731782ECD680992F62798BE95DDC7ABA544F3B00"
  );
  assert.equal(
    hash("app/favicon.ico"),
    "617E8F6A24067E937ECAFD8C8A8DE735BF4BAC546B0378F0220C884F88C952DB"
  );
});
