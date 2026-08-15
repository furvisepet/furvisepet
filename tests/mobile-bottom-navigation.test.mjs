import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  getActiveMobileNavigationTab,
  isAuthenticatedAppNavigationRoute,
  MOBILE_NAVIGATION_ITEMS,
  shouldShowMobileNavigation,
} from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const mobileNavigationStart = header.indexOf('<nav aria-label="Mobile navigation"');
const mobileNavigation = header.slice(mobileNavigationStart, header.indexOf("</nav>", mobileNavigationStart) + 6);
const rootLayout = read("app/layout.tsx");
const appChrome = read("app/components/authenticated-app-chrome.tsx");
const appPage = read("app/components/app-page.tsx");

test("mobile destinations use the approved public image assets", () => {
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ asset, href, label }) => ({ asset, href, label })),
    [
      { asset: "/images/nav-today-v1.webp", href: "/today", label: "Today" },
      { asset: "/images/nav-history-v1.webp", href: "/history", label: "History" },
      { asset: "/images/nav-ask-v1.webp", href: "/ask", label: "Ask" },
      { asset: "/images/nav-pets-v1.webp", href: "/pets", label: "Pets" },
      { asset: "/images/nav-products-v1.webp", href: "/shop", label: "Products" },
    ],
  );
  for (const item of MOBILE_NAVIGATION_ITEMS) assert.equal(existsSync(new URL(`../public${item.asset}`, import.meta.url)), true);
  assert.match(header, /NAVIGATION_ICON_ASSETS\.more/);
  assert.doesNotMatch(mobileNavigation, /\/images\/(?:cat|dog)\.png/);
  assert.match(header, /import Image from "next\/image"/);
});

test("active tabs cover public aliases and established application destinations", () => {
  for (const [pathname, tab] of [
    ["/today", "today"],
    ["/dashboard", "today"],
    ["/history", "history"],
    ["/care-log/pet", "history"],
    ["/ask/thread", "ask"],
    ["/pets/pet-id", "pets"],
    ["/dogs/pet-id/memories", "pets"],
    ["/shop", "products"],
    ["/account", "more"],
    ["/vet-briefs/brief-id", "more"],
  ]) assert.equal(getActiveMobileNavigationTab(pathname), tab);
  assert.equal(getActiveMobileNavigationTab("/onboarding"), null);
  assert.match(mobileNavigation, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(mobileNavigation, /data-active-indicator=\{active \? "icon-capsule" : undefined\}/);
});

test("navigation is authenticated-only and excludes public Auth surfaces", () => {
  assert.equal(shouldShowMobileNavigation("/today", true), true);
  assert.equal(shouldShowMobileNavigation("/today", false), false);
  for (const pathname of ["/", "/login", "/login/signup", "/signup", "/auth/callback"]) {
    assert.equal(shouldShowMobileNavigation(pathname, true), false, `${pathname} stays hidden`);
  }
  assert.match(mobileNavigation, /lg:hidden/);
});

test("one persistent root-owned authenticated chrome survives application route changes", () => {
  assert.match(rootLayout, /<AuthenticatedAppChrome \/>[\s\S]*\{children\}/);
  assert.match(appChrome, /usePathname\(\)/);
  assert.match(appChrome, /isAuthenticatedAppNavigationRoute\(pathname\)/);
  assert.match(appChrome, /return <SignedInHeader \/>/);
  assert.doesNotMatch(appChrome, /key=\{pathname\}/);
  assert.doesNotMatch(appPage, /SignedInHeader|AppHeader/);

  const navigationOwners = ["app/components/app-header.tsx", "app/components/app-page.tsx", "app/components/authenticated-app-chrome.tsx", "app/layout.tsx"]
    .map(read)
    .join("\n")
    .match(/data-ui="mobile-bottom-navigation"/g) || [];
  assert.equal(navigationOwners.length, 1);

  for (const pathname of ["/today", "/history", "/ask", "/pets", "/shop", "/pets/pet-id"]) {
    assert.equal(isAuthenticatedAppNavigationRoute(pathname), true, pathname);
  }
  for (const pathname of ["/", "/login", "/signup", "/auth/callback", "/onboarding", "/privacy", "/terms"]) {
    assert.equal(isAuthenticatedAppNavigationRoute(pathname), false, pathname);
  }
});

test("scrolling cannot move or temporarily disable the interactive dock", () => {
  assert.match(mobileNavigation, /data-state=\{askCompactNavigation \? "ask-compact" : "stable"\}/);
  assert.match(mobileNavigation, /askCompactNavigation \? "h-\[var\(--mobile-nav-compact-height\)\] p-1" : "h-\[var\(--mobile-nav-expanded-height\)\] p-1\.5"/);
  assert.doesNotMatch(header, /addEventListener\("scroll"|readScrollPosition|expandAfterIdle|mobileNavigationState/);
  assert.doesNotMatch(mobileNavigation, /translate|transition-\[height|transition-\[width/);
});

test("reduced motion keeps the fixed dock and disables cosmetic transitions", () => {
  assert.match(mobileNavigation, /motion-reduce:transition-none/);
  assert.match(mobileNavigation, /duration-\[var\(--motion-fast\)\]/);
});

test("the glass dock uses semantic color roles and reserves safe page space", () => {
  assert.match(mobileNavigation, /mobile-liquid-glass/);
  const css = read("app/globals.css");
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*backdrop-filter: blur\(24px\) saturate\(155%\)/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*inset 0 1px 0[\s\S]*0 14px 38px/);
  assert.match(css, /\.mobile-liquid-glass-scene::before/);
  assert.match(mobileNavigation, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.doesNotMatch(mobileNavigation, /#[0-9a-f]{3,8}|(?:bg|text|border|ring)-(?:white|black|red|green|blue|orange|amber|stone|gray)-/i);
  assert.match(read("app/globals.css"), /--mobile-nav-expanded-height: 5\.75rem;[\s\S]*--mobile-nav-compact-height: 3\.5rem;[\s\S]*--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-expanded-height\)/);
});

test("persistent navigation icons are low-priority and do not remount by pathname", () => {
  assert.match(mobileNavigation, /<NavigationIcon asset=\{item\.asset\} \/>/);
  assert.doesNotMatch(mobileNavigation, /NAVIGATION_ICON_ASSETS\.more/);
  assert.match(header, /<NavigationIcon asset=\{NAVIGATION_ICON_ASSETS\.more\} \/>/);
  assert.match(header, /loading="lazy"/);
  assert.match(header, /decoding="async"/);
  assert.doesNotMatch(mobileNavigation, /key=\{pathname\}|opacity-0|animate-opacity/);
  assert.doesNotMatch(header, /artworkScale|scale-\[/);
  assert.match(header, /className="h-full w-full object-contain"/);
  assert.match(header, /height=\{48\}/);
  assert.match(header, /width=\{48\}/);
});

test("History alias reuses the established care-history implementation", () => {
  assert.match(read("app/history/page.tsx"), /redirect\("\/care-log"\)/);
  assert.match(read("app/history/layout.tsx"), /PrivateRouteLayout/);
});
