import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = (path) => createHash("sha256").update(readFileSync(new URL(`../${path}`, import.meta.url))).digest("hex").toUpperCase();
const css = read("app/globals.css");
const header = read("app/components/app-header.tsx");
const brand = read("app/components/brand-mark.tsx");
const primitives = read("app/components/product-primitives.tsx");
const appPage = read("app/components/app-page.tsx");
const ask = read("app/ask/page.tsx");
const products = read("app/shop/page.tsx");
const menu = read("app/components/pet-overflow-menu.tsx");

test("mobile type scale stays compact and restores the approved desktop title size", () => {
  assert.match(primitives, /mobileTitleClass[\s\S]*text-\[2\.125rem\][\s\S]*text-\[2\.25rem\]/);
  assert.match(primitives, /leading-\[1\.08\][\s\S]*md:text-\[2\.625rem\]/);
  assert.match(primitives, /supportingText[\s\S]*text-base[\s\S]*sm:text-lg/);
  assert.match(css, /body[\s\S]*font-size: 16px;[\s\S]*line-height: 1\.5;/);
  assert.match(products, /text-\[clamp\(1\.9rem,8\.3vw,2\.4rem\)\][\s\S]*lg:text-\[clamp\(3\.5rem,4\.5vw,4\.5rem\)\]/);
  assert.match(products, /min-h-\[calc\(100svh-4\.25rem-var\(--mobile-nav-clearance\)\)\]/);
  assert.match(products, /bg-\[var\(--surface-primary\)\]/);
  assert.match(products, /bottom-\[-1\.5rem\][\s\S]*right-\[-15vw\][\s\S]*w-\[145vw\][\s\S]*sm:w-\[120vw\]/);
  assert.match(css, /--products-coming-soon-artwork-mask: linear-gradient\(to bottom, transparent 0%, var\(--deep-forest\) 22%, var\(--deep-forest\) 100%\)/);
  assert.match(products, /mask-image:var\(--products-coming-soon-artwork-mask\)[\s\S]*lg:\[mask-image:none\]/);
  assert.match(products, /lg:inset-0 lg:h-full lg:w-full[\s\S]*lg:object-cover lg:object-center/);
  assert.match(products, /max-w-\[15rem\][\s\S]*flex-wrap[\s\S]*lg:max-w-none/);
  assert.equal((products.match(/whitespace-nowrap/g) ?? []).length, 3);
});

test("mobile header has a compact safe-area-aware height and responsive approved logo sizing", () => {
  assert.match(header, /min-h-\[calc\(4\.25rem\+env\(safe-area-inset-top,0px\)\)\]/);
  assert.match(header, /\[--brand-mark-size:2rem\]/);
  assert.match(brand, /width: showName \? `calc\(\$\{responsiveSize\} \* 3\.2\)` : responsiveSize/);
  assert.match(header, /lg:\[--brand-mark-size:3\.125rem\]/);
  assert.match(brand, /var\(--brand-mark-size, \$\{size\}px\)/);
});

test("one stable bottom-navigation height drives safe-area clearance and composer offset", () => {
  assert.match(css, /--mobile-nav-height: 4\.25rem;/);
  assert.match(css, /--mobile-nav-safe-area: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(css, /--mobile-nav-clearance: calc\([\s\S]*24px/);
  assert.match(header, /h-\[var\(--mobile-nav-expanded-height\)\]/);
  assert.match(header, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.match(css, /\.app-mobile-nav-clearance[\s\S]*var\(--mobile-nav-clearance\)/);
  assert.match(css, /--mobile-sticky-gap: var\(--space-3\);/);
  assert.match(css, /\.app-sticky-composer[\s\S]*var\(--mobile-nav-height\)[\s\S]*var\(--mobile-nav-safe-area\)[\s\S]*var\(--mobile-sticky-gap\)/);
  assert.match(appPage, /app-mobile-nav-clearance/);
});

test("mobile navigation order and labels remain stable during scrolling", () => {
  const mobile = header.slice(header.indexOf("const MOBILE_NAV_ITEMS"), header.indexOf("export function AppHeader"));
  let cursor = -1;
  for (const label of ["Today", "History", "Ask", "Pets", "Products"]) {
    const next = mobile.indexOf(`label: "${label}"`);
    assert.ok(next > cursor, `${label} stays in route order`);
    cursor = next;
  }
  assert.match(header, /text-\[0\.6875rem\]/);
  assert.match(header, /data-active-indicator=\{active \? "icon-capsule"/);
  assert.match(header, /<span className=\{askCompactNavigation \? "sr-only" : "block whitespace-nowrap"\}>\{item\.label\}<\/span>/);
  assert.doesNotMatch(header, /mobileNavigationState|hideLabel|addEventListener\("scroll"/);
});

test("Ask keeps composer and disclaimer in one nav-aware sticky region", () => {
  assert.match(ask, /app-sticky-composer sticky[\s\S]*data-ui="ask-composer-region"/);
  assert.match(ask, /<Composer[\s\S]*Furvise organizes care information and does not replace a veterinarian/);
  assert.match(ask, /textarea[\s\S]*text-base[\s\S]*PrimaryButton[\s\S]*type="submit"/);
});

test("pet overflow placement is viewport and bottom-navigation aware", () => {
  assert.match(menu, /getBoundingClientRect\(\)/);
  assert.match(menu, /getClientRects\(\)\.length/);
  assert.match(menu, /data-ui='mobile-bottom-navigation'/);
  assert.match(menu, /placement: MenuPlacement/);
  assert.match(menu, /roomBelow >= menuHeight \+ MENU_GAP \? "below" : "above"/);
  assert.match(menu, /data-placement=\{position\.placement\}/);
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
  for (const [token, value] of levels) assert.match(css, new RegExp(`${token}: ${value};`));
  assert.match(header, /z-\[var\(--z-bottom-navigation\)\]/);
  assert.match(menu, /z-\[var\(--z-popover\)\]/);
  assert.match(primitives, /z-\[var\(--z-dialog\)\]/);
});

test("desktop navigation remains hidden below 1024px and brand assets remain unchanged", () => {
  assert.match(header, /hidden items-center justify-self-center lg:flex[\s\S]*aria-label="Primary navigation"/);
  assert.match(header, /data-ui="mobile-bottom-navigation"/);
  assert.match(header, /lg:hidden/);
  assert.equal(brand.match(/FURVISE_BRAND_ASSET = "([^"]+)"/)?.[1], "/brand/logo.png");
  assert.equal(hash("public/brand/logo.png"), "D24A7A73878FB4692918D140D69DC9D803281D53FF2704AC51B5720A782BECB6");
  assert.equal(hash("app/favicon.ico"), "6E33AAE904FB4A5A8EBC6CE15EE8846C692F154B92FB0EEAC3278B0351444557");
});
