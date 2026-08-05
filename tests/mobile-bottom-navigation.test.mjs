import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  getActiveMobileNavigationTab,
  isAuthenticatedAppNavigationRoute,
  MOBILE_NAVIGATION_IDLE_EXPAND_MS,
  MOBILE_NAVIGATION_ITEMS,
  MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX,
  resolveMobileNavigationState,
  shouldShowMobileNavigation,
} from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");
const mobileNavigation = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
const rootLayout = read("app/layout.tsx");
const appChrome = read("app/components/authenticated-app-chrome.tsx");
const appPage = read("app/components/app-page.tsx");

test("mobile destinations use the approved public image assets", () => {
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ asset, href, label }) => ({ asset, href, label })),
    [
      { asset: "/images/today_house.png", href: "/today", label: "Today" },
      { asset: "/images/history_clock.png", href: "/history", label: "History" },
      { asset: "/images/ask_chat.png", href: "/ask", label: "Ask" },
      { asset: "/images/pets_paw.png", href: "/pets", label: "Pets" },
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
    ["/shop", "more"],
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

test("scroll state uses a noise threshold, expands upward, and expands after idle", () => {
  assert.equal(MOBILE_NAVIGATION_SCROLL_THRESHOLD_PX, 14);
  assert.equal(MOBILE_NAVIGATION_IDLE_EXPAND_MS, 300);
  assert.equal(resolveMobileNavigationState({ accumulatedDelta: 8, currentState: "expanded", reducedMotion: false, scrollY: 100 }), "expanded");
  assert.equal(resolveMobileNavigationState({ accumulatedDelta: 14, currentState: "expanded", reducedMotion: false, scrollY: 100 }), "compact");
  assert.equal(resolveMobileNavigationState({ accumulatedDelta: -14, currentState: "compact", reducedMotion: false, scrollY: 100 }), "expanded");
  assert.match(header, /requestAnimationFrame\(readScrollPosition\)/);
  assert.match(header, /setTimeout\(\(\) => updateState\("expanded"\), MOBILE_NAVIGATION_IDLE_EXPAND_MS\)/);
  assert.match(mobileNavigation, /data-state=\{mobileNavigationState\}/);
});

test("reduced motion remains expanded and disables visual transitions", () => {
  assert.equal(resolveMobileNavigationState({ accumulatedDelta: 100, currentState: "compact", reducedMotion: true, scrollY: 100 }), "expanded");
  assert.match(header, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(mobileNavigation, /motion-reduce:transition-none/);
  assert.match(mobileNavigation, /duration-\[var\(--motion-standard\)\]/);
});

test("the glass dock uses semantic color roles and reserves safe page space", () => {
  assert.match(mobileNavigation, /mobile-liquid-glass/);
  const css = read("app/globals.css");
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*backdrop-filter: blur\(24px\) saturate\(155%\)/);
  assert.match(css, /\.mobile-liquid-glass-scene \{[\s\S]*inset 0 1px 0[\s\S]*0 14px 38px/);
  assert.match(css, /\.mobile-liquid-glass-scene::before/);
  assert.match(mobileNavigation, /pb-\[var\(--mobile-nav-safe-area\)\]/);
  assert.doesNotMatch(mobileNavigation, /#[0-9a-f]{3,8}|(?:bg|text|border|ring)-(?:white|black|red|green|blue|orange|amber|stone|gray)-/i);
  assert.match(read("app/globals.css"), /--mobile-nav-expanded-height: 5\.75rem;[\s\S]*--mobile-nav-clearance: calc\([\s\S]*var\(--mobile-nav-expanded-height\)/);
});

test("persistent navigation icons are eagerly decoded and do not remount by pathname", () => {
  assert.match(mobileNavigation, /<NavigationIcon asset=\{item\.asset\} eager \/>/);
  assert.match(mobileNavigation, /<NavigationIcon asset=\{NAVIGATION_ICON_ASSETS\.more\} eager \/>/);
  assert.match(header, /loading=\{eager \? "eager" : "lazy"\}/);
  assert.match(header, /decoding=\{eager \? "sync" : "async"\}/);
  assert.doesNotMatch(mobileNavigation, /key=\{pathname\}|opacity-0|animate-opacity/);
  assert.match(header, /asset === NAVIGATION_ICON_ASSETS\.more \? "scale-\[2\.65\]" : "scale-\[2\.35\]"/);
  assert.match(header, /className=\{`h-full w-full \$\{artworkScale\} object-contain`\}/);
  assert.match(header, /height=\{72\}/);
  assert.match(header, /width=\{48\}/);
});

test("History alias reuses the established care-history implementation", () => {
  assert.match(read("app/history/page.tsx"), /redirect\("\/care-log"\)/);
  assert.match(read("app/history/layout.tsx"), /PrivateRouteLayout/);
});
