import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MOBILE_NAVIGATION_ITEMS } from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const css = read("app/globals.css");
const liquidGlassHook = read("app/lib/navigation/use-mobile-liquid-glass.ts");
const mobileHeader = header.slice(header.indexOf('data-ui="header-optical-row"'), header.indexOf('<nav aria-label="Mobile navigation"'));
const bottomDockStart = header.indexOf('<nav aria-label="Mobile navigation"');
const bottomDock = header.slice(bottomDockStart, header.indexOf("</nav>", bottomDockStart) + 6);

test("mobile header owns More while the dock contains exactly five ordered routes", () => {
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ href, label }) => [label, href]),
    [["Today", "/today"], ["History", "/history"], ["Ask", "/ask"], ["Pets", "/pets"], ["Account", "/account"]],
  );
  assert.match(bottomDock, /grid-cols-5/);
  assert.doesNotMatch(bottomDock, /NAVIGATION_ICON_ASSETS\.more|mobile-more-menu|Open More menu/);
  assert.match(mobileHeader, /data-ui="mobile-more-container"[\s\S]*NAVIGATION_ICON_ASSETS\.more/);
});

test("the mobile More control is a first-tap accessible header button", () => {
  assert.match(mobileHeader, /<button[\s\S]*aria-controls=\{mobileMoreMenuId\}[\s\S]*aria-expanded=\{mobileMoreOpen\}[\s\S]*aria-haspopup="menu"/);
  assert.match(mobileHeader, /aria-label=\{mobileMoreOpen \? "Close More menu" : "Open More menu"\}/);
  assert.match(mobileHeader, /min-h-11 min-w-11[\s\S]*focus-visible:ring-2/);
  assert.match(mobileHeader, /onClick=\{\(\) => setMobileMoreOpen\(\(open\) => !open\)\}/);
  assert.match(mobileHeader, /mobileMoreOpen \? \([\s\S]*data-ui="mobile-more-menu"[\s\S]*\) : null/);
});

test("More retains account menu entries and closes without a pointer-blocking overlay", () => {
  assert.doesNotMatch(mobileHeader, /href="\/shop"[\s\S]*>Products<\/Link>/);
  assert.match(mobileHeader, /accountMenuItems\.map[\s\S]*href=\{item\.href\}/);
  assert.match(header, /document\.addEventListener\("click", handleOutsideClick\)/);
  assert.doesNotMatch(header, /document\.addEventListener\("pointerdown", handleOutsideClick\)/);
  assert.doesNotMatch(mobileHeader, /backdrop|fixed inset-0|pointer-events-none opacity/);
  assert.match(header, /setMobileMoreOpen\(false\)/);
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
