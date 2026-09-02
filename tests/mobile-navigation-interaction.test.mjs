import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOBILE_NAVIGATION_ITEMS } from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const accountUtility = read("app/components/account-utility.tsx");
const css = read("app/globals.css");
const liquidGlassHook = read("app/lib/navigation/use-mobile-liquid-glass.ts");
const mobileHeader = header.slice(header.indexOf('data-ui="header-optical-row"'), header.indexOf('<nav aria-label="Mobile navigation"'));
const bottomDockStart = header.indexOf('<nav aria-label="Mobile navigation"');
const bottomDock = header.slice(bottomDockStart, header.indexOf("</nav>", bottomDockStart) + 6);

test("mobile header owns the account utility while the dock contains exactly four ordered routes", () => {
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ href, label }) => [label, href]),
    [["Today", "/today"], ["History", "/history"], ["Ask", "/ask"], ["Pets", "/pets"]],
  );
  assert.match(bottomDock, /grid-cols-4/);
  assert.doesNotMatch(bottomDock, /Account|href="\/account"/);
  assert.doesNotMatch(bottomDock, /NAVIGATION_ICON_ASSETS\.more|mobile-more-menu|Open More menu/);
  assert.match(mobileHeader, /<AccountUtility email=\{accountEmail\} \/>/);
});

test("the mobile account utility is a first-tap accessible menu control", () => {
  assert.match(accountUtility, /<summary[\s\S]*aria-controls=\{menuId\}[\s\S]*aria-haspopup="menu"/);
  assert.match(accountUtility, /aria-label="Open account menu"/);
  assert.match(accountUtility, /min-h-11[\s\S]*focus-visible:ring-2/);
  assert.match(accountUtility, /data-ui="account-utility"/);
});

test("the account menu retains its exact destinations and dismisses without an overlay", () => {
  assert.doesNotMatch(accountUtility, /href="\/shop"|Products/);
  assert.match(accountUtility, /Account settings[\s\S]*Membership[\s\S]*Privacy[\s\S]*Terms[\s\S]*Sign out/);
  assert.match(accountUtility, /document\.addEventListener\("click", closeMenu\)/);
  assert.doesNotMatch(accountUtility, /document\.addEventListener\("pointerdown"/);
  assert.doesNotMatch(accountUtility, /backdrop|fixed inset-0|pointer-events-none opacity/);
  assert.match(accountUtility, /detailsRef\.current\.open = false/);
});

test("visual layers cannot intercept taps and interactive content owns hit testing", () => {
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*pointer-events: none;[\s\S]*z-index: 0/);
  assert.match(css, /\.mobile-liquid-glass \{[\s\S]*pointer-events: none;[\s\S]*z-index: 1/);
  assert.match(css, /\.mobile-liquid-glass > canvas \{[\s\S]*pointer-events: none !important/);
  assert.match(css, /\.mobile-liquid-glass-content \{[\s\S]*pointer-events: auto;[\s\S]*touch-action: manipulation;[\s\S]*z-index: 2/);
});

test("each dock route uses one standard Link click with immediate pressed feedback", () => {
  assert.match(bottomDock, /MOBILE_NAV_ITEMS\.map[\s\S]*<Link[\s\S]*touch-manipulation[\s\S]*active:bg-\[var\(--surface-hover\)\][\s\S]*href=\{item\.href\}/);
  assert.doesNotMatch(bottomDock, /onTouchStart|onPointerDown|stopPropagation|router\.push/);
  assert.match(bottomDock, /onClick=\{guardAppNavigation\}/);
});

test("scroll, resize, and route state cannot move or disable the dock", () => {
  assert.match(bottomDock, /data-state=\{askCompactNavigation \? "ask-compact" : "stable"\}[\s\S]*h-\[var\(--mobile-nav-expanded-height\)\]/);
  assert.doesNotMatch(header, /addEventListener\("scroll"|expandAfterIdle|mobileNavigationState|pointer-events-none[^"]*mobile-liquid-glass-content/);
  assert.doesNotMatch(bottomDock, /translate|transition-\[height|transition-\[width|\sdisabled=/);
  assert.doesNotMatch(liquidGlassHook, /pathname|lifecycleKey|route_change/);
  assert.match(liquidGlassHook, /\}, \[enabled, glassRef, rootRef\]\);/);
});
