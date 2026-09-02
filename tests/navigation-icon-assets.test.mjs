import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  MOBILE_NAVIGATION_ITEMS,
  NAVIGATION_ICON_ASSETS,
} from "../app/lib/navigation/mobile-navigation.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const header = read("app/components/app-header.tsx");

const expectedAssets = {
  ask: "/images/nav-ask-v1.webp",
  history: "/images/nav-history-v1.webp",
  more: "/images/nav-more-v1.webp",
  pets: "/images/nav-pets-v1.webp",
  products: "/images/nav-products-v1.webp",
  today: "/images/nav-today-v1.webp",
};

test("the shared navigation icon inventory maps every action to its optimized derivative", () => {
  assert.deepEqual(NAVIGATION_ICON_ASSETS, expectedAssets);
  for (const asset of Object.values(expectedAssets)) {
    assert.equal(existsSync(new URL(`../public${asset}`, import.meta.url)), true, asset);
  }
});

test("mobile destinations retain the intended icon assets while desktop stays text-only", () => {
  const expectedMobile = [
    ["Today", "/today", expectedAssets.today],
    ["History", "/history", expectedAssets.history],
    ["Ask", "/ask", expectedAssets.ask],
    ["Pets", "/pets", expectedAssets.pets],
  ];
  assert.deepEqual(
    MOBILE_NAVIGATION_ITEMS.map(({ asset, href, label }) => [label, href, asset]),
    expectedMobile,
  );

  const desktop = header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS"));
  assert.doesNotMatch(desktop, /asset:|NAVIGATION_ICON_ASSETS|<Image|NavigationIcon/);
  assert.match(header, /asset=\{NAVIGATION_ICON_ASSETS\.more\}/);
});

test("the mobile dock has exactly four evenly distributed routes in the required order", () => {
  assert.equal(MOBILE_NAVIGATION_ITEMS.length, 4);
  assert.deepEqual(MOBILE_NAVIGATION_ITEMS.map(({ label }) => label), ["Today", "History", "Ask", "Pets"]);
  const mobileStart = header.indexOf('<nav aria-label="Mobile navigation"');
  const mobile = header.slice(mobileStart, header.indexOf("</nav>", mobileStart) + 6);
  assert.match(mobile, /grid-cols-4/);
  assert.match(mobile, /MOBILE_NAV_ITEMS\.map/);
  assert.doesNotMatch(mobile, /NAVIGATION_ICON_ASSETS\.more|Open More menu/);
  assert.match(mobile, /mx-4[\s\S]*p-1\.5[\s\S]*px-1/);
  assert.match(mobile, /min-h-11/);
  assert.match(mobile, /whitespace-nowrap/);
});

test("the dormant Products icon stays available while dock icons remain outside the LiquidGlass capture target", () => {
  const navigationSource = read("app/lib/navigation/mobile-navigation.ts");
  assert.equal((navigationSource.match(/\/images\/nav-products-v1\.webp/g) ?? []).length, 1);
  const mobile = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  const emptyGlassTarget = mobile.indexOf('data-liquid-glass-skip-content=""');
  const ignoredInteractiveLayer = mobile.indexOf('data-liquid-glass-ignore=""');
  const mappedIcons = mobile.indexOf("<NavigationIcon asset={item.asset}");
  assert.ok(emptyGlassTarget >= 0 && ignoredInteractiveLayer > emptyGlassTarget && mappedIcons > ignoredInteractiveLayer);
});

test("navigation images use bounded object-contain rendering without artwork-damaging effects", () => {
  assert.match(header, /import Image from "next\/image"/);
  assert.doesNotMatch(header, /artworkScale|scale-\[/);
  assert.match(header, /className="object-contain"/);
  assert.match(header, /fill/);
  assert.match(header, /sizes=\"100%\"/);
  assert.match(header, /grid-cols-4/);
  assert.match(header, /min-h-11 min-w-0/);
  assert.match(header, /inline-flex shrink-0[^"]*overflow-hidden[\s\S]*askCompactNavigation \? "h-8 w-10" : "h-10 w-12"/);
  assert.match(header, /alt=""[\s\S]*aria-hidden="true"/);
  assert.doesNotMatch(header, /(?:filter|opacity|mask|object-cover)/);
});

test("navigation labels, destinations, state, and accessibility remain intact", () => {
  for (const [href, label] of [
    ["/today", "Today"],
    ["/pets", "Pets"],
    ["/history", "History"],
    ["/ask", "Ask"],
  ]) assert.match(header, new RegExp(`href: "${href}", label: "${label}"`));
  assert.doesNotMatch(header.slice(header.indexOf("export const APP_NAV_ITEMS"), header.indexOf("const MOBILE_NAV_ITEMS")), /Products|\/shop/);

  assert.match(header, /aria-label="Primary navigation"/);
  assert.match(header, /aria-label="Mobile navigation"/);
  assert.match(header, /aria-label=\{mobileMoreOpen \? "Close More menu" : "Open More menu"\}/);
  assert.match(header, /aria-expanded=\{mobileMoreOpen\}/);
  assert.match(header, /aria-controls=\{mobileMoreMenuId\}/);
  assert.match(header, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(header, /focus-visible:ring-2/);
});

test("no superseded navigation artwork or inline navigation glyphs remain", () => {
  const navigation = `${read("app/lib/navigation/mobile-navigation.ts")}\n${header}`;
  assert.doesNotMatch(navigation, /\/images\/(?:cat|dog)\.png/);
  const mobileNavigation = header.slice(header.indexOf('<nav aria-label="Mobile navigation"'));
  assert.doesNotMatch(mobileNavigation, /<svg|<circle|fill="currentColor"/);
});
